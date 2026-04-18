---
author: JZ
pubDatetime: 2026-04-18T12:00:00Z
modDatetime: 2026-04-18T12:00:00Z
title: AI/ML - How the Transformer Attention Mechanism Works
tags:
  - design-system
  - ai-ml
description:
  "How the Transformer attention mechanism works: intuition behind queries/keys/values, scaled dot-product attention, multi-head attention, positional encoding, and a source code walkthrough from PyTorch and the original paper."
---

## Table of contents

## Context

Before 2017, sequence models like machine translation relied on **recurrent neural networks** (RNNs) and **LSTMs**. These models process tokens one at a time, left to right. This sequential nature creates two problems:

1. **Slow training.** You cannot parallelize across time steps — step 5 depends on step 4.
2. **Forgetting.** Information from early tokens fades as the sequence grows, even with gating mechanisms like LSTM cells.

In June 2017, Vaswani et al. published [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762), introducing the **Transformer**. The key insight: **replace recurrence entirely with attention**. Instead of passing information through a chain of hidden states, let every token look directly at every other token in parallel.

```
         RNN (sequential)                   Transformer (parallel)

   x1 --> h1 --> h2 --> h3 --> h4       x1  x2  x3  x4
                              |          |   |   |   |
                           output        +---+---+---+  <-- attention:
                                         |   |   |   |      every token
                                         v   v   v   v      sees all others
                                        y1  y2  y3  y4
```

This single change enabled training on thousands of GPUs simultaneously and led to GPT, BERT, and every large language model that followed. The Transformer is arguably the most influential neural network architecture of the last decade.

Let's walk through how it works, starting from the core building block: **attention**.

## The Intuition: Queries, Keys, and Values

Imagine you're at a library. You have a **question** (query), and the library has many **book titles** (keys) on the shelf. Each book has **content** (value). To answer your question, you:

1. Compare your question against every book title to see which ones are relevant.
2. Give higher weight to more relevant books.
3. Combine the content of those books, weighted by relevance, into your answer.

That's exactly what attention does:

```
  Query: "What is the capital of France?"

  Key 1: "Geography of France"   --> high relevance  (weight = 0.7)
  Key 2: "French cuisine"        --> some relevance   (weight = 0.2)
  Key 3: "History of Japan"      --> low relevance    (weight = 0.1)

  Output = 0.7 * Value_1 + 0.2 * Value_2 + 0.1 * Value_3
```

In a Transformer, every token in the input sequence generates all three: a query ("what am I looking for?"), a key ("what do I contain?"), and a value ("what information do I carry?"). Every token's query is compared against every token's key to decide how much to attend to each token's value.

## Scaled Dot-Product Attention

The mathematical core of the Transformer is this equation from Section 3.2.1 of the paper:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V$$

Let's break this down step by step.

### Step 1: Compute similarity scores

Multiply the query matrix $Q$ by the transpose of the key matrix $K^T$. Each entry $(i, j)$ in the resulting matrix is the **dot product** between query $i$ and key $j$ — a measure of how much token $i$ should attend to token $j$.

```
  Q (seq_len x d_k)     K^T (d_k x seq_len)     Scores (seq_len x seq_len)

  +---+---+---+        +---+---+---+---+        +-----+-----+-----+-----+
  | q1              |   | k1  k2  k3  k4 |        | s11   s12   s13   s14 |
  | q2              | x |                 |  =     | s21   s22   s23   s24 |
  | q3              |   |                 |        | s31   s32   s33   s34 |
  | q4              |   +---+---+---+---+        | s41   s42   s43   s44 |
  +---+---+---+                                  +-----+-----+-----+-----+

  where s_ij = dot(q_i, k_j) = how much token i attends to token j
```

### Step 2: Scale

Divide every score by $\sqrt{d_k}$, where $d_k$ is the dimension of the key vectors.

**Why scale?** When $d_k$ is large, dot products grow large in magnitude. Large values push softmax into regions where its gradient is extremely small (close to 0 or 1), making learning nearly impossible. The paper explains: *"We suspect that for large values of $d_k$, the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients."*

