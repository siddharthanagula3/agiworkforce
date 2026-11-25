---
id: "DOC-50-competitors-data-readme"
type: "comparison-data"
title: "AGI compared with Claude and ChatGPT"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# AGI compared with Claude and ChatGPT

Snapshot of 2026-11-22, copied here on 2026-11-24. AGI's status in these files came from **reading our code at GitHub main**, not from running the apps. Each row is a lead until a person has looked.

## Files

| File                         | What it holds                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comparison-<app>.csv`       | Every compared feature for that app (4,754 in all): whether Claude has it, whether ChatGPT has it, AGI's status, the difference, where in our code, where in the leaders' documentation |
| `missing-in-agi.csv`         | 1,710 features AGI does not have, with IDs (`W1`, `D1`, `M1`, `X1`, `C1`, `V1`)                                                                                                         |
| `partly-there.csv`           | 1,097 features AGI has in part, with IDs (`WP1`, `DP1`, ...) and the piece that is lacking                                                                                              |
| `reverse-engineer-extra.csv` | Not in the repository. 201 leads from studying the leaders' desktop apps; the file stays on the author's computer (see `.gitignore` in the knowledge base) |
| `lists-to-read/`             | The same lists as readable pages, one per app                                                                                                                                           |
| `leader-catalog.jsonl`       | 9,643 features taken from every official Claude and ChatGPT help and documentation page on 2026-11-22, each with its web address                                                                                          |
| `leader-pages-saved/`        | Not in the repository. A link to saved copies of those pages on the author's computer: third-party pages are not copied into the project |

The same material as a page with filters: https://claude.ai/artifact/T4fnApWapZhPmKocxAVukz (private to the owner).

## AGI status values

| Value           | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| Same            | The code has it, like the leaders                          |
| Better          | The code has more than the leaders                         |
| Partial         | Partly there; the `difference` column says what is lacking |
| Missing         | Not in the code                                            |
| Off by decision | Left out on purpose by an owner decision                   |
| N/A             | Does not apply to this app                                 |

| App     | Same | Better | Partial | Missing | Off by decision | N/A |
| ------- | ---: | -----: | ------: | ------: | --------------: | --: |
| Web     |  548 |     64 |     350 |     474 |              14 |  11 |
| Desktop |  153 |      5 |     136 |     163 |               3 |   8 |
| Mobile  |  349 |     32 |     114 |     232 |              41 |  23 |
| CLI     |  357 |     45 |     370 |     727 |               9 |  13 |
| VS Code |  105 |     17 |      88 |     100 |               1 |   3 |
| Chrome  |   86 |     38 |      39 |      33 |               1 |   2 |

499 of the missing and partial features are shipped by both leaders. The owner has pivoted away from none of them so far.

## What this comparison does not cover

- **Local and own-key modes.** It compares the Cloud product only.
- **Whether anything works.** That is what `70-qa/test-plans` and `70-qa/results` are for.
- **How this list maps to the test plans.** The test plans use the project's capability ledger (IDs like `S13.10`), an older and separate list. Another agent is merging these comparison rows into that ledger; until that is done the two lists overlap but are not joined line by line.

## Other comparison material in the project

- `docs/product/competitive-guidance.md`: the rules for using the leaders as the reference.
- `docs/research/`: dated research, including the phone screenshot study `mobile-layout-2026-11-12`.
- `~/Desktop/competitor_mobile_pics`: 229 named screenshots of the leaders' phone apps.
- `~/Desktop/reverse-engineer`: notes on the leaders' desktop apps. Leads only; none of their code, text or images may enter the project.
