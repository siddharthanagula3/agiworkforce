# Approval gate: The deep-research loop has no gate at all

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

The second reviewer found this. The gate has one caller (`tool-loop.ts:2798`). Deep research runs `url_fetch` through its own `runToolCalls` (`apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1729-1734`, offered at `:771`).
