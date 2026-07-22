---
author: JZ
pubDatetime: 2026-07-22T10:00:00Z
modDatetime: 2026-07-22T10:00:00Z
title: AI/ML - How BPE Tokenization Works in Large Language Models
tags:
  - design-system
  - ai-ml
description:
  "How Byte Pair Encoding (BPE) tokenization works in large language models: the training algorithm, encoding and decoding, tiktoken and sentencepiece implementations, vocabulary construction, and why subword tokenization strikes the right balance between characters and words."
---

## Table of contents

## Context

Before a large language model can process text, it must convert raw strings into numbers. This conversion — called **tokenization** — is the very first step in any LLM pipeline. The model never sees characters or words directly; it only sees integer token IDs.

```
  Raw text:    "The cat sat on the mat."
                        |
                   tokenizer
                        |
                        v
  Token IDs:   [464, 3857, 3290, 319, 262, 2603, 13]
```

Early NLP systems used one of two extremes:

1. **Character-level:** Each character is a token. Vocabulary is tiny (~256 for UTF-8 bytes), but sequences become very long. The model must learn to spell words from scratch.
2. **Word-level:** Each word is a token. Sequences are short, but vocabulary explodes (English alone has 170,000+ words), and any word not in the vocabulary becomes `<UNK>`.

**Subword tokenization** sits in the sweet spot: frequently-used words stay as single tokens (like "the"), while rare words get split into meaningful pieces (like "unhappiness" → "un" + "happiness"). The dominant algorithm for this in modern LLMs is **Byte Pair Encoding (BPE)**.

```
                                Vocabulary Size vs Sequence Length

          Characters                  Subword (BPE)                    Words
     +------------------+       +------------------+       +------------------+
     |  vocab: ~256     |       |  vocab: 50k-100k |       |  vocab: 170k+    |
     |  seq:   very long|       |  seq:   moderate |       |  seq:   short    |
     |  OOV:   none     |       |  OOV:   none     |       |  OOV:   many     |
     +------------------+       +------------------+       +------------------+
           |                           |                          |
           v                           v                          v
     "cat" = [c,a,t]           "cat" = [cat]               "cat" = [cat]
     "unhappiness" =           "unhappiness" =             "unfglorpify" =
      [u,n,h,a,p,p,            [un,happiness]              [<UNK>]
       i,n,e,s,s]
```

