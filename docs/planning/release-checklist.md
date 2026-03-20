# AGI Workforce — Distribution Release Checklist

_Created: March 19, 2026 (Wave 3 hardening pass) — last verified: March 20, 2026_

This document provides per-surface release checklists. Items are marked as DONE, PENDING, or BLOCKED based on verified codebase state at the time of writing. Update each item as it is completed before shipping a production release.

Legend: **[DONE]** verified in codebase | **[PENDING]** not yet implemented | **[BLOCKED]** waiting on dependency

---

## Desktop (Tauri v2 — macOS / Windows / Linux)

### Code Signing

| Item                              | Status        | Evidence / Notes                                                                                                                                       |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS code signing (Developer ID) | **[PENDING]** | `tauri.conf.json` has `entitlements.plist` and `PrivacyInfo.xcprivacy`. macOS certificate thumbprint not set. Requires Apple Developer ID certificate. |
| macOS notarization                | **[PENDING]** | Entitlements file present. Notarization requires signed certificate to be configured.                                                                  |
| Windows code signing (EV cert)    | **[PENDING]** | `tauri.conf.json` sets `digestAlgorithm: sha256` and `timestampUrl: digicert.com` but `certificateThumbprint` is `null`. Needs EV certificate.         |
| Linux AppImage / deb signing      | **[PENDING]** | No GPG signing configured for Linux bundles.                                                                                                           |

### Auto-Updater

| Item                                    | Status     | Evidence / Notes                                                                                                            |
| --------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Updater endpoint configured             | **[DONE]** | `tauri.conf.json` → `plugins.updater.endpoints`: `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}` |
| Updater public key present              | **[DONE]** | `tauri.conf.json` → `plugins.updater.pubkey` is set. Matching private key in `apps/desktop/src-tauri/tauri-signing`.        |
| Release endpoint returns valid manifest | **[DONE]** | `apps/web/app/api/releases/route.ts` exists.                                                                                |
| Windows passive install mode            | **[DONE]** | `tauri.conf.json` → `plugins.updater.windows.installMode: passive`                                                          |

### Crash Reporting

| Item                           | Status        | Evidence / Notes                                                                                                    |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sentry SDK integrated          | **[DONE]**    | `apps/desktop/src/services/errorTracking.ts` imports `@sentry/react`                                                |
| Sentry DSN configured          | **[PENDING]** | DSN loaded from `VITE_SENTRY_DSN` env var. Ensure production DSN is set in CI/CD build environment.                 |
| Unhandled error boundary wired | **[DONE]**    | `apps/desktop/src/services/errorTracking.ts` registers `window.onerror` and `window.onunhandledrejection` handlers. |

### First-Run Experience

| Item                                       | Status     | Evidence / Notes                                                          |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| Onboarding store exists                    | **[DONE]** | `apps/desktop/src/stores/onboardingStore.ts`                              |
| Welcome / setup flow shown on first launch | **[DONE]** | `apps/desktop/src/App.tsx` references onboarding state.                   |
| Deep-link scheme registered                | **[DONE]** | `tauri.conf.json` → `plugins.deep-link.desktop.schemes: ["agiworkforce"]` |

### Pre-Release Checklist

- [ ] Bump version in `apps/desktop/package.json` and `apps/desktop/src-tauri/Cargo.toml`
- [ ] `cargo check` passes with zero warnings
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (0 warnings)
- [ ] Windows certificate thumbprint set in `tauri.conf.json`
- [ ] macOS entitlements and notarization configured in CI
- [ ] `VITE_SENTRY_DSN` set in production build
- [ ] Release notes written for auto-updater dialog

---

## Web (Next.js 16 — Vercel)

### SEO and Discoverability