Concretely, if $d_k = 64$ and each component of $q$ and $k$ is roughly unit variance, the expected magnitude of the dot product is $\sqrt{d_k} = 8$. Dividing by $8$ brings it back to unit variance.

### Step 3: Softmax

Apply softmax row-wise, turning each row of raw scores into a probability distribution that sums to 1:

```
  Raw scores for token 2:   [2.1,  8.3,  0.5,  1.2]
                                     |
                               divide by sqrt(d_k)
                                     |
  Scaled scores:             [0.26, 1.04, 0.06, 0.15]
                                     |
                                  softmax
                                     |
  Attention weights:         [0.15, 0.52, 0.12, 0.21]
                                     |
                              (sums to 1.0)
```

### Step 4: Weighted sum of values

Multiply the attention weights by the value matrix $V$. Each output row is a weighted combination of all value vectors, where the weights reflect relevance:

```
  Weights (seq_len x seq_len)    V (seq_len x d_v)     Output (seq_len x d_v)

  +------+------+------+------+  +---+---+---+        +---+---+---+
  | 0.15   0.52   0.12   0.21 |  | v1            |     | o1            |
  |  ...                       |  | v2            |  =  | o2            |
  |  ...                       |  | v3            |     | o3            |
  |  ...                       |  | v4            |     | o4            |
  +------+------+------+------+  +---+---+---+        +---+---+---+

  o2 = 0.15*v1 + 0.52*v2 + 0.12*v3 + 0.21*v4
```

### In PyTorch

PyTorch implements this as [`torch.nn.functional.scaled_dot_product_attention`](https://github.com/pytorch/pytorch/blob/main/torch/nn/functional.py). The pure-math version looks like:

```python
import torch
import torch.nn.functional as F

def scaled_dot_product_attention(Q, K, V, mask=None):
    d_k = Q.size(-1)
    # Step 1 & 2: similarity scores, scaled
    scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_k ** 0.5)

    # Optional: mask out future tokens (for decoder / causal attention)
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    # Step 3: normalize to probabilities
    weights = F.softmax(scores, dim=-1)

    # Step 4: weighted combination of values
    return torch.matmul(weights, V), weights
```

That's around 5 lines of actual logic. The entire mechanism that powers GPT, BERT, and every modern LLM is built on matrix multiply, scale, softmax, matrix multiply.

## Multi-Head Attention

A single attention pass captures one "type" of relationship. But language has many simultaneous relationships: syntactic (subject-verb), semantic (synonyms), positional (nearby words), and more. **Multi-head attention** runs several attention passes in parallel, each learning a different relationship.

From Section 3.2.2 of the paper:

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) W^O$$

$$\text{where head}_i = \text{Attention}(Q W_i^Q, K W_i^K, V W_i^V)$$

Here's the process:

```
  Input embedding (d_model = 512)
         |
         +---> W_1^Q, W_1^K, W_1^V ---> Attention ---> head_1 (d_v = 64)
         |
         +---> W_2^Q, W_2^K, W_2^V ---> Attention ---> head_2 (d_v = 64)
         |
         +---> W_3^Q, W_3^K, W_3^V ---> Attention ---> head_3 (d_v = 64)
         |                  ...
         +---> W_8^Q, W_8^K, W_8^V ---> Attention ---> head_8 (d_v = 64)
                                                          |
                                                   Concat all heads
                                                   (8 x 64 = 512)
                                                          |
                                                        W^O
                                                          |
                                                   Output (512)
```

Each head projects $Q$, $K$, $V$ from the full $d_\text{model} = 512$ down to $d_k = d_v = 512 / 8 = 64$. After attention, the 8 heads are concatenated back to 512, then one more linear projection $W^O$ mixes the heads together.

**Why is this better than a single large attention?** The paper found multi-head attention outperforms single-head attention of equivalent total dimension. Each head can specialize: one head might learn positional adjacency, another might learn coreference (matching "it" to the noun it refers to), another might learn syntactic dependency.

