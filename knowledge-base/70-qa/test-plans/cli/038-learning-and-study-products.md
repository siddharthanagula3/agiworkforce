---
id: "PLAN-cli-038"
type: "test-plan"
title: "CLI · 38. Learning and study products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "38"
---
# CLI · 38. Learning and study products

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S38.01 Study-mode entry.

- **Expected:** A Study entry point starts a tutoring session that changes how the model teaches.
- **Code:** done. Evidence present: apps/cli/src/output_styles.rs:55
- **Where to find it:** Type /output-style in the CLI, then /output-style study (labels found in the code)
- **Needs:** A configured model provider so the CLI can answer the question
- **Steps:**
  1. Start the agi CLI and type /output-style, then press Enter.
  2. Look for the study row under "Available styles" with its description, and confirm the current style is marked with *.
  3. Type /output-style study and press Enter. Add --session to the end to change only this session and leave your saved default alone.
  4. Ask a question on a topic, such as how a sorting algorithm works, and check the reply teaches step by step and asks guiding questions instead of giving the finished answer.