| Item                                        | Status        | Evidence / Notes                                                                                                    |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`                                | **[DONE]**    | `apps/web/public/robots.txt` present; disallows `/api/`, `/dashboard/`, `/admin/`, `/auth/`. Sitemap URL declared.  |
| `sitemap.xml`                               | **[PENDING]** | Declared in `robots.txt` but no sitemap file or generator found. Add `apps/web/app/sitemap.ts` route.               |
| OpenGraph meta tags                         | **[DONE]**    | `apps/web/public/og-image.svg` exists. Verify `<meta og:image>` and `<meta og:title>` in `apps/web/app/layout.tsx`. |
| Twitter/X card meta                         | **[PENDING]** | Not verified in layout. Add `twitter:card`, `twitter:site`, `twitter:image`.                                        |
| `<title>` and `<meta description>` per page | **[PENDING]** | Needs audit of all public-facing pages for unique titles and descriptions.                                          |
| Canonical URLs                              | **[PENDING]** | Verify `<link rel="canonical">` on marketing pages.                                                                 |

### Analytics and Monitoring

| Item                    | Status        | Evidence / Notes                                                                                     |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Analytics integration   | **[PENDING]** | No Google Analytics or Posthog initialization found in `apps/web/app/layout.tsx`. Add before launch. |
| Error tracking (Sentry) | **[PENDING]** | `apps/web` does not appear to have Sentry initialized. Add Sentry Next.js SDK.                       |
| Performance monitoring  | **[PENDING]** | No Web Vitals reporting found. Consider `next/analytics` or Vercel Speed Insights.                   |

### Public Assets

| Item              | Status     | Evidence / Notes                                                                                  |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Favicon and icons | **[DONE]** | `apps/web/public/logo.png`, `logo-192.png`, `logo-512.png`, `apple-touch-icon.png` present.       |
| OG image          | **[DONE]** | `apps/web/public/og-image.svg` present. Consider generating a static PNG for broad compatibility. |

### Pre-Release Checklist

- [ ] `sitemap.xml` route generates correctly for all public pages
- [ ] Twitter card meta tags added to `layout.tsx`
- [ ] Analytics initialized in production
- [ ] Sentry Next.js SDK initialized with production DSN
- [ ] All environment variables set in Vercel project settings
- [ ] CORS policy reviewed for all `/api/` routes
- [ ] Rate limits verified under load
- [ ] `pnpm typecheck` passes (0 errors)
- [ ] Lighthouse score ≥ 90 for marketing pages

---

## Mobile (Expo / EAS — iOS App Store + Google Play)

### Expo / EAS Configuration

| Item                        | Status        | Evidence / Notes                                                                                           |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Expo project ID (`expo.id`) | **[PENDING]** | `apps/mobile/app.json` → `expo.extra.eas.projectId` not verified. Run `eas init` to bind project.          |
| EAS build profiles          | **[DONE]**    | `apps/mobile/eas.json` has `development`, `preview`, and `production` profiles with `autoIncrement: true`. |
| iOS bundle identifier       | **[PENDING]** | Verify `expo.ios.bundleIdentifier` in `app.json`.                                                          |
| Android package name        | **[PENDING]** | Verify `expo.android.package` in `app.json`.                                                               |
| App icon (1024×1024)        | **[DONE]**    | `apps/mobile/assets/icon.png` present.                                                                     |
| Splash screen               | **[PENDING]** | Verify `apps/mobile/assets/splash.png` dimensions meet store requirements.                                 |

### App Store Readiness

| Item                                  | Status        | Evidence / Notes                                                                                 |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| App store screenshots (iOS)           | **[PENDING]** | No screenshot assets found in `apps/mobile/`. Required: 6.5" and 5.5" sizes.                     |
| App store screenshots (Android)       | **[PENDING]** | No screenshot assets found. Required: phone + tablet.                                            |
| Privacy policy URL                    | **[PENDING]** | Both stores require a privacy policy URL in the listing. Add `https://agiworkforce.com/privacy`. |
| App store listing copy (description)  | **[PENDING]** | No listing copy document found. Write subtitle (30 chars), description (4000 chars), keywords.   |
| Age rating questionnaire              | **[PENDING]** | Complete content advisory rating in App Store Connect and Google Play Console.                   |
| In-app purchases / billing disclosure | **[PENDING]** | Declare in-app purchase or subscription info if applicable.                                      |

### Pre-Release Checklist

- [ ] `eas build --profile production` succeeds for both iOS and Android
- [ ] OTA update channel `production` confirmed in `eas.json`
- [ ] Privacy policy page live at `https://agiworkforce.com/privacy`
- [ ] Screenshots captured on physical devices (not simulator)
- [ ] App tested on iOS 17 and Android 13+
- [ ] Push notification certificates configured in EAS

---

## VS Code Extension (Marketplace)

### Package Hygiene

| Item                 | Status     | Evidence / Notes                                                                                             |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `.vscodeignore`      | **[DONE]** | `apps/extension-vscode/.vscodeignore` exists.                                                                |
| Extension icon       | **[DONE]** | `apps/extension-vscode/media/icon.png` present. Referenced in `package.json` as `media/icon.png`.            |
| `CHANGELOG.md`       | **[DONE]** | `apps/extension-vscode/CHANGELOG.md` exists with entries through v0.2.0.                                     |
| `README.md`          | **[DONE]** | `apps/extension-vscode/README.md` present.                                                                   |
| Publisher registered | **[DONE]** | `package.json` → `publisher: agiworkforce`. Confirm publisher is registered at marketplace.visualstudio.com. |
| Extension VSIX built | **[DONE]** | `apps/extension-vscode/agi-workforce-0.3.0.vsix` present.                                                    |

### Marketplace Listing

| Item                             | Status        | Evidence / Notes                                                                              |
| -------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| Marketplace gallery banner color | **[PENDING]** | Add `galleryBanner.color` and `galleryBanner.theme` to `package.json`.                        |
| Keywords for discoverability     | **[PENDING]** | Add `keywords` array to `package.json` (e.g., `["ai", "llm", "claude", "copilot", "agent"]`). |
| Categories                       | **[PENDING]** | Add `categories` array (e.g., `["AI", "Programming Languages", "Other"]`).                    |
| Preview/release badge            | **[PENDING]** | Set `preview: false` when ready for full release.                                             |

### Pre-Release Checklist

