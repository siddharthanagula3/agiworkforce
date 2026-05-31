# Cross-Cutting & Supply Chain Findings — Monorepo

**Scope**: Repository-wide cross-cutting concerns (secrets, dependencies, CI/CD supply chain, JWT/CSRF consistency, observability, compliance).
**Surfaces**: `apps/web`, `apps/desktop`, `apps/cli`, `apps/mobile`, `apps/extension`, `apps/extension-vscode`, `services/api-gateway`, `services/signaling-server`, `crates/`, `packages/`, `.github/workflows/`.
**Method**: Static analysis only.
**Date**: 2026-05-04

## Executive Summary

Above-average cross-cutting hygiene: dependency overrides for known-vuln npm, comprehensive Rust log redaction, HMAC Stripe webhooks, PKCE OAuth, RLS-aware service helpers, secret-masking in CI. **However**:

1. **JWT in `localStorage`** (web SPA) — XSS exfil surface (HIGH).
2. **7 service files use `SUPABASE_SERVICE_ROLE_KEY` with manual user-id filter** — RLS-bypass regression risk (HIGH).
3. **`tungstenite` + `tokio-tungstenite` from `openai-oss-forks` git fork** (HIGH).
4. **Sentry client fully stubbed** — every `captureError` is no-op (HIGH/observability).
5. **Pino logger has no `redact:` config** (MEDIUM).
6. **Third-party GH Actions tag-pinned** (MEDIUM).
7. **`lodash@4.18.1` overridden** — non-canonical version (MEDIUM).
8. **No EU data residency** (INFO).

---

## [SEV-XCUT-01] HIGH — JWT stored in `localStorage` then sent as Bearer

**Surface**: `apps/web` (cross-cutting; consumed by every authenticated UI fetch)
**File**: `apps/web/lib/supabase.ts:22-37, 39-47`

`secureStorage` is `localStorage` with SSR guard. Confirmed propagation across 20+ call sites:

- `apps/web/features/chat/hooks/use-multi-agent-chat.ts:155`
- `apps/web/features/workforce/components/TeamChatInterface.tsx:36-67`
- `apps/web/features/billing/services/stripe-payments.ts:40, 141`
- `apps/web/features/vibe/sdk/session.ts:142`
- `apps/web/features/media/services/media-api-service.ts:93, 130, 152`

**Threat**: Any XSS on agiworkforce.com exfiltrates the access token. Fix exists partially via `set-token` httpOnly cookie path, but SPA still holds tokens in localStorage in parallel. Comment at `lib/csrf.ts:213-217` already acknowledges migration plan.

**Fix**: Migrate to httpOnly-cookie auth fully; drop `secureStorage`. Bearer-token Auth pattern in services should pull from cookie via SSR helper, not from localStorage.

---

## [SEV-XCUT-02] HIGH — 7 service files use SERVICE_ROLE_KEY with manual user-id filtering

**Surface**: `apps/web` (regression risk for cross-tenant leakage)
**Files**:

- `apps/web/lib/services/subscription-service.ts:24-26`
- `apps/web/lib/services/credit-service.ts:10-12`
- `apps/web/lib/services/audit-service.ts:12-14`
- `apps/web/lib/services/api-key-service.ts:43-45`
- `apps/web/lib/services/organization-service.ts:12-14`
- `apps/web/lib/services/security-monitoring-service.ts:12-14`
- `apps/web/lib/services/notification-service.ts:12-14`

The new safe helper at `lib/supabase-server.ts:14-65` is committed but **not yet** consumed. Its docstring acknowledges:

> _They are CURRENTLY SAFE because every query filters by `.eq('user_id', userId)`, but a regression that drops the filter would silently leak across tenants._

**Threat**: Time-bomb. Future refactor dropping `.eq('user_id', userId)` silently bypasses RLS — service-role queries are unrestricted.

**Fix**: Migrate all 7 services to `getUserClient(userJwt)` from `lib/supabase-server.ts:67-85`. Add ESLint rule forbidding direct `createClient(..., SUPABASE_SERVICE_ROLE_KEY, ...)` outside `lib/supabase-server.ts`.

---

## [SEV-XCUT-03] HIGH — `tungstenite` + `tokio-tungstenite` from third-party git fork

**Surface**: `apps/desktop`, `apps/cli` (any WebSocket — Tauri events, signaling, MCP transports)
**File**: `Cargo.lock:12706, 13064`

```
source = "git+https://github.com/openai-oss-forks/tokio-tungstenite?rev=132f5b39c862e3a970f731d709608b3e6276d5f6#..."
source = "git+https://github.com/openai-oss-forks/tungstenite-rs?rev=9200079d3b54a1ff51072e24d81fd354f085156f#..."
```

**Risk**: (1) `openai-oss-forks` org could be deleted/renamed — SHA mitigates rev-tampering but not org-deletion. (2) Fork may not track upstream security patches. (3) Both deps in same org — single compromise = double exposure.

