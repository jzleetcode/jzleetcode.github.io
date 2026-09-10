---
author: JZ
pubDatetime: 2026-09-10T12:01:00Z
modDatetime: 2026-09-10T12:01:00Z
title: AI/ML - How Neural Network Backpropagation Works
tags:
  - aiml
description:
  "How backpropagation trains neural networks: the chain rule on computational graphs, forward pass, backward pass, gradient flow, vanishing gradients, and a source code walkthrough of PyTorch's autograd engine."
---

## Table of contents

## Context

A neural network is, at its core, a function that takes an input (like an image or a sentence) and produces an output (like a label or a probability). When we first create a network, its parameters — the "weights" — are random. It produces garbage. Training is the process of adjusting these weights so the network's output gets closer to the correct answer.

But how do you know *which direction* to adjust each weight, and by *how much*? In a network with millions of parameters, you cannot try every combination. You need a systematic way to compute, for each weight, how much it contributed to the error.

That algorithm is **backpropagation** (short for "backward propagation of errors"). It was popularized by Rumelhart, Hinton, and Williams in their 1986 paper, and it remains the engine that trains every deep learning model today — from the image classifiers on your phone to GPT and diffusion models.

The key insight: if you organize the computation as a **graph**, you can use the chain rule from calculus to efficiently compute the gradient (the direction and magnitude of change) for every weight in the network, in a single backward pass.

```
                 The Training Loop

  +----------+      +-----------+      +--------+
  |  Input   |----->|  Forward  |----->|  Loss  |
  |  (data)  |      |   Pass    |      | (error)|
  +----------+      +-----------+      +----+---+
                          ^                  |
                          |                  | how wrong?
                     +----+----+             |
                     |  Update |<------------+
                     | weights |   Backward Pass
                     +---------+   (backpropagation)
```

The loop repeats thousands or millions of times: feed data forward, measure the error, propagate gradients backward, nudge the weights. Each iteration makes the network a little less wrong.

## A Concrete Example: One Neuron

Before we tackle full networks, let's trace backpropagation through a single neuron. A neuron computes:

$$z = w \cdot x + b$$
$$a = \sigma(z)$$

where $x$ is the input, $w$ is the weight, $b$ is the bias, and $\sigma$ is an activation function (say, sigmoid: $\sigma(z) = \frac{1}{1 + e^{-z}}$).

Suppose we have a target value $y$, and we measure error with mean squared error: $L = (a - y)^2$.

We want $\frac{\partial L}{\partial w}$ — how much does the loss change when we wiggle $w$? The chain rule says:

$$\frac{\partial L}{\partial w} = \frac{\partial L}{\partial a} \cdot \frac{\partial a}{\partial z} \cdot \frac{\partial z}{\partial w}$$

Each piece is simple:

```
  Forward pass (left to right):
  ==============================

    x=2.0    w=0.5    b=0.1
      \       |       /
       \      |      /
        v     v     v
      +---------------+
      | z = w*x + b   |   z = 0.5 * 2.0 + 0.1 = 1.1
      +-------+-------+
              |
              v
      +---------------+
      | a = sigmoid(z)|   a = sigmoid(1.1) = 0.7503
      +-------+-------+
              |
              v
      +---------------+
      | L = (a - y)^2 |   y = 1.0, L = (0.7503 - 1.0)^2 = 0.0624
      +---------------+


  Backward pass (right to left):
  ===============================

      dL/dL = 1.0                         (start here)
         |
         v
      dL/da = 2(a - y) = 2(0.7503 - 1.0) = -0.4994
         |
         v
      da/dz = a(1-a) = 0.7503 * 0.2497   = 0.1874
         |
         v
      dL/dz = dL/da * da/dz = -0.4994 * 0.1874 = -0.0936
        / \
       /   \
      v     v
    dz/dw = x = 2.0        dz/db = 1.0
      |                       |
      v                       v
    dL/dw = -0.0936 * 2.0    dL/db = -0.0936 * 1.0
          = -0.1872                 = -0.0936
```

The gradient $\frac{\partial L}{\partial w} = -0.1872$ tells us: increasing $w$ slightly would *decrease* the loss (negative gradient). So we should increase $w$. With a learning rate $\eta = 0.1$:

$$w_{\text{new}} = w - \eta \cdot \frac{\partial L}{\partial w} = 0.5 - 0.1 \times (-0.1872) = 0.5187$$

That's one step of gradient descent. Repeat thousands of times, and the network converges.

