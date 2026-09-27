# Desktop sign-in

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

`github.com` isn't in the desktop sign-in host allowlist (`apps/desktop/electron/windowPolicy.ts:16-22`). GitHub, the default provider, and Okta, OneLogin and Ping SSO break in the desktop app.
