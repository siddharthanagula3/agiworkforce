---
id: "DOC-70-qa-code-status-summary"
type: "code-status"
title: "Where the code stands, by app"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Where the code stands, by app

Built 2026-11-24 from the capability ledger against the project folder at commit `f51d16e747` (0 uncommitted files). The ledger's code audit dates from 2026-09-26 (commit `21d439536d`) and has been updated since.

**Reading the columns.** *Done, partial, unverified* are the code audit's verdicts. *Evidence present* means the exact code the audit quoted is still in the file today; *moved* means the file exists but that code is not found, so the item needs a fresh look; *gone* means the file was removed. *Seen by a person* counts items with a passing check in the running app.

| App | Items to test | Done | Partial | Unverified | Evidence present | Moved | Gone | No location | Seen working by a person |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Web | 1698 | 1560 | 119 | 19 | 1075 | 604 | 1 | 18 | 141 |
| Desktop | 1744 | 1652 | 72 | 20 | 1097 | 624 | 2 | 21 | 2 |
| Mobile | 1205 | 1127 | 52 | 26 | 585 | 581 | 9 | 30 | 0 |
| CLI | 989 | 979 | 2 | 8 | 674 | 304 | 1 | 10 | 1 |
| VS Code | 791 | 780 | 6 | 5 | 543 | 235 | 1 | 12 | 3 |
| Chrome | 773 | 584 | 29 | 160 | 284 | 328 | 1 | 160 | 2 |
| API (code only) | 193 | 186 | 7 | 0 | 148 | 43 | 0 | 2 | 0 |
| Platform (code only) | 424 | 402 | 20 | 2 | 306 | 115 | 0 | 3 | 0 |
