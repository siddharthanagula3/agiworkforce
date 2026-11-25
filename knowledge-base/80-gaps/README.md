---
id: "GAPS"
type: "gap-register"
title: "Gap register"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gap register

10605 open gaps, each with an identifier, its source, the kind of evidence behind it, and the features and requirement items it affects. Machine-readable: [gaps.jsonl](gaps.jsonl). One page per product area is in [by-area/](by-area/).

| Kind of gap | Count | Evidence |
|---|---:|---|
| current behaviour differs from required | 5211 | read in the code |
| missing compared with Claude or ChatGPT | 1729 | competitor evidence |
| partly there compared with Claude or ChatGPT | 1097 | competitor evidence |
| behind a competitor | 849 | competitor evidence |
| not built on an app | 729 | read in the code |
| defect found by reading code | 296 | read in the code |
| looks wrong in the code | 258 | read in the code |
| problem seen in the running app | 237 | seen in a real run |
| partly built | 199 | read in the code |

## Identifiers

- `GAP-F013-02-01`: a gap written on that feature's page. `-NOTBUILT` and `-PARTLY` come from the capability ledger.
- `GAP-AREA013-LW01`: something that looks wrong in the code of an area.
- `GAP-CAP-<topic>-NN`: behind a competitor, from the competitor trace.
- `CMP-W12`, `CMP-WP30`: lines of the comparison lists (`50-competitors/data`).
- `DEF-001`: a defect found by reading code on 2026-11-22.
- `SEEN-WEB-001`: a problem seen while using the Web app.

A gap closes when the cause is fixed in the code and a person has seen the feature work. Then its line is removed here and the result is recorded in `70-qa/results`.