**Fix**: Audit diff vs nearest crates.io tag. Then either upstream changes, vendor under `crates/agiworkforce-tungstenite`, or self-mirror SHA-pinned tarball.

---

## [SEV-XCUT-04] HIGH — Sentry stubbed across web; no centralized error/security telemetry

**Surface**: `apps/web` (error visibility, intrusion detection)
**File**: `apps/web/shared/lib/sentry.ts:1-160`

Every export is a no-op. No centralized observability for web. Credential stuffing, webhook signature failures, RLS bypass attempts have no SIEM-equivalent surface. Mitigations exist (`security_audit_logs` writes) but nothing tails them. Desktop has `@sentry/react@10.46.0`; web does not.

**Fix**: Install real `@sentry/nextjs`, or wire stub to write `captureError` events into `security_audit_logs`. Add Supabase scheduled function alerting on `> N failed-auth events / minute`.

---

## [SEV-XCUT-05] MEDIUM — Pino loggers have no `redact:` config

**Files**:

- `apps/web/lib/logger.ts:9-24`
- `services/api-gateway/src/lib/logger.ts:9-24`
- `services/signaling-server/src/logger.ts:24-46`

No `redact: ['*.token', '*.password', 'authorization', 'req.headers.cookie']`. Rust-side `redact_secrets()` is comprehensive but only at known sites — not equivalent to logger-level filtering.

**Risk amplifiers found**:

- `apps/web/app/api/shared/route.ts:93, 121` — logs share `token` field as structured prop
- `apps/web/app/api/share/[token]/route.ts:82` — logs `{error, token, userId}`
- `apps/web/app/api/sync-subscription/route.ts:39`, `apps/web/app/api/auth/desktop-token/route.ts:124, 205` — log structured objects that could surface auth-shaped fields if future refactor changes spread

**Fix**: Add `redact:` to all three loggers. Unit test asserting known secret keys don't surface.

---

## [SEV-XCUT-06] MEDIUM — Third-party GitHub Actions tag-pinned (not SHA-pinned)

**Files**: All 9 workflows under `.github/workflows/`.

Examples: `actions/checkout@v6`, `pnpm/action-setup@v5`, `actions/setup-node@v6`, `actions-rust-lang/setup-rust-toolchain@v1`, `Swatinem/rust-cache@v2`, `softprops/action-gh-release@v2`, `rustsec/audit-check@v2.0.0`, all `docker/*` actions in `deploy-signaling-server.yml:100-137`.

**Already SHA-pinned (set the model)**:

- `release-desktop.yml:378, 485, 581`, `release.yml:153`, `build-windows-release.yml:122`: `tauri-apps/tauri-action@84b9d35b... # v0.6.2`
- `deploy-signaling-server.yml:208`: `superfly/flyctl-actions/setup-flyctl@fc53c09e... # v1.5`

**Threat**: Compromised action publisher force-pushing major tag → arbitrary code on runners with secrets (recent precedent: `tj-actions/changed-files` 2025 attack).

**Fix**: Pin all third-party actions to commit SHAs with comment-tagged versions. `pnpm dlx pin-github-action .github/workflows/*.yml` or Dependabot config.

---

## [SEV-XCUT-07] MEDIUM — `lodash@4.18.1` forced via `pnpm.overrides`; non-canonical version

**Files**: `package.json:38`, `pnpm-lock.yaml:13796, 28253`

`pnpm.overrides: "lodash": ">=4.18.0"`. lockfile shows three lodash co-resident: `@4.17.23`, `@4.18.1`, `lodash-es@4.18.1`. lodash maxed at `4.17.21` for years; `4.18.x` may be a recent maintainer release without widespread audit. Override-forced version higher risk than community-diff-reviewed stable.

**Fix**: Verify upstream `npm view lodash versions` confirms 4.18.1 genuinely from maintainers. Consider tightening to `"lodash": "4.17.21"`. Migrate to `lodash-es` and drop `lodash`.

---

## [SEV-XCUT-08] MEDIUM — DMG binaries committed to `apps/web/public/downloads/`

**Files**:

- `apps/web/public/downloads/agi-workforce-mac.dmg` (16,083,413 bytes — tracked)
- `apps/web/public/downloads/agiworkforce.dmg` (38,690,856 bytes — local)

Repo bloat (every clone pulls 16 MB), version drift, code-signing skew (per `release-desktop.yml:252-263`, macOS signing **disabled** until v1.2.1).

**Fix**: Move to GitHub Releases / CDN; serve via redirect. `.gitignore` `apps/web/public/downloads/*.{dmg,exe,AppImage}`.

---

## [SEV-XCUT-09] MEDIUM — `dompurify@3.4.2` in lockfile; recent mXSS advisories patched in 3.5+

**File**: `pnpm-lock.yaml:10045`

`pnpm.overrides: "dompurify": ">=3.4.0"` keeps pinned-low.

