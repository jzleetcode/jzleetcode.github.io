---
author: JZ
pubDatetime: 2026-09-27T06:00:00Z
modDatetime: 2026-09-27T06:00:00Z
title: AI/ML - How Reinforcement Learning from Human Feedback (RLHF) Works
tags:
  - aiml-llm
description:
  "How RLHF works end to end: supervised fine-tuning, reward model training, PPO optimization, and the math behind aligning large language models with human preferences."
---

## Table of contents

## Context

You train a large language model on billions of words from the internet. It can complete sentences, write code, and summarize articles. But it also happily generates toxic content, makes up facts, and follows instructions in harmful ways. The model learned *what humans write*, not *what humans want*.

This gap between capability and alignment is the central problem RLHF solves. Instead of relying on static training data, RLHF lets humans teach the model what "good" output looks like through comparisons — and then uses reinforcement learning to steer the model toward those preferences.

The idea was popularized by OpenAI's [InstructGPT](https://arxiv.org/abs/2203.02155) paper (2022) and is the core technique behind ChatGPT, Claude, and most modern conversational AI systems.

```
            From Pre-training to Alignment

  Pre-trained LLM          Aligned LLM
  (knows language)         (follows instructions safely)

  "The president"    →     User: "Summarize this article"
  "of the United"          Assistant: "The article discusses
   States said..."          three key points: ..."

       Raw capability            Helpful, harmless, honest
              |                         ^
              |        RLHF             |
              +-------------------------+
```

RLHF has three stages. Let's walk through each one.

## Stage 1: Supervised Fine-Tuning (SFT)

Before any reinforcement learning happens, we need a starting point that is better than the raw pre-trained model. We collect a dataset of **(prompt, ideal response)** pairs, written by human annotators, and fine-tune the model on them using standard supervised learning.

```
  +------------------+     +--------------------+     +------------------+
  |  Pre-trained     |     |  Human-written     |     |  SFT Model       |
  |  LLM             | --> |  demonstrations    | --> |  (supervised     |
  |  (GPT, LLaMA...) |     |  (prompt, response)|     |   fine-tuned)   |
  +------------------+     +--------------------+     +------------------+

  Loss = standard cross-entropy (next token prediction)
  on the demonstration dataset
```

This step is straightforward fine-tuning. If you have read the [backpropagation post](/posts/aiml-how-backpropagation-works), the same gradient descent machinery applies here. The model learns to mimic the format and style of the demonstrations.

SFT alone produces a noticeably better model. But it is limited by the size and quality of the demonstration dataset. Writing thousands of perfect responses is expensive, and the model can only mimic — it has no way to learn *which aspects* of a response make it good or bad.

## Stage 2: Training a Reward Model

This is where RLHF diverges from standard fine-tuning. Instead of writing perfect answers, human annotators now **compare** two (or more) model outputs and say which one is better. This is much easier and faster than writing answers from scratch.

### Collecting comparison data

For each prompt, we sample multiple responses from the SFT model and present pairs to annotators:

```
  Prompt: "Explain quantum entanglement to a 10-year-old"

  Response A: "Quantum entanglement is a phenomenon in
  quantum mechanics where two particles become correlated
  such that the quantum state of one particle..."

  Response B: "Imagine you have two magic coins. When you
  flip one and it lands on heads, the other one — no matter
  how far away — always lands on tails..."

  Human annotator: B > A  (B is better)
```

### The Bradley-Terry model

We need to turn these pairwise comparisons into a trainable signal. The standard approach uses the **Bradley-Terry model**, which says the probability that response $y_w$ is preferred over response $y_l$ given prompt $x$ is:

$$P(y_w \succ y_l \mid x) = \sigma\big(r_\theta(x, y_w) - r_\theta(x, y_l)\big)$$

where $r_\theta$ is a scalar reward model (a neural network that outputs a single number for each prompt-response pair) and $\sigma$ is the sigmoid function $\sigma(z) = \frac{1}{1 + e^{-z}}$.

The loss function for the reward model is:

$$\mathcal{L}_{RM}(\theta) = -\mathbb{E}_{(x, y_w, y_l)} \Big[\log \sigma\big(r_\theta(x, y_w) - r_\theta(x, y_l)\big)\Big]$$