## Computational Graphs: The Data Structure Behind Backpropagation

The example above had three operations. A real network has millions. Backpropagation scales because it represents computation as a **directed acyclic graph (DAG)** where:

- Each **node** is an operation (add, multiply, sigmoid, matrix multiply, etc.).
- Each **edge** carries a tensor (the data flowing between operations).
- Each node knows how to compute its **local gradient** — the derivative of its output with respect to its inputs.

```
  Computational Graph for z = (a + b) * c

       a ----+
              |
              v
       b --->(+)----> d --->(*)----> z
                              ^
                              |
       c ---------------------+

  Forward:  d = a + b,  z = d * c

  Backward: dz/dd = c,   dz/dc = d
            dd/da = 1,   dd/db = 1

  Chain rule:
    dz/da = dz/dd * dd/da = c * 1 = c
    dz/db = dz/dd * dd/db = c * 1 = c
    dz/dc = d
```

The beauty is that **each node only needs to know its local gradient**. The chain rule stitches them together. This modularity is what makes deep learning frameworks like PyTorch possible — you can compose arbitrary operations, and backpropagation "just works."

## The Algorithm: Forward Then Backward

Here is backpropagation stated precisely:

### Forward Pass

Walk the graph from inputs to output. At each node, compute the output from the inputs and **save any values needed for the backward pass** (this is called "saving for backward" or "activation checkpointing" when memory-optimized).

### Backward Pass

Walk the graph from output back to inputs. At each node:

1. Receive the **upstream gradient** $\frac{\partial L}{\partial \text{output}}$ from the node above.
2. Compute the **local gradient** $\frac{\partial \text{output}}{\partial \text{input}}$.
3. Multiply them: **downstream gradient** = upstream $\times$ local.
4. Pass the downstream gradient to the input nodes.

```
  Backward Pass Through a Multi-Layer Network

  Layer 1         Layer 2         Layer 3        Loss
  +---------+     +---------+     +---------+    +------+
  | x -> h1 |---->| h1-> h2 |---->| h2-> y  |--->| L(y) |
  +---------+     +---------+     +---------+    +------+
       ^               ^               ^             |
       |               |               |             |
       +----dL/dW1-----+----dL/dW2-----+---dL/dW3---+
                                                     |
                                              dL/dL = 1
                                              (seed)

  The gradient flows backward like water:
  1. dL/dy  = dL/dL * dL/dy          (loss layer)
  2. dL/dh2 = dL/dy * dy/dh2         (layer 3)
  3. dL/dh1 = dL/dh2 * dh2/dh1       (layer 2)
  4. dL/dW1 = dL/dh1 * dh1/dW1       (layer 1)
```

When a node has **multiple consumers** (its output feeds into two or more downstream nodes), the gradients from all consumers are **summed**. This follows from the multivariate chain rule: if $z = f(x)$ and $z = g(x)$ both use $x$, then $\frac{\partial L}{\partial x} = \frac{\partial L}{\partial f} \cdot \frac{\partial f}{\partial x} + \frac{\partial L}{\partial g} \cdot \frac{\partial g}{\partial x}$.

```
  Gradient Accumulation When a Value is Used Twice

            +---> f(x) ---+
            |              |
  x --------+              +---> L
            |              |
            +---> g(x) ---+

  dL/dx = dL/df * df/dx  +  dL/dg * dg/dx
          ~~~~~~~~~~~~~~~    ~~~~~~~~~~~~~~~
          (from f branch)    (from g branch)
```

## Time Complexity: Why Backpropagation Is Efficient

A naive approach to computing gradients would perturb each weight one at a time and re-run the forward pass to see how the loss changes. For $N$ weights, that's $O(N)$ forward passes.

Backpropagation computes **all** $N$ gradients in a single backward pass that costs roughly the same as one forward pass. The total cost is $O(1)$ forward passes, regardless of how many weights you have.

```
  Naive (numerical differentiation):
    For each of N weights:
      perturb w_i by epsilon
      run forward pass
      compute (L(w+eps) - L(w)) / eps
    Total: O(N) forward passes

  Backpropagation:
    1 forward pass  +  1 backward pass
    Total: O(1) forward passes  (backward ≈ 2-3x forward cost)
```

For a model like GPT-3 with 175 billion parameters, the naive approach would require 175 billion forward passes per training step. Backpropagation does it in one. This is why backpropagation unlocked deep learning — without it, training large networks would be computationally impossible.

