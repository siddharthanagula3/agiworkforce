# Stopping an image on mobile doesn't stop the bill

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

Stop marks the message stopped on the phone and never tells the server (`apps/mobile/stores/chat/chatMessageStore.ts:885-893`), so the server job keeps running and bills.

**Fix:** generate with `async: true`, keep the returned `job_id`, and on Stop call `POST /api/media/image/cancel` with `{ job_id }`, the route web already uses. The mobile app is owned by the Codex mobile workstream.
