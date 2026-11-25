---
id: "DOC-70-qa-defects-readme"
type: "defect-list"
title: "Defects"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Defects

| File                               | What it holds                                                                                                                       | How it was found                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `found-by-testing.csv`             | New defects a tester finds. **Testers write here.**                                                                                 | Using the apps                                        |
| `web-problems-seen-in-browser.csv` | 237 problems seen during the Web basics runs of 2026-11-24, largest first, each with the exact text on screen, steps and screenshot | Using the Web app                                     |
| `root-causes/`                     | Cause and fix design for the 15 major Web problems, one page each; `summary.json` lists them                                        | Reading code and the server log after the browser run |
| `fix-checks-2026-11-24.json`       | What a browser check of each fix on the fix branch showed                                                                           | Using the Web app                                     |
| `code-audit-defects.csv`           | 296 defects across the six apps (16 top priority)                                                                                   | Reading code on 2026-11-22; not confirmed in the apps |

The project's own open-defect list is `../../../audit/registers/known-flaws.md`. A row is deleted there by the commit that fixes it.

## New on 2026-11-24, not fixed

| Seen                                                                                                                                                                                   | Where                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| A long scheduled task fails at about 53 seconds with "The model took too long to respond": one model step sent nothing for 25 seconds and the run stopped without trying another model | Web, Scheduled, fix branch |
| Idle sign-out gives no warning beforehand and lands on the home page, not on a sign-in page that says why                                                                              | Web, fix branch            |
| Pressing Stop on an answer later raises a notification "Agent run failed"                                                                                                              | Web, Free                  |
| Pressing Stop shows "You've reached the Free limit for now" although the next message works                                                                                            | Web, Free                  |
| Free has no Auto choice in the model picker, and a new chat keeps the last chosen model                                                                                                | Web, Free                  |
| Adding a file to a project fails with a generic error, shown twice                                                                                                                     | Web, Free and paid         |
| With a PDF and an image attached together, the shape count is sometimes wrong                                                                                                          | Web, Free                  |
| The delete-schedule dialog does not say the public link will stop working                                                                                                              | Web                        |

All of these, with steps and screenshots, are lines in `web-problems-seen-in-browser.csv` or in `fix-checks-2026-11-24.json`.

## Sizes used

`blocker`: the task cannot be done. `major`: it can be done but something a person would call broken happens. `minor`: wrong wording, an extra step, a small visual fault. `cosmetic`: only looks.

## A fix is finished when

1. the cause is fixed in the code,
2. the app is rebuilt,
3. a tester has done the same steps again and seen it work,
4. the result sheet says `pass` with the date and build.
