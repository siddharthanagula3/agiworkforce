# The desktop bridge answers "success" to messages it ignores

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`apps/desktop/electron/browser/bridgeServer.ts:427-443` returns `{ success: true }` for any native message it has no handler for. Chrome's "capture page" and "Ask AGI → Desktop" selection handoff are therefore silently lost. Separately, the phone's "Start on Desktop" request is acknowledged and then dropped (`apps/desktop/electron/remote/codeRemoteController.ts:297-302`).
