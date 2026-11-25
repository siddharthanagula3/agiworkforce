---
id: 'QA-README'
type: 'qa'
title: 'QA: testing the apps like a person'
last_reviewed: '2026-11-24'
---

# QA: testing the apps like a person

Everything a tester needs, whether a person or a model that controls apps on macOS. A feature counts as working only when it has been used in the real app and seen to work. All testing is on localhost, one app at a time.

## Two jobs

| Job               | Who                                 | What it means                                                                                   |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Code              | The session working in the terminal | Read and fix the code; keep the knowledge base and `code-status` up to date                     |
| Hands on the apps | A session that controls the apps    | Use each app like a person (click, tap, type, drag, swipe) and record what is seen in `results` |

## Read in this order

1. [start-here/rules.md](start-here/rules.md): the owner's rules.
2. [start-here/how-to-test-like-a-human.md](start-here/how-to-test-like-a-human.md): how to run a check and record the result.
3. [start-here/controlling-apps-on-macos.md](start-here/controlling-apps-on-macos.md): what screen control can and cannot do with each app.
4. [start-here/where-things-stand.md](start-here/where-things-stand.md): what is known today.
5. [setup/](setup/): how to start each app locally, and the test accounts.
6. [test-plans/](test-plans/README.md): what to test.

## Folders

| Folder        | Holds                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start-here`  | Rules, method, macOS control notes, today's status                                                                                                       |
| `setup`       | One page per app, and `accounts.md`                                                                                                                      |
| `test-plans`  | 7,200 items across six apps, one file per app and product area. Each item: what should happen, where the code is, where to find it in the app, the steps |
| `results`     | `<app>/results.csv` for the tester to fill in; `basics` links to the scorecards of the 66 basic capabilities                                             |
| `defects`     | `found-by-testing.csv` (testers add here), problems seen in the Web app, root causes, defects found by reading code                                      |
| `code-status` | Per app: what the code audit says is built and whether the code it cited is still there                                                                  |
| `evidence`    | Screenshots, recordings and logs. Existing sets are links to where they are kept outside the project; new evidence goes in `evidence/<app>/`             |
| `tools`       | `build_plans.py` rebuilds plans, result sheets and code status from the capability ledger and keeps what testers filled in                               |

## How this connects to the rest of the knowledge base

- Test items use the capability ledger's identifiers (`S13.10`). The same identifiers are on the requirement pages ([10-requirements/capabilities](../10-requirements/capabilities/)) and on each feature page ([20-features](../20-features/README.md)), which also gives acceptance criteria, edge cases and test scenarios.
- A defect found by testing becomes a line in the gap register ([80-gaps](../80-gaps/README.md)) on the next build.
- Results recorded here are copied into the capability ledger by the code session, which updates the verification status shown on every feature page.

## Numbers on 2026-11-24

- Items the code says are built, across six apps: 7,200. Seen working by a person: 149.
- Test items whose path was confirmed against labels in the code: 5,818. No screen of their own: 518. Not found in the code any more: 602.
- Web's 19 basics as Free and Subscribed: 1 pass, 30 partial, 2 fail, 5 blocked. Other apps' basics: not run, except 9 of 108 CLI checks.
