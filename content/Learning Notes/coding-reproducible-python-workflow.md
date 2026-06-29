---
title: "Coding Reproducible Python Workflow"
date: "2026-06-27"
type: "learning-note"
tags: ["coding", "python", "reproducibility"]
status: "seed"
publish: true
privacy: "public"
summary: "A small checklist for making analysis code easier to rerun and review."
---

# Coding Reproducible Python Workflow

Good research code should make future reruns boring.

好的分析代码应该让复现变得普通，而不是每次都像重新破案。

## Minimal structure

```text
project/
  data/
  notebooks/
  scripts/
  results/
  README.md
```

## Practical rules

- Keep raw inputs separate from generated outputs.
- Put reusable logic in scripts instead of only notebooks.
- Save parameters near the result.
- Write short comments for decisions, not for obvious syntax.

## Tiny example

```python
from pathlib import Path

root = Path(__file__).resolve().parents[1]
result_dir = root / "results"
result_dir.mkdir(exist_ok=True)

print("Project root:", root)
```

## Related

- [[bioinformatics-sequence-quality-control]]
- [[Projects]]
