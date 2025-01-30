---
author: JZ
pubDatetime: 2024-12-14T08:22:00Z
modDatetime: 2024-12-14T10:12:00Z
title: Generative AI (Artificial Intelligence) with Large Language Models (LLM) - Part 1
featured: true
tags:
  - aiml-llm
description:
  "generative AI (artificial intelligence) machine learning with large language models"
---

## Table of contents

## Generative AI and LLMs

Generative AI is a subset of traditional machine learning. Example foundation/base large language models include GPT, BERT, FLAN-T5, LLaMa, PaLM, BLOOM. The models are created for multiple modalities, including images, video, audio, and speech. In this post we will focus on large language models and their uses in natural language generation.

In regular programming, the compiler or interpreter takes programming languages as input, whereas, LLMs can take human language as input.

The text that you pass to an LLM is known as a prompt. The space or memory that is available to the prompt is called the context window, and this is typically large enough for a few thousand words, but differs from model to model. In the example below, you ask the model to determine where Ganymede is located in the solar system. The prompt is passed to the model, the model then predicts the next words, and because your prompt contained a question, this model generates an answer. The output of the model is called a completion, and the act of using the model to generate text is known as inference. The completion consists of the text contained in the original prompt, followed by the generated text. You can see that this model did a good job of answering your question. It correctly identifies that Ganymede is a moon of Jupiter and generates a reasonable answer to your question stating that the moon is located within Jupiter's orbit.

![prompt,context window,completion](https://drive.google.com/thumbnail?id=1aVPFtIYaTT2bq7586ZNYslsJLzNKHN49&sz=w1000)

## LLM Use Cases

1. LLM chatbot, next word prediction
2. essay writer, summarize
3. translate (natural language → natural language or code)
4. entity extraction (information retrieval)
5. augmenting LLM, invoking external APIs

Developers have discovered that as the scale of foundation models grows from hundreds of millions of parameters to billions, even hundreds of billions, the subjective understanding of language that a model possesses also increases. This language understanding stored within the parameters of the model is what processes, reasons, and ultimately solves the tasks you give it, but it's also true that smaller models can be fine-tuned to perform well on specific focused tasks.

![model scale](https://drive.google.com/thumbnail?id=1vHCkLwyqLWyUoOAG2rx1XZhHWIjiZZi9&sz=w1000)

## Transformers

Previous generations of language models made use of an architecture called recurrent neural networks or RNNs. RNNs while powerful for their time, were limited by the amount of compute and memory needed to perform well at generative tasks.

![transformer model architecture](https://arxiv.org/html/1706.03762v7/extracted/1706.03762v7/Figures/ModalNet-21.png)

"Attention is All You Need" is a research [paper](https://arxiv.org/abs/1706.03762) published in 2017 by Google researchers, which introduced the Transformer model, a novel architecture that revolutionized the field of natural language processing (NLP) and became the basis for the LLMs we  now know - such as GPT, PaLM and others. The paper proposes a neural network architecture that replaces traditional recurrent neural networks (RNNs) and convolutional neural networks (CNNs) with an entirely attention-based mechanism.

The Transformer model uses self-attention to compute representations of input sequences, which allows it to capture long-term dependencies and parallelize computation effectively. The authors demonstrate that their model achieves state-of-the-art performance on several machine translation tasks and outperforms previous models that rely on RNNs or CNNs.

The Transformer architecture consists of an encoder and a decoder, each of which is composed of several layers. Each layer consists of two sub-layers: a multi-head self-attention mechanism and a feed-forward neural network. The multi-head self-attention mechanism allows the model to attend to different parts of the input sequence, while the feed-forward network applies a point-wise fully connected layer to each position separately and identically.

The Transformer model also uses residual connections and layer normalization to facilitate training and prevent overfitting. In addition, the authors introduce a positional encoding scheme that encodes the position of each token in the input sequence, enabling the model to capture the order of the sequence without the need for recurrent or convolutional operations.

Encoder-only models also work as sequence-to-sequence models, but without further modification, the input sequence and the output sequence or the same length. Their use is less common these days, but by adding additional layers to the architecture, you can train encoder-only models to perform classification tasks such as sentiment analysis, BERT is an example of an encoder-only model.

Encoder-decoder models, as you've seen, perform well on sequence-to-sequence tasks such as translation, where the input sequence and the output sequence can be different lengths. You can also scale and train this type of model to perform general text generation tasks. Examples of encoder-decoder models include BART as opposed to BERT and T5.

Finally, decoder-only models are some of the most commonly used today. Again, as they have scaled, their capabilities have grown. These models can now generalize to most tasks. Popular decoder-only models include the GPT family of models, BLOOM, Jurassic, LLaMA, and many more.

## Prompt Engineering

![zero shot](https://drive.google.com/thumbnail?id=1-LgRk98WHSQXexb_DdqM_qugPWxcCH2r&sz=w1000)

As larger and larger models have been trained, it's become clear that the ability of models to perform multiple tasks and how well they perform those tasks depends strongly on the scale of the model. As you heard earlier in the lesson, models with more parameters are able to capture more understanding of language. The largest models are surprisingly good at zero-shot inference and are able to infer and successfully complete many tasks that they were not specifically trained to perform. In contrast, smaller models are generally only good at a small number of tasks. Typically, those that are similar to the task that they were trained on. You may have to try out a few models to find the right one for your use case. Once you've found the model that is working for you, there are a few settings that you can experiment with to influence the structure and style of the completions that the model generates.

![inference parameters](https://drive.google.com/thumbnail?id=1Hhoi4jK1zqxeAnOzETCx4BpjybHV-fV9&sz=w1000)

These configuration parameters are invoked at inference time and give you control over things like the maximum number of tokens in the completion, and how creative the output is. Max new tokens is probably the simplest of these parameters, and you can use it to limit the number of tokens that the model will generate.

Two Settings, top p and top k are sampling techniques that we can use to help limit the random sampling and increase the chance that the output will be sensible. To limit the options while still allowing some variability, you can specify a top k value which instructs the model to choose from only the k tokens with the highest probability.

Alternatively, you can use the top p setting to limit the random sampling to the predictions whose combined probabilities do not exceed p.

One more parameter that you can use to control the randomness of the model output is known as temperature. This parameter influences the shape of the probability distribution that the model calculates for the next token. Broadly speaking, the higher the temperature, the higher the randomness, and the lower the temperature, the lower the randomness. If you leave the temperature value equal to one, this will leave the softmax function as default and the unaltered probability distribution will be used.

![lifecycle](https://drive.google.com/thumbnail?id=1MqmHUkbleqDXhetXXj1uISvzryJ3aHPl&sz=w1000)

## LLM pre-training ans scaling laws



## References

1. [deeplearning ai course](https://www.deeplearning.ai/courses/generative-ai-with-llms/).
