# 2026-05-31 — AGI Workforce v1.2.0 store submission assets

Status: Current
Owner: Founder / release lead
Last updated: 2026-05-22 (R21 lane 8 — external-blocker prep)
Companion to: `docs/plans/2026-05-31-suite-transformation-launch.md`

## Scope

This file is the **prep half** of the external-blocker boundary the autonomous
loop cannot cross. It contains the executable build commands, listing copy,
privacy disclosures, screenshot inventories, day-of runbook, and known
pre-submission blockers needed to ship AGI Workforce v1.2.0 across four
stores plus two direct-distribution channels:

| Store / Channel                    | Surface                                               | Status                             |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| Apple App Store                    | Mobile (iOS / iPadOS)                                 | Pending submission                 |
| Google Play                        | Mobile (Android)                                      | Pending submission                 |
| Chrome Web Store                   | Chrome extension                                      | Pending submission                 |
| VS Code Marketplace                | VS Code extension                                     | Pending submission (preview)       |
| GitHub Releases + agiworkforce.com | Desktop (Linux today; macOS+Windows after cert setup) | Linux ready; macOS/Windows blocked |
| GitHub Releases + npm              | CLI binaries (6 targets)                              | Ready (workflow exists)            |
| Vercel                             | Web                                                   | Ready (`vercel --prod`)            |

This doc references — but does not duplicate — two existing per-surface
runbooks:

- `apps/mobile/EAS_SIGNING_RUNBOOK.md` — iOS Distribution credential flow
- `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md` — `vsce` flow + 6
  required screenshots list

Read those before submission day. This doc is the cross-surface checklist.

---

## 1. Build commands per surface

### 1.1 Mobile — Apple App Store + Google Play

```bash
cd apps/mobile

# Production credentials live in EAS (eas.json profile production uses
# credentialsSource: "remote"). Apple Team ID D2PR62RLT4 is hardcoded.
# Run once per machine: `eas login` and `eas credentials` to verify the
# iOS Distribution cert + provisioning profile are uploaded.

eas build --platform all --profile production
```

Required env / EAS credentials (uploaded once via `eas credentials`):

- **iOS** — Distribution Certificate (.p12) + App Store provisioning profile,
  managed remotely by EAS. Apple App Store Connect API key (`asc-api-key.p8`)
  expected at `apps/mobile/secrets/asc-api-key.p8` for `eas submit`.
  - `$ASC_APP_ID` — App Store Connect app ID (numeric)
  - `$APPLE_ID` — Apple ID email
  - `$ASC_API_KEY_ID` — Key ID for the .p8
  - `$ASC_API_KEY_ISSUER_ID` — Issuer ID for the .p8
- **Android** — Google Play service-account JSON at
  `apps/mobile/secrets/google-play-service-account.json`. Upload track is
  `internal` → promote to `production` via Play Console UI.

After build succeeds:

```bash
eas submit --platform ios   --profile production --latest
eas submit --platform android --profile production --latest
```

Bundle identifiers (canonical, hardcoded):

- iOS: `com.agiworkforce.app`
- Android: `com.agiworkforce.app`

**Pre-build blockers — see §6.**

### 1.2 Desktop — Tauri signed installers

```bash
cd apps/desktop
pnpm tauri build
```

For signed CI releases, the canonical pipeline is `.github/workflows/release.yml`
(manual `workflow_dispatch`-only — it produces signed macOS universal,
Windows x64, and Linux x86_64 bundles). The on-tag workflow
`.github/workflows/release-desktop.yml` ships **Linux-only** because the
macOS + Windows jobs were deleted pending cert setup (see header comment in
that file).

Tauri config: `apps/desktop/src-tauri/tauri.conf.json` — already set up for:

- macOS Developer ID Application: `AGI AUTOMATION LLC (D2PR62RLT4)`,
  entitlements: `entitlements.plist`, plist: `Info.plist`
- Windows code-signing: SHA256 digest + DigiCert timestamp URL, NSIS +
  WiX targets
- Updater pubkey already baked in

Required GitHub Actions secrets (canonical names from `release.yml`):

| Secret                                             | Used for                                                    |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`                        | Tauri updater signature (already present)                   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`               | Password for the above                                      |
| `APPLE_CERTIFICATE`                                | Base64-encoded Developer ID `.p12`                          |
| `APPLE_CERTIFICATE_PASSWORD`                       | `.p12` password                                             |
| `APPLE_SIGNING_IDENTITY`                           | Must exactly match keychain identity string                 |
| `APPLE_ID`                                         | Apple ID for notarization                                   |
| `APPLE_PASSWORD`                                   | App-specific password for notarization                      |
| `APPLE_TEAM_ID`                                    | `D2PR62RLT4`                                                |
| `WINDOWS_CERTIFICATE` (DigiCert EV `.pfx`, base64) | Windows code-signing                                        |
| `WINDOWS_CERTIFICATE_PASSWORD`                     | `.pfx` password                                             |
| `LINUX_PRIVATE_KEY`                                | GPG key for `.deb` signing (optional; AppImage is unsigned) |