## Inside PyTorch's Autograd Engine

PyTorch implements backpropagation through its **autograd** system. When you set `requires_grad=True` on a tensor, PyTorch starts recording every operation on it into a computational graph. Let's see this in action:

```python
import torch

# Create tensors with gradient tracking
x = torch.tensor(2.0)
w = torch.tensor(0.5, requires_grad=True)
b = torch.tensor(0.1, requires_grad=True)
y = torch.tensor(1.0)

# Forward pass — PyTorch builds the graph as we compute
z = w * x + b              # linear combination
a = torch.sigmoid(z)       # activation
loss = (a - y) ** 2        # MSE loss

# Backward pass — one call computes ALL gradients
loss.backward()

print(f"dL/dw = {w.grad:.4f}")  # -0.1872
print(f"dL/db = {b.grad:.4f}")  # -0.0936
```

These match our hand-computed values exactly. But how does PyTorch do this under the hood?

### The Graph: Nodes and Edges

Every tensor in PyTorch has a `grad_fn` attribute that points to the **Function** (node) that created it. Each Function knows:

1. What operation it performed (multiply, add, sigmoid, etc.).
2. What inputs it received (saved for the backward pass).
3. How to compute the local gradient (its `backward()` method).

```
  PyTorch's Autograd Graph for loss = (sigmoid(w*x + b) - y)^2

  w (leaf)      x         b (leaf)      y
    \           |           /            |
     \          |          /             |
      v         v         v             |
    [MulBackward0]   (no grad)         |
          |                             |
          v                             |
    [AddBackward0] <--- b              |
          |                             |
          v                             |
    [SigmoidBackward0]                 |
          |                             |
          v                             v
    [SubBackward0] <-------------------.
          |
          v
    [PowBackward0]   <-- loss.grad_fn
```

When you call `loss.backward()`, PyTorch walks this graph in **reverse topological order** — from `PowBackward0` back to the leaf tensors `w` and `b`.

### The Engine: C++ Under the Hood

