# Approval gate: Scheduled runs ignore the account policy

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

`apps/web/lib/services/scheduled-agent-executor.ts:429-434` runs with `approvalMode: 'auto'` for search, fetch and code, even when the account says "Ask before every action". The reviewer did _not_ confirm that connectors auto-run: tools the user hasn't saved are filtered out.
