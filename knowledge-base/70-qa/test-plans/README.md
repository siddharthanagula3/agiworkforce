---
id: "DOC-70-qa-test-plans-readme"
type: "test-plan"
title: "Test plans"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Test plans

What to test in each app. Two layers:

1. **Basics** (66 across the six apps): the short script each app must pass first. They are in `../results/basics/scripts/` with their scorecards beside them.
2. **Full plans** (7,200 items): every capability the code says the app has, one file per area, in the folders here.

| App     | Items | Folder     |
| ------- | ----: | ---------- |
| Web     | 1,698 | `web/`     |
| Desktop | 1,744 | `desktop/` |
| Mobile  | 1,205 | `mobile/`  |
| CLI     |   989 | `cli/`     |
| VS Code |   791 | `vscode/`  |
| Chrome  |   773 | `chrome/`  |

Each app folder has a `README.md` listing its areas, how many items each holds, and how many have never been seen working by a person.

## Reading one item

```
## S13.10 Undo and redo.
- Expected: what a person must be able to do and see
- Code: done / partial / unverified, and whether the code the audit quoted is still in the file
- Known to be unfinished: what the audit said is still missing (partial items)
- Earlier check in the running app: a past result, if any
- Where to find it: the path a person takes to reach it
- Steps: what to do
```

- The ID (`S13.10`) is the line's ID in the project's capability ledger. Results are recorded under the same ID.
- **Code** is what reading the code found. It is never proof that the feature works.
- **Where to find it** and **Steps** are written from the code. Where they are wrong, trust the screen, and write the real path in your result.
- An item whose code line says "evidence moved" or "gone" may no longer exist in the app. If you cannot find it, record `not built` and say where you looked.

## Suggested order inside an app

Sign-in and first run, new chat and composer, messages and streaming, files and attachments, search, artifacts and documents, projects, memory and settings, voice, agents and schedules, coding, connectors, plans and billing, then admin.

## Rebuilding

`python3 -I tools/build_plans.py` rebuilds these files from the project's ledger. It keeps what testers wrote in the result sheets.
