# AGI Chrome Extension — Volume 31 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, and real repo paths under `apps/extension/` (`manifest.json`, `package.json`, `vite.config.ts`, `build.ts`, `MANIFEST_NOTES.md`, `THREAT_MODEL.md`, `native-host/`, `scripts/`) plus `.github/workflows/ci.yml`.

## Overview & stance

This volume covers how the AGI Browser Companion ships and stays shipped: store listings, versioning, updates, flags, rollback, CI/CD. The Chrome product is a permission-gated **browser agent**, not a standalone assistant, so deployment inherits its trust posture. The extension holds **no provider keys and runs no inference** — bridged chat streams through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the Desktop native-messaging host (`com.agiworkforce.browser`). A build must never embed keys, model IDs, or checkout. History and memory are `chrome.storage.local` only, device-scoped, never synced (Neon delta-sync is Web↔Mobile↔Desktop only) — a store update never migrates user data to Cloud. There is no BYOK here. The store surface is public and hostile-input-facing, so every deployment step is a security gate.

## Chrome Web Store

The Chrome Web Store (CWS) is the canonical distribution channel. The packaging path is **✅ Built**: `pnpm package` runs `pnpm build` then zips `dist/` excluding sourcemaps (`apps/extension/package.json`), producing an MV3 bundle (`manifest.json`, `manifest_version: 3`). Listing metadata, screenshots, privacy disclosures, and automated CWS-API publish are **🔭 Planned** — no publish job exists in `.github/workflows/`. Requirements: single-purpose listing matching the browser-agent stance; permission justifications for `debugger`, `nativeMessaging`, `tabs`, `scripting`, `cookies` from `MANIFEST_NOTES.md`/`THREAT_MODEL.md`; `minimum_chrome_version` held at `132`; no remote code (CSP `script-src 'self'`). The `.zip` must pass `check-conflict-markers.sh` and carry no `.map` files.

## Microsoft Edge Add-ons

Edge runs Chromium and consumes the same MV3 artifact, so the bundle is technically compatible today. Edge Add-ons submission, Partner Center listing, and review are **🔭 Planned** — no Edge manifest variant, listing assets, or publish automation exist. Requirement when built: reuse the identical `dist/` artifact from `build.ts`; do not fork the manifest. If Edge needs a distinct store key, add it via a build-time overlay, never by hand-editing `manifest.json`. Native-messaging host registration on Edge must be validated separately (`native-host/INSTALL.md` documents Chrome-family paths).

## Brave Compatibility

Brave is Chromium-based and installs CWS extensions directly, so the same artifact is expected to run. Formal Brave verification is **🔭 Planned** — no Brave test matrix or CI target. Requirements when validated: confirm `chrome.debugger` CDP attach (`cdpDriver.ts`) works under Brave Shields; the localhost `8787` pairing bridge (`pairing.ts`, `X-Bridge-Token`) is not blocked by Brave network filtering; `nativeMessaging` to `com.agiworkforce.browser` resolves. Treat Brave as a compatibility target of the Chrome artifact, never a separate product with its own code paths.

## Versioning

Versioning is **✅ Built** and manually synchronized: `manifest.json` and `package.json` both pin `1.2.0`. Requirements: use semantic `MAJOR.MINOR.PATCH`; store and package versions must match every release (a CI assertion is **🔭 Planned**); CWS forbids downgrades, so a bad release is fixed by a higher patch, never a re-upload of the same number. A version bump must accompany any permission/CSP or native-host contract change (`MANIFEST_NOTES.md`).

## Automatic Updates

Auto-update relies on the store: CWS/Edge poll the published listing and push the new MV3 build to installed browsers with no user action. The extension carries **no self-hosted `update_url`** (absent from `manifest.json`) — the correct posture, updates come only through the reviewed store. This is **🔭 Planned** end-to-end (nothing published yet); the enabling MV3 format is **✅ Built**. Requirement: never add an off-store `update_url` or update server — it bypasses review and violates the no-remote-code CSP. The native-messaging host updates on its own track (`native-host/install.sh`, `scripts/install-native-host.{sh,ps1}`) and its version handshake must stay backward-tolerant across a staggered rollout.

## Feature Flags

Today flags are **build-time env gating only (🟡)**: cloud/free-trial paths compile out of production via `import.meta.env.DEV` in `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` (dev-only affordances absent from production builds). A **runtime/remote** flag system (server kill-switch for computer-use, autofill, or scheduled tasks) is **🔭 Planned**. Requirements: entitlement/plan gating is decided **server-side** and surfaced via `429 {kind:'paywall', requiredTier}` — flags must never client-side unlock a paid tier; any kill-switch fails **closed** and never reroutes Local/Desktop-bridged sessions to Cloud. Use the canon tiers (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) — never gate on removed tiers.

## Rollback

