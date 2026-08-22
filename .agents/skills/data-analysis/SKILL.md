---
name: data-analysis
description: Analyze a spreadsheet, CSV, table, or metrics export and report validated findings with limitations. Use for questions about numbers, trends, conversion, revenue, signups, or which segment or channel performed best.
version: 1.0.0
---

# Data analysis

Use this skill for tables, datasets, metrics, and quantitative comparisons.

1. Inspect the available schema, units, time range, nulls, and obvious quality problems.
2. State the question, analysis grain, and assumptions before calculating.
3. Use code for transformations and calculations so the result is reproducible.
4. Preserve source rows unless the user explicitly asks for a mutation.
5. Validate totals, denominators, joins, filters, and date boundaries with independent checks.
6. Separate observed results from interpretation. Do not imply causation from correlation.
7. Report the important findings in plain language, including uncertainty and data limitations.

Never invent missing values or silently discard inconvenient records.
