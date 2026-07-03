# AGI Desktop — Volume 32 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (binding canon), and the real repo paths used here: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/entitlements.plist`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/features/updater.rs`, `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs`, `apps/desktop/src/services/featureFlags.ts`, `.github/workflows/release-desktop.yml`, `.github/workflows/build-windows-release.yml`, `apps/web/app/api/releases/[target]/[version]/route.ts`, `apps/web/db/neon/0018_releases.sql`, `apps/web/db/neon/0020_functions.sql`.

## Overview & stance

AGI Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the local-private compute host for the suite. Deployment therefore protects a **security boundary, not just a download**: the shipped binary embeds the local runtime, the OS-keychain BYOK path, and the cloud gateway client, so a tampered or unsigned build would compromise all three trust modes at once. Every requirement below preserves two invariants: (1) signed, verifiable artifacts end-to-end, and (2) no deployment mechanism — updater, feature flag, or release channel — may silently re-route Local chats/files/sessions to BYOK or Cloud. The updater's only network dependency is release _metadata_ from `agiworkforce.com`; no local data leaves the host during update. Bundling is Tauri v2 (`productName "AGI"`, `identifier com.agiworkforce.desktop`, `version 1.2.0` per `tauri.conf.json`).

## Windows Installer

NSIS is the configured Windows target (`bundle.windows.nsis`, `installMode: currentUser`, English) with a WiX fallback (`tauri.conf.json`). 🟡 Partial: config and the manual `build-windows-release.yml` job exist, but the automated `release-desktop.yml` ships Linux only — its header records Windows is deferred to Q3 2026 pending an SSL.com EV certificate. Requirements: per-user install (no admin elevation); Authenticode-signed `setup.exe`/`.msi`; `.nsis.zip` + `.sig` produced for the updater; SmartScreen reputation seeded by EV signing.

## macOS Installer

macOS bundles a `.dmg`/`.app` under App Sandbox with Hardened Runtime. 🟡 Partial: `entitlements.plist` (app-sandbox, network client/server, user-selected + downloads file access, camera/mic, Apple Events, `cs.allow-jit` for WKWebView) and `signingIdentity: Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)` are configured in `tauri.conf.json`, but notarization is blocked because the six `APPLE_*` CI secrets are not set (`release-desktop.yml` header). Requirements: Developer ID sign → `notarytool` submit → staple; `.app.tar.gz` + `.sig` for the updater; least-privilege entitlements (the removed `disable-library-validation` / `allow-unsigned-executable-memory` keys must stay removed).

## Linux Packages

Linux ships `.AppImage` (with `.AppImage.tar.gz` + `.sig`) today via `release-desktop.yml` `build-linux`; `bundle.targets: "all"` also permits `.deb`. ✅ Built (Linux is the only fully automated target). Requirements: AppImage runs without root (`chmod +x`); `.deb` declares webkit2gtk-4.1 and ayatana-appindicator deps; artifacts retained and attached to the GitHub release for the updater to resolve.

## Code Signing

Three independent signing systems, all mandatory before a channel goes public: (1) **Tauri update signatures** — Ed25519, private key in CI (`TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]`, masked in logs), public key embedded via `plugins.updater.pubkey` in `tauri.conf.json`; every artifact carries a `.sig`. ✅ Built. (2) **macOS Developer ID + notarization** — configured, gated on `APPLE_*` secrets 🟡. (3) **Windows Authenticode (EV)** — 🔭 Planned pending the SSL.com cert. The client refuses any update whose Ed25519 signature fails; the release route (`apps/web/app/api/releases/.../route.ts`) drops any asset missing a `.sig`.

## Auto Updates

✅ Built. `tauri-plugin-updater` 2.10.0 is compiled behind the `updater` Cargo feature (in `default`, disabled for App Store builds) and wired in `apps/desktop/src-tauri/src/lib.rs`; commands and events live in `apps/desktop/src-tauri/src/features/updater.rs` (`check_for_updates`, `install_update`, `install_update_and_restart`, `get_version_info`; events `updater:checking|available|downloading|downloaded|installing|error`). Endpoint: `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`. The web route compares semver, returns `204` when current, else JSON with signed `url` + `signature`. Requirements: signature-verified downloads only; user-visible consent before install (no silent restart); Windows `installMode: passive`.

## Delta Updates

🔭 Planned. The Tauri updater currently replaces the **full** bundle (`.app.tar.gz` / `.nsis.zip` / `.AppImage.tar.gz`); no binary-diff/patch path exists in `updater.rs` or the release route. Design intent: publish per-version patch artifacts and a manifest so the client downloads a diff against its installed version, falling back to full-bundle on hash mismatch. Requirement: any delta scheme must preserve the same Ed25519 verification and produce a byte-identical result to the full bundle.

## Rollback

🟡 Partial. Server-side rollback exists operationally: releases start as GitHub **drafts** (`release-desktop.yml` `publish-release`/`cleanup-on-failure`), and the Neon `releases` table (`0018_releases.sql`) plus `upsert_release` (`0020_functions.sql`) let ops unpublish or re-point a channel. But client **auto-downgrade is not built**: `isNewerVersion` in the release route only serves strictly-higher semver, so a rolled-back user is not pulled back automatically. Requirements: an `is_critical` release (column exists) may force-prompt; document a runbook to yank a bad build (unpublish GitHub release → clients stop seeing it) 🔭 and a future explicit downgrade path 🔭.

## Feature Flags