BPE was originally a data compression algorithm invented by Philip Gage in 1994. In 2016, Sennrich et al. adapted it for neural machine translation in their paper [*Neural Machine Translation of Rare Words with Subword Units*](https://arxiv.org/abs/1508.07909). Today it powers GPT-2, GPT-3, GPT-4, Claude, LLaMA, and most major LLMs.

## The BPE Training Algorithm

BPE training builds a vocabulary by iteratively merging the most frequent pair of adjacent symbols. It starts from individual bytes (or characters) and grows the vocabulary one merge at a time.

### Step by step

Imagine we have a tiny training corpus and count word frequencies:

```
  Corpus word frequencies:
    "low"     : 5
    "lower"   : 2
    "newest"  : 6
    "widest"  : 3
```

**Step 1:** Split each word into characters plus a special end-of-word marker `</w>`:

```
  l o w </w>       (frequency 5)
  l o w e r </w>   (frequency 2)
  n e w e s t </w> (frequency 6)
  w i d e s t </w> (frequency 3)
```

**Step 2:** Count all adjacent pairs across the corpus:

```
  Pair       Frequency
  --------   ---------
  (e, s)     6 + 3 = 9    <-- highest
  (s, t)     6 + 3 = 9    <-- tied
  (l, o)     5 + 2 = 7
  (o, w)     5 + 2 = 7
  (n, e)     6
  (e, w)     6
  (t, </w>)  6 + 3 = 9    <-- tied
  (w, </w>)  5
  ...
```

**Step 3:** Merge the most frequent pair. Say we pick `(e, s)` → `es`:

```
  l o w </w>        (5)
  l o w e r </w>    (2)
  n e w es t </w>   (6)
  w i d es t </w>   (3)
```

**Step 4:** Repeat. Now count pairs again, merge the next most frequent, and so on. Each merge adds one new symbol to the vocabulary. We stop when we reach the desired vocabulary size.

### The algorithm in pseudocode

```
function train_bpe(corpus, num_merges):
    vocab = set of all individual bytes/characters
    splits = {word: list of characters for word in corpus}

    for i in 1..num_merges:
        # Count adjacent pairs weighted by word frequency
        pair_counts = {}
        for word, freq in corpus:
            symbols = splits[word]
            for j in 0..len(symbols)-2:
                pair = (symbols[j], symbols[j+1])
                pair_counts[pair] += freq

        # Find the most frequent pair
        best_pair = argmax(pair_counts)

        # Merge that pair everywhere
        new_symbol = concat(best_pair[0], best_pair[1])
        vocab.add(new_symbol)
        for word in corpus:
            splits[word] = merge_pair(splits[word], best_pair, new_symbol)

        # Record the merge rule
        merges.append(best_pair -> new_symbol)

    return vocab, merges
```

The output of training is two things:
1. A **vocabulary** — the final set of tokens (bytes + all merged symbols).
2. A **merge list** — the ordered sequence of merge rules, used during encoding.

## Encoding: Text to Token IDs

Once we have a trained BPE model (vocabulary + merge list), encoding new text works like this:

```
  Input: "lowest"

  Step 1: Split into characters
          [l, o, w, e, s, t]

  Step 2: Apply merges in priority order

          Merge #1 was (e,s)->es:    [l, o, w, es, t]
          Merge #2 was (es,t)->est:  [l, o, w, est]
          Merge #3 was (l,o)->lo:    [lo, w, est]
          Merge #4 was (lo,w)->low:  [low, est]

          No more applicable merges.

  Step 3: Look up token IDs
          low -> 9382
          est -> 395

  Output: [9382, 395]
```

The key insight: **merges are applied in the exact order they were learned during training.** Earlier merges have higher priority because they represent more frequent patterns.

### tiktoken: OpenAI's fast implementation

OpenAI's models (GPT-3.5, GPT-4) use [tiktoken](https://github.com/openai/tiktoken), a Rust-based BPE encoder optimized for speed. The core encoding logic in tiktoken uses a different approach than naive iterative merging — it uses **regex-based pre-tokenization** followed by a byte-level BPE lookup.

From [`tiktoken/_educational.py`](https://github.com/openai/tiktoken/blob/main/tiktoken/_educational.py):

```python
def encode(self, text: str) -> list[int]:
    tokens = []
    for match in self._pat.finditer(text):
        # Pre-tokenize: split text into chunks via regex
        chunk = match.group().encode("utf-8")
        # Apply BPE within each chunk
        tokens.extend(self._encode_chunk(chunk))
    return tokens

def _encode_chunk(self, chunk: bytes) -> list[int]:
    # If the whole chunk is in the vocabulary, return it directly
    if chunk in self._encoder:
        return [self._encoder[chunk]]

    # Otherwise, find the best merge using the ranked merge list
    parts = list(chunk)  # start with individual bytes
    while len(parts) > 1:
        # Find the pair with the lowest merge rank
        min_rank = float("inf")
        min_idx = -1
        for i in range(len(parts) - 1):
            pair = parts[i] + parts[i + 1]
            rank = self._mergeable_ranks.get(pair, float("inf"))
            if rank < min_rank:
                min_rank = rank
                min_idx = i

        if min_idx == -1:
            break  # no more merges possible

        # Merge the best pair
        parts = parts[:min_idx] + [parts[min_idx] + parts[min_idx + 1]] + parts[min_idx + 2:]

    return [self._encoder[part] for part in parts]
```

The regex pattern for GPT-4 (`cl100k_base`) splits text at natural boundaries before BPE runs:

```python
pat_str = r"""'(?i:[sdmt]|ll|ve|re)|[^\r\n\p{L}\p{N}]?+\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]++[\r\n]*|\s*[\r\n]|\s+(?!\S)|\s+"""
```

This regex ensures that:
- Contractions stay together ("don't" → "don" + "'t")
- Words include a leading space (" cat" is one pre-token)
- Numbers are chunked into groups of up to 3 digits
- Whitespace/newlines are handled predictably

### Why pre-tokenization matters

Without regex pre-splitting, BPE could merge across word boundaries. For example, "the dog" might merge "e " + "d" into a single token "e d", which hurts generalization. Pre-tokenization constrains merges to happen only within meaningful chunks.

```
  Without pre-tokenization:        With pre-tokenization:

  "the dog" -> [t,h,e, ,d,o,g]    "the dog" -> ["the", " dog"]
  BPE might merge "e " -> "e "               -> BPE within "the": [the]
  across the word boundary                       BPE within " dog": [ dog]
```

## Byte-Level BPE

GPT-2 introduced **byte-level BPE**, which solved the vocabulary bootstrapping problem. Instead of starting from Unicode characters (which would require a base vocabulary of 100,000+ characters for multilingual support), byte-level BPE starts from the 256 raw byte values.

```
  Character-level BPE              Byte-level BPE
  ------------------               ---------------
  Base vocab: all Unicode chars    Base vocab: 256 bytes (0x00-0xFF)
  Problem: huge base vocab         Advantage: tiny base vocab
  Problem: unknown chars           Advantage: ANY text encodable

  "café" -> [c, a, f, é]          "café" -> [99, 97, 102, 195, 169]
              (needs é in vocab)                (UTF-8 bytes, always valid)
```

The trade-off: byte-level BPE must learn multi-byte sequences for non-ASCII characters. The token for "é" might be the merge of bytes `[195, 169]` (its UTF-8 encoding). But this is handled naturally by the merge process — frequent non-ASCII characters get merged into single tokens just like frequent English letter combinations.

From the [GPT-2 paper](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf):

> "Byte-level BPE [...] can encode any text without pre-processing, tokenization errors, or unknown tokens, at only a modest increase in sequence length."

## Decoding: Token IDs Back to Text

Decoding is the reverse: map token IDs back to byte sequences, then decode UTF-8:

```python
def decode(self, tokens: list[int]) -> str:
    # Look up each token ID to get its byte sequence
    byte_pieces = []
    for token_id in tokens:
        byte_pieces.append(self._decoder[token_id])

    # Concatenate all bytes and decode as UTF-8
    return b"".join(byte_pieces).decode("utf-8", errors="replace")
```

Decoding is always O(n) — just a lookup table plus concatenation. No merge logic needed.

## Vocabulary Construction in Practice

Real LLM tokenizers have vocabularies in the 32k–200k range:

```
  Model           Tokenizer       Vocab Size    Base
  ----------      -----------     ----------    --------
  GPT-2           BPE             50,257        byte-level
  GPT-3.5/4      cl100k_base     100,256       byte-level
  GPT-4o          o200k_base     200,019       byte-level
  LLaMA 1/2      SentencePiece   32,000        byte-level + unigram
  LLaMA 3        tiktoken-based  128,256       byte-level
  Claude          BPE variant     ~100,000      byte-level
```

The vocabulary size is a hyperparameter chosen before training. Larger vocabularies mean:
- **Shorter sequences** (more concepts compressed into single tokens)
- **Larger embedding matrices** (more parameters, more memory)
- **Better coverage** of rare words and multilingual text

The sweet spot depends on the model size and training data composition.

## Special Tokens

Every tokenizer reserves IDs for special tokens that control model behavior:

```
  Token              Purpose                          Example ID
  ---------------    ----------------------------     ----------
  <|endoftext|>      Marks document boundaries        100257
  <|im_start|>       Start of a message (chat)        100264
  <|im_end|>         End of a message (chat)          100265
  <|pad|>            Padding for batch alignment      100266
```

These are never produced by the BPE merge algorithm — they are injected by the tokenizer when formatting prompts. The model learns their meaning during training.

## SentencePiece: An Alternative Implementation

Google's [SentencePiece](https://github.com/google/sentencepiece) (used by LLaMA 1/2, T5, ALBERT) takes a slightly different approach:

1. **No pre-tokenization.** SentencePiece treats the input as a raw stream of Unicode characters (including spaces). It uses `▁` (U+2581) to mark word boundaries instead of relying on whitespace splitting.
2. **Unigram LM option.** Besides BPE, SentencePiece supports a **unigram language model** algorithm that starts with a large vocabulary and prunes it down (the opposite direction of BPE).

```
  BPE approach:                    Unigram LM approach:
  Start small, grow               Start large, shrink

  [a,b,c,...] --merge-->          [all possible subwords] --prune-->
  [a,b,c,ab,bc,...] --merge-->    [subset scoring highest] --prune-->
  [a,b,c,ab,bc,abc,...]          [final vocabulary]
```

The unigram model assigns a probability to each token and finds the segmentation that maximizes the overall probability:

```
  P("unaffable") = P("un") * P("aff") * P("able")    -- segmentation 1
                 = P("una") * P("ff") * P("able")     -- segmentation 2
                 = P("un") * P("afford")              -- invalid (not a match)

  Pick the segmentation with highest joint probability.
```

This is solved efficiently with the **Viterbi algorithm** (dynamic programming on a token lattice).

## How BPE Training Scales

Training BPE on a large corpus (hundreds of gigabytes) requires careful engineering. The naive algorithm is O(n * m) where n is corpus size and m is number of merges. Real implementations optimize with:

```
  Optimization                How it helps
  -------------------------   -----------------------------------------
  Priority queue for pairs    O(log n) to find best pair instead of O(n)
  Inverted index              Track which words contain each pair
  Parallelization             Count pairs across shards independently
  Pre-counting                Only track pairs that exist, not all possible
```

tiktoken's training uses Rust for the inner loop, processing billions of bytes in minutes rather than hours.

## Tokenization Artifacts and Edge Cases

BPE produces some unintuitive behaviors that affect model performance:

### The "trailing space" problem

```
  " hello" (with space)  -> [token_for_" hello"]     (1 token)
  "hello"  (no space)    -> [token_for_"hello"]      (1 token, different!)

  The model sees these as completely different tokens.
  This is why prompt formatting matters.
```

### Number tokenization

```
  "123"   -> [token_for_"123"]          (1 token)
  "1234"  -> [token_for_"123"] + ["4"]  (2 tokens)

  Arithmetic is hard because the digit grouping is inconsistent.
```

### The "unseen word" graceful degradation

```
  "Pneumonoultramicroscopicsilicovolcanoconiosis"
      -> ["Pn", "eum", "on", "oult", "ram", "icro", "scop",
          "ics", "ilic", "ov", "olc", "ano", "con", "i", "osis"]

  Rare words decompose into recognizable morphological pieces.
  The model can still reason about parts it has seen in other contexts.
```

## The Full Pipeline

Here is how tokenization fits into the complete LLM inference pipeline:

```
                            LLM Inference Pipeline

  "How does BPE work?"
         |
         v
  +------------------+
  |  Pre-tokenize    |   regex split into chunks
  |  (regex)         |   ["How", " does", " BPE", " work", "?"]
  +--------+---------+
           |
           v
  +------------------+
  |  BPE encode      |   apply merges within each chunk
  |  (merge rules)   |   [2437, 1587, 83547, 990, 30]
  +--------+---------+
           |
           v
  +------------------+
  |  Embedding       |   token ID -> dense vector
  |  lookup          |   [2437] -> [0.12, -0.03, 0.88, ...]
  +--------+---------+
           |
           v
  +------------------+
  |  Transformer     |   attention + FFN layers
  |  layers          |
  +--------+---------+
           |
           v
  +------------------+
  |  Output logits   |   probability over vocab
  |  (vocab_size)    |   argmax -> next token ID
  +--------+---------+
           |
           v
  +------------------+
  |  BPE decode      |   token ID -> bytes -> text
  |                  |   [1539] -> " It"
  +------------------+
         |
         v
  " It works by..."
```

## Why Not Just Use Words or Characters?

The decision to use BPE is ultimately about the **information bottleneck** between vocabulary size and sequence length:

```
  Method       Vocab    Seq Length for "I love transformers"    Params in embed
  ----------   ------   ------------------------------------   ----------------
  Char-level   256      22 chars                               256 * d_model
  BPE (50k)    50,000   4 tokens                               50,000 * d_model
  Word-level   170,000  3 tokens                               170,000 * d_model
```

- Attention is O(n^2) in sequence length, so shorter sequences are much cheaper.
- But larger vocabularies mean larger embedding tables and output projection layers.
- BPE at 50k-100k tokens hits the practical sweet spot for current hardware.

Characters waste compute on attention over long sequences. Words waste parameters on rare entries and cannot handle novel words. BPE adapts: common words compress to one token, rare words decompose into reusable pieces.

## References

1. Gage, P. (1994). A New Algorithm for Data Compression. *C Users Journal*. [paper](https://www.derczynski.com/papers/archive/BPE_Gage.pdf)
2. Sennrich, R., Haddow, B., & Birch, A. (2016). Neural Machine Translation of Rare Words with Subword Units. [paper](https://arxiv.org/abs/1508.07909)
3. Radford, A. et al. (2019). Language Models are Unsupervised Multitask Learners (GPT-2). [paper](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf)
4. OpenAI tiktoken library. [`tiktoken/_educational.py`](https://github.com/openai/tiktoken/blob/main/tiktoken/_educational.py)
5. Kudo, T. & Richardson, J. (2018). SentencePiece: A simple and language independent subword tokenizer. [paper](https://arxiv.org/abs/1808.06226)
6. Kudo, T. (2018). Subword Regularization: Improving Neural Network Translation Models with Multiple Subword Candidates. [paper](https://arxiv.org/abs/1804.10959)
7. OpenAI tokenizer tool. [platform.openai.com/tokenizer](https://platform.openai.com/tokenizer)
