# Temporary chats leak into search

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`/api/search` has no temporary filter (`apps/web/app/api/search/route.ts:256-262`, `:305-313`), and the first turn of a new temporary chat is saved (`apps/web/lib/server/persist-free-offering-user.ts:24-50`). Live QA reproduced it. Mobile past-chat recall uses the same search.
