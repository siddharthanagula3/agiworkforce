# Approval gate: Live voice runs tools without reading the policy

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

`apps/web/lib/voice/live-voice-tools.ts:71-78` attaches hosted `web_search` and `code_interpreter` with `requiresApproval: false`.
