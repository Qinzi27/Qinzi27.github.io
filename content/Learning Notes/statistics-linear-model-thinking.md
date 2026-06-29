---
title: "Statistics Linear Model Thinking"
date: "2026-06-27"
type: "learning-note"
tags: ["statistics", "modeling", "research-methods"]
status: "seed"
publish: true
privacy: "public"
summary: "A concise bilingual note on thinking with linear models instead of only memorizing formulas."
---

# Statistics Linear Model Thinking

A linear model is not only a formula. It is a way to write down a hypothesis about signal, noise, and covariates.

线性模型的重点不是背公式，而是把研究问题拆成可解释的结构。

## Basic form

$$
y = X\beta + \epsilon
$$

Where:

- $y$ is the outcome
- $X$ is the design matrix
- $\beta$ stores effect estimates
- $\epsilon$ represents residual variation

## Research habit

Before fitting the model, write the sentence:

> I expect the outcome to change with these variables, while accounting for these sources of variation.

中文版本：

> 我希望估计某个因素与结果之间的关系，同时控制这些会影响解释的变量。

## Example

```r
fit <- lm(expression ~ group + batch + sex, data = sample_table)
summary(fit)
```

## Links

- [[bioinformatics-sequence-quality-control]]
- [[paper-reading-template-in-action]]