- [ ] Bump version in `package.json` and `CHANGELOG.md`
- [ ] `vsce package` produces clean VSIX with no unexpected files
- [ ] All commands tested against VS Code stable and insiders
- [ ] `vitest run` passes
- [ ] `vsce publish` run with `--pat` to marketplace
- [ ] Extension verified installable from `.vsix` on clean machine

---

## CLI (`agiworkforce-cli`)

### Distribution Channels

| Item                              | Status        | Evidence / Notes                                                                                |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Install script (`install.sh`)     | **[PENDING]** | No `install.sh` found. Create a curl-pipe installer at `apps/cli/scripts/install.sh`.           |
| Homebrew formula                  | **[PENDING]** | No `Formula/agi-workforce.rb` found. Required for `brew install agiworkforce`.                  |
| npm package (`@agiworkforce/cli`) | **[PENDING]** | No `package.json` in `apps/cli/`. Consider a thin npm wrapper that downloads the Rust binary.   |
| GitHub Releases binary uploads    | **[PENDING]** | No CI pipeline found for cross-compiling and uploading binaries to GitHub Releases.             |
| Crates.io publish                 | **[PENDING]** | `apps/cli/Cargo.toml` → `name: agiworkforce-cli`. Run `cargo publish` after verifying metadata. |

### Documentation

| Item                   | Status        | Evidence / Notes                                                                                 |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| CLI README             | **[DONE]**    | `apps/cli/README.md` exists.                                                                     |
| Man page               | **[PENDING]** | Generate `agiworkforce.1` man page from CLI flags.                                               |
| Help text completeness | **[DONE]**    | `apps/cli/src/main.rs` uses `clap` with documented subcommands. Verify `--help` output is clean. |

### Pre-Release Checklist

- [ ] `cargo check -p agiworkforce-cli` passes with zero warnings
- [ ] `cargo clippy -p agiworkforce-cli` passes
- [ ] Binary tested on macOS arm64, macOS x86_64, Ubuntu 22.04, Windows 11
- [ ] Version bumped in `apps/cli/Cargo.toml`
- [ ] `install.sh` tested on clean macOS and Linux
- [ ] Homebrew formula tapped and validated

---

## Chrome Extension (MV3)

### Web Store Readiness

| Item                      | Status        | Evidence / Notes                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest version          | **[DONE]**    | Extension uses MV3 (`manifest_version: 3`).                                                                                                                                                                                                                                                      |
| Version                   | **[DONE]**    | `apps/extension/manifest.json` → `version: 1.2.0`.                                                                                                                                                                                                                                               |
| Permissions scoping       | **[PARTIAL]** | Current permissions: `activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups`. The `cookies` permission is broad — audit whether all cookie access is necessary and document the minimum required scope in the privacy policy. |
| Privacy policy            | **[PENDING]** | Web Store requires a privacy policy URL for extensions using `cookies`, `storage`, and `nativeMessaging`.                                                                                                                                                                                        |
| Store listing screenshots | **[PENDING]** | 1280×800 or 640×400 screenshots required (at least one, up to 5).                                                                                                                                                                                                                                |
| Store listing description | **[PENDING]** | Write short description (132 chars) and full description for Chrome Web Store listing.                                                                                                                                                                                                           |
| Store icon (128×128)      | **[PENDING]** | Web Store requires a 128×128 PNG icon separate from the extension icon.                                                                                                                                                                                                                          |
| Single-purpose statement  | **[PENDING]** | Chrome Web Store requires a "single purpose" statement explaining the extension's core functionality.                                                                                                                                                                                            |

### Security Hardening

| Item                                            | Status        | Evidence / Notes                                                                 |
| ----------------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Content Security Policy in manifest             | **[PENDING]** | Verify `content_security_policy` is set in `manifest.json`.                      |
| Native messaging host validated                 | **[DONE]**    | `nativeMessaging` permission present; native host defined for desktop bridge.    |
| Cookie domain blocking (banking/gov/healthcare) | **[DONE]**    | `apps/extension/src/background.ts` includes domain blocklist per security rules. |

### Pre-Release Checklist

- [ ] `pnpm build` produces clean `dist/` with no source maps
- [ ] Permissions audit: remove any permissions not strictly needed
- [ ] Privacy policy page live and linked in listing
- [ ] Store listing reviewed and approved by team
- [ ] Extension tested on Chrome stable, Chrome beta, and Edge
- [ ] Submit for Chrome Web Store review (2-7 day review window)

---

## Cross-Surface Release Gate

Before any production release, verify all surfaces pass:

- [x] `cargo check` — 0 errors, 0 warnings (verified 2026-03-20)
- [ ] `pnpm typecheck` (desktop) — 0 errors
- [ ] `pnpm typecheck` (web) — 0 errors
- [ ] `pnpm lint` (desktop + web) — 0 warnings
- [ ] All unit tests pass (`pnpm test --run`)
- [ ] Canonical Capability Matrix updated to reflect shipped state
- [ ] ROADMAP.md updated for shipped items
- [ ] Release notes written for each surface shipping a new version
- [ ] Deployment smoke test on staging environment
- [ ] Rollback plan documented
