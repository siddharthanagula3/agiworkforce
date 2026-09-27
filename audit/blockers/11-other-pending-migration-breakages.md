# The other pending-migration breakages

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The machine-readable config says production is at 0273 (recorded 2026-09-20). The web release audit says production reported 0291 on 2026-09-22. We kept 0273, and **the first live check should confirm the real level.** At 0273:

- **0280:** the identity risk engine is blind. `apps/web/lib/server/risk-signals.ts:233` and `:341` read and write `user_agent_ref`, so every insert and history read fails. The failure is only logged. New-device, new-location and credential-stuffing signals never fire.
- **0281:** overage accounting. Only an overage turn's reservation row is tagged, so its later rows count against plan windows and can push rolling usage below zero (`apps/web/db/neon/0281_managed_usage_overage_classification.sql`).
- **0286-0288:** enterprise billing. `apps/web/lib/services/enterprise-contracts/agreement-store.ts:31-41` selects 0286/0287 columns on every read, and `invoicing.ts:287-312` writes a 0288 table. Every enterprise agreement read fails, so the enterprise billing panel errors.
- **0289:** plugin release history. It selects signature columns from 0289 (`apps/web/lib/services/plugin-lifecycle.ts:100-102`), so plugin pages quietly show no versions, and the plugin update path breaks.
- **0290:** customer-managed keys. After any rotation, key status and rewrap read `covered_stores` from 0290 (`apps/web/lib/server/organization-encryption-keys.ts:622-637`).
- **0293:** provider pinning. The per-conversation provider pin column lives in 0293 (`apps/web/app/api/chat/conversations/[id]/route.ts:201-206`). No control sets it anyway.
- Also 0277 (the `recovery_pending` account state) and 0282 (the compaction summary digest).

If production really is at 0291, these cells would flip to done (the generated sensitivity table; a flip is a candidate, not a verdict):

- would flip: 41 cell(s)
- still blocked by a later migration: 0
- also missing something else: 82
- pending-migration without a named migration: 0

| group                                                    | web | desktop | mobile | cli | vscode | chrome | api | platform | total |
| -------------------------------------------------------- | --: | ------: | -----: | --: | -----: | -----: | --: | -------: | ----: |
| A. Product surfaces and screen inventory                 |   1 |       0 |      0 |   0 |      0 |      0 |   0 |        0 |     1 |
| E. Search, Research, notebooks, Memory, and learning     |   2 |       2 |      1 |   0 |      0 |      3 |   0 |        0 |     8 |
| H. Agents, tasks, browser operation, and coding          |   4 |       4 |      0 |   0 |      1 |      1 |   1 |        0 |    11 |
| K. Subscription, usage, billing, and commercial product  |   2 |       2 |      0 |   0 |      0 |      0 |   0 |        0 |     4 |
| L. Settings, account management, enterprise, and support |   1 |       1 |      0 |   0 |      0 |      0 |   1 |        0 |     3 |
| M. Backend product components                            |   0 |       0 |      0 |   0 |      0 |      0 |   0 |        7 |     7 |
| N. Shared packages, runtimes, and implementation choices |   0 |       0 |      0 |   0 |      0 |      0 |   0 |        5 |     5 |
| O. Additional ecosystem products that are easy to miss   |   1 |       1 |      0 |   0 |      0 |      0 |   0 |        0 |     2 |
| **all**                                                  |  11 |      10 |      1 |   0 |      1 |      4 |   2 |       12 |    41 |