### PyTorch implementation

PyTorch's [`torch.nn.MultiheadAttention`](https://github.com/pytorch/pytorch/blob/main/torch/nn/modules/activation.py) packs all three projection matrices ($W^Q$, $W^K$, $W^V$) into a single weight for efficiency:

```python
class MultiheadAttention(Module):
    def __init__(self, embed_dim, num_heads, dropout=0.0, bias=True, ...):
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads

        # All Q, K, V projections packed into one matrix (3 * embed_dim, embed_dim)
        self.in_proj_weight = Parameter(torch.empty((3 * embed_dim, embed_dim)))
        self.in_proj_bias = Parameter(torch.empty(3 * embed_dim))

        # Output projection W^O
        self.out_proj = Linear(embed_dim, embed_dim, bias=bias)
```

The single `in_proj_weight` of shape `(3 * 512, 512) = (1536, 512)` is split three ways during the forward pass:

```python
# Conceptually during forward:
q, k, v = input @ W_q, input @ W_k, input @ W_v

# But implemented as a single matmul then chunk:
qkv = input @ in_proj_weight.T  # (seq_len, 1536)
q, k, v = qkv.chunk(3, dim=-1)  # each is (seq_len, 512)
```

This single large matrix multiply is much faster on GPUs than three separate smaller ones, because it maximizes memory throughput and parallelism.

## The Full Transformer Block

Attention alone isn't enough. The Transformer wraps attention in a block with residual connections and feed-forward layers:

```
          Input
            |
            v
    +----------------+
    |   Multi-Head   |
    |   Attention    |
    +-------+--------+
            |
            + <--- Add (residual connection from input)
            |
            v
    +----------------+
    |  Layer Norm    |
    +-------+--------+
            |
            v
    +----------------+
    |  Feed-Forward  |
    |  Network (FFN) |
    |                |
    |  Linear(512,   |
    |    2048)       |
    |  ReLU          |
    |  Linear(2048,  |
    |    512)        |
    +-------+--------+
            |
            + <--- Add (residual connection)
            |
            v
    +----------------+
    |  Layer Norm    |
    +-------+--------+
            |
          Output
```

**Residual connections** (`Add`) let gradients flow directly through the network without vanishing. Without them, stacking 6+ layers of attention would make training extremely difficult.

**Layer normalization** stabilizes training by normalizing activations to zero mean and unit variance within each layer.

**Feed-forward network (FFN)** is a simple two-layer MLP applied identically to each token position:

$$\text{FFN}(x) = \text{ReLU}(x W_1 + b_1) W_2 + b_2$$

The FFN's inner dimension (2048) is 4x the model dimension (512). This expansion gives the model capacity to learn complex transformations. Think of attention as "gathering information from other tokens" and the FFN as "processing that gathered information."

## Positional Encoding: Giving Tokens a Sense of Order

Attention treats every token equally regardless of position — it's a set operation, not a sequence operation. The sentence "dog bites man" and "man bites dog" would produce identical attention weights without some notion of position.

The original Transformer uses **sinusoidal positional encodings**, adding a unique signal to each token based on its position:

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_\text{model}}}\right)$$

$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_\text{model}}}\right)$$

```
  Position 0:  [sin(0/1), cos(0/1), sin(0/100), cos(0/100), ...]
  Position 1:  [sin(1/1), cos(1/1), sin(1/100), cos(1/100), ...]
  Position 2:  [sin(2/1), cos(2/1), sin(2/100), cos(2/100), ...]
                 ^^^^^               ^^^^^^^^^^^
                 high frequency      low frequency
                 (changes fast)      (changes slowly)
```

Each dimension oscillates at a different frequency. Low-index dimensions change rapidly with position (capturing local ordering), while high-index dimensions change slowly (capturing global position). The sinusoidal pattern has a useful property: the positional encoding of any position $pos + k$ can be expressed as a linear function of the encoding at $pos$, allowing the model to learn relative positions.

