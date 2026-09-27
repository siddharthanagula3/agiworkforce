# API-key calls get account memory

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

Calls to `/api/llm/v1/chat/completions` receive account memories (`request-processor.ts:2904-2921`). The only opt-out is undocumented.
