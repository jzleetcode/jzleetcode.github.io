---
author: JZ
pubDatetime: 2024-12-10T08:22:00Z
modDatetime: 2024-12-10T10:12:00Z
title: AI Machine Learning Linear Regression and Logistic Regression
featured: true
draft: true
tags:
  - aiml-regression
description:
  "artificial intelligence machine learning, linear regression and logistic regression in and out"
---

## Table of contents

## Glossary

1. Feature: inputs to the model; the `x` variables in the math equation.
2. Label: the output of the model; what we are trying to predict; they `y` variable in the math equation.

## Linear Regression

![straight line](https://developers.google.com/static/machine-learning/crash-course/linear-regression/images/car-data-points-with-model.png)

In linear regression, we are trying to fit the model with a linear math equation.
In the simplest form, we can visualize the model with a straight line in the figure above.

The math equation is $y = mx + b$ or $y = b + w_1 \cdot x_1$,

where

- the slope `m` or `w` of the line is the weight for the features of the model
- the intercept `b` is the bias of the model
- `y` is the predicted label-the output
- $x_1$ is the feature-the input

For models with multiple features, the math equation is

$y = b + w_1 \cdot x_1 + w_2 \cdot x_2 + w_3 \cdot x_3$

### Loss

In linear regression, there are four main types of loss

| Loss type                 | Definition                | Equation                                                            |
|---------------------------|---------------------------|---------------------------------------------------------------------|
| L1 Loss                   | sum absolute values       | $\sum \text{\textbar} actual-predicted \text{\textbar} $            |
| Mean Absolute Error (MAE) | average L1 losses         | $\frac{1}{N}\sum{\text{\textbar} actual-predicted \text{\textbar}}$ |
| L2 loss                   | sum of squared difference | $\sum {(actual value - predicted value) ^ 2}$                       |
| Mean Squared Error (MSE)  | average L2 losses         | $\frac{1}{N} \sum {(actual value - predicted value) ^ 2} $          |

### Choosing a loss

When the difference between the prediction and label is large, squaring makes the loss even larger.
When the difference is small (less than 1), squaring makes the loss even smaller.

When processing multiple examples at once, we recommend averaging the losses across all the examples,
whether using MAE or MSE.

Most features typically fall within a distinct range, e.g., cars are normally between 2000 and 5000 pounds.
An outlier can refer to a car weight outside of that range, e.g., an 8000-pound car.
An outlier can also refer to prediction, e.g., a 3000-pound car withs 40 MPG (miles per gallon).

When choosing the best loss function, consider how you want the model to treat outliers.
For instance, MSE moves the model more toward the outliers, while MAE doesn't.
L2 loss incurs a much higher penalty for an outlier than L1 loss.

## Logistic Regression

## References

1. google ML [crash course](https://developers.google.com/machine-learning/crash-course).