The Apple cert (Developer ID Application: AGI AUTOMATION LLC) was last
shipped v1.1.6 on 2026-03-07; it just needs re-export and upload.

### 1.3 Chrome extension

```bash
pnpm --filter @agiworkforce/extension package
# Output: apps/extension/extension.zip
```

The `package` script (in `apps/extension/package.json`) runs `vite build`
then zips `dist/` excluding source maps. Output is `extension.zip`, not
`agi-workforce-chrome.zip`; the Chrome Web Store accepts any name when
uploading.

Manifest is **v3**, minimum Chrome 132. Permissions:

`activeTab`, `tabs`, `storage`, `nativeMessaging`, `alarms`, `contextMenus`,
`sidePanel`, `scripting`, `cookies`, `notifications`, `tabGroups`

Host permissions (intentional, with runtime enforcement note in manifest):
`http://localhost/*`, `http://127.0.0.1/*` — used by the desktop bridge.

The CSP drops `style-src 'unsafe-inline'` (M-08 hardening, 2026-05-19).

### 1.4 VS Code extension

```bash
cd apps/extension-vscode
pnpm package
# Output: agi-workforce-<version>.vsix
```

The `package` script (in `apps/extension-vscode/package.json`) is
`node esbuild.js --production && node scripts/vsce-package.js package --no-dependencies`.
There is already a built `agi-workforce-0.3.0.vsix` in the directory at HEAD.

Publish:

```bash
vsce publish --packagePath agi-workforce-<version>.vsix --pat $VSCE_PAT
```

Full step-by-step: `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md`.

Publisher: `agiworkforce`. Extension ID: `agi-workforce`. Pricing: Free.
Engines: `vscode ^1.95.0`.

### 1.5 CLI binaries (6 targets)

The canonical pipeline is `.github/workflows/release-cli.yml`, triggered by
pushing a `v-cli-*` tag. It builds 6 targets, publishes 7 npm packages
(via `scripts/publish-cli.sh`), and creates a GitHub release.

`cargo-dist` is **not configured** in this repo (verified — no
`[workspace.metadata.dist]` section). The matrix workflow handles the same
job.

Manual / local build per target:

```bash
cd apps/cli
cargo build --release --target aarch64-apple-darwin   # macOS arm64
cargo build --release --target x86_64-apple-darwin    # macOS x64
cargo build --release --target x86_64-unknown-linux-gnu   # Linux x64
cross build --release --target aarch64-unknown-linux-gnu  # Linux arm64 (needs `cross`)
cargo build --release --target aarch64-pc-windows-msvc    # Windows arm64
cargo build --release --target x86_64-pc-windows-msvc     # Windows x64
```

Linux requires `libasound2-dev libudev-dev pkg-config` (cpal voice deps).

CI release path:

```bash
git tag v-cli-<version>
git push origin v-cli-<version>
```

Required secret: `NPM_TOKEN` (npm automation token for the `@agiworkforce/*`
scope).

### 1.6 Web

```bash
pnpm --filter @agiworkforce/web build
vercel --prod
```

Deployment is the "submission" for web. No app-store listing required.

---

## 2. Listing copy per store

### 2.1 Apple App Store

