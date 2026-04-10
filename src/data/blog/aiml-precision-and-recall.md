---
author: JZ
pubDatetime: 2026-04-09T06:23:00Z
modDatetime: 2026-04-09T06:23:00Z
title: AI Machine Learning - Precision and Recall
tags:
  - aiml-classification
description:
  "artificial intelligence machine learning, understanding precision, recall, accuracy, confusion matrix, and the tradeoffs between them in classification problems"
---

## Table of contents

## Context

You have built a classifier. It takes an input and predicts one of two classes — say, "spam" or "not spam." You run it on a test set and it gets 95% of the examples right. Sounds great, right?

Not necessarily. Imagine your email dataset has 950 legitimate emails and 50 spam emails. A model that **always predicts "not spam"** — never even looking at the content — scores 95% accuracy. It catches zero spam. Accuracy alone can be deeply misleading when classes are imbalanced, and most real-world classification problems have imbalanced classes.

This is why we need **precision** and **recall**: two metrics that look at the quality of predictions from different angles. Together they tell a much richer story than accuracy ever could.

## The Confusion Matrix

Before we define precision and recall, we need a vocabulary for the four outcomes a binary classifier can produce. These four outcomes form a 2×2 table called the **confusion matrix**:

```
                          Actual Class
                    Positive        Negative
                 +---------------+---------------+
  Predicted      |               |               |
  Positive       |  True Pos (TP)|  False Pos(FP)|
                 |               |               |
                 +---------------+---------------+
  Predicted      |               |               |
  Negative       |  False Neg(FN)|  True Neg (TN)|
                 |               |               |
                 +---------------+---------------+
```

Reading each cell as a short story:

- **True Positive (TP):** The model said "positive" and it really was positive. The model got it right.
- **True Negative (TN):** The model said "negative" and it really was negative. Also correct.
- **False Positive (FP):** The model said "positive" but it was actually negative. A **false alarm**. In medical testing, this is a healthy person told they are sick.
- **False Negative (FN):** The model said "negative" but it was actually positive. A **miss**. In medical testing, this is a sick person told they are healthy.

The "true/false" part tells you whether the model was right. The "positive/negative" part tells you what the model predicted.

## Accuracy

Accuracy is the simplest metric. It asks: of all the predictions, how many were correct?

$$\text{Accuracy} = \frac{TP + TN}{TP + TN + FP + FN}$$

In the spam example above: $\frac{0 + 950}{0 + 950 + 0 + 50} = 0.95$. 95% accuracy, 0% usefulness. Accuracy treats all errors equally, which is rarely what you want.

## Recall

Recall answers the question: **of all the actual positives, how many did the model catch?**

$$\text{Recall} = \frac{TP}{TP + FN}$$

The denominator $TP + FN$ is the total number of actual positives in the data. Recall measures the model's ability to **find** all the relevant cases. It is also called the **true positive rate** or **sensitivity**.

```
  All actual positives in the dataset
  +-----------------------------------+
  |                                   |
  |   +------------------+            |
  |   |  TP              |    FN      |
  |   |  (model found    |  (model    |
  |   |   these)         |   missed   |
  |   |                  |   these)   |
  |   +------------------+            |
  |                                   |
  +-----------------------------------+

  Recall = TP / (TP + FN) = shaded / whole box
```

**When to prioritize recall:** When missing a positive is expensive. A cancer screening test should have high recall — you would rather flag a healthy patient for further testing (false positive) than send a cancer patient home (false negative).

In the spam example, recall = $\frac{0}{0 + 50} = 0$. The "always predict not spam" model has zero recall.

## Precision

Precision answers a different question: **of all the predictions the model called positive, how many were actually positive?**

$$\text{Precision} = \frac{TP}{TP + FP}$$

The denominator $TP + FP$ is everything the model labeled as positive. Precision measures the model's **trustworthiness** when it says "positive."

```
  All predictions the model called positive
  +-----------------------------------+
  |                                   |
  |   +------------------+            |
  |   |  TP              |    FP      |
  |   |  (actually       |  (actually |
  |   |   positive)      |   negative)|
  |   |                  |            |
  |   +------------------+            |
  |                                   |
  +-----------------------------------+

  Precision = TP / (TP + FP) = shaded / whole box
```

**When to prioritize precision:** When a false positive is expensive. A video recommendation system that flags content as "safe for children" should have high precision — showing one inappropriate video to a child is worse than being overly cautious and filtering out a few safe videos.

## The Precision-Recall Tradeoff

Here is the fundamental tension: **improving recall often hurts precision, and vice versa.**

Think of a classifier that outputs a confidence score between 0 and 1, and you choose a **threshold** to decide the cutoff:

```
   Confidence Score
   0.0                                              1.0
   |------|------|------|------|------|------|--------|
                 ^                    ^
            Low threshold         High threshold

   Low threshold (e.g., 0.2):
     - Predicts "positive" for almost everything
     - Catches most actual positives  --> HIGH RECALL
     - Also catches many negatives    --> LOW PRECISION

   High threshold (e.g., 0.9):
     - Only predicts "positive" when very confident
     - Misses borderline positives    --> LOW RECALL
     - Positive predictions are reliable --> HIGH PRECISION
```

You can visualize this tradeoff by sweeping the threshold from 0 to 1 and plotting precision vs. recall at each point. This gives you the **precision-recall curve**:

```
  Precision
  1.0 |*
      | *
      |  *
      |   *
      |    **
      |      ***
      |         ****
      |             ******
  0.0 +---------------------------
      0.0                      1.0
                Recall
```

A perfect classifier would have a curve hugging the top-right corner (precision = 1 and recall = 1 simultaneously). In practice, you pick a point on this curve that reflects the cost tradeoff of your specific problem.

## A Worked Example: Email Spam Detection

Suppose we have a test set with 100 emails: 40 spam (positive) and 60 legitimate (negative). Our model produces these results:

```
                        Actually     Actually
                         Spam      Legitimate
                      +---------+-----------+
  Predicted Spam      |   35    |     5     |   40 predicted spam
                      +---------+-----------+
  Predicted Legit     |    5    |    55     |   60 predicted legit
                      +---------+-----------+
                         40          60         100 total
```

Now let's compute all three metrics:

$$\text{Accuracy} = \frac{35 + 55}{100} = 0.90 = 90\%$$

$$\text{Recall} = \frac{35}{35 + 5} = \frac{35}{40} = 0.875 = 87.5\%$$

$$\text{Precision} = \frac{35}{35 + 5} = \frac{35}{40} = 0.875 = 87.5\%$$

This model has balanced precision and recall. But now suppose we lower the threshold to catch more spam:

```
                        Actually     Actually
                         Spam      Legitimate
                      +---------+-----------+
  Predicted Spam      |   39    |    15     |   54 predicted spam
                      +---------+-----------+
  Predicted Legit     |    1    |    45     |   46 predicted legit
                      +---------+-----------+
```

$$\text{Recall} = \frac{39}{40} = 97.5\%$$

$$\text{Precision} = \frac{39}{54} = 72.2\%$$

Recall jumped from 87.5% to 97.5% — we now catch almost all spam. But precision dropped from 87.5% to 72.2% — more legitimate emails end up in the spam folder. This is the tradeoff in action.

## F1 Score: Combining Precision and Recall

When you need a single number that balances both precision and recall, the **F1 score** is the standard choice. It is the **harmonic mean** of precision and recall:

$$F_1 = \frac{2 \cdot \text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}} = \frac{2 \cdot TP}{2 \cdot TP + FP + FN}$$

Why the harmonic mean instead of the arithmetic mean? The harmonic mean penalizes extreme imbalances. If precision is 1.0 and recall is 0.01, the arithmetic mean is 0.505 (sounds okay), but the harmonic mean is 0.0198 (sounds terrible, which is closer to reality — a model with 1% recall is nearly useless).

```
  Precision   Recall    Arithmetic Mean    F1 (Harmonic Mean)
  ---------   ------    ---------------    ------------------
    1.00       0.01          0.505              0.020
    0.90       0.90          0.900              0.900
    0.70       0.95          0.825              0.807
    0.50       0.50          0.500              0.500
```

The F1 score is highest when precision and recall are both high and close to each other.

## Choosing the Right Metric

There is no single "best" metric. The right choice depends on the **cost of errors** in your problem:

```
  Scenario                          Prioritize     Why
  --------------------------------  ----------     -------------------------
  Cancer screening                  Recall         Missing cancer is deadly
  Search engine results             Precision      Irrelevant results annoy
  Fraud detection                   Recall         Missed fraud costs money
  Content moderation (child-safe)   Precision      Wrong content is harmful
  Manufacturing defect detection    Recall         Defective products ship
  Email spam filter                 Balance (F1)   Both errors are annoying
```

The key question is always: **which is worse — a false positive or a false negative?** If false negatives are worse, optimize recall. If false positives are worse, optimize precision. If both matter roughly equally, use F1.

## References

1. Google ML Crash Course, Classification: Accuracy, Precision, and Recall [link](https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall)
2. Wikipedia, Precision and recall [link](https://en.wikipedia.org/wiki/Precision_and_recall)
3. Wikipedia, Confusion matrix [link](https://en.wikipedia.org/wiki/Confusion_matrix)
4. Wikipedia, F-score [link](https://en.wikipedia.org/wiki/F-score)
