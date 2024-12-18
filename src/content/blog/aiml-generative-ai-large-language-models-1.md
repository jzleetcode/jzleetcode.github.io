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

![prompt,context window,completion](https://drive.google.com/thumbnail?id=1vHCkLwyqLWyUoOAG2rx1XZhHWIjiZZi9&sz=w1000)

## References

1. [deeplearning ai course](https://www.deeplearning.ai/courses/generative-ai-with-llms/).