| Field                                             | Value                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App name                                          | `AGI Workforce`                                                                                                                                              |
| Subtitle (≤30 chars)                              | `Local-first multi-model AI`                                                                                                                                 |
| Promotional text (≤170 chars)                     | `One subscription, every model. Local-first, BYOK, with on-device inference via Apple Foundation Models — chat with GPT, Claude, Gemini, and 10+ providers.` |
| Keywords (≤100 chars, comma-separated, no spaces) | `ai,assistant,chat,llm,gpt,claude,gemini,local,multimodel,byok,coding,productivity,agent,private,fast`                                                       |
| Category — primary                                | Productivity                                                                                                                                                 |
| Category — secondary                              | Developer Tools                                                                                                                                              |
| Age rating                                        | 4+ (no objectionable content; text-only AI chat)                                                                                                             |
| Support URL                                       | `https://agiworkforce.com/support` (TODO — page deferred per scope-cut #2)                                                                                   |
| Marketing URL                                     | `https://agiworkforce.com`                                                                                                                                   |
| Privacy Policy URL                                | `https://agiworkforce.com/privacy`                                                                                                                           |

**Description (3-5 paragraphs):**

```
AGI Workforce is the first AI assistant that runs locally on your iPhone and
iPad using Apple Foundation Models — for free, on-device, with no network
round-trip. Add your own API keys (Anthropic, OpenAI, Google, xAI, DeepSeek,
Perplexity, Qwen, Moonshot, Zhipu, Ollama) and switch between 10+ providers
in a single conversation when you need more power.

Local-first means private by default. Conversations stay on your device until
you opt into cloud sync. Bring-your-own-key means you pay providers
directly — no markup, no minimum, no surprise bills. The same app on iPhone,
iPad, Mac desktop, web, Chrome, and VS Code keeps your work in sync (or
strictly local — your choice).

Built for the way developers, researchers, and creators actually work:
multi-provider in a single thread, transparent auto-routing with one-click
pin, real-time voice mode, Apple Intelligence integration via App Intents,
on-device translation, Face ID lock, and Universal Links to pick up where
you left off on another device.

What's free, what's not: local Apple Foundation Models inference is free.
Bring your own keys is free. Managed cloud (Hobby, Pro, Pro+, Max) is a
separate paid tier with subscription + top-up pricing, available as a
waitlist gate in v1. No ads, no data sale, no training on your prompts.
Ever.

Made by AGI Automation LLC. Free in v1.
```

Required App Store assets:

- App icon: 1024×1024 PNG (no alpha) — derived from `apps/mobile/assets/icon.png`
- Screenshots: see §4
- App preview video (optional, recommended for productivity apps): 15-30s
  portrait MP4

### 2.2 Google Play

| Field                          | Value                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- |
| App name                       | `AGI Workforce`                                                              |
| Short description (≤80 chars)  | `Local-first multi-model AI. GPT, Claude, Gemini, plus on-device inference.` |
| Full description (≤4000 chars) | Same long description as App Store above                                     |
| Category                       | Productivity                                                                 |
| Content rating                 | Everyone (text-only AI chat)                                                 |
| Target audience                | 18+ (developers, creators, professionals)                                    |
| Contains ads                   | No                                                                           |
| In-app purchases               | Yes — cloud subscription via Play Billing (v1.x waitlist-gated)              |
| Privacy Policy URL             | `https://agiworkforce.com/privacy`                                           |

Required Play Store assets:

- App icon: 512×512 PNG
- Feature graphic: 1024×500 PNG (banner shown on listing)
- Screenshots: see §4

### 2.3 Chrome Web Store

| Field                | Value                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Extension name       | `AGI Workforce — browser automation`                                                                                  |
| Summary (≤132 chars) | `Connect your browser to the AGI Workforce desktop app for intelligent web automation, capture, and side-panel chat.` |
| Category             | Productivity                                                                                                          |
| Language             | English (default) — add others as `i18n/messages.json` ships                                                          |
| Pricing              | Free                                                                                                                  |

**Description (long form, ~1500 chars):**

```
AGI Workforce browser companion lets you connect Chrome to the AGI Workforce
desktop app for intelligent automation, page capture, and side-panel chat
across any site.

Side-panel chat
Chat with any AGI Workforce model directly in Chrome's side panel —
no new tab, no context switch. Capture the current page (Cmd+Shift+C),
ask questions about it, and let the AI summarize, explain, or extract data.

Native messaging bridge
The extension talks to your local AGI Workforce desktop app via Chrome
native messaging — no data leaves your machine unless you opt into cloud
sync. Runtime guards reject any non-localhost bridge URL.

Privacy-first
- No tracking, no analytics, no ads.
- Localhost-only network (`http://localhost/*`, `http://127.0.0.1/*`).
- Manifest v3 with strict CSP (no `unsafe-inline`).
- Open-source extension code at github.com/siddharthanagula3/agiworkforce.

Requires AGI Workforce desktop app installed for full functionality.
Standalone side-panel chat works without the bridge.
```

Permissions justification (required for Chrome Web Store review — paste
verbatim into the permission justification fields):

| Permission                              | Justification                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `activeTab`                             | Capture the current page when the user explicitly triggers `Capture Page` (Cmd+Shift+C).    |
| `tabs`                                  | List open tabs in the side-panel "Switch chat" menu.                                        |
| `storage`                               | Persist user settings (bridge port, allowlist) locally via `chrome.storage.local`.          |
| `nativeMessaging`                       | Talk to the AGI Workforce desktop app via native messaging on the user's machine.           |
| `alarms`                                | Reconnect bridge after sleep/wake on a scheduled interval.                                  |
| `contextMenus`                          | Right-click → "Send selection to AGI Workforce".                                            |
| `sidePanel`                             | Render the chat UI in Chrome's side panel.                                                  |
| `scripting`                             | Inject capture script only on the active tab when the user triggers capture.                |
| `cookies`                               | Read first-party session cookies for the user's logged-in agiworkforce.com session.         |
| `notifications`                         | Surface bridge connection / agent completion notifications.                                 |
| `tabGroups`                             | Group related tabs when the user runs a multi-tab workflow.                                 |
| `host_permissions: localhost/127.0.0.1` | Bridge endpoint is user-configurable; runtime `validateBridgeUrl()` rejects non-local URLs. |

### 2.4 VS Code Marketplace

| Field                    | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Display name             | `AGI Workforce`                                                                                 |
| Publisher                | `agiworkforce`                                                                                  |
| Extension ID             | `agi-workforce`                                                                                 |
| Description (≤200 chars) | `Multi-provider AI coding assistant — 10+ providers (GPT, Claude, Gemini, and more) in VS Code` |
| Categories               | AI, Chat, Machine Learning, Programming Languages, Other                                        |
| Keywords                 | ai, llm, chat, copilot, assistant, coding, agent, gpt, claude, gemini                           |
| Pricing                  | Free                                                                                            |
| Preview                  | Yes (current setting in `package.json`)                                                         |
| Gallery banner           | `#0f0f0f` (dark theme)                                                                          |
| Q&A                      | Marketplace                                                                                     |

**README — long description** (the marketplace pulls from `README.md`):

```
AGI Workforce is a multi-provider AI coding assistant for VS Code with 10+
LLM providers (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen,
Moonshot, Zhipu, Ollama, LM Studio) accessible from a single chat
participant: @agi.

Built-in chat commands
- @agi /explain — explain the selected code
- @agi /fix — find and fix bugs
- @agi /refactor — suggest improvements
- @agi /tests — generate unit tests
- @agi /docs — generate documentation
- @agi /model — switch the active model

Agent mode
- ask / auto / plan / bypass approval modes
- 4 reasoning effort levels: low / medium / high / max
- Diff-based edits with per-diff accept / reject keyboard shortcuts
- Up to 25 autonomous iterations per session (configurable)

Desktop bridge
Connects to the AGI Workforce desktop app on `localhost:8787` to share
context, sync conversation history, and trigger agent actions on your
machine — never on a remote server.

Cross-conversation memory
Sidebar tree view lets you pin facts the assistant should remember across
threads. View, create, edit, delete from the activity bar.

Privacy & licensing
- Free, no telemetry by default (opt-in via setting).
- BYOK (bring your own keys) or use the AGI Workforce managed gateway.
- Proprietary license; source at github.com/siddharthanagula3/agiworkforce.
```

### 2.5 GitHub Releases (Desktop + CLI)

GitHub release body is generated by `release-desktop.yml` and `release-cli.yml`
automatically. Use the existing automation — body content is well-formed.

Use the launch-doc as `--notes-file`:

```bash
gh release create v1.2.0 --notes-file docs/plans/2026-05-31-suite-transformation-launch.md
```

---

## 3. Privacy disclosures

### 3.1 iOS — App Store Privacy Nutrition Label

The iOS privacy manifest at `apps/mobile/app.config.js` lines 113-115 declares:

```js
NSPrivacyCollectedDataTypes: [],
NSPrivacyTracking: false,
```

Translated into the App Store Connect privacy questionnaire:

| Question                                                        | Answer                                                                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do you or your third-party partners collect data from this app? | **No — Data Used to Track You**                                                                                                                           |
| Data Linked to You                                              | **None** (v1 LOCAL ONLY — no cloud login required). If the user opts into cloud sync, email + name only. **VERIFY before submission** (see blocker §6.4). |
| Data Not Linked to You                                          | None                                                                                                                                                      |
| Tracking                                                        | None                                                                                                                                                      |

Privacy API reasons (already declared in `app.config.js`):

- `NSPrivacyAccessedAPICategoryUserDefaults` — reason CA92.1 (app functionality)
- `NSPrivacyAccessedAPICategorySystemBootTime` — reason 35F9.1 (performance measurement)
- `NSPrivacyAccessedAPICategoryDiskSpace` — reason E174.1 (app functionality)
- `NSPrivacyAccessedAPICategoryFileTimestamp` — reason C617.1 (app functionality)

Info.plist permission strings (already declared) — App Store reviewers
read these verbatim:

- `NSCameraUsageDescription` — QR code scanning and image input
- `NSMicrophoneUsageDescription` — voice input and voice conversations
- `NSPhotoLibraryUsageDescription` — image selection for AI analysis
- `NSFaceIDUsageDescription` — app unlock
- `NSCalendarsUsageDescription` — AI-assisted scheduling
- `NSContactsUsageDescription` — AI-assisted messaging
- `NSHealthShareUsageDescription` — AI health insights
- `NSSpeechRecognitionUsageDescription` — voice transcription
- `NSTranslationUsageDescription` — on-device translation

### 3.2 Android — Google Play Data Safety

| Data type        | Collected?                           | Shared? | Purpose           | Encrypted in transit? |
| ---------------- | ------------------------------------ | ------- | ----------------- | --------------------- |
| Email address    | Only with explicit cloud-sync opt-in | No      | Account           | Yes (TLS 1.3)         |
| Name             | Only with explicit cloud-sync opt-in | No      | Account           | Yes                   |
| Photos & videos  | Locally only (image input)           | No      | App functionality | n/a (local)           |
| Microphone audio | Locally only (voice input)           | No      | App functionality | n/a (local)           |
| Camera           | Locally only (QR + image capture)    | No      | App functionality | n/a (local)           |
| Files & docs     | Locally only                         | No      | App functionality | n/a (local)           |
| App activity     | No                                   | No      | n/a               | n/a                   |
| Device/other IDs | No                                   | No      | n/a               | n/a                   |

Android permissions (already in `app.config.js`):
`CAMERA`, `RECORD_AUDIO`, `READ_EXTERNAL_STORAGE`, `USE_BIOMETRIC`, `USE_FINGERPRINT`.

### 3.3 Chrome — see §2.3 "Permissions justification" table

### 3.4 VS Code — see `package.json` `capabilities.untrustedWorkspaces`

Already declared: API endpoint, gateway URL, CLI path, system prompt, and
agent auto-apply settings cannot be overridden by workspace settings in
untrusted workspaces. Agent mode file writes are disabled until the
workspace is trusted.

### 3.5 Web

Canonical policy at `apps/web/app/privacy/page.tsx`, served at
`https://agiworkforce.com/privacy`. Last updated 2026-05-08.

Discloses: account email + hashed password, Stripe customer ID, cloud-mode
conversations (RLS-enforced), local-mode conversations (SQLite, never
leaves machine), BYOK keys (AES-256-GCM encrypted on device), aggregated
anonymous telemetry (Sentry + GA, IP-anonymized, opt-in), server logs
(30-day retention).

---

## 4. Screenshot checklist

### 4.1 Apple App Store — iOS 6.7" (1290×2796) — 5 required

| #   | Screen                                           | Source (recapture from)                               | Tagline overlay                |
| --- | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| 1   | Chat home with multi-provider picker open        | `app/(app)/chat/index.tsx`                            | One subscription, every model. |
| 2   | Active conversation with model badge + streaming | `app/(app)/chat/[id].tsx`                             | Switch providers mid-thread.   |
| 3   | Projects detail screen                           | `app/(app)/projects/[id].tsx`                         | Organize by project, not chat. |
| 4   | Voice mode (recording state)                     | `app/(app)/voice.tsx` (or chat composer voice button) | Talk to any model.             |
| 5   | Settings → Permissions (4-state picker)          | `app/(app)/settings/permissions/[permission].tsx`     | Local-first, always private.   |

The visual-verification PNGs in `docs/visual-verification/mobile/` are
similarity-test captures (smaller, viewport-only); **all mobile screenshots
need fresh capture at 1290×2796**.

### 4.2 Apple App Store — iPad 12.9" (2048×2732) — 5 required if iPad claimed

`apps/mobile/app.config.js` line 62 sets `supportsTablet: true`, so iPad
screenshots **are required**. Same 5 screens as iPhone but in landscape
orientation, captured on iPad Pro 12.9" simulator.

### 4.3 Google Play — phone (1080×1920 or 16:9) — 5 required

Same 5 screens as App Store iOS, exported at 1080×1920 portrait.

### 4.4 Google Play — tablet (1080×1920 landscape or 2048×1536)

`supportsTablet: true` claim on iOS implies Android tablet support is
also expected. Capture the same 5 screens on Android tablet emulator at
1600×2560 (10" tablet baseline).

### 4.5 Chrome Web Store (1280×800 or 640×400) — 5 promotional images

| #   | Screen                                         | Source                                 |
| --- | ---------------------------------------------- | -------------------------------------- |
| 1   | Side-panel chat open over a webpage            | Capture from running extension         |
| 2   | Page-capture confirmation toast                | Capture from running extension         |
| 3   | Bridge-connected status pill in popup          | `src/popup.html`                       |
| 4   | Allowlist UI in popup                          | `src/popup.html` (R5 commit aa3edc0e2) |
| 5   | Context-menu "Send selection to AGI Workforce" | Capture in-browser                     |

Existing visual-verification at `docs/visual-verification/chrome-extension/`
contains `round-17-static-html.snap` (text only, not an image). **All
Chrome screenshots need fresh capture.**

Optional: 1 promo tile 440×280 + 1 marquee promo 1400×560 (Chrome Web
Store featuring).

### 4.6 VS Code Marketplace — 6 screenshots embedded in README

Per `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md` step 3,
placed in `apps/extension-vscode/media/`:

1. `sidebar-chat.png` — sidebar panel + multi-turn conversation + provider badge
2. `at-mention-quickpick.png` — `@` typed, file quickpick open
3. `chat-in-editor.png` — chat panel in editor tab
4. `model-picker.png` — `selectModel` QuickPick with provider list
5. `sessions-history.png` — History tree view in sidebar
6. `inline-completion.png` — ghost-text inline completion accepted

Recommended size: 1280×800 px PNG, ≤ 200 KB each. **Capture from a live
extension dev host.**

### 4.7 Desktop — GitHub Releases page

Optional but recommended for the release notes:

| #   | Screen                                     | Source                                                                              |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | Chat home with relevant-chats panel        | `docs/visual-verification/desktop/round-17-root-full.png` — already at 1400×850     |
| 2   | Artifact thumbnail card + file-op timeline | Recapture                                                                           |
| 3   | Providers page                             | `docs/visual-verification/desktop/desktop-providers-full.png` — already at 1400×850 |
| 4   | Tool-call rendering with thinking timer    | Recapture                                                                           |
| 5   | Settings depth                             | Recapture                                                                           |

Desktop visual-verification PNGs **can serve directly** for the GitHub
release page since they're at the canonical 1400×850 window size.

### 4.8 Web — Vercel landing / metadata images

Open Graph image (1200×630): generate via `apps/web/app/opengraph-image.tsx`
if present; otherwise capture `https://agiworkforce.com` hero at that size.

### 4.9 CLI — terminal recording (asciinema preferred)

CLI visual-verification at `docs/visual-verification/cli/` has `.snap`
text files, not images. For the GitHub release page, record a 60s
asciinema demo showing: `agi` startup, `/agents` slash command, model
switch, plan-mode banner.

---

## 5. Submission-day runbook

Target window: 2-3 hours, executed in order. Stop on first failure.

### Step 1 — Pre-flight verification (15 min)

```bash
cd /Users/siddhartha/Desktop/agiworkforce

# Worktree must be clean
git status

# Re-run all gates
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:service-layer
pnpm check:hooks
pnpm check:llm-operability
pnpm lint
pnpm typecheck:all
pnpm test

# Per-surface similarity should still be ≥80%
for s in web desktop mobile cli vscode-extension chrome-extension; do
  grep -m1 "^## Score" docs/visual-verification/$s/similarity-report.md
done
```

### Step 2 — Push commits + tag (5 min)

```bash
git log --oneline origin/main..HEAD   # confirm 21 ahead of origin/main
git push origin main
git push origin v1.2.0
```

### Step 3 — Verify required secrets (10 min)

| Surface      | Secret                                                                                                                     | Where it lives                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Mobile       | `apps/mobile/secrets/asc-api-key.p8`                                                                                       | Local file (not git)                 |
| Mobile       | `apps/mobile/secrets/google-play-service-account.json`                                                                     | Local file (not git)                 |
| Mobile (env) | `ASC_APP_ID`, `APPLE_ID`, `ASC_API_KEY_ID`, `ASC_API_KEY_ISSUER_ID`                                                        | `.env.local` or shell                |
| Desktop      | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | GitHub Actions secrets               |
| Desktop      | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`                                                                      | GitHub Actions secrets               |
| Desktop      | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`                                                          | GitHub Actions secrets (already set) |
| CLI          | `NPM_TOKEN`                                                                                                                | GitHub Actions secret                |
| VS Code      | `VSCE_PAT`                                                                                                                 | Local shell env                      |
| Web          | `STRIPE_LIVE_SECRET`, `STRIPE_WEBHOOK_SECRET`                                                                              | Vercel env vars                      |
| Web          | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                | Vercel env vars (already set)        |

Verify GitHub Actions secrets via:

```bash
gh secret list --repo siddharthanagula3/agiworkforce
```

### Step 4 — Build all artifacts (60 min)

Run in parallel terminal panes — none of these depend on each other.

```bash
# Pane 1 — mobile (cloud build on EAS, ~25 min each)
cd apps/mobile && eas build --platform all --profile production

# Pane 2 — desktop (CI workflow; manual dispatch)
gh workflow run release.yml -f version=1.2.0

# Pane 3 — chrome extension (~1 min)
pnpm --filter @agiworkforce/extension package
# Output: apps/extension/extension.zip

# Pane 4 — VS Code extension (~30 sec)
cd apps/extension-vscode && pnpm package
# Output: agi-workforce-1.2.0.vsix

# Pane 5 — CLI (CI workflow; auto-triggered by v-cli-* tag)
git tag v-cli-1.7.1   # current CLI version in apps/cli/Cargo.toml
git push origin v-cli-1.7.1

# Pane 6 — web
pnpm --filter @agiworkforce/web build && vercel --prod
```

### Step 5 — Submit each store (60-90 min total)

**5a. App Store**

```bash
cd apps/mobile
eas submit --platform ios --profile production --latest
```

Then in App Store Connect web UI:

1. Fill in privacy nutrition label (paste from §3.1)
2. Upload 5+5 screenshots (iPhone 6.7" + iPad 12.9")
3. Paste listing copy from §2.1
4. Submit for review (Apple review: 24-48 hours typical in May 2026)

**5b. Google Play**

```bash
cd apps/mobile
eas submit --platform android --profile production --latest
```

Then in Play Console web UI:

1. Fill in Data Safety section (paste from §3.2)
2. Upload 5+5 screenshots (phone + tablet) + feature graphic 1024×500
3. Paste listing copy from §2.2
4. Promote from `internal` to `production` track
5. Submit for review (Play review: hours to a few days)

**5c. Chrome Web Store**

1. Open https://chrome.google.com/webstore/devconsole
2. Pay $5 developer fee if not already paid
3. Upload `apps/extension/extension.zip`
4. Paste listing copy + permission justifications from §2.3
5. Upload 5 promo images from §4.5
6. Submit for review (Chrome review: hours to days, faster for low-permission updates; this is initial submission)

**5d. VS Code Marketplace**

```bash
cd apps/extension-vscode
vsce publish --packagePath agi-workforce-1.2.0.vsix --pat $VSCE_PAT
```

No review queue — listing goes live immediately after `vsce publish`
returns success. Verify at
`https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce`.

**5e. GitHub release (desktop + CLI)**

GitHub releases are auto-created by `release-desktop.yml` (on `v*` tag)
and `release-cli.yml` (on `v-cli-*` tag). Verify both drafts at
`https://github.com/siddharthanagula3/agiworkforce/releases` and publish
when artifacts attach.

Or create unified release pointing at the launch doc:

```bash
gh release create v1.2.0 \
  --title "AGI Workforce v1.2.0" \
  --notes-file docs/plans/2026-05-31-suite-transformation-launch.md
```

### Step 6 — Post-submission verification (15 min)

```bash
# Confirm public URLs resolve
curl -fsSL https://agiworkforce.com | grep -i 'agi'
curl -fsSL https://agiworkforce.com/privacy | grep -i 'privacy policy'

# Confirm VS Code marketplace listing is live
curl -fsSL https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce | grep -i 'agi workforce'

# Confirm npm packages published
npm view @agiworkforce/cli version
npm view @agiworkforce/cli-darwin-arm64 version

# Confirm GitHub releases are public
gh release view v1.2.0 --repo siddharthanagula3/agiworkforce
```

---

## 6. Known pre-submission blockers

### 6.1 Mobile version number is stale — BLOCKER

`apps/mobile/app.config.js` line 51: `version: '1.0.0'`, line 64: `buildNumber: '1'`.

The repo is at `v1.2.0` (desktop + chrome ext + cli aligned). Mobile must
be bumped to `1.2.0` and `buildNumber` to `1` (or the next available
integer per EAS auto-increment) **before** the first App Store / Play
submission, otherwise the marketing version on the listing will not match
the binary.

Fix:

```js
// apps/mobile/app.config.js
version: '1.2.0',
ios: { buildNumber: '1', /* eas autoIncrement handles next */ },
android: { versionCode: 1, /* eas autoIncrement handles next */ },
```

`eas.json` production profile already has `autoIncrement: true` which
will handle subsequent builds; the _initial_ manual bump is needed once.

### 6.2 VS Code extension repository URL is wrong — BLOCKER

`apps/extension-vscode/package.json` line 11:
`"url": "https://github.com/agiworkforce/agiworkforce"`.

The rest of the repo (CLI Cargo.toml, chrome ext package.json) points to
`siddharthanagula3/agiworkforce`. The marketplace "Repository" link will
404 as-is.

Fix:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/siddharthanagula3/agiworkforce.git",
  "directory": "apps/extension-vscode"
}
```

### 6.3 VS Code extension is marked `"preview": true` — NOT a blocker but noted

`apps/extension-vscode/package.json` line 15. VS Code will show a "Preview"
badge on the marketplace listing. Acceptable for a first listing; flip to
`false` when removing the badge for v1.3.

### 6.4 iOS privacy manifest may need update if cloud-sync ships — VERIFY

`apps/mobile/app.config.js` lines 113-115 declare
`NSPrivacyCollectedDataTypes: []`. If mobile v1.2.0 has any login flow
that collects email (even opt-in), this is **technically inaccurate** and
Apple may reject.

**Action**: before submission, verify v1 mobile does NOT collect data per
the LOCAL ONLY lock. If it does (any auth screen, any cloud-sync toggle
that posts data), update `NSPrivacyCollectedDataTypes` to include
`NSPrivacyCollectedDataTypeEmailAddress` / `NSPrivacyCollectedDataTypeName`
with purposes `NSPrivacyCollectedDataTypePurposeAppFunctionality`.

Check via:

```bash
grep -rn "signInWith\|signUp\|email" apps/mobile/app/\(auth\)/ apps/mobile/app/onboarding/ 2>/dev/null | head -20
```

If any results: update the privacy manifest before submission.

### 6.5 Desktop macOS + Windows release jobs deleted — BLOCKER for stores beyond GitHub

`.github/workflows/release-desktop.yml` lines 7-29 explain that the
`build-macos` and `build-windows` jobs were **deleted** until APPLE\_\*
secrets + DigiCert EV cert are configured. Pushing `v1.2.0` today triggers
**Linux-only** release.

**Two paths to fix:**

A. Use `release.yml` (manual dispatch, full pipeline) — restore APPLE\_\*
secrets first.
B. Re-add the macOS + Windows jobs to `release-desktop.yml` per the
instructions in its header comment.

Path A is faster; path B is the long-term fix.

### 6.6 Tauri macOS signingIdentity is hardcoded — VERIFY KEYCHAIN

`apps/desktop/src-tauri/tauri.conf.json` line 66:
`"signingIdentity": "Developer ID Application: AGI AUTOMATION LLC (D2PR62RLT4)"`.

This string must exactly match what's installed in the building machine's
keychain (`security find-identity -v -p codesigning`). If the cert was
re-issued or renamed, this string must be updated.

### 6.7 Web "Support URL" referenced in App Store listing does not exist — MINOR

Per launch-doc scope-cut #2, `/support` was deferred. App Store requires
a support URL. Two options:

A. Use `https://agiworkforce.com/privacy` (acceptable — has contact info
per the privacy page).
B. Ship a minimal `/support` stub before submission (1-hour task).