```python
import torch
import math

def positional_encoding(seq_len, d_model):
    pe = torch.zeros(seq_len, d_model)
    position = torch.arange(0, seq_len).unsqueeze(1).float()
    div_term = torch.exp(
        torch.arange(0, d_model, 2).float() * -(math.log(10000.0) / d_model)
    )
    pe[:, 0::2] = torch.sin(position * div_term)  # even indices
    pe[:, 1::2] = torch.cos(position * div_term)  # odd indices
    return pe
```

Modern models like GPT and LLaMA use **learned** or **rotary** positional embeddings (RoPE) instead, but the sinusoidal encoding from the original paper remains the clearest way to understand why position information is needed and how it's injected.

## Encoder-Decoder Architecture

The original Transformer has two halves:

```
  Input tokens                              Output tokens (shifted right)
       |                                          |
       v                                          v
  +-----------+                             +-----------+
  | Embedding |                             | Embedding |
  |   + PE    |                             |   + PE    |
  +-----+-----+                             +-----+-----+
        |                                         |
  +-----+-----+                             +-----+-----+
  |           |                             |           |
  |  Self-    |                             |  Masked   |
  |  Attention|                             |  Self-    |
  |           |                             |  Attention|
  +-----------+                             +-----------+
        |                                         |
  +-----------+                             +-----------+
  | FFN       |                             | Cross-    |
  +-----------+                             | Attention |<--- K, V from encoder
        |                                   +-----------+
        |            x 6 layers                   |
        |                                   +-----------+
        v                                   | FFN       |
   Encoder                                  +-----------+
   Output                                        |
                                                  |      x 6 layers
                                                  v
                                            +-----------+
                                            | Linear +  |
                                            | Softmax   |
                                            +-----------+
                                                  |
                                            Next token
                                            probabilities
```

**Encoder (left):** Each token attends to all other tokens in the input. This is **bidirectional** — the word "bank" can look at both "river" and "account" to figure out which meaning is intended.

**Decoder (right):** Has three sub-layers:
1. **Masked self-attention:** Each output token attends only to previous output tokens (not future ones). This is done by setting future positions to $-\infty$ before softmax, forcing their weights to zero.
2. **Cross-attention:** Output tokens attend to all encoder positions. Queries come from the decoder, but keys and values come from the encoder output. This is how the decoder "reads" the input.
3. **FFN:** Same as in the encoder.

The masking in the decoder is critical for training. During training, all output positions are processed in parallel, but each position must only see positions before it — otherwise the model would be "cheating" by looking at the answer:

```
  Causal mask for sequence length 4:

         k1    k2    k3    k4
  q1  [  0   -inf  -inf  -inf ]    token 1 sees only itself
  q2  [  0     0   -inf  -inf ]    token 2 sees tokens 1-2
  q3  [  0     0     0   -inf ]    token 3 sees tokens 1-3
  q4  [  0     0     0     0  ]    token 4 sees tokens 1-4

  (added to scores before softmax; -inf becomes 0 after softmax)
```

## Self-Attention vs. Cross-Attention

The Transformer uses attention in three distinct ways:

```
  Type               Q from      K, V from     Where used
  ----------------  ----------  ------------  ----------------------
  Self-attention     same input  same input    Encoder, Decoder (masked)
  Cross-attention    decoder     encoder       Decoder middle layer
```

In **self-attention**, a sequence attends to itself — every token computes relevance scores against every other token in the same sequence. In **cross-attention**, queries come from one sequence (decoder) but keys and values come from another (encoder output). The math is identical; only the inputs differ.

## Computational Complexity

The attention mechanism's main cost is the $QK^T$ matrix multiplication, which is $O(n^2 \cdot d)$ where $n$ is the sequence length and $d$ is the dimension. The resulting attention matrix is $n \times n$.

```
  Sequence     Attention matrix     Memory
  length       size                 (float32)
  ---------   -----------------    ----------
    512         512 x 512            1 MB
   2048        2048 x 2048          16 MB
   8192        8192 x 8192         256 MB
  32768       32768 x 32768          4 GB
  131072     131072 x 131072        64 GB     (per head, per layer!)
```

