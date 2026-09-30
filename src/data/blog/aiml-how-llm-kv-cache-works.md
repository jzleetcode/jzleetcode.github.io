---
author: JZ
pubDatetime: 2026-09-30T23:32:00Z
modDatetime: 2026-09-30T23:32:00Z
title: AI/ML - How the LLM KV Cache Works
tags:
  - design-system
  - ai-ml
description: "How the LLM key-value cache speeds up token-by-token generation, what it stores, why it consumes GPU memory, and how paged allocation helps serving systems."
---

## Table of contents

## The Repeated-Work Problem

Ask an assistant to finish a sentence: "A good database index helps a query by..." The model does not write the whole answer in one pass. It predicts one token, adds that token to the conversation, then predicts the next one.

Suppose the prompt has four tokens and the model has already generated three. To predict the next token, the model needs to consider the prompt plus those three generated tokens. A straightforward implementation could run all seven tokens through every Transformer layer again. Once that token is added, the next step could run all eight. Most of that work would repeat.

The key-value cache, usually shortened to **KV cache**, avoids repeating an important part of that work: it keeps the attention keys and values already computed for earlier tokens. The next token still attends to the earlier context, but the model does not need to rebuild that context's keys and values from scratch.

```text
Without a KV cache:

  step 1: [prompt tokens]                       -> predict token 1
  step 2: [prompt tokens, token 1]               -> predict token 2
  step 3: [prompt tokens, token 1, token 2]      -> predict token 3
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           old tokens are processed again

With a KV cache:

  prefill: [prompt tokens] -> compute and save their keys and values
  step 1:  [token 1]       -> attend to saved prompt keys and values
  step 2:  [token 2]       -> attend to saved prompt and token 1 keys and values
```

This is an inference optimization. It does not change the model's learned weights or the attention result. To see why those two saved tensors are enough, we need to look at what one attention layer computes.

## What Gets Cached?

Each Transformer layer turns a token's current representation into three vectors:

- A **query** (`Q`) asks what information this token needs from earlier tokens.
- A **key** (`K`) describes what a token can be matched against.
- A **value** (`V`) carries the information that can be mixed into the result.

The query is compared with keys to produce attention weights; those weights select a blend of values. This article focuses on how generation reuses those results rather than re-deriving the attention mechanism itself.

During generation, a new token's query is used for that token's attention calculation. Future tokens will have different queries, but they still need to compare them with the earlier tokens. So the model keeps the earlier **keys and values**, not the earlier queries.

The cache is also **per layer**. A token's key and value at layer 1 are different from its key and value at layer 20, because each layer has transformed the token representation differently. A request therefore accumulates a key tensor and a value tensor for each attention layer.

```text
                 One request's cache

Layer 0:  K for tokens 0..t     V for tokens 0..t
Layer 1:  K for tokens 0..t     V for tokens 0..t
Layer 2:  K for tokens 0..t     V for tokens 0..t
  ...
Layer L:  K for tokens 0..t     V for tokens 0..t
```

For ordinary causal self-attention, an earlier token cannot look at future tokens. Adding a new token therefore does not change the keys and values already produced for the earlier prefix. That is what makes those tensors safe to reuse.

## Prefill, Then Decode

Generation has two useful phases. During **prefill**, the model processes the prompt and builds the cache. The prompt has many tokens, so the model can process their attention computations in parallel within each layer. The final prompt position produces the scores used to select the first generated token.

During **decode**, the model processes each new token in turn. At every layer, it computes the new token's query, key, and value. It adds the new key and value to that layer's cache, then uses the query to attend across the cached keys and values. The output passes to the next layer, and ultimately to the vocabulary scores for the next token.

```text
                         PREFILL
  prompt tokens --------------------------------------+
        |                                             |
        v                                             v
  +-------------+   +-------------+             +-------------+
  | Transformer |-->| Transformer |--> ... ---->| Transformer |
  |   layer 0   |   |   layer 1   |             |   layer L   |
  +------+------+   +------+------+             +------+------+
         |                 |                            |
         v                 v                            v
      K0, V0            K1, V1                       KL, VL
         |                 |                            |
         +-----------------+----------------------------+
                           |
                    per-layer KV cache
                           |
                           +----> choose first output token

                          DECODE
  newest token -> each layer computes Q, K, V
                       |       |
                       |       +----> append K and V to that layer's cache
                       v
            Q attends to cached K and V
                       |
                       +----> next token
```

In compact form, the attention part of one decode step at one layer is:

```text
output_t = softmax(Q_t * K_cache^T / sqrt(head_dimension)) * V_cache
```

`Q_t` has one query position for the new token, while `K_cache` and `V_cache` contain the usable prefix. A causal mask and any model-specific positional handling still apply; caching does not remove them.

Here is simplified pseudocode for that loop:

```python
for layer_id, layer in enumerate(model.layers):
    query, new_key, new_value = layer.project(current_token_state)
    all_keys, all_values = cache[layer_id].append(new_key, new_value)
    current_token_state = layer.attend(query, all_keys, all_values)
```

Real implementations also handle batching, position encodings, masks, multiple heads, and device-specific kernels. But the core contract is visible in Hugging Face Transformers' [`DynamicLayer.update`](https://github.com/huggingface/transformers/blob/main/src/transformers/cache_utils.py): it concatenates the new key and value states to the stored tensors and returns the full cached tensors to attention.