This is essentially binary cross-entropy. When the reward model correctly assigns a higher score to the preferred response, the loss is low. When it gets it wrong, the loss is high.

### Architecture

The reward model is typically initialized from the SFT model itself, with the language modeling head (the token prediction layer) replaced by a single scalar output:

```
  +-------------------------------------+
  |         Reward Model                |
  |                                     |
  |  +-----------------------------+    |
  |  |  Transformer layers         |    |
  |  |  (from SFT model weights)   |    |
  |  +-------------+---------------+    |
  |                |                    |
  |                v                    |
  |  +-----------------------------+    |
  |  |  Linear layer (hidden → 1)  |    |  <-- replaces the LM head
  |  +-------------+---------------+    |
  |                |                    |
  |                v                    |
  |           scalar reward             |
  |           r(x, y) = 3.7             |
  +-------------------------------------+
```

The model processes the full `[prompt + response]` sequence through the transformer, takes the hidden state at the last token, and projects it to a single number.

Here is a simplified PyTorch sketch:

```python
class RewardModel(nn.Module):
    def __init__(self, base_model):
        super().__init__()
        self.transformer = base_model.transformer
        self.reward_head = nn.Linear(base_model.config.hidden_size, 1)

    def forward(self, input_ids, attention_mask):
        hidden = self.transformer(input_ids, attention_mask).last_hidden_state
        # Take the last non-padding token's representation
        seq_lengths = attention_mask.sum(dim=1) - 1
        last_hidden = hidden[range(hidden.size(0)), seq_lengths]
        return self.reward_head(last_hidden).squeeze(-1)
```

Training loop (simplified):

```python
for batch in dataloader:
    r_w = reward_model(batch["chosen_ids"], batch["chosen_mask"])
    r_l = reward_model(batch["rejected_ids"], batch["rejected_mask"])
    loss = -torch.log(torch.sigmoid(r_w - r_l)).mean()
    loss.backward()
    optimizer.step()
```

A well-trained reward model acts as a **proxy for human judgment** — it can score any response without needing a human in the loop.

## Stage 3: Optimizing the Policy with PPO

Now we have a reward model that can score responses. The final stage uses **reinforcement learning** to optimize the language model (now called the **policy**) to generate responses that earn high rewards.

### The RL framing

In RL terms:

```
  +-------------------------------------------------------------------+
  |  RL Concept           LLM Mapping                                 |
  +-------------------------------------------------------------------+
  |  Environment          The prompt (input text)                     |
  |  Agent                The language model (policy)                 |
  |  Action               Generating the next token                  |
  |  State                Tokens generated so far                     |
  |  Reward               Score from the reward model                 |
  |  Episode              Generating one complete response            |
  +-------------------------------------------------------------------+
```

### The objective

We want to maximize the expected reward while staying close to the original SFT model. If we only maximize reward, the policy quickly finds degenerate outputs that exploit the reward model (reward hacking) — for example, repeating a phrase the reward model likes.

The objective includes a **KL divergence penalty** that prevents the policy from drifting too far from the SFT model:

$$\max_{\pi_\phi} \; \mathbb{E}_{x \sim D,\; y \sim \pi_\phi(\cdot|x)} \Big[ r_\theta(x, y) - \beta \cdot D_{KL}\big(\pi_\phi(\cdot|x) \;\|\; \pi_{SFT}(\cdot|x)\big) \Big]$$

where:
- $\pi_\phi$ is the policy (the model we are training)
- $\pi_{SFT}$ is the frozen SFT model (the reference)
- $\beta$ controls how strongly we penalize deviation
- $D_{KL}$ is the Kullback-Leibler divergence

In practice, the KL term is computed per-token:

$$D_{KL} = \sum_{t=1}^{T} \log \frac{\pi_\phi(y_t \mid x, y_{<t})}{\pi_{SFT}(y_t \mid x, y_{<t})}$$

### The PPO algorithm