🟡 Partial. Two layers: (a) **runtime flags** in `apps/desktop/src/services/featureFlags.ts` (`FeatureFlagName` enum, remote config via `featureFlagGetAll`, `localOverrides`, `useSyncExternalStore`) — e.g. `DESKTOP_CHAT_V3`; (b) **compile-time Cargo features** (`default = ["shell","updater","billing","vad"]` in `Cargo.toml`). Trust rule: a flag may gate UI or opt-in capabilities but **must never flip a trust boundary** — no flag can enable cloud/BYOK routing of Local data without the explicit fork (context selection, secret scan, payload preview, provider label, consent). The `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is an incident-response kill-switch only (re-gates Cloud), not a growth flag.

## Monitoring

🟡 Partial. `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs` (`error_report`) forwards frontend errors to `tracing` and, when `SENTRY_DSN` is set, POSTs a hand-built Sentry event. Download/adoption telemetry is captured in `release_downloads` (`0018_releases.sql`: ip_hash, ua, country). Requirements: crash-free-session and update-success rate per channel; alert on failed-signature spikes; no PII beyond hashed IP; monitoring must respect trust modes (never exfiltrate Local prompt/file contents in error payloads).

## Logging

🟡 Partial. Structured logging uses the `tracing` crate across `src-tauri` (e.g. `tracing::error!` in `error_reporting.rs`). Requirements: rotating local log files with redaction of secrets/keys and Local chat contents; a user-accessible "export logs" flow for support; log level gated by build/flag; BYOK keys (OS keychain) and provider tokens never logged.

## Observability

🟡 Partial. Composed from the above: updater events (`updater.rs`), Sentry (env-gated), Neon release + download tables. 🔭 Planned: a unified release-health dashboard (adoption %, crash-free %, update failure reasons per `{target, channel}`) fed by `release_downloads` and updater outcomes. Requirement: correlate a version's adoption curve with error rate to decide promote-vs-rollback, without cross-surface data mixing.

## CI/CD

🟡 Partial. `.github/workflows/release-desktop.yml` runs on `v*` tags / dispatch: `prepare-release` (draft, changelog — with the documented C1 fix passing commit text via `env:` to block `github-script` template-injection), `validate` (`pnpm lint`, `typecheck:all`, `test`), `build-linux` (signed AppImage via pinned `tauri-action`), `update-database` (Neon `upsert_release`), `publish-release`, `cleanup-on-failure`. `build-windows-release.yml` is a manual upload job; `release-cli.yml` is separate. Requirements: macOS/Windows jobs re-enabled once certs land; signing secrets always masked; a failed build must never leave a published (non-draft) release.

## Repository map

- `apps/desktop/src-tauri/tauri.conf.json` — bundle targets, signing identity, updater endpoint + pubkey.
- `apps/desktop/src-tauri/entitlements.plist`, `Info.plist`, `PrivacyInfo.xcprivacy` — macOS hardened-runtime/privacy.
- `apps/desktop/src-tauri/Cargo.toml` — Cargo feature flags, updater plugin.
- `apps/desktop/src-tauri/src/features/updater.rs`, `src/lib.rs` — updater commands/events.
- `apps/desktop/src-tauri/src/sys/commands/error_reporting.rs` — crash/error reporting.
- `apps/desktop/src/services/featureFlags.ts`, `src/api/analytics.ts` — runtime flags/analytics.
- `.github/workflows/{release-desktop,build-windows-release,release-cli,release}.yml` — CI/CD.
- `apps/web/app/api/releases/**` — updater + latest-release endpoints.
- `apps/web/db/neon/0018_releases.sql`, `0020_functions.sql` — release registry + `upsert_release`.

## Competitor notes

Claude Desktop, ChatGPT desktop, and Codex ship single-vendor, auto-updating signed apps tied to one cloud account. AGI Desktop deliberately diverges: it is a **multi-provider, local-first host** where BYOK keys live in the OS keychain and Local sessions never leave the device. Signing and the updater exist to protect that local trust boundary — updates carry code and metadata only, never a hidden channel that promotes Local data to cloud. Unlike App-Store-only competitors, AGI keeps a self-hosted signed-update path (Ed25519 + `agiworkforce.com`) so users can run and update outside a store.

## Acceptance / Definition of Done

Production-ready when all three platforms build signed, notarized/Authenticode artifacts in CI, the updater verifies signatures and requires consent, rollback has a documented runbook, and monitoring reports per-channel health without leaking trust-scoped data.

- [ ] Build: Linux `.AppImage`/`.deb`, macOS notarized `.dmg`, Windows EV-signed NSIS all produced by CI with matching `.sig` files.
- [ ] Trust: no flag, updater path, or release channel can re-route Local/BYOK data to Cloud; kill-switch env verified as re-gate-only.
- [ ] Security: signing secrets masked in CI; failed builds never publish; update install refuses on bad signature; logs/monitoring redact keys and Local content.

## Anti-patterns

- Shipping or auto-installing an update without Ed25519 signature verification, or silently restarting without consent.
- Marking macOS/Windows "shipped" while `APPLE_*`/EV certs are unconfigured — cite the gap, keep 🟡/🔭.
- A feature flag or env that flips a trust boundary (Local→Cloud/BYOK) outside the explicit consented fork.
- Logging BYOK keys, provider tokens, or Local chat/file contents; sending them in crash payloads.
- Reintroducing removed hardened-runtime entitlements (`disable-library-validation`, unsigned executable memory).
- Referencing removed tiers (Plus/Hobby/pro_plus), inventing INR for Pro/Max, adding credit top-ups, hardcoding model IDs (use `packages/types/src/models.json`), or naming Supabase (stack is Clerk + Neon + Stripe).