Rollback is **🔭 Planned** — no extension rollback tooling exists. CWS has no true "roll back" primitive, so the design is: retain every shipped `.zip` per version and recover by publishing a higher patch that re-includes the last-known-good bundle. Requirements: retain signed artifacts and build provenance per release; a rollback release still passes the full CI gate below; if the incident is trust/abuse, use the server-side `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch (incident-response only) to cut cloud egress while the store propagates the fix.

## Monitoring

Deployment monitoring is **🔭 Planned**. There is no in-extension telemetry or crash-reporting pipeline, and any is constrained by the device-scoped, never-synced data rule. Requirements when built: monitor via server-side signals the extension already touches — gateway error rates on `/api/v1/providers/<id>/stream`, `429` paywall volume, pairing failures — not by exfiltrating page content or history. Any client metric must be opt-in, carry no page/DOM/console/network payloads, and respect the allowlist. CWS listing health lives in the store dashboard.

## Logging

Logging is **🟡 Partial**: the extension logs to the browser console/service-worker context, but there is **no structured, shippable log pipeline** and none should exfiltrate data. Requirements: production logs must never include page content, autofill values, cookies, bridge tokens (`X-Bridge-Token`), or memory entries (`memory-bridge.ts`); the CSP `connect-src` allowlist already blocks arbitrary log endpoints and must not be widened for logging. Security-relevant events (debugger attach/detach, allowlist denials, escalation approvals from `escalationEngine.ts`) log locally for user-visible audit in `chrome.storage.local`.

## CI/CD

CI is **✅ Built** for build and guardrails, **🔭 Planned** for delivery. `.github/workflows/ci.yml` runs the AP-02 no-hardcoded-color check (`check:no-hex`), the AP-10 no-direct-cloud-IPC check (`check:no-cloud-ipc`, enforcing the InviteCodeModal/egress gate), and `pnpm --filter @agiworkforce/extension build`. Local gates `typecheck`, `test` (vitest), `lint`, and `check-conflict-markers.sh` exist. Missing (🔭): a CWS/Edge publish job, version-parity assertion, artifact signing/retention. Requirement: no artifact reaches a store unless build + typecheck + test + no-hex + no-cloud-ipc pass; publish is a separate, manually-approved job (serial-by-surface lock holds; Mobile is the active surface).

## Repository map

- `apps/extension/manifest.json` — MV3 manifest, version, permissions, CSP, `minimum_chrome_version`.
- `apps/extension/{package.json,vite.config.ts,build.ts}` — `build`/`package`/`check:*` scripts and per-entry IIFE build.
- `apps/extension/{MANIFEST_NOTES.md,THREAT_MODEL.md}` — permission/CSP rationale and review notes.
- `apps/extension/native-host/` — native host template, `install.sh`, `INSTALL.md`.
- `apps/extension/scripts/` — `check-no-hex-colors.mjs`, `check-no-cloud-ipc-v1.mjs`, `check-conflict-markers.sh`, `install-native-host.{sh,ps1}`.
- `.github/workflows/ci.yml` — AP-02/AP-10 checks + build.
- `apps/extension/src/{features/background/conversation-history.ts,background/memory-bridge.ts,features/cloud-bridge/freeTrialClient.ts}` — retention caps and build-time gating.

## Competitor notes

Claude for Chrome and ChatGPT's browser extensions publish single-vendor bundles through CWS with vendor-hosted inference and telemetry; OpenAI Codex ships via CLI/IDE, not a browser store. AGI's divergence: (1) **local-first, no inference in the client** — the extension is a thin bridged window over the cloud gateway or Desktop host, so a store update never ships a model or key; (2) **per-surface trust** — no BYOK on Chrome, no data sync (device-scoped `chrome.storage.local` only), unlike competitors' account-wide history sync; (3) **entitlements server-side** via `429 {kind:'paywall'}`, no in-extension checkout; (4) **multi-provider** through the gateway, never naming a model ID (those live only in `packages/contracts/types/src/models.json`).

## Acceptance / Definition of Done

Production-ready when: a reproducible `dist/` builds via `build.ts`; the listing matches the browser-agent stance with justified permissions; version parity holds; auto-update flows only through the reviewed store; rollback is a higher-patch republish with retained artifacts; and no build ships keys, model IDs, checkout, or an off-store `update_url`.

- [ ] Build: `typecheck`, `test`, `check:no-hex`, `check:no-cloud-ipc`, `build` green in CI; packaged `.zip` has no `.map` files.
- [ ] Trust: no provider key, model ID, or checkout in the bundle; history/memory stay `chrome.storage.local` (≤100 convs/30-day TTL; ≤200 memories, never synced); paywall renders from server `429`.
- [ ] Security: CSP unchanged or re-reviewed; `THREAT_MODEL.md` updated on any permission/CSP delta; publish is a separate, approved job.

## Anti-patterns

- Adding a self-hosted/off-store `update_url` or update server (bypasses review; breaks no-remote-code CSP).
- Widening `connect-src`/`host_permissions` for logs/telemetry, or logging page content, cookies, autofill values, bridge tokens, or memory.
- Client-side flags that unlock a paid tier, or a kill-switch that fails open or reroutes Local/Desktop sessions to Cloud.
- Hand-editing the committed `manifest.json` per store instead of a build-time overlay; letting manifest/package versions drift.
- Hardcoding model IDs (use `packages/contracts/types/src/models.json`), referencing removed tiers (Plus/Hobby/`pro_plus`), top-ups, invented Pro/Max INR, or Supabase.
- Publishing without the full CI gate, or treating "build succeeded" as done without inspecting the artifact for secrets.
