# Server memory writes fail (migration 0285)

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`writeConsolidatedMemory` is the single server insert behind `POST /api/memory`, `/remember` and the automatic consolidator (`apps/web/lib/services/managed-memory-context-service.ts:721-728`). It writes provenance columns that exist only in pending migration 0285. On the production schema every such write fails. On web the fact then sits only in the browser, still listed as "saved" (`apps/web/app/api/memory/route.ts:140-159`). Chrome shows "Memory is unavailable". Only the sync route used by mobile, the CLI and VS Code still writes. Automatic learning, stale-fact correction, conflict handling and project memories are all blocked.
