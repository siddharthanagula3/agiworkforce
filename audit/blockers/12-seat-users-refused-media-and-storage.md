# Team and Enterprise seat users are refused media and storage

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

Several entitlement checks read the caller's own `subscriptions` row instead of the resolved plan. A never-paid Free user or a Team/Enterprise seat member has no such row, so:

- **Project storage.** The storage cap resolves to 0 bytes, so every project file upload, Library "Add to project", saved answer and project duplicate is refused (`apps/web/app/api/projects/[id]/knowledge-files/route.ts:381-404`, `packages/contracts/types/src/billing-catalog.ts:377-380`). Live QA hit this on Free.
- **Image and video.** Seat users are refused image generation (`apps/web/app/api/media/image/generate/route.ts:177`, `:222`) and video generation (`apps/web/app/api/media/video/generate/route.ts:757-759`).
- **Plan display.** `/api/me` reports seat members as Free on web billing, mobile and VS Code.
- **OCR.** The OCR budget has the same defect.

**Fix:** one resolver (the effective-plan tier) used by every entitlement read.
