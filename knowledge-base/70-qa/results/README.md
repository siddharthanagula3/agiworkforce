---
id: "DOC-70-qa-results-readme"
type: "results"
title: "Results"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Results

Where a tester writes down what was seen.

## Two kinds of sheet

| Sheet                         | For                                                       | State on 2026-11-24                                                                         |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `basics/scorecards/<app>.csv` | The 66 basic capabilities, per app and mode               | Web 38 of 38 run. CLI 9 of 108. Desktop, Mobile, VS Code, Chrome: none                      |
| `<app>/results.csv`           | The full plan: one line per item in `test-plans/<app>/` | Not started. The `earlier_live_check` column carries past results from the project's ledger |

`basics/` is a link to the folder the baseline runs use (`~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline`). It also holds the scripts, the test files (`fixtures/`) and the run folders.

## Filling in `results.csv`

Fill only these columns, on the line with the item's ID:

| Column          | Write                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| `result`        | `pass`, `partial`, `fail`, `blocked` or `not built`                        |
| `tested_on`     | The date                                                                   |
| `build_tested`  | The commit or version, and where it ran                                    |
| `what_was_seen` | Plain words; for anything but pass, the exact text on screen and the steps |
| `evidence_path` | The folder under `evidence/`                                               |

The other columns come from the project and are rewritten when the plans are rebuilt. What you filled in is kept.

## Web basics, 2026-11-24

|                                               | Free                                | Subscribed                   |
| --------------------------------------------- | ----------------------------------- | ---------------------------- |
| W-1 Sign up, age step, sign in and out        | partial (sign-up form not testable) | partial                      |
| W-2 Ask a question                            | partial                             | partial                      |
| W-3 Follow up, stop, regenerate, edit         | partial                             | partial                      |
| W-4 Attach a PDF and an image                 | partial                             | partial                      |
| W-5 Web search with sources                   | partial                             | partial                      |
| W-6 Choose a model or Auto                    | partial                             | partial                      |
| W-7 Generate and edit an image                | **fail**                            | partial                      |
| W-8 Create and edit an artifact               | partial                             | partial                      |
| W-9 Word, Excel, PowerPoint files             | partial                             | **fail** (Excel)             |
| W-10 Voice                                    | partial                             | blocked (no microphone)      |
| W-11 Projects                                 | blocked (file upload fails)         | blocked (file upload fails)  |
| W-12 Memory                                   | **pass**                            | partial                      |
| W-13 Find, rename, pin, archive, delete chats | partial                             | partial                      |
| W-14 Share a chat by link                     | partial                             | partial                      |
| W-15 Multi-step Work                          | partial                             | partial                      |
| W-16 Scheduled task                           | partial                             | partial                      |
| W-17 Connect an outside app                   | partial                             | blocked (no outside account) |
| W-18 Cloud coding task                        | partial                             | blocked (no GitHub App here) |
| W-19 Usage and limits                         | partial                             | partial                      |

The first run used GitHub main; the Free rerun of twelve of these used the fix branch. See `../start-here/where-things-stand.md`.
