---
author: JZ
pubDatetime: 2026-11-07T19:31:01Z
modDatetime: 2026-11-07T19:31:01Z
title: AI/ML - How Diffusion Models Generate Images
tags:
  - aiml-diffusion
  - design-system
description: "A beginner-friendly walkthrough of diffusion image generation: how models learn to remove noise, use text prompts, and generate images in compressed latent space."
---

## Table of contents

## Start with a noisy picture

A text-to-image model gets a prompt such as “a red bicycle leaning against a brick wall on a rainy evening.” One way to imagine its job is that it starts with a canvas of static and gradually turns that static into an image that fits the prompt.

This is the basic idea behind **diffusion models**. During training, the model learns how an image changes as noise is added. During generation, it runs a learned process in reverse: begin with noise, then repeatedly make the result a little less noisy. The original denoising diffusion probabilistic model (DDPM) paper showed that this simple training setup can produce high-quality images [1].

```text
TRAINING: teach the model what noise looks like

  clean training image + sampled noise
                  |
                  v
      noisy image at timestep t  +  timestep t  +  optional text
                  |
                  v
            denoising network
                  |
                  v
        predicted noise vs. actual noise
                  |
                  v
           update model weights

GENERATION: use the learned denoiser in reverse

  random noise -> less noisy -> clearer structure -> final image
                       ^              ^
                       +-- repeat, guided by the prompt --+
```

A diffusion model does not usually translate a prompt into a finished picture in one pass. It performs a sequence of denoising steps. This iterative process is why the number and type of sampling steps affect both image quality and generation time.

## How training teaches denoising

Start with a real image, called `x0`. Choose a timestep `t` from a schedule, then add a known amount of random noise `epsilon` to make a noisy version `xt`. Small timesteps add a little noise; large timesteps add much more. A common DDPM formulation is:

$$x_t = \sqrt{\bar{\alpha}_t}x_0 + \sqrt{1-\bar{\alpha}_t}\,\epsilon$$

Here, `alpha-bar` summarizes how much of the original image remains at timestep `t`. The exact schedule is a design choice; the important part is that the training process knows the noise it added.

The denoising network receives `xt` and `t`, and learns to predict `epsilon`. Training compares its prediction with the known noise, often using mean squared error. It sees images at many noise levels, so it learns how to estimate the part that should be removed whether an image is almost clear or mostly static.

Text-to-image models add a text condition. A text encoder turns the prompt into vectors. The denoiser uses those vectors as guidance while predicting noise, so its cleanup steps move toward features associated with the words. In latent diffusion models, cross-attention is one common way for the image-generation network to use this text representation [2].

The model is not given a hand-written drawing recipe for “bicycle, wall, and rain.” Instead, the prompt changes the denoising direction across many steps. The image structure emerges as the noisy input is refined.

## Generation runs the process backward

Once training is finished, generation begins with random noise. For each sampling step, a scheduler tells the denoising network which timestep it is handling. The network estimates the noise in the current image, and the scheduler uses that estimate to produce a slightly cleaner image for the next step.

```text
xT: random static
  |
  | denoiser(noisy image, timestep, prompt)
  v
xT-1: broad colors and rough layout
  |
  | denoiser(noisy image, timestep, prompt)
  v
 ...
  |
  v
x0: final image
```

The prompt is involved throughout this sequence, not just at the beginning. For example, early steps can establish broad composition while later steps sharpen edges and texture. This is a helpful mental picture, though the exact division of work depends on the model and scheduler.

A **scheduler** chooses how the model moves between noise levels. The original DDPM process can take many steps. Faster samplers use different numerical methods to get a useful image with fewer network evaluations. Fewer steps usually reduce latency, but the best setting depends on the model, the prompt, and the sampler.

## Classifier-free guidance: how strongly should the prompt steer?

A model can make one prediction with the prompt and another without it. Classifier-free guidance combines those predictions so that the final denoising direction pays more attention to the prompt [3]. A guidance scale controls how strongly the prompt pulls the image toward its description.

A low scale leaves more room for the model’s general image prior, which can make the result less faithful to the wording. A high scale can make the image follow the prompt more strongly, but can also produce harsh colors, repeated details, or less natural compositions. More guidance is not always better.

Many image-generation interfaces expose settings such as the number of steps, guidance scale, and random seed. The seed chooses the initial noise, so reusing it can make comparisons more repeatable when the model, prompt, and other settings stay the same. It is not a guarantee of identical results across software or model versions.

## Why generate in a latent space?

A high-resolution image has many pixel values. Running every denoising step directly on those pixels is expensive. **Latent diffusion** first uses an autoencoder to compress an image into a smaller representation, called a latent. The diffusion process happens in this compressed space; after denoising, the decoder turns the final latent back into pixels.

```text
TRAINING DATA                         GENERATION
image -> encoder -> latent             random latent noise
                      |                         |
                      +-- add/remove noise <----+
                                |
                           denoiser
                                |
                final latent -> decoder -> image
```

The latent keeps enough visual structure for the model to generate a useful image while making the repeated denoising steps cheaper. The latent diffusion paper describes this approach and its use of cross-attention for conditioning on inputs such as text [2]. The trade-off is that compression can lose fine detail, and the decoder has to reconstruct the final image from that representation.

## What diffusion models are good at—and where they struggle

Diffusion models can create varied images from short descriptions, and the iterative process gives them a flexible way to combine visual patterns. They are also used for image editing, inpainting, and other tasks where generation can be guided by an input image or mask.

They can still misread a prompt. Small text, exact counts, left-right relationships, and unusual combinations of objects can be difficult. A plausible picture is not proof that the model followed every instruction. The model can also reproduce patterns and biases present in training data. These are reasons to review generated images in context, especially when accuracy or representation matters.

A compact mental model is: **training teaches a network to recognize the noise added to images; generation repeatedly uses that skill to turn random noise into an image, with the prompt steering each step.** The model architecture, noise schedule, sampler, text encoder, and latent representation all affect the result.

## References

1. Jonathan Ho, Ajay Jain, and Pieter Abbeel, [Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239), NeurIPS 2020.
2. Robin Rombach et al., [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752), CVPR 2022.
3. Jonathan Ho and Tim Salimans, [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598), 2022.
4. Hugging Face, [The Diffusion Models Course](https://huggingface.co/learn/diffusion-course/unit1/3).
