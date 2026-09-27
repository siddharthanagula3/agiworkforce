# Stopping media generation doesn't stop the bill

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

- **Mobile image.** Stop marks the message stopped on the phone and never calls the cancel route (`apps/mobile/stores/chat/chatMessageStore.ts:885-893`), so the server job runs and bills.
- **Video, on every surface.** Stop only records the request. Provider cancellation exists only for Runway, which isn't released, so Google and OpenRouter jobs keep running and are billed if they deliver (`apps/web/app/api/media/video/cancel/route.ts:56-58`).
- **Live voice.** Voice has only a mic mute. The session keeps running and billing.