### 6.8 Chrome extension host_permissions trip Web Store review — VERIFY

`apps/extension/manifest.json` lines 21-22 use broad
`http://localhost/*` + `http://127.0.0.1/*`. The justification (bridge
port is user-configurable) is sound, and runtime `validateBridgeUrl()`
enforces it. Chrome Web Store reviewers may still question this.

**Action**: paste the existing `_host_permissions_note` from the manifest
into the Chrome Web Store permission justification field verbatim.

### 6.9 expo-location intentionally not installed — NOT a blocker

`apps/mobile/src/features/settings/permissions/registry.ts` line 9 documents
that `expo-location` is intentionally NOT a dependency in v1; the
Location permission UI surfaces to OS Settings via deeplink instead of
prompting in-app. This is **by design** per R21 Lane 4 — no Info.plist
location key is needed, no permission prompt will fire from the app, and
the privacy manifest doesn't need a location entry.

If a future sprint adds `expo-location`, add
`NSLocationWhenInUseUsageDescription` to `app.config.js` and add
`ACCESS_FINE_LOCATION` to the Android permissions array.

### 6.10 CLI publishes to npm — VERIFY scope ownership

`scripts/publish-cli.sh` publishes 7 packages under the `@agiworkforce/*`
scope (per `release-cli.yml`). Verify the npm scope is owned by the
publishing account before tagging `v-cli-1.7.1`:

```bash
npm access list packages --json | jq 'keys[] | select(startswith("@agiworkforce/"))'
```

If the scope is unclaimed, run `npm org create agiworkforce` and add the
publishing account first.

---

## 7. Submission order (recommended)

Sequence to minimize blocking on review queues:

1. **VS Code Marketplace first** — no review queue, immediate publish, lowest risk to validate the listing copy + screenshots flow end-to-end.
2. **Chrome Web Store second** — review queue is hours, low permission complexity if §6.8 justification is clean.
3. **Google Play third** — review queue is hours to days; Android internal track is fast.
4. **Apple App Store last** — review queue is 24-48 hours typical, highest rejection risk if §6.1 (version) or §6.4 (privacy manifest) blockers slip through.
5. **GitHub release (desktop Linux + CLI npm)** can ship in parallel with any of the above — auto-triggered by tag push.
6. **Web (Vercel)** can ship in parallel with any of the above.

The desktop signed-installer path (macOS + Windows) is blocked on §6.5; ship the Linux AppImage with v1.2.0 and follow up with macOS + Windows in v1.2.1 once certs land.

---

## 8. Post-launch monitoring (first 48 hours)

```bash
# Crash reports
open https://sentry.io/organizations/agiworkforce/issues/

# Vercel analytics
vercel --prod logs --follow

# Supabase logs
# (via Supabase dashboard or MCP get_logs)

# App Store reviews
# https://appstoreconnect.apple.com/apps/<ASC_APP_ID>/appstore/activity/ios/ratings-and-reviews

# Play Store reviews
# https://play.google.com/console/u/0/developers/<dev-id>/app/<app-id>/user-feedback

# Chrome Web Store reviews
# https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/reviews

# VS Code Marketplace stats
# https://marketplace.visualstudio.com/manage/publishers/agiworkforce
```

Set up an on-call rotation for the first 48 hours; respond to negative
reviews within 24 hours per the GTM playbook lock.

---

## Lineage

- Companion to `docs/plans/2026-05-31-suite-transformation-launch.md`
- Generated by R21 lane 8 (external-blocker prep), 2026-05-22
- Grounded in: `apps/mobile/app.config.js`, `apps/mobile/eas.json`,
  `apps/desktop/src-tauri/tauri.conf.json`, `apps/extension/manifest.json`,
  `apps/extension/package.json`, `apps/extension-vscode/package.json`,
  `apps/cli/Cargo.toml`, `.github/workflows/release-{desktop,cli}.yml`,
  `apps/web/app/privacy/page.tsx`, `apps/mobile/EAS_SIGNING_RUNBOOK.md`,
  `apps/extension-vscode/MARKETPLACE_PUBLISH_RUNBOOK.md`.
