# Signed-in visitors to `/` get a crash page

Found by the code audit of `21d4395` on 2026-09-26 and confirmed in code. Delete this file when the fix lands, and mark the affected cells `done` in `audit/ledger/ecosystem-capability-ledger.jsonl`.

A signed-in `/` is rewritten to `/chat`, but the sign-in provider is mounted based on the browser path `/`, so it isn't mounted. `TelemetryConsentSync` then throws (`apps/web/proxy.ts:97-116`, `apps/web/lib/identity/browser-provider-routes.ts:18-24`, `apps/web/shared/components/TelemetryConsentSync.tsx:28-29`). The same happens for `/agi-work` and `/agi-code`, and for the installed web app, whose start URL is `/`. Live QA reproduced it (finding LQA-03). **Fix:** mount the provider for rewritten product paths.