## The Memory Bill

Caching saves recomputation by retaining data, and retained data takes memory. For a full-attention decoder, a useful estimate for the cache size is:

```text
KV bytes ~= 2 * layers * batch * cached_tokens * KV_heads * head_dimension * bytes_per_value
```

The factor of 2 accounts for storing both keys and values. `cached_tokens` includes prompt and generated tokens that remain available to attention. The exact memory use depends on model architecture and cache implementation; this estimate leaves out allocator overhead and temporary workspace.

For example, take a model with 32 layers, one request, 8,192 cached tokens, 8 KV heads, head dimension 128, and two bytes per value (as with a 16-bit cache):

```text
2 * 32 * 1 * 8,192 * 8 * 128 * 2
  = 1,073,741,824 bytes
  = 1 GiB
```

That is cache memory for one request, not model weights. Four requests with the same lengths would need roughly four times as much cache before any sharing or other optimizations. Longer context and larger batches can therefore make the cache a major GPU-memory consumer.

The same math explains **grouped-query attention (GQA)** and **multi-query attention (MQA)**. A model with fewer KV heads than query heads stores fewer key/value vectors per token. GQA shares each KV head among a group of query heads; MQA uses one KV head. These are architectural choices that reduce the amount of cache data itself, unlike a memory allocator that only changes where the data is stored.

There is also an important limit to what caching buys: a new token still needs to compare its query with the keys in its context. The cache avoids recomputing earlier layers' K/V projections and other old-token work, but attention still has to read the relevant past keys and values. For long contexts, that memory traffic can become a bottleneck of its own.

## Why Serving Systems Page the Cache

Memory use is only half of the serving problem. A server may handle many requests at once, and each request grows at a different rate. One conversation may finish after 100 tokens; another may continue for thousands. If the server reserves a large contiguous cache region for every request up front, it can leave unused gaps. If it repeatedly resizes regions, allocation becomes harder to manage.

**PagedAttention** applies an idea familiar from virtual memory: divide each request's logical token history into fixed-size blocks, then map those blocks to physical blocks wherever they fit in GPU memory. The request sees one ordered sequence; the physical storage does not have to be contiguous.

```text
Request's logical sequence:
  token 0 ... token 15 | token 16 ... token 31 | token 32 ...
       logical block 0        logical block 1       block 2

GPU cache blocks:
  [block 4] [free] [block 1] [block 7] [block 2] [free] ...
      ^                     ^          ^
      +---- block table -----+----------+
             logical blocks map to physical blocks
```

When a request grows, the scheduler can allocate another free block instead of reserving its maximum possible length. The attention kernel follows the block table to read the keys and values in the correct logical order. The last block may still have unused slots, but the system avoids requiring one large contiguous reservation per request.

Paged allocation is not the same thing as KV caching. **KV caching** says which computed tensors to keep and reuse. **PagedAttention** describes an attention implementation and memory layout that lets a serving system manage those tensors in blocks. It can reduce fragmentation and support sharing cache blocks for common prefixes; it does not make the actual keys and values disappear.

The vLLM paper introduced PagedAttention for this serving problem. In the current vLLM source, [`KVCacheManager`](https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/kv_cache_manager.py) handles cache blocks for requests, including reusing computed prefix blocks and allocating additional slots as requests advance.

## Cache Strategies and Trade-offs

The same KV data can be managed in different ways:

- A **dynamic cache** grows as tokens are added. It avoids reserving a maximum length in advance, but changing tensor shapes can make some compiled execution paths less convenient.
- A **static cache** reserves a known capacity up front. Stable shapes can help compilation, but requests shorter than the reserved capacity leave memory unused.
- A **sliding-window cache** keeps only a recent window in layers designed to use sliding-window attention. It bounds cache growth for those layers, but it is not a general replacement for full attention: dropping old keys changes what the model can attend to.
- **GQA/MQA** reduce cache size by storing fewer KV heads. They change the model's attention architecture rather than its cache allocator.

The right choice depends on the model, accelerator, serving workload, and generation strategy. A small single-request script may be fine with a simple dynamic cache. A high-throughput server has to consider allocator fragmentation, request lengths, batch size, and whether prefixes can be reused safely.

## Putting It Together

When an LLM streams an answer one token at a time, it does not need to forget and rebuild the entire conversation at every step. It processes the prompt, stores each layer's keys and values, and then adds the newest token's key and value after each decode step. That cache trades GPU memory for less repeated computation.

For a single request, the core idea is simple: **compute the prefix once, then reuse its keys and values**. For a serving fleet, the harder question is how to fit the growing caches for many requests into limited memory. Dynamic and static cache strategies, grouped-query attention, and paged allocation each address a different part of that problem.

## References

1. Hugging Face Transformers, [KV cache strategies](https://huggingface.co/docs/transformers/main/kv_cache)
2. Hugging Face Transformers source, [`DynamicLayer` in `cache_utils.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/cache_utils.py)
3. Kwon et al., [_Efficient Memory Management for Large Language Model Serving with PagedAttention_](https://arxiv.org/abs/2309.06180)
4. vLLM source, [`KVCacheManager`](https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/kv_cache_manager.py)
5. Ainslie et al., [_GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints_](https://arxiv.org/abs/2305.13245)
