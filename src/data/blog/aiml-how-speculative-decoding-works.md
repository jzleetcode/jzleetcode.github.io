---
author: JZ
pubDatetime: 2026-10-10T18:30:00Z
modDatetime: 2026-10-10T18:30:00Z
title: AI/ML - How Speculative Decoding Speeds Up LLM Generation
tags:
  - design-system
  - ai-ml
description: "A practical explanation of speculative decoding: how a small draft model proposes tokens, a larger model verifies them in parallel, and rejection sampling preserves the target model's output distribution."
---

## Table of contents

- [The one-token bottleneck](#the-one-token-bottleneck)
- [Draft and verify](#draft-and-verify)
- [One speculative round](#one-speculative-round)
- [Why the output distribution stays the same](#why-the-output-distribution-stays-the-same)
- [When it helps](#when-it-helps)
- [What it does not do](#what-it-does-not-do)
- [References](#references)

## The One-Token Bottleneck

An autoregressive language model writes a response one token at a time. To produce token 2, it needs token 1. To produce token 3, it needs tokens 1 and 2. Even when a GPU can do a lot of arithmetic in parallel, the next token cannot be chosen until the current step finishes.

That creates a strange workload. A large model may spend a lot of time moving its weights from GPU memory for each small decoding step. The GPU can be underused while the application waits for the next step to finish. The [LLM KV-cache article](./aiml-how-llm-kv-cache-works.md) explains how the cache avoids recalculating earlier attention values; speculative decoding attacks a different cost: the number of sequential steps the large model must take.

The basic question is: can a cheaper process guess several future tokens, then ask the large model to check those guesses together?

## Draft and Verify

Speculative decoding uses two probability distributions:

- `q`: a draft distribution that is cheap to evaluate. It might come from a smaller draft model.
- `p`: the target distribution from the large model whose behavior we want to preserve.

The draft model generates a short candidate continuation. The target model then processes the prompt plus those candidates in one forward pass. Because a Transformer can calculate outputs for multiple sequence positions in parallel while applying a causal attention mask, the target can score each candidate position without waiting for a separate target-model call after every token.

```text
                         propose k tokens
Prompt ────────────────> Draft model ───────────────> y1, y2, ..., yk
   │                                                     │
   └──────────────────── Target model <─────────────────┘
                         score each position together
                                    │
                           accept a prefix, then
                           correct the first reject
```

The target still does the authoritative work. The draft is allowed to be wrong; its job is to create candidates that the target can check efficiently.

## One Speculative Round

Suppose the draft proposes four tokens: `y1`, `y2`, `y3`, and `y4`.

1. The draft samples those tokens one after another from its own next-token distributions, called `q1` through `q4`.
2. The target evaluates the same four positions in a single forward pass and produces `p1` through `p4`.
3. Starting from the left, the sampler checks each draft token against the target distribution. An accepted token becomes part of the output. At the first rejection, later draft tokens are discarded.
4. The sampler draws a corrected token at the rejected position from the target distribution's residual, then starts another round from the now-longer prefix.
5. If all four draft tokens are accepted, the target samples one more token from the distribution after `y4`.

The acceptance check for a proposed token `y` at a position is:

```text
accept with probability min(1, p(y) / q(y))
```

If the candidate is rejected, the replacement is sampled from the normalized positive difference between the target and draft distributions:

```text
residual(x) = max(0, p(x) - q(x))
```

The residual step is not an optional quality improvement. It is the correction that prevents a draft model with different preferences from biasing the final output.

## Why the Output Distribution Stays the Same

Imagine the draft gives a candidate token a probability of `0.5`, while the target gives it `0.4`. The sampler accepts that candidate with probability `0.4 / 0.5 = 0.8`. In the remaining cases, it rejects the candidate and draws from the residual distribution. Across accepted and corrected outcomes, the next emitted token follows the target distribution.

This is the central promise of speculative sampling: it can reduce sequential target-model work without changing the target model's sampling distribution. It does not promise that two runs with different random-number draws produce identical text. It promises the same probability distribution over possible continuations.

For greedy decoding, the same idea has a simpler form: accept draft tokens while each equals the target model's highest-scoring token; at the first mismatch, emit the target's choice instead. The sampling algorithm above is more subtle because it preserves a full distribution rather than only the top choice.

## When It Helps

Speculation pays when the cost of drafting and verifying a block is lower than asking the target model for the same number of tokens sequentially. A smaller draft model can make good guesses, and the target can check those guesses in parallel. This is especially attractive when target-model decoding is limited by repeatedly reading large model weights from GPU memory.

The important quantity is the accepted prefix length. If the draft often matches what the target would produce, one target pass can yield several output tokens. If the draft disagrees early, the target still did verification work and the draft added overhead.

Block size is a trade-off. A larger block gives the draft more chances to get ahead, but also increases draft work and target verification work. A smaller block reduces wasted work after early rejection. The best choice depends on the model pair, prompt, sampling settings, hardware, and serving load; there is no universal speedup percentage.

## What It Does Not Do

- It does not replace the target model. The target evaluates every candidate block and determines the output.
- It does not mean a transaction or request can safely accept arbitrary draft output. Sampling correction is essential when exact target-distribution behavior matters.
- It does not guarantee lower latency. If draft tokens are rarely accepted, or drafting and verification cost too much, ordinary decoding can be faster.
- It is not the same as batching unrelated users. Speculation creates candidate tokens for one sequence; batching combines work from multiple sequences.

The original papers describe the distribution-preserving algorithms, while serving engines add practical choices for how to produce candidates and how many to verify. The vLLM guide frames speculative decoding as a way to reduce inter-token latency in medium-to-low-QPS, memory-bound workloads. It also documents acceptance metrics, which help operators tell whether draft tokens are being reused often enough to justify the extra work.

## References

1. [Leviathan, Kalman, and Matias, “Fast Inference from Transformers via Speculative Decoding”](https://arxiv.org/abs/2211.17192), ICML 2023.
2. [Chen et al., “Accelerating Large Language Model Decoding with Speculative Sampling”](https://arxiv.org/abs/2302.01318), 2023.
3. [vLLM documentation: Speculative Decoding](https://docs.vllm.ai/en/latest/features/speculative_decoding/), including [acceptance metrics](https://docs.vllm.ai/en/latest/features/speculative_decoding/acceptance_metrics/).
4. [How the LLM KV Cache Works](./aiml-how-llm-kv-cache-works.md), for the complementary cache optimization.
