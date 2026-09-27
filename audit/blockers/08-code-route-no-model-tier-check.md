# The Code route runs any model on any plan

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`POST /api/code/sessions/[sessionId]/agent` accepts any model string with no plan-tier check (`apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:118-144`). The web Code page's Auto and no-tools fallback sends `claude-sonnet-5`, a Pro model, for every plan (`apps/web/features/code/CloudCodePage.tsx:83,127-130`), so a Basic user runs Pro models on Code. The chat route checks correctly (`request-processor.ts:3648-3670`). **Fix:** check model access on the resolved model in the Code route, and make the Auto fallback plan-aware. Exposure today depends on web cloud Code being switched on in production (it is off by default; see §5).
