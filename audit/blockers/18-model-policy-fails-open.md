# Workspace model policy fails open (founder decision)

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

If the workspace model-policy read fails, or the workspace can't be resolved, the request runs ungoverned and the failure is only logged (`request-processor.ts:1628-1650`, `apps/web/lib/services/model-policy-gate.ts:100-125`, `packages/ai/routing/src/model-policy.ts:211-215`). An admin who blocked a provider can have it used during a database blip. This is deliberate in code, so it needs a founder call: fail closed for governed workspaces, or keep availability first.
