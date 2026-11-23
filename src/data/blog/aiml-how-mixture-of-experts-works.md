---
author: JZ
pubDatetime: 2026-11-23T19:32:20Z
modDatetime: 2026-11-23T19:32:20Z
title: AI/ML - How Mixture of Experts Models Work
tags:
  - aiml-llm
  - design-system
description: "A beginner-friendly tour of MoE routers, sparse expert activation, load balancing, and why more model capacity brings memory and communication costs."
---

## Table of contents

## The idea: choose a small part of a large model

A standard Transformer layer sends every token through the same feed-forward network. That shared network is powerful, but it also means every token uses the same set of feed-forward weights.

A **Mixture-of-Experts (MoE)** layer replaces that one network with several alternatives called **experts** and adds a small **router**. For each token, the router selects which experts should process it.

Think of a support desk with several teams. A coordinator looks at each request and sends it to one or two teams that can handle it. The coordinator does not send every request to every team. In an MoE model, the router is the coordinator and each expert is a learned neural network.

The experts are not usually labeled by a person as “math,” “code,” or “history.” Training can cause them to specialize in different patterns, but those roles emerge from the data and are not guaranteed to be clean or exclusive.

## From one token to its selected experts

The router sees a token's hidden representation—its numeric state after earlier Transformer operations. It computes a score for each expert, keeps the top *k*, and combines those experts' outputs.

~~~text
                       router scores for token x
                    +------+------+------+------+
                    | E0   | E1   | E2   | E3   |
                    | 0.08 | 0.61 | 0.24 | 0.07 |
                    +------+------+------+------+
                              | top 2
                         +----+----+
                         |         |
                         v         v
                    +--------+  +--------+
                    | Expert1|  | Expert2|
                    |  E1(x) |  |  E2(x) |
                    +---+----+  +---+----+
                        |           |
                  weight 0.61   weight 0.24
                        +-----+-----+
                              |
                              v
                  weighted combination for x
~~~

A simplified version of the computation is:

**output(x) = sum(weight_i(x) * Expert_i(x))** for the selected experts.

The router and experts are ordinary learned parts of the model. The example scores above are illustrative; models differ in how they score, select, and normalize experts. Some use top-1 routing, while others use top-2 or a different sparse rule.

An MoE model does not replace the whole Transformer with experts. Attention, embeddings, and other layers are commonly shared. MoE is often used in place of selected feed-forward sublayers. A token can therefore use one set of experts in one layer and a different set in the next.

## Training teaches both the router and the experts

During training, the router makes a routing decision for each token, and the chosen experts process those tokens. The experts receive learning signals from the model's prediction loss, so their weights adapt to the tokens they see.

There is a practical problem: the router may send too many tokens to one expert and almost none to others. The busiest expert becomes a bottleneck, while the unused experts add model size without doing much work. MoE training methods use balancing losses or other routing rules to encourage traffic to spread across experts.

Many implementations also set an **expert capacity**: a limit on how many tokens an expert accepts in one batch. If too many tokens choose the same expert, the model needs a policy for the overflow. Some designs may drop or reroute tokens; others use approaches that avoid dropping them. The details vary, so “MoE” describes a family of designs rather than one exact routing algorithm.

At large scale, routing also affects where computation happens. If experts live on different GPUs, the system must send token representations to the devices that own the chosen experts, then collect their outputs. This communication can be a significant part of the runtime.

## More total parameters, fewer active experts per token

The main attraction is **conditional computation**. A model can contain many experts, while each token uses only a small subset of them. With a fixed top-*k* rule, adding more available experts increases the model's capacity without making every token run every expert.

Mixtral 8x7B is a concrete example. Its report describes eight feed-forward experts per MoE layer and selects two for each token. The model has about 47 billion total parameters, while about 13 billion parameters are active for a token during inference.

That does not make an MoE model automatically cheap to serve:

- **Compute:** only the selected experts run for a token, but shared layers and routing still cost compute.
- **Memory:** the model must keep its experts available, even when one token does not use most of them.
- **Communication:** tokens may have to move between devices to reach their experts.
- **Balance:** a busy expert can limit throughput even when the other experts are idle.

MoE is useful when a system needs more model capacity and can manage its routing and hardware costs. A dense model uses all of its feed-forward weights for every token; an MoE model spends that work selectively, and pays additional complexity to make the selection efficient.

## Common misunderstandings

**“Each expert is a separate model.”** An expert is one component inside a shared model. The router and shared layers participate in producing the final output.

**“Experts have fixed human-readable specialties.”** They may develop different behavior during training, but a model's expert numbers do not come with reliable names or clean subject boundaries.

**“More total parameters means more work per token.”** Not necessarily. The selected experts determine most of the expert-specific work. Total parameters still matter for memory and communication, and actual inference speed depends on the serving setup.

**“Every MoE uses the same routing rule.”** No. Top-1 and top-*k* routing, balancing objectives, capacity limits, and overflow handling differ across model families.

## References

1. Shazeer et al., [Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer](https://arxiv.org/abs/1701.06538).
2. Fedus, Zoph, and Shazeer, [Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity](https://arxiv.org/abs/2101.03961).
3. Mistral AI, [Mixtral of Experts](https://arxiv.org/abs/2401.04088).
4. Hugging Face, [Mixture of Experts Explained](https://huggingface.co/blog/moe).
