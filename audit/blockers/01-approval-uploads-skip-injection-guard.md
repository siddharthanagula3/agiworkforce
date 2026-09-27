# Approval gate: Uploaded documents never trip the injection guard

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

The product promises that, under "Ask before every action", nothing with side effects runs without the user's say-so. That promise doesn't hold on seven paths. The second reviewer re-confirmed all of them line by line.

The "lethal trifecta" check is meant to ask before the model sends data out after reading untrusted content. Uploads raise only the "sensitive data" leg, never the "untrusted content" leg (`apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:166-169`; uploads are hydrated at `chat-attachment-hydration.ts:108-113`). So a poisoned upload, plus a connector, plus `url_fetch` can run without asking. `url_fetch` is auto-approved in read-only mode. The reviewer's caveat: an undeclared connector tool still asks, so the silent path needs a saved "allow" or a read-class connector. **Fix:** mark uploaded text as untrusted before the first tool call. Also make the re-ask say what data would leave; today it doesn't.