The actual backward traversal happens in C++ for performance. The entry point is in [`torch/csrc/autograd/engine.cpp`](https://github.com/pytorch/pytorch/blob/main/torch/csrc/autograd/engine.cpp). The core loop (simplified) looks like:

```cpp
auto Engine::execute(const edge_list& roots,
                     const variable_list& inputs) -> variable_list {
    // 1. Build a topological ordering of nodes to process
    GraphTask graph_task(/* ... */);
    compute_dependencies(graph_task, roots);

    // 2. Seed the output gradient (dL/dL = 1.0)
    // and enqueue the root node (loss.grad_fn)

    // 3. Process nodes in reverse topological order
    while (!ready_queue.empty()) {
        auto task = ready_queue.pop();
        auto& fn = task.fn;  // e.g., PowBackward0

        // Call the node's backward() to get local gradients
        auto outputs = fn.apply(task.inputs);

        // Distribute gradients to input nodes
        for (int i = 0; i < outputs.size(); i++) {
            auto& edge = fn.next_edges()[i];
            // Accumulate gradient (handles the fan-out/sum case)
            edge.function->accumulate_grad(outputs[i]);

            // If all of this node's consumers have sent gradients,
            // it's ready to process
            if (--dependencies[edge.function] == 0) {
                ready_queue.push(edge);
            }
        }
    }
}
```

The key insight in the implementation: **dependency counting**. Each node tracks how many downstream consumers need to send gradients before it can run its own backward. Only when all incoming gradients are accumulated does the node fire. This is exactly a **reverse topological sort** driven by a queue.

### How Individual Operations Define Their Backward

Each operation (add, multiply, sigmoid, etc.) defines a backward function. These are generated from **derivative formulas** in [`tools/autograd/derivatives.yaml`](https://github.com/pytorch/pytorch/blob/main/tools/autograd/derivatives.yaml):

```yaml
# From PyTorch's derivatives.yaml (simplified)

- name: mul.Tensor(Tensor self, Tensor other) -> Tensor
  self: "grad * other"           # d(a*b)/da = b
  other: "grad * self"           # d(a*b)/db = a

- name: add.Tensor(Tensor self, Tensor other) -> Tensor
  self: "grad"                   # d(a+b)/da = 1, so grad * 1
  other: "grad"                  # d(a+b)/db = 1

- name: sigmoid(Tensor self) -> Tensor
  self: "grad * result * (1 - result)"  # sigmoid'(z) = sig(z)(1-sig(z))

- name: pow.Tensor_Scalar(Tensor self, Scalar exponent) -> Tensor
  self: "grad * exponent * self.pow(exponent - 1)"  # power rule
```

PyTorch's code generation reads this YAML and produces C++ backward functions automatically. When you write a new custom operation, you can define its backward the same way — tell the framework the local gradient, and backpropagation handles the rest.

## The Vanishing Gradient Problem

Backpropagation multiplies gradients at each layer. In a deep network with $n$ layers, the gradient at the first layer involves a product of $n$ terms:

$$\frac{\partial L}{\partial W_1} = \frac{\partial L}{\partial h_n} \cdot \frac{\partial h_n}{\partial h_{n-1}} \cdot \ldots \cdot \frac{\partial h_2}{\partial h_1} \cdot \frac{\partial h_1}{\partial W_1}$$

If each $\frac{\partial h_{i+1}}{\partial h_i}$ is less than 1 (as happens with sigmoid, whose derivative peaks at 0.25), the product shrinks exponentially:

```
  Gradient magnitude across layers (sigmoid activation)

  Layer:    10      8       6       4       2       1
  Grad:   1.0    0.25   0.0625  0.0156  0.0039  0.00098
            |      |       |       |       |        |
            v      v       v       v       v        v
  ====================================================>
  [##########][######][####][##][#][ ]
                                      ^
                                      |
                               gradient nearly zero
                               (layer 1 barely learns)
```

The early layers — the ones that detect basic features — receive almost no gradient signal. They stop learning. This is the **vanishing gradient problem**, and it plagued deep networks for decades.

### Solutions

Several innovations addressed vanishing gradients:

**ReLU activation** ($f(x) = \max(0, x)$): Its derivative is either 0 or 1 — no shrinking. Introduced by Glorot et al. (2011), it became the default activation for hidden layers.

**Residual connections** (skip connections): Instead of $h_{l+1} = f(h_l)$, compute $h_{l+1} = f(h_l) + h_l$. The additive shortcut gives gradients a "highway" that bypasses the nonlinearity:

```
           Residual Connection

     h_l ----+---> [Layer] ---> (+) ---> h_{l+1}
              |                  ^
              |                  |
              +------------------+
                (identity shortcut)

  Gradient flow:
    dh_{l+1}/dh_l = df/dh_l + 1
                              ^^^
                    gradient is at LEAST 1
                    (never vanishes completely)
```

This is why ResNets (2015) and Transformers (which use residual connections around every attention and feed-forward block) can be hundreds of layers deep and still train effectively.

**Batch normalization**: Normalizes activations at each layer, keeping gradients in a healthy range. **Layer normalization** serves the same purpose in transformers.

**Careful initialization**: Xavier (Glorot) and Kaiming (He) initialization set the initial weight scale so that activations and gradients neither explode nor vanish at the start of training.

## Backpropagation Through Time (BPTT)

When backpropagation is applied to recurrent neural networks (RNNs) that process sequences, it's called **Backpropagation Through Time** (BPTT). The recurrence is "unrolled" into a long chain:

```
  Unrolled RNN processing "the cat sat"

   x_1="the"   x_2="cat"   x_3="sat"
      |            |            |
      v            v            v
  +-------+   +-------+   +-------+
  | RNN   |-->| RNN   |-->| RNN   |--> output
  | cell  |   | cell  |   | cell  |
  +-------+   +-------+   +-------+
   h_0->h_1    h_1->h_2    h_2->h_3

  Same weights W shared across all timesteps!

  Backward: gradient flows right-to-left through all steps.
  For long sequences (100+ steps), this is where vanishing
  gradients hit hardest — motivating LSTMs and Transformers.
```

The shared weights mean gradients from each timestep are **summed** (just like the fan-out case). For long sequences, the multiplicative chain through $h_1 \to h_2 \to \ldots \to h_T$ causes severe vanishing or exploding gradients. This is why:

- **LSTMs** (1997) added gating mechanisms — learned gates that control gradient flow, acting like the residual connections above.
- **Transformers** (2017) replaced recurrence entirely with attention, where each position can directly access every other position. No long multiplicative chain, no vanishing gradient problem across sequence length.

## Backpropagation and Modern Transformers

In a transformer, backpropagation flows through:

1. **Loss** → output logits → final layer norm → final feed-forward block
2. Through each transformer layer: residual → attention → residual → FFN
3. Down to the embedding layer

```
  Gradient Flow in a Transformer Block

                      +------ dL/dh ------+
                      |                    |
                      v                    |
  h_in ---> [LayerNorm] --> [Attention] --->(+)---> h_mid
                                            ^
                                            |
                                  (residual: dL/dh_mid
                                   passes straight through)

                      +------ dL/dh_mid ---+
                      |                    |
                      v                    |
  h_mid --> [LayerNorm] --> [FFN] --------->(+)---> h_out
                                             ^
                                             |
                                   (residual again)
```

The residual connections ensure that $\frac{\partial h_{\text{out}}}{\partial h_{\text{in}}}$ always has an additive identity component. Even if the attention or FFN gradients vanish, the identity path carries the gradient through. This is why transformers can stack 100+ layers.

The attention mechanism itself has a well-defined backward pass. For the scaled dot-product attention $\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$, the gradients with respect to $Q$, $K$, and $V$ flow through the softmax and the matrix multiplications — each of which has a known derivative formula, all registered in PyTorch's `derivatives.yaml`.

## Practical Details

### Gradient Clipping

Even with modern architectures, gradients can occasionally spike (especially during early training). **Gradient clipping** caps the gradient norm:

```python
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

This rescales all gradients proportionally so their combined L2 norm doesn't exceed the threshold. It prevents a single bad batch from destabilizing the model.

### Mixed Precision Training

Modern GPUs have specialized hardware for 16-bit floating point (FP16/BF16). Mixed precision training runs the forward and backward pass in 16-bit but keeps a 32-bit "master copy" of the weights for the update step. The 16-bit gradients are less precise but 2x faster to compute and require half the memory.

PyTorch's `torch.amp` (automatic mixed precision) handles this automatically, including **loss scaling** — multiplying the loss by a large constant before backward to prevent small gradients from underflowing to zero in FP16, then dividing back before the weight update.

### Gradient Accumulation

When your model is too large to fit a useful batch size in GPU memory, you can simulate a larger batch by accumulating gradients across multiple forward-backward passes before updating:

```python
optimizer.zero_grad()
for i, (inputs, targets) in enumerate(dataloader):
    loss = model(inputs, targets) / accumulation_steps
    loss.backward()  # gradients accumulate in .grad

    if (i + 1) % accumulation_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

The gradients from each `backward()` call are **summed** into the `.grad` tensors (they aren't reset until `zero_grad()`). After $k$ steps, you have the same gradient as a $k\times$ larger batch.

## Summary

Backpropagation is a single idea — the chain rule applied systematically to computational graphs — but it enables everything in modern deep learning. The algorithm itself is elegant:

1. **Build** a computational graph during the forward pass.
2. **Seed** the output gradient with 1.0.
3. **Walk backward** through the graph, multiplying upstream gradients by local gradients.
4. **Sum** gradients when paths merge (multivariate chain rule).
5. **Update** weights using the computed gradients (gradient descent).

The challenges (vanishing gradients, numerical precision, memory) are solved not by changing backpropagation itself, but by designing architectures (residual connections, normalization, gating) and training techniques (clipping, mixed precision, accumulation) that keep the gradient signal healthy as it flows backward through billions of parameters.

## References

1. Learning representations by back-propagating errors, Rumelhart, Hinton, and Williams (1986) [paper](https://www.nature.com/articles/323533a0)
2. PyTorch autograd engine [`torch/csrc/autograd/engine.cpp`](https://github.com/pytorch/pytorch/blob/main/torch/csrc/autograd/engine.cpp)
3. PyTorch derivative definitions [`tools/autograd/derivatives.yaml`](https://github.com/pytorch/pytorch/blob/main/tools/autograd/derivatives.yaml)
4. Deep Residual Learning for Image Recognition, He et al. (2015) [paper](https://arxiv.org/abs/1512.03385)
5. Understanding the difficulty of training deep feedforward neural networks, Glorot and Bengio (2010) [paper](https://proceedings.mlr.press/v9/glorot10a.html)
6. Long Short-Term Memory, Hochreiter and Schmidhuber (1997) [paper](https://www.bioinf.jku.at/publications/older/2604.pdf)
7. Attention Is All You Need, Vaswani et al. (2017) [paper](https://arxiv.org/abs/1706.03762)
8. PyTorch autograd tutorial [doc](https://pytorch.org/tutorials/beginner/blitz/autograd_tutorial.html)
9. Mixed precision training, Micikevicius et al. (2018) [paper](https://arxiv.org/abs/1710.03740)
