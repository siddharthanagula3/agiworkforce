---
id: "GRAPH"
type: "relationship-map"
title: "Relationship map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Relationship map

24996 nodes and 87849 edges, built by `tools/04_build_indexes.py` from the pages and the capability ledger. One JSON object per line.

- [nodes.jsonl](nodes.jsonl): `id`, `type`, `title`, `path` (a page of this knowledge base or a file of the project).
- [edges.jsonl](edges.jsonl): `from`, `rel`, `to`, `evidence` (files and lines, or web addresses), `basis` (code, requirement, competitor, executed), `source` (which page or data set stated it). `available_on` edges also carry `status` (built, partial, missing) and `verification`.

## Node types

| Type | Count |
|---|---:|
| gap | 8659 |
| file | 5820 |
| test | 3764 |
| requirement item | 3468 |
| feature | 1159 |
| competitor capability | 877 |
| endpoint | 555 |
| store | 233 |
| table | 211 |
| area | 106 |
| other | 51 |
| provider | 27 |
| plan | 25 |
| system | 22 |
| app | 9 |
| engineering page | 7 |
| mode | 3 |

## Relationships

| Relationship | Count | Meaning |
|---|---:|---|
| implemented_by | 28972 | the code that implements it |
| depends_on | 16745 | needs this to work |
| blocked_by | 10281 | an open gap |
| tested_by | 9892 | a test file that covers it |
| available_on | 7304 | the app has it (see status) |
| part_of | 4623 | belongs to this area |
| satisfies | 3466 | feature covers this requirement item |
| traced_to | 1839 | competitor capability maps to this requirement item |
| exposes_api | 1372 | serves this endpoint |
| stores_data_in | 1356 | where its data is kept |
| governed_by_subscription | 882 | a plan or usage rule applies |
| configured_by | 757 | a setting or flag controls it |
| uses_provider | 265 | calls this inference provider package |
| documented_in | 95 | a project document describes it |

## Identifier forms

`F013-02` feature, `S13.10` requirement item, `AREA-013` area, `SYS-...` system page, `SURF-...` app page, `CAP-<topic>-NN` competitor capability, `GAP-...` gap, `surface:web` app, `mode:local` mode, `plan:<name>` plan, `file:<path>`, `api:<METHOD> <path>`, `table:<name>`, `store:<name>`, `provider:<folder>`, `test:<path>`.