**Fix**: Bump to `>=3.5.0`.

---

## [SEV-XCUT-10] MEDIUM — Web download placeholder cleanup verified, downstream link audit recommended

45/49-byte placeholder `agi-workforce-linux.AppImage` and `agi-workforce-win.exe` deleted.

**Fix**: Verify `/download` route handles missing platforms gracefully (404 or redirect to GitHub releases).

---

## [SEV-XCUT-11] LOW — `h2@0.3.27` co-resident with `h2@0.4.13`

**File**: `Cargo.lock:4696, 4715`

`h2@0.3` is maintenance-only.

**Fix**: `cargo tree -i h2`; upgrade.

---

## [SEV-XCUT-12] LOW — Inline `${{ secrets.GITHUB_TOKEN }}` interpolation

**File**: `.github/workflows/build-windows-release.yml:36, 50`

Direct shell interpolation. Same file at lines 124-128 does it correctly (env var, then `${GITHUB_TOKEN}`).

**Fix**: Apply env-var pattern.

---

## [SEV-XCUT-13] LOW — Two of three loggers use bare `process.env.NODE_ENV`

Bypasses `noUncheckedIndexedAccess`.

**Fix**: Normalize to `process.env['NODE_ENV']`.

---

## [SEV-XCUT-14] LOW — CSP `style-src 'unsafe-inline'`

**File**: `apps/web/proxy.ts:16-33`

Comment explains cost-of-removal (Tailwind/Radix/CSS-in-JS). `script-src` correctly nonce-based. Track as known acceptable risk.

---

## [SEV-XCUT-15] INFO — No EU data residency

`us-east-2` only. GDPR Art. 44 transfer concerns if EU users sign up.

**Fix**: Country-block at signup or signed SCCs in privacy policy.

---

## [SEV-XCUT-16] INFO — `.env.local` has expired Vercel OIDC JWT

`.env.local:2` — real JWT (already expired). `.gitignore:184` excludes correctly.

**Fix**: Pre-commit hook scanning staged files for `eyJhbGciOi`, `sk-ant-`, `sk_live_`, `whsec_` prefixes.

---

## Verified Fixed (No Action Required)

- ✅ **WEB-RLS-BYPASS**: `chat/completions/route.ts:225-241` — service-role used only for JWT verification
- ✅ **WEB-SET-TOKEN-UNVALIDATED**: `set-token/route.ts:43-53` — JWT validated before cookie set
- ✅ **WEB-CSRF-ANON-FORGE**: chain broken by composition with set-token validation
- ✅ **WEB-DOWNLOAD-PLACEHOLDERS**: 45/49-byte placeholder files deleted
- ✅ **CI permissions**: all 9 workflows `contents: read` + per-job elevation
- ✅ **CI secret masking**: Tauri signing keys + Supabase service-role `::add-mask::`'d
- ✅ **`pull_request_target` trigger**: NOT used
- ✅ **Self-hosted runners**: NOT used
- ✅ **macOS build refuses unsigned ship**: `release-desktop.yml:285-305` (FIX-011)
- ✅ **Stripe webhook HMAC**: `stripe-webhook/route.ts:1233`
- ✅ **Stripe webhook excluded from middleware**: `proxy.ts:71-83`
- ✅ **Dockerfile non-root user (UID 1001)**: both services
- ✅ **JWT algorithm allowlist**: HS256 only across api-gateway
- ✅ **CSRF timing-safe compare**: `lib/csrf.ts:80-88`
- ✅ **PKCE OAuth flow**: `lib/supabase.ts:44`
- ✅ **Brute-force protection**: `auth-login: 5/15min`, fail-closed on Redis outage
- ✅ **Rust log redaction**: `log_redaction.rs:13-76`
- ✅ **No hardcoded production secrets** (only test fixtures)
- ✅ **No private keys** in working tree
- ✅ **No real GitHub PATs / Slack tokens** (test forms only)
- ✅ **All `.env*` properly gitignored**
- ✅ **Mobile token storage**: MMKV + `expo-secure-store`
- ✅ **No real PII in test fixtures**
- ✅ **SLSA provenance attestation** for Docker images
- ✅ **Railway CLI version pinned**

---

## Top 5 Action Items

1. **[XCUT-01]** Migrate `apps/web` to httpOnly-cookie auth fully — drop localStorage tokens. 20+ call sites need refactor.
2. **[XCUT-02]** Replace 7 services' `getSupabaseClient()` with `getUserClient(userJwt)` from `lib/supabase-server.ts`.
3. **[XCUT-03]** Vendor or self-mirror the `openai-oss-forks` tungstenite + tokio-tungstenite forks.
4. **[XCUT-04]** Install `@sentry/nextjs` (or wire stub to `security_audit_logs`).
5. **[XCUT-06]** Pin all third-party GitHub Actions to commit SHAs.

---

_21 findings: 4 HIGH, 6 MEDIUM, 4 LOW, 7 INFO._