This quadratic scaling is why long-context models are expensive. Research on efficient attention (FlashAttention, sparse attention, linear attention) focuses on reducing this $O(n^2)$ cost. **FlashAttention** by Dao et al. (2022) doesn't change the math but restructures the computation to minimize GPU memory reads/writes, achieving 2-4x speedup without approximation.

## Putting It All Together: A Token's Journey

Let's trace how a single token flows through one encoder layer:

```
  "The cat sat on the mat"

  Token: "sat" (position 2)
       |
       v
  1. Embedding lookup: "sat" --> [0.12, -0.45, 0.78, ...] (512-dim vector)

  2. Add positional encoding: + PE(pos=2) = [0.91, 0.54, 0.01, ...]
     Result: x = [1.03, 0.09, 0.79, ...]

  3. Multi-head attention (8 heads):
     For each head i:
       q_i = x @ W_i^Q          project to 64-dim query
       k_i = x @ W_i^K          project to 64-dim key   (for ALL tokens)
       v_i = x @ W_i^V          project to 64-dim value  (for ALL tokens)

       scores_i = q_sat . [k_the, k_cat, k_sat, k_on, k_the, k_mat] / sqrt(64)
       weights_i = softmax(scores_i)
       head_i = weights_i @ [v_the, v_cat, v_sat, v_on, v_the, v_mat]

     Concat 8 heads: [head_1 | head_2 | ... | head_8]  (512-dim)
     Output projection: concat @ W^O

  4. Residual + LayerNorm:
     attn_out = LayerNorm(x + attention_output)

  5. Feed-forward:
     ffn_out = ReLU(attn_out @ W_1 + b_1) @ W_2 + b_2

  6. Residual + LayerNorm:
     output = LayerNorm(attn_out + ffn_out)
       |
       v
     [0.34, -0.22, 0.91, ...]  (512-dim, enriched with context)
```

The input was an isolated word embedding. The output is that same word, now enriched with information from every other word in the sentence. The word "sat" now "knows" that a cat did the sitting, and that it happened on a mat.

## Why Transformers Dominate

The Transformer's success comes from several reinforcing advantages:

1. **Parallelism.** Unlike RNNs, all positions are processed simultaneously during training. A 1000-token sequence takes the same number of GPU steps as a 1-token sequence (ignoring memory).
2. **Direct long-range connections.** Any token can attend to any other token in a single layer — no need to propagate through a chain of hidden states.
3. **Scalability.** The architecture scales gracefully with more data, parameters, and compute. This property, documented in Kaplan et al.'s *Scaling Laws for Neural Language Models* (2020), is what made GPT-3, GPT-4, and Claude possible.
4. **Flexibility.** The same architecture handles text (GPT, BERT), images (Vision Transformer), audio (Whisper), protein sequences (AlphaFold 2), and more.

## References

1. Vaswani et al., *Attention Is All You Need* (2017) [paper](https://arxiv.org/abs/1706.03762)
2. PyTorch `MultiheadAttention` implementation [`torch.nn.modules.activation`](https://github.com/pytorch/pytorch/blob/main/torch/nn/modules/activation.py)
3. PyTorch `scaled_dot_product_attention` [`torch.nn.functional`](https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html)
4. Rush, *The Annotated Transformer* (2018) [blog](https://nlp.seas.harvard.edu/annotated-transformer/)
5. Dao et al., *FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness* (2022) [paper](https://arxiv.org/abs/2205.14135)
6. Kaplan et al., *Scaling Laws for Neural Language Models* (2020) [paper](https://arxiv.org/abs/2001.08361)
7. Devlin et al., *BERT: Pre-training of Deep Bidirectional Transformers* (2019) [paper](https://arxiv.org/abs/1810.04805)
8. Su et al., *RoFormer: Enhanced Transformer with Rotary Position Embedding* (2021) [paper](https://arxiv.org/abs/2104.09864)
