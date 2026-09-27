# Approval gate: Provider-native web fetch and code execution skip the gate

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

Anthropic's native `web_fetch` and provider-hosted code execution run inside the provider's turn and never reach our gate (`tool-loop.ts:2780-2792`, `request-processor.ts:1502-1505`). Provider-hosted code is the default while `AGI_E2B_EXECUTION` is off (`apps/web/lib/e2b/gate.ts:20`). Only native web search is swapped for a gated tool today. **Fix:** do the same swap for fetch and code, or refuse them when the policy is Ask.