**Proximal Policy Optimization** (PPO), from [Schulman et al. (2017)](https://arxiv.org/abs/1707.06347), is the RL algorithm used to optimize this objective. The key idea is to update the policy in small, stable steps.

Here is the full training loop at a high level:

```
  For each training iteration:
  +--------------------------------------------------------------+
  |                                                              |
  |  1. SAMPLE: Generate responses from current policy           |
  |     prompts x ~ D                                           |
  |     responses y ~ pi_phi(.|x)                               |
  |                                                              |
  |  2. SCORE: Compute rewards                                  |
  |     R(x,y) = r_theta(x,y) - beta * KL(pi_phi || pi_SFT)   |
  |                                                              |
  |  3. ESTIMATE ADVANTAGES:                                     |
  |     A_t = R_t - V(s_t)  (how much better than expected)     |
  |     using Generalized Advantage Estimation (GAE)             |
  |                                                              |
  |  4. UPDATE POLICY (multiple epochs on same batch):           |
  |     ratio = pi_phi(a|s) / pi_old(a|s)                       |
  |     L_clip = min(ratio * A, clip(ratio, 1-eps, 1+eps) * A)  |
  |     maximize L_clip                                          |
  |                                                              |
  |  5. UPDATE VALUE FUNCTION:                                   |
  |     minimize (V(s) - R)^2                                   |
  |                                                              |
  +--------------------------------------------------------------+
```

The **clipping** in step 4 is PPO's central innovation. Without it, a single large update could destabilize training. The clip function limits how much the probability ratio can change in one step:

$$L^{CLIP} = \mathbb{E}_t \Big[ \min\big( r_t(\phi) \cdot A_t, \;\text{clip}(r_t(\phi), 1-\epsilon, 1+\epsilon) \cdot A_t \big) \Big]$$

where $r_t(\phi) = \frac{\pi_\phi(a_t|s_t)}{\pi_{\text{old}}(a_t|s_t)}$ and $\epsilon$ is typically 0.2.

Visually, the clip works like this:

```
   L_clip as a function of ratio r

   If advantage A > 0 (action was good):
   ^
   |          ____________________
   |         /
   |        /
   |_______/
   +-------|-------|-------------> r
         1-eps   1+eps

   The policy is encouraged to increase r (make this
   action more likely), but only up to 1+eps.

   If advantage A < 0 (action was bad):
   ^
   |_______
   |       \
   |        \
   |         \____________________
   +-------|-------|-------------> r
         1-eps   1+eps

   The policy is encouraged to decrease r (make this
   action less likely), but only down to 1-eps.
```

This "trust region" keeps training stable — the model improves steadily without catastrophic forgetting.

### What happens in memory

During PPO training, four models need to be in memory simultaneously:

```
  +------------------+   +------------------+
  |  Policy Model    |   |  Reference Model |
  |  (pi_phi)        |   |  (pi_SFT)       |
  |  trainable       |   |  frozen          |
  +------------------+   +------------------+

  +------------------+   +------------------+
  |  Reward Model    |   |  Value Model     |
  |  (r_theta)       |   |  (V_phi)         |
  |  frozen          |   |  trainable       |
  +------------------+   +------------------+

  Total memory ~ 4x model size
  (This is why RLHF is expensive)
```

For a 7B parameter model, each copy takes roughly 14 GB in fp16, so you need around 56 GB of GPU memory just for the models — before accounting for activations and optimizer states. This is why techniques like LoRA (Low-Rank Adaptation) and DeepSpeed are commonly used.

## The Full Pipeline

Putting all three stages together:

```
  Stage 1: SFT                Stage 2: Reward Model         Stage 3: PPO
  +------------------+        +------------------+          +------------------+
  |  Pre-trained     |        |  SFT Model       |          |  SFT Model       |
  |  LLM             |        |  (init weights)  |          |  (policy init)   |
  +--------+---------+        +--------+---------+          +--------+---------+
           |                           |                             |
  human demonstrations        human comparisons              reward model scores
           |                           |                             |
           v                           v                             v
  +------------------+        +------------------+          +------------------+
  |  SFT Model       |        |  Reward Model    |          |  RLHF Model      |
  |  (fine-tuned)    |  --->  |  r(x,y) -> score |  --->    |  (aligned)       |
  +------------------+        +------------------+          +------------------+

  Effort: ~50K demos           ~300K comparisons              ~1M RL episodes
  (expensive per sample)      (cheap per sample)             (automated)
```

A key insight is that comparison data (Stage 2) is **much cheaper** to collect than demonstration data (Stage 1). Telling someone "A is better than B" takes seconds, while writing a perfect answer from scratch takes minutes. This economic advantage is what makes RLHF practical at scale.

## DPO: Skipping the Reward Model

A newer technique called **Direct Preference Optimization** (DPO), from [Rafailov et al. (2023)](https://arxiv.org/abs/2305.18290), shows that you can skip the reward model entirely. The insight is that the optimal policy under the RLHF objective has a closed-form relationship to the reward:

$$r^*(x, y) = \beta \log \frac{\pi^*(y|x)}{\pi_{SFT}(y|x)} + \beta \log Z(x)$$

Substituting this into the Bradley-Terry preference model gives a loss that depends only on the policy (no separate reward model needed):

$$\mathcal{L}_{DPO}(\phi) = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma \left( \beta \log \frac{\pi_\phi(y_w|x)}{\pi_{SFT}(y_w|x)} - \beta \log \frac{\pi_\phi(y_l|x)}{\pi_{SFT}(y_l|x)} \right) \right]$$

```
  RLHF (3-model pipeline):           DPO (direct optimization):

  SFT → Reward Model → PPO           SFT → Direct loss on preferences
                                      (single training loop, no RL)

  Pros: more flexible,               Pros: simpler, cheaper,
        reward model reusable              more stable training
  Cons: complex, expensive,           Cons: less flexible,
        reward hacking risk                 no reusable reward signal
```

DPO has become popular for smaller-scale alignment because it eliminates the complexity of RL. Many open-source models (Zephyr, Intel's Neural Chat) use DPO. However, large-scale systems often still use PPO or its variants because the explicit reward model provides more control and can be used for other tasks like filtering and monitoring.

## Why RLHF Matters

Without RLHF (or similar alignment techniques), a language model is a powerful but undirected tool. RLHF addresses three critical properties:

```
  Property        Without RLHF                 With RLHF
  --------------- ---------------------------- --------------------------
  Helpfulness     Answers are generic,         Follows instructions,
                  often miss the point         addresses user's intent

  Harmlessness    Will generate toxic,         Refuses harmful requests,
                  biased, or dangerous         avoids stereotypes
                  content on request

  Honesty         Confidently makes up         More likely to say "I
                  facts (hallucination)        don't know" or hedge
```

The reward model encodes these preferences as a learned function. When annotators consistently prefer honest, helpful, and harmless responses, the reward model learns to score those properties highly, and PPO optimizes the policy toward them.

## Challenges and Open Problems

**Reward hacking.** The policy can find outputs that score highly with the reward model but are not actually good. For example, it might learn to be excessively verbose or hedge everything, because the reward model slightly prefers cautious responses.

**Distributional shift.** The reward model was trained on outputs from the SFT model. As PPO changes the policy, it generates outputs the reward model has never seen, which can lead to unreliable scores.

**Scalable oversight.** For complex tasks (writing code, solving math), human annotators may not be able to reliably judge which response is better. This limits the quality of the reward model.

**Constitutional AI (CAI).** Anthropic's approach partially addresses scalable oversight by using an AI system to generate comparison data based on a set of principles (a "constitution"), reducing reliance on human annotators for routine judgments. See [Bai et al. (2022)](https://arxiv.org/abs/2212.08073).

## References

1. Training language models to follow instructions with human feedback (InstructGPT) [paper](https://arxiv.org/abs/2203.02155)
2. Proximal Policy Optimization Algorithms (PPO) [paper](https://arxiv.org/abs/1707.06347)
3. Direct Preference Optimization: Your Language Model is Secretly a Reward Model (DPO) [paper](https://arxiv.org/abs/2305.18290)
4. Constitutional AI: Harmlessness from AI Feedback (CAI) [paper](https://arxiv.org/abs/2212.08073)
5. Learning to summarize from human feedback (early RLHF for summarization) [paper](https://arxiv.org/abs/2009.01325)
6. Fine-Tuning Language Models from Human Preferences (original RLHF formulation) [paper](https://arxiv.org/abs/1909.08593)
7. Deep reinforcement learning from human preferences (Christiano et al.) [paper](https://arxiv.org/abs/1706.03400)
8. Hugging Face TRL library (RLHF implementation) [repo](https://github.com/huggingface/trl)
9. LMSYS Chatbot Arena (large-scale human preference collection) [site](https://chat.lmsys.org)
