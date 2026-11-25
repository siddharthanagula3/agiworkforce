---
id: "DOC-70-qa-code-status-readme"
type: "code-status"
title: "Code status"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Code status

What the code says, kept by the terminal session. It answers "by the code, is this believed to work?" and nothing more. It is never a test result.

## Files

- `summary.md`: one table, all apps.
- `<app>.csv`: one line per item the code audit called built, partly built or unverified. `api.csv` and `platform.csv` cover the server and shared parts that have no screen of their own.

## Columns

| Column            | Meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `code_status`     | The code audit's verdict: `done`, `partial` or `unverified`  |
| `evidence_check`  | Whether the exact code the audit quoted is in the file today |
| `evidence_detail` | The file and line, or what was not found                     |
| `remaining`       | For partial items, what the audit said is missing            |
| `resolved_by`     | The change that last touched the item, if recorded           |

## `evidence_check` values

| Value     | Meaning                                          | What happens next                                                |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `present` | The quoted code is still there                   | Ready for a person to test                                       |
| `moved`   | The file exists but the quoted code is not found | The terminal session re-reads the feature and updates the ledger |
| `gone`    | The file was removed                             | Same; the feature may have moved or been removed                 |
| `none`    | The audit gave no place in the code              | Same                                                             |

The audit dates from 2026-09-26. A third of the quoted code is no longer found where it was, mostly because files were edited since. That is a list of things to re-read, not a list of broken features.

## Only these count as a code status

A named passing test, a traced path with file and line, a known defect ID, or "not checked". "Works" without one of these is not written here.

## Checks run on the fix branch, 2026-11-24

| Check                                                 | Result                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Type check, all packages                              | pass                                                                                                                     |
| Lint, all packages                                    | pass                                                                                                                     |
| Web tests in the changed files (29 files)             | 440 pass                                                                                                                 |
| Contracts tests                                       | 1,352 pass                                                                                                               |
| Phone tests for the changed screens                   | 135 pass                                                                                                                 |
| CLI schedule tests                                    | 27 pass                                                                                                                  |
| Repository guards                                     | 19 of the 20 run pass; trust boundaries cannot run in that folder (needs a Python environment and a desktop helper file) |
| Full web test suite, priority tests, full guard chain | not completed; to be run on a quiet machine                                                                              |
