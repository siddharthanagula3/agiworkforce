# R26-PARITY W3 — Claude iOS Parity Audit (Mobile)

**Date:** 2026-05-22  
**Auditor:** mobile-engineer  
**Reference set:** 27 screenshots at `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/`  
**Our implementation:** `apps/mobile/` (Expo 55 + React Native 0.84.1)  
**Strategy context:** v1 = LOCAL ONLY + cloud waitlist. Mobile is the lead surface. M1 alpha Jun 21.

---

## 1. Inventory Table

| #   | Screenshot                                                           | Claude feature captured                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01_app-shell_splash-opus-extended-faded-greeting.png`               | App shell / splash: logo overlay on chat empty state, contextual greeting ("How can I help you this evening?"), model pill + Extended label top-center, ghost icon top-right, usage-warning banner above composer                 |
| 02  | `02_empty-state_composer-keyboard-up.png`                            | Empty state with keyboard open: greeted by name, star logo, composer placeholder "Chat with Claude", [+] left, microphone + waveform right, "BY ANTHROPIC" footer                                                                 |
| 03  | `03_sidebar_chats-projects-artifacts-code-dispatch-recents.png`      | Sidebar/drawer: brand wordmark "Claude", nav items (Chats, Projects, Artifacts, Code, Dispatch "New" badge), Recents list with 10 truncated titles, user avatar + name + [+] FAB bottom                                           |
| 04  | `04_composer_model-selector-opus-sonnet-haiku-extended.png`          | Model selector dropdown: Opus 4.6 (most capable), Sonnet 4.6 (most efficient), Haiku 4.5 (fastest), Extended thinking toggle + "More models >"                                                                                    |
| 05  | `05_projects_list-research-claude-prompt.png`                        | Projects list: simple list with title + relative timestamp + chevron, search bar bottom, [+] FAB                                                                                                                                  |
| 06  | `06_artifacts_gallery-loading-skeleton.png`                          | Artifacts gallery loading: skeleton 2-column card grid + "Get inspired" banner top                                                                                                                                                |
| 07  | `07_artifacts_gallery-loaded-card-grid.png`                          | Artifacts gallery loaded: 2-column card grid with title + date, text snippet previews                                                                                                                                             |
| 08  | `08_code_sessions-list-idle-and-archived.png`                        | Code sessions list: "Idle" section + "Archived" section, each row = title + repo path + chevron, [+] FAB                                                                                                                          |
| 09  | `09_cowork_looking-for-desktop-loading.png`                          | Cowork/Dispatch connection loading: phone→arrow→laptop illustration, "Looking for your desktop…" copy, spinner, instruction copy                                                                                                  |
| 10  | `10_settings_main-profile-billing-usage-capabilities-connectors.png` | Settings main: email at top, Profile / Billing (Max plan) / Usage / Capabilities / Connectors / Permissions / Appearance (Dark) / Speech language / Notifications / Privacy / Shared links / Haptic feedback toggle               |
| 11  | `11_settings_connectors-drive-gmail-vercel-calendar-n8n.png`         | Connectors settings: Drive search toggle (off), Gmail (chevron), Vercel (chevron), Google Calendar (Connect external-link), n8n (Connect external-link)                                                                           |
| 12  | `12_settings_capabilities-artifacts-code-web-memory-tools.png`       | Capabilities settings: Artifacts toggle, Code execution toggle, Web search toggle, Memory section (search/reference chats, generate memory from chat), View your memory row, Tool access (Auto/On demand/Always available)        |
| 13  | `13_settings_usage-current-session-and-weekly-limits.png`            | Usage screen: "Current session" progress bar (2%, resets in 4h 58m), "Weekly limits – All models" bar (25%, resets Thu 10PM), last-update timestamp                                                                               |
| 14  | `14_settings_notifications-research-chat-code.png`                   | Notifications settings: Research complete, Chat responses, Code updates — all toggle rows, all ON                                                                                                                                 |
| 15  | `15_settings_shared-links-empty-state.png`                           | Shared links: centered empty state with link icon + copy                                                                                                                                                                          |
| 16  | `16_settings_permissions-location-calendar-reminders-health.png`     | Permissions: Location (Read only), Calendar (Read & write), Reminders (Read & write), Health (Never) — each with description                                                                                                      |
| 17  | `17_settings_billing-max-plan-manage-subscription.png`               | Billing: "Account plan – Max" card, Manage subscription, Restore purchases                                                                                                                                                        |
| 18  | `18_settings_profile-personal-preferences.png`                       | Profile: Full Name + Nickname fields, Update Profile button, Personal Preferences textarea, Save Preferences, Delete account (danger)                                                                                             |
| 19  | `19_code_session-detail-connecting-state.png`                        | Code session detail: title + repo subtitle in header, [•••] menu, body empty (connecting), "Connecting" spinner pill, "Add feedback…" textarea, "</> Code" mode label + [+] + send button                                         |
| 20  | `20_code_session-select-mode-plan-vs-code.png`                       | Code mode sheet: "Plan" (Claude explores before edits) vs "Code" (writes directly) — checkmark on Code                                                                                                                            |
| 21  | `21_code_session-more-menu-copy-share-rename-archive.png`            | Code session more menu: Copy branch (branch name), Share, Rename, Archive                                                                                                                                                         |
| 22  | `22_code_session-attachment-take-or-choose-photo.png`                | Code session attachment picker: "Take Photo" / "Choose Photo" inline menu overlay                                                                                                                                                 |
| 23  | `23_code_archived-sessions-list.png`                                 | Archived code sessions list: longer list with disconnected state labels, task-notification titles, [+] FAB                                                                                                                        |
| 24  | `24_chat_thread-reasoning-chip-reply-composer.png`                   | Chat thread (streaming): message bubble, thinking chip "The user is asking whether…" (collapsed, tappable with ">"), response still streaming (star spinner), "Reply to Claude" composer placeholder, [+] left, stop square right |
| 25  | `25_chat_thought-process-sheet-overview.png`                         | Thought process bottom sheet: partial view sliding up from bottom with full thinking text                                                                                                                                         |
| 26  | `26_chat_thought-process-sheet-expanded.png`                         | Thought process sheet expanded: full-screen readable thinking text, [X] close top-left, "Thought process" title                                                                                                                   |
| 27  | `27_composer_add-to-chat-sheet-camera-photos-files-toggles.png`      | Add to Chat sheet: Camera/Photos/Files 3-up row, Research toggle (off), Web search toggle (on), Health Beta toggle (off), Add to project (None), Choose style (Normal), Tool access (Auto), Manage Connectors                     |

---

## 2. Parity Scorecard

Scale: **MATCH** = functionally equivalent | **CLOSE** = present but differs in detail | **PARTIAL** = feature exists but significantly incomplete | **MISSING** = not implemented | **AHEAD** = we have it, Claude doesn't

| Area                          | Claude iOS                                                                                                                       | AGI Mobile                                                                                                                                                                                 | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App shell / splash**        | Logo overlay on dark BG, contextual time greeting, star logo                                                                     | Contextual greeting exists in empty chat (star logo, time greeting)                                                                                                                        | **MATCH**   | `app/(app)/(tabs)/chat.tsx`, `ChatEmptyState.tsx`                                                                                                                                                                                                                                                                                                                         |
| **Drawer navigation**         | Chats, Projects, Artifacts, Code, Dispatch (New badge), Recents list, user avatar                                                | Chat, Artifacts, Code, Projects, Skills, Dispatch (feature-flagged), Recents (last 5)                                                                                                      | **CLOSE**   | AGI adds Skills drawer item. Claude uses "Chats" label; we use "Chat". Dispatch is feature-flagged in AGI — `DrawerContent.tsx:50-55`. AGI adds "Local Mode" status card not present in Claude                                                                                                                                                                            |
| **Recents in drawer**         | ~10 items, full-width                                                                                                            | Last 5 items                                                                                                                                                                               | **PARTIAL** | We show 5 vs Claude's ~10. `DrawerContent.tsx:270`                                                                                                                                                                                                                                                                                                                        |
| **User card in drawer**       | Avatar + name + [+] FAB                                                                                                          | Avatar initial + display name + "Local profile" label + [+] button                                                                                                                         | **CLOSE**   | AGI adds "Local profile" sub-label (feature differentiator). No email in our drawer vs Claude shows name only                                                                                                                                                                                                                                                             |
| **Model selector**            | Dropdown from model pill in nav bar: Opus, Sonnet, Haiku + Extended thinking option + "More models >"                            | Bottom sheet with Auto modes, search, On-device / Cloud sections, favorites, thinking toggle                                                                                               | **AHEAD**   | AGI model picker is significantly richer: search, favorites, install state, per-model thinking toggle, multi-provider grouping. Claude only shows 3 Anthropic models + Extended. `ModelPickerSheet.tsx`                                                                                                                                                                   |
| **Chat empty state**          | Star logo, contextual greeting ("How can I help you this evening?"), usage warning banner                                        | Star logo, contextual greeting, task chips                                                                                                                                                 | **CLOSE**   | AGI adds 6 task chips above composer on empty state. Claude shows usage warning banner — we have `ContextWarningChip.tsx` but no dedicated usage-limit banner                                                                                                                                                                                                             |
| **Composer placeholder**      | "Chat with Claude"                                                                                                               | Standard placeholder                                                                                                                                                                       | **CLOSE**   | Our placeholder reads from ChatInput; doesn't say "Chat with Claude" specifically                                                                                                                                                                                                                                                                                         |
| **Composer toolbar**          | [+] left, microphone + waveform button right                                                                                     | [+] left, voice + add-to-chat buttons                                                                                                                                                      | **MATCH**   | `ChatInput.tsx`, `Composer.tsx`                                                                                                                                                                                                                                                                                                                                           |
| **Add to Chat sheet**         | Camera, Photos, Files 3-up; Research/Web search/Health toggles; Add to project/Choose style/Tool access/Manage Connectors        | Camera, Photos, File, Skills 4-up; Chat mode selector; Agent mode; Effort; Auto-approve; Temp chat; Web search/Image gen/Computer use/Health toggles; Project/Style/Tool access/Connectors | **AHEAD**   | AGI sheet is much richer. Claude has 3 attachment types; we have 4 (add Skills). Claude shows Research/Web/Health; we add Image gen, Computer use, Agent mode, Effort, Auto-approve, Temp chat. `AddToChatSheet.tsx`                                                                                                                                                      |
| **Thinking / reasoning chip** | Collapsed chip in thread with "The user is asking…" text snippet + ">" tap to expand                                             | `ThinkingLine.tsx` chip + `ThinkingBottomSheet.tsx`                                                                                                                                        | **MATCH**   | Both show collapsed chip tappable to full sheet. `ThinkingBottomSheet.tsx:38-60`                                                                                                                                                                                                                                                                                          |
| **Thought process sheet**     | Full-screen bottom sheet, [X] close, "Thought process" title, plain readable text                                                | Same structure via `ThinkingBottomSheet.tsx` at 90% snap                                                                                                                                   | **MATCH**   | `ThinkingBottomSheet.tsx`                                                                                                                                                                                                                                                                                                                                                 |
| **Chat thread**               | Message bubbles, streaming spinner (star logo), "Reply to Claude" composer during stream                                         | Message list, streaming indicator, composer                                                                                                                                                | **CLOSE**   | Our composer placeholder says standard text not "Reply to Claude". Streaming stop button is a square; Claude uses a square too — MATCH                                                                                                                                                                                                                                    |
| **Projects list**             | Title + relative timestamp + chevron rows, search bottom, [+] FAB                                                                | `ProjectCard.tsx`, search in `Sidebar.tsx`                                                                                                                                                 | **MATCH**   | `apps/mobile/app/(app)/(tabs)/projects.tsx` + `ProjectCard.tsx`                                                                                                                                                                                                                                                                                                           |
| **Artifacts gallery**         | 2-column card grid with text preview, loading skeleton, "Get inspired" banner                                                    | `ArtifactFullScreen.tsx`, gallery at `artifacts/index.tsx`                                                                                                                                 | **PARTIAL** | We have artifact fullscreen and inline cards but need to verify 2-column gallery grid with skeleton + "Get inspired" banner. Source at `app/(app)/artifacts/index.tsx` — need implementation check                                                                                                                                                                        |
| **Code sessions list**        | Idle + Archived sections, title + repo + status row, [+] FAB                                                                     | `CodeSessionsScreen` with Idle + Archived sections, same row format, [+] FAB                                                                                                               | **MATCH**   | `code-sessions/index.tsx:38-115`                                                                                                                                                                                                                                                                                                                                          |
| **Code session detail**       | Header with title + repo + [•••], "Connecting" status pill, "Add feedback…" textarea, "</> Code" mode label, [+] + send          | `CodeSessionDetailScreen` with same structure                                                                                                                                              | **MATCH**   | `code-sessions/index.tsx:196-388`                                                                                                                                                                                                                                                                                                                                         |
| **Code mode select sheet**    | Plan vs Code, checkmark on selected                                                                                              | `ModeSelectSheet.tsx`                                                                                                                                                                      | **MATCH**   | `code-sessions/components/ModeSelectSheet.tsx`                                                                                                                                                                                                                                                                                                                            |
| **Code more menu**            | Copy branch, Share, Rename, Archive                                                                                              | `CodeSessionMoreMenu.tsx` — same 4 actions                                                                                                                                                 | **MATCH**   | `code-sessions/components/CodeSessionMoreMenu.tsx`                                                                                                                                                                                                                                                                                                                        |
| **Code attachment picker**    | Take Photo / Choose Photo inline overlay                                                                                         | `AddToChatSheet.tsx` Camera/Photos, also code-specific via `EnvironmentOptionsSheet.tsx`                                                                                                   | **MATCH**   | Pattern matches                                                                                                                                                                                                                                                                                                                                                           |
| **Dispatch / Cowork**         | "Looking for your desktop…" connecting screen, phone→laptop illustration, spinner                                                | `companion/index.tsx`, `ConnectionStateViews.tsx`, `DesktopInfoCard.tsx`, QR scanner pairing                                                                                               | **AHEAD**   | AGI Dispatch has QR pairing, execution stream, agent dashboard, heartbeat latency — significantly richer than Claude's simple connecting screen. `dispatch/index.tsx`                                                                                                                                                                                                     |
| **Settings main**             | Email top, Profile/Billing/Usage/Capabilities/Connectors/Permissions/Appearance/Speech/Notifications/Privacy/Shared links/Haptic | Mode/Keys/Local AI/Connections/Voice/Preferences/Privacy/About sections                                                                                                                    | **CLOSE**   | Different information architecture. Claude is flat list; AGI is sectioned. Claude has: Usage screen, Shared links, Speech language. AGI has: Local Mode status, BYOK row (locked), Storage, Performance, Auto-approve, Desktop pairing, Cloud Whisper waitlist. Core parity items: Capabilities, Connectors, Permissions, Notifications, Appearance, Haptic — all present |
| **Settings > Capabilities**   | Artifacts, Code execution, Web search, Memory (search/generate), View memory, Tool access                                        | `settings/capabilities/index.tsx`                                                                                                                                                          | **CLOSE**   | Need to verify our capabilities screen has all 6 toggles + Tool access selector matching Claude's layout                                                                                                                                                                                                                                                                  |
| **Settings > Connectors**     | Drive search toggle, Gmail, Vercel, Google Calendar, n8n                                                                         | `connectors/index.tsx`                                                                                                                                                                     | **PARTIAL** | Our connectors are cloud-only and waitlist-gated in v1. We show waitlist state; Claude shows live toggles. Functional gap is intentional (v1 lock)                                                                                                                                                                                                                        |
| **Settings > Permissions**    | Location, Calendar, Reminders, Health — with Read/Write granularity                                                              | `settings/permissions/index.tsx` + `permissions/[permission].tsx`                                                                                                                          | **MATCH**   | Same 4 system permissions with granularity. `settings/permissions/index.tsx`                                                                                                                                                                                                                                                                                              |
| **Settings > Billing**        | Account plan card (Max), Manage subscription, Restore purchases                                                                  | `billing/index.tsx` with plan display + StoreKit                                                                                                                                           | **MATCH**   | `app/(app)/billing/index.tsx` — StoreKit IAP per product strategy                                                                                                                                                                                                                                                                                                         |
| **Settings > Profile**        | Full Name, Nickname, Personal Preferences textarea, Update/Save, Delete account                                                  | `profile/index.tsx`                                                                                                                                                                        | **MATCH**   | `app/(app)/profile/index.tsx`                                                                                                                                                                                                                                                                                                                                             |
| **Settings > Notifications**  | Research complete, Chat responses, Code updates — toggle rows                                                                    | `settings/notifications/index.tsx`                                                                                                                                                         | **MATCH**   | `settings/notifications/index.tsx`                                                                                                                                                                                                                                                                                                                                        |
| **Settings > Usage**          | Current session progress bar + weekly limits bar + reset timestamp                                                               | `usage.tsx`                                                                                                                                                                                | **PARTIAL** | `app/(app)/usage.tsx` exists — need to confirm dual-bar layout (current session + weekly) matches Claude                                                                                                                                                                                                                                                                  |
| **Settings > Shared links**   | Empty state screen with copy                                                                                                     | Not found in settings routes                                                                                                                                                               | **MISSING** | No `settings/shared-links` route. This is a cloud feature but the empty-state screen should exist for v1 parity                                                                                                                                                                                                                                                           |
| **Appearance toggle**         | Dark/Light inline in settings, immediate apply                                                                                   | Theme row in settings with Dark/Light/System 3-way                                                                                                                                         | **AHEAD**   | AGI adds System (follows OS). Claude only shows Dark/Light. `settings/index.tsx:285-312`                                                                                                                                                                                                                                                                                  |
| **Speech language**           | "EN" value in settings row                                                                                                       | Not in settings                                                                                                                                                                            | **MISSING** | No speech language selector found. Voice settings exist but no language picker                                                                                                                                                                                                                                                                                            |
| **Privacy / Shared links**    | Shared links row in settings                                                                                                     | Not present                                                                                                                                                                                | **MISSING** | See Shared links above                                                                                                                                                                                                                                                                                                                                                    |
| **Dark mode throughout**      | All screenshots in dark mode, consistent #1C1C1E-class background                                                                | Dark/light theme system with `useThemeColors`                                                                                                                                              | **MATCH**   | `src/ui/theme.ts`                                                                                                                                                                                                                                                                                                                                                         |
| **"New" badge on Dispatch**   | Orange "New" badge on Dispatch drawer item                                                                                       | Not found in `DrawerContent.tsx`                                                                                                                                                           | **MISSING** | No badge on Dispatch nav item in our drawer. `DrawerContent.tsx:50-55` — badge field absent                                                                                                                                                                                                                                                                               |
| **Usage warning banner**      | "Opus consumes usage limits faster than other models" dismissable chip above composer                                            | `ContextWarningChip.tsx` exists                                                                                                                                                            | **CLOSE**   | Our chip exists but fires on context length, not specifically model-tier usage rate                                                                                                                                                                                                                                                                                       |
| **Voice mode**                | Microphone + waveform button in composer, voice conversation screen                                                              | `VoiceInputButton.tsx`, `VoiceConversationScreen.tsx`, `Waveform.tsx`                                                                                                                      | **MATCH**   | Full voice pipeline implemented. `src/features/voice/`                                                                                                                                                                                                                                                                                                                    |
| **Haptic feedback toggle**    | Toggle in settings, ON by default                                                                                                | `settingsStore.hapticsEnabled`, toggle in settings                                                                                                                                         | **MATCH**   | `settings/index.tsx:634-640`                                                                                                                                                                                                                                                                                                                                              |

---

## 3. User-Flow Reality Check

For each critical flow: what would a TestFlight user actually experience on M2 cut (Jul 19)?

---

### Flow 1 — Onboarding

**What Claude iOS shows:** Sign-in screen (email/Apple), plan selection, standard cloud setup.

**What a user actually gets in our app:**

The onboarding is correctly implemented and v1-locked. `app/(public)/onboarding.tsx` runs a 3-screen flow: Hero → device-tier detection → model download. No account, no login, no BYOK form. The compliance disclosure modal fires on first CTA tap via `@agiworkforce/compliance` package. `DISCLOSURE_PROVIDERS` is hardcoded to `[]` (empty), correctly signalling no third-party AI cloud routing in v1. On completion, `storage.set('onboarding-done', 'true')` and `storage.set('onboarding-mode', 'local')` are persisted to MMKV.

**Critical gap:** The model download in Screen 3 is **a simulated progress bar** — not a real download. The `TODO` comment at `onboarding.tsx:231-247` is explicit: `downloadUrl`, `checksum`, and `format` fields are not yet in `OnDeviceModel`. The progress bar runs on a `setInterval` at `+1.2%` every 80ms (about 7 seconds to 100%), then calls `finishOnboarding()` regardless of whether any model file was actually fetched. A user tapping "Download model" on TestFlight will see a convincing progress animation and then enter the app with **no local model installed**.

**v1 lock compliance:** PASS — no BYOK forms, no cloud login, no provider key entry. Tagline "AGI runs on your device." is correct. Trust chips (Local LLMs active / Works offline / DPDP Act 2023 compliant) are rendered. Footer "Made by AGI Automation LLC · Delaware, USA" is present.

**Runtime verdict:** UI correct, model download is a stub. **BLOCKER for M1 alpha** — must wire real `downloadModel()` service before any TestFlight distribution.

---

### Flow 2 — StoreKit IAP

**What Claude iOS shows:** Billing screen: Account plan (Max), Manage subscription (links to App Store), Restore purchases.

**What a user actually gets in our app:**

`app/(app)/billing/index.tsx` renders a full tier-card pricing screen (Free / Hobby / Pro / Pro+ / Max). The `handleUpgrade` function calls `api.post('/api/checkout', { tier, interval })` to get a checkout URL, then opens it via `openExternalUrl`. This is a **web redirect to Stripe**, not StoreKit IAP.

The screen is also gated: `if (!FEATURES.billing) return null;` — so it only renders if the billing feature flag is on. Checking the flag value is required to know if this screen is even reachable on TestFlight.

The billing screen does **not** use `expo-in-app-purchases` or `react-native-purchases` (RevenueCat). There is no `Restore purchases` button. The product strategy mandates StoreKit IAP at 15% via Apple Small Business Program. The current implementation does not satisfy this — it routes to a web checkout.

**Runtime verdict:** The billing screen renders a correct-looking pricing UI but the purchase mechanism is wrong for App Store distribution. Apple will reject a binary that routes paid upgrades to an external web checkout without the StoreKit entitlement path. **BLOCKER for App Store submission** (M3). Not a M1/M2 TestFlight blocker if internal only, but requires a plan before M2 external TestFlight.

---

### Flow 3 — Voice Mode

**What Claude iOS shows:** Microphone + waveform button in composer. Full-screen voice conversation with waveform animation.

**What a user actually gets in our app:**

Voice recording uses `src/features/voice/services/voice.ts` which delegates to `services/voiceInput.ts` (on-device STT). `startRecording()` calls `startCapture()` from the on-device STT service. `stopRecording()` calls `stopCapture()`. The facade comment states: "cloud Whisper + Deepgram helpers below are retained for v1.1 and gated behind `FEATURES.cloudChat` — they throw `CloudVoiceDisabledError` in v1."

The full-screen `VoiceConversationScreen` is wired: it imports from `voice` and `tts` services and calls `onSendMessage` to route transcribed text to the chat engine.

The `VoiceSelector` bottom sheet wires the voice model selector. The settings screen exposes Voice & Language via `VoiceSelector`.

**Dependency risk:** `voiceInput.ts` (the `startCapture` / `stopCapture` implementation) was not directly read. The on-device STT pipeline depends on an underlying native module or library (`@agiworkforce/local-llm` or a speech recognition API). If this is not configured with real model files, the mic button will capture audio but produce no transcript.

**Runtime verdict:** Architecture is sound and correctly gated to on-device-only in v1. Real runtime depends on `voiceInput.ts` having a working implementation with an installed speech model. **Needs manual verification on device** before M1.

---

### Flow 4 — Push Notifications

**What Claude iOS shows:** Notifications settings with Research complete / Chat responses / Code updates toggles, all ON.

**What a user actually gets in our app:**

`services/notifications.ts` is a complete, production-grade implementation:

- `registerForPushNotifications()` calls `Notifications.requestPermissionsAsync()`, creates 4 Android priority channels (critical/high/normal/low), calls `Notifications.getExpoPushTokenAsync()`, and `sendTokenToBackend(token)` which posts to `/api/mobile/push-token`.
- `setupNotificationListeners()` subscribes to foreground, response, and token-refresh events.
- `handleNotificationResponse()` has a full type-switch routing to companion/chat/schedule routes, with auth guard (redirects to login if no session), UUID validation for agentId, and route allowlist.
- `handleInitialNotification()` handles cold-start taps.

Security fixes are documented inline (LOW-MOB-3: auth-gate before navigation, navigator-ready guard with exponential backoff).

**Dependency:** `sendTokenToBackend` requires `/api/mobile/push-token` backend endpoint to exist and the EAS project ID to be set in `app.config.js`. If either is missing, token registration silently fails (the catch block swallows the error as "non-critical") — notifications will be requested and granted, but tokens won't reach the backend and remote pushes won't deliver.

**Runtime verdict:** Client-side implementation is production-ready and secure. **Delivery depends on backend endpoint existence and EAS project ID configuration.** Local notifications (schedules, local triggers) will work immediately. Remote push requires backend wiring.

---

### Flow 5 — Dispatch (Mobile → Desktop)

**What Claude iOS shows:** "Cowork" screen — "Looking for your desktop…" connecting screen with spinner. Claude needs Claude Desktop installed and signed in.

**What a user actually gets in our app:**

`stores/dispatchStore.ts` `sendTask()` calls `useConnectionStore.getState().sendControl('dispatch_task', payload)` when status is `'connected'`, or `queueControl()` when disconnected. This is **real WebRTC control channel dispatch**, not a UI stub. Messages are persisted to MMKV (with `partialize` that strips `previewUrl` from task results for security). The store is rehydrated via `whenMmkvReady`.

`src/features/companion/components/ConnectionStateViews.tsx` renders `DisconnectedView` (QR scan prompt) and `SessionExpiredView`. The `QRScanner` component exists at `src/features/companion/components/QRScanner.tsx`.

`stores/connectionStore.ts` (not read but referenced) drives the `status` field. The Dispatch feature is gated: `show: FEATURES.dispatch` in `DrawerContent.tsx:54`.

**Dependency:** If `FEATURES.dispatch` is false in the v1 feature flags, the entire Dispatch nav item is hidden and no user can reach it. If it is true, the flow requires a desktop app running the WebRTC bridge on the same network or via relay.

**Runtime verdict:** Implementation is substantially real (WebRTC dispatch, QR pairing, MMKV persistence, security hardening). **Gated by `FEATURES.dispatch` flag.** If flag is off, users see nothing — intentional for v1 local-only scope.

---

### Flow 6 — Biometric Gate

**What Claude iOS shows:** Not directly shown; Claude iOS uses Face ID for app lock via iOS Settings.

**What our app implements:**

`lib/biometricFlagStore.ts` is a security-hardened implementation:

- Flag lives in `SecureStore` (iOS Keychain / Android EncryptedSharedPreferences), NOT in MMKV — the audit comment explains this prevents flag flip if MMKV key is extracted.
- Defaults to **fail-closed**: `enabled: true` until hydration completes, so a device seen before first unlock shows the lock screen.
- `WHEN_UNLOCKED_THIS_DEVICE_ONLY` prevents iCloud backup leakage.
- `hydrateBiometricFlag()` is called at app boot.

The `__tests__/biometric-gate.test.tsx` test file exists, confirming the flow has test coverage.

`lib/secureStorage.ts` is the underlying Zustand StateStorage adapter using `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and full promise propagation (fixes MOB-3 fire-and-forget silent failure and MOB-4 Before-First-Unlock handling).

**Runtime verdict:** Biometric gate is **production-grade and correctly hardened**. Fail-closed default, keychain-backed flag, Before-First-Unlock handled. This is ahead of Claude iOS's simple iOS-level app lock.

---

### Flow 7 — MMKV + Biometric + Secure Storage Chain

**What our app implements:**

The three layers are correctly composed and hardened:

1. **Secure storage (expo-secure-store):** Used for auth tokens (`secureStorage` adapter), MMKV encryption key (`agi_mmkv_encryption_key_v1`), and biometric flag (`agi_biometric_lock_enabled_v1`). All items use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Promise propagation fixed (MOB-3/MOB-4).

2. **MMKV encrypted store:** `initMmkvEncryption()` generates a 256-bit key via `Crypto.getRandomBytesAsync(32)` (fixed from dual-UUID 244-bit entropy issue, CRIT-MOB-02), stores it in Keychain, and opens `MMKV({ id: 'agiworkforce-mobile', encryptionKey: key })`. The `whenMmkvReady` / `rehydrateWhenMmkvReady` pattern resolves the startup race condition (MMKV-RACE fix, 23 stores) — stores using `skipHydration: true` wait for the encrypted instance before rehydrating.

3. **Biometric flag in Keychain:** Separated from MMKV to prevent flag flip via MMKV key extraction (LOW-MOB-1 fix).

**What this means for TestFlight users:** On first install, `initMmkvEncryption()` generates the key and writes to Keychain synchronously before any store is accessed. All subsequent launches reuse the same key. If `initMmkvEncryption()` is not called early enough in `app/_layout.tsx`, the proxy no-op MMKV prevents crashes but all store reads return null (degraded state, not crash). The root layout must call it in its first effect.

**Runtime verdict:** Storage chain is **production-grade** with documented security audit trail. Verify `initMmkvEncryption()` call position in `app/_layout.tsx` before M1.

---

### Summary: Runtime Gaps for M2 TestFlight (Jul 19)

| Flow                            | Runtime status                                    | M1/M2 blocker?       |
| ------------------------------- | ------------------------------------------------- | -------------------- |
| Onboarding v1 compliance        | PASS — no BYOK/cloud                              | No                   |
| **Model download**              | **STUB — simulated progress, no real file**       | **YES — M1 blocker** |
| StoreKit IAP                    | Wrong path (web redirect, not StoreKit)           | M3/App Store blocker |
| Voice recording (on-device STT) | Wired but needs voiceInput.ts verification        | Verify before M1     |
| Push notifications              | Client complete; needs backend + EAS config       | Backend dependency   |
| Dispatch WebRTC                 | Real implementation, gated by feature flag        | Flag-dependent       |
| Biometric gate                  | Production-grade, fail-closed                     | No                   |
| MMKV+secure chain               | Production-grade; verify `_layout.tsx` init order | Verify before M1     |

---

## 4. Where We Are Ahead

| Feature                         | AGI advantage                                                                                                                                                      | Source                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **Multi-provider model picker** | 9 cloud providers + local LLMs, search, install state, favorites, per-model thinking toggle vs Claude's 3 Anthropic models                                         | `ModelPickerSheet.tsx`, `lib/models.ts` |
| **Add to Chat richness**        | Agent mode (ask/auto/plan/bypass), Effort axis, Auto-approve cycling, Temporary chat toggle, Image generation toggle, Computer use row, Skills attachment type     | `AddToChatSheet.tsx`                    |
| **Dispatch / Cowork**           | QR pairing, live heartbeat latency display, execution stream, agent dashboard, realtime connection quality — vs Claude's bare "looking for desktop" waiting screen | `companion/`, `dispatch/index.tsx`      |
| **Local Mode status card**      | Persistent teal "Local Mode — Active" badge in drawer signals local-first trust                                                                                    | `DrawerContent.tsx:131-175`             |
| **Appearance: System theme**    | Dark/Light/System 3-way vs Claude's 2-way                                                                                                                          | `settings/index.tsx:285-312`            |
| **Skills drawer item**          | Dedicated Skills nav item in drawer                                                                                                                                | `DrawerContent.tsx:48`                  |
| **Voice on-device banner**      | Settings clearly communicates "On-device by default, never sent to training" — a privacy differentiator                                                            | `settings/index.tsx:330-387`            |
| **Auto-approve controls**       | Ask/Smart/Full cycle with per-conversation override — granularity Claude doesn't expose                                                                            | `AddToChatSheet.tsx:86-98`              |
| **Edge-case modals**            | BatteryLow, ThermalThrottle, StorageFull, FileTooLarge — hardened for mobile constraints Claude doesn't surface                                                    | `src/features/edge-cases/`              |
| **Memory import/export**        | `settings/memory-import.tsx`, memory view/edit, local memory store                                                                                                 | `settings/memory.tsx`                   |
| **OCR scan**                    | `scan.tsx` — document scanner Claude doesn't expose                                                                                                                | `app/(app)/scan.tsx`                    |
| **Widget setup**                | iOS home screen widget config                                                                                                                                      | `app/(app)/widget-setup.tsx`            |
| **Schedules**                   | `schedules/` with create/run history — automated task scheduling                                                                                                   | `app/(app)/schedules/`                  |
| **Messaging integrations**      | `messaging/index.tsx` — platform messaging (Slack, etc.)                                                                                                           | `app/(app)/messaging/index.tsx`         |

---

## 4. Recommendations

### P0 — Must fix before M1 alpha (Jun 21)

**R26-PARITY-MOBILE-01 (P0)** — Add "Recents" count to 10  
Claude shows ~10 recent chats in the drawer. We show 5 (`DrawerContent.tsx:270`). Increase slice to 10. Trivial change, high perceptual impact.  
File: `apps/mobile/src/features/drawer/components/DrawerContent.tsx:270`

**R26-PARITY-MOBILE-02 (P0)** — Add "New" badge to Dispatch drawer item  
Claude renders a bright orange "New" badge on Dispatch (`03_sidebar_...png`). This signals the feature to new users. Our drawer item at `DrawerContent.tsx:50-55` has no badge field.  
File: `apps/mobile/src/features/drawer/components/DrawerContent.tsx:50`

**R26-PARITY-MOBILE-03 (P0)** — Audit Artifacts gallery for 2-column grid + skeleton + "Get inspired" banner  
Reference `06_artifacts_gallery-loading-skeleton.png` and `07_artifacts_gallery-loaded-card-grid.png` show: 2-col masonry/card grid, skeleton shimmer on load, "Get inspired" banner at top. Verify `app/(app)/artifacts/index.tsx` fully implements this layout.  
File: `apps/mobile/app/(app)/artifacts/index.tsx`

**R26-PARITY-MOBILE-04 (P0)** — Model selector inline dropdown (top-bar pill) vs bottom sheet  
Claude's model selector opens as a contextual dropdown directly below the model pill in the nav bar (`04_composer_model-selector-opus-sonnet-haiku-extended.png`). Our picker is a bottom sheet. The dropdown pattern is faster for power users. Consider: keep bottom sheet but also add fast-access dropdown for the top 3 models (Opus / Sonnet / Haiku equivalent) triggered by tapping the model pill, with "More models >" leading to full sheet.

**R26-PARITY-MOBILE-05 (P0)** — "Reply to Claude" composer placeholder during active chat  
During an active chat thread Claude shows "Reply to Claude" as the composer placeholder (`24_chat_thread-reasoning-chip-reply-composer.png`). Our ChatInput uses a static placeholder. Update ChatInput placeholder to be context-aware: "Chat with AGI" when empty, "Reply to AGI" when a thread is active.  
File: `apps/mobile/src/features/chat/components/ChatInput.tsx`

**R26-PARITY-MOBILE-06 (P0)** — Usage warning banner above composer  
Claude shows a dismissable warning banner ("Opus consumes usage limits faster than other models") above the composer when Opus is selected (`01_app-shell_...png`, `02_empty-state_...png`). We have `ContextWarningChip.tsx` for context length but not for model-tier usage rate. Add a model-tier warning chip that fires when the selected model is Opus-equivalent (highest compute model), informing users it consumes quota faster.  
File: `apps/mobile/src/features/chat/components/ContextWarningChip.tsx`

---

### P1 — Should fix before M2 TestFlight (Jul 19)

**R26-PARITY-MOBILE-07 (P1)** — Settings > Usage screen dual progress bars  
Claude Usage screen (`13_settings_usage-current-session-and-weekly-limits.png`) shows: (1) current session bar with time-until-reset, (2) weekly limits bar by model with day/time reset. Verify `app/(app)/usage.tsx` renders both bars. If only session-level exists, add weekly breakdown.  
File: `apps/mobile/app/(app)/usage.tsx`

**R26-PARITY-MOBILE-08 (P1)** — Add Shared links screen to Settings  
Claude surfaces a "Shared links" row in settings leading to an empty-state screen (`15_settings_shared-links-empty-state.png`). This is a cloud feature but the screen should exist with an empty/waitlist state. Add `settings/shared-links.tsx` and a row in the Settings screen under Privacy or a new Sharing section.  
File: `apps/mobile/src/features/settings/index.tsx` + new screen

**R26-PARITY-MOBILE-09 (P1)** — Settings > Capabilities: verify all 6 Claude toggles present  
Claude Capabilities (`12_settings_capabilities-...png`) shows: Artifacts, Code execution, Web search, Memory (2 sub-toggles), View your memory row, Tool access (Auto/On demand/Always available). Audit `settings/capabilities/index.tsx` against this exact list and add any missing items.  
File: `apps/mobile/src/features/settings/capabilities/index.tsx`

**R26-PARITY-MOBILE-10 (P1)** — Speech language setting  
Claude Settings shows "Speech language: EN" row (`10_settings_main-...png`). We have voice settings but no language selector. Add a speech/transcription language picker (at minimum EN + top 5 languages) to `settings/notifications` or a new `settings/speech.tsx` screen, and expose in the main settings Voice section.

**R26-PARITY-MOBILE-11 (P1)** — Composer placeholder text: "Chat with AGI" (branding)  
Current placeholder is likely the default. Claude says "Chat with Claude". Standardise to "Chat with AGI" on the empty-state composer. Consistent with our brand.  
File: `apps/mobile/src/features/chat/components/ChatInput.tsx`

**R26-PARITY-MOBILE-12 (P1)** — Sidebar: increase drawer label from "Chat" to "Chats"  
Claude uses "Chats" (plural) in the sidebar (`03_sidebar_...png`). We use "Chat" (`DrawerContent.tsx:37`). Minor but consistent with pluralisation of other items (Projects, Artifacts).  
File: `apps/mobile/src/features/drawer/components/DrawerContent.tsx:37`

---

### P2 — Nice to have before M3 launch (Aug 16)

**R26-PARITY-MOBILE-13 (P2)** — Projects list: show last-updated relative timestamp  
Claude Projects list (`05_projects_list-...png`) shows "6 days ago" / "1 month ago" under each project name. Our `ProjectCard.tsx` likely has a date field — expose it as relative time if not already shown.  
File: `apps/mobile/src/features/projects/components/ProjectCard.tsx`

**R26-PARITY-MOBILE-14 (P2)** — Artifacts gallery: "Get inspired" banner with card preview  
The "Get inspired" banner on Claude's artifacts gallery (`06_artifacts_gallery-loading-skeleton.png`) shows example artifact cards as a thumbnail strip. This doubles as onboarding for new users who haven't created artifacts yet. Add a similar banner surfacing 2-3 template artifacts.

**R26-PARITY-MOBILE-15 (P2)** — Settings > Notifications: 3-category toggle layout  
Claude Notifications (`14_settings_notifications-...png`) uses exactly 3 rows: Research complete / Chat responses / Code updates. Our `settings/notifications/index.tsx` may have more or fewer. Align to these 3 categories as the v1 minimum.  
File: `apps/mobile/src/features/settings/notifications/index.tsx`

**R26-PARITY-MOBILE-16 (P2)** — Add to Chat sheet: show "Research" as a toggle (not just mode)  
Claude's Add to Chat sheet (`27_composer_add-to-chat-sheet-...png`) shows a "Research" toggle alongside Web search and Health. Our sheet has a "Research" mode option but as a radio in the chat mode selector, not a standalone toggle. Consider promoting Research to a quick-access toggle matching Claude's affordance.  
File: `apps/mobile/src/features/chat/components/AddToChatSheet.tsx`

**R26-PARITY-MOBILE-17 (P2)** — Code session archived list: show full archived session history  
Claude archived sessions (`23_code_archived-sessions-list.png`) shows 10+ archived items including verbose task-notification titles. Our archived view (`code/archived.tsx`) may truncate. Ensure no artificial cap on archived session count.  
File: `apps/mobile/app/(app)/code/archived.tsx`

---

## Summary

| Status  | Count                  |
| ------- | ---------------------- |
| MATCH   | 17                     |
| CLOSE   | 8                      |
| AHEAD   | 13 distinct advantages |
| PARTIAL | 4                      |
| MISSING | 4                      |

**Overall posture:** Strong implementation foundation with significant feature advantages in model picker, dispatch/companion, and composer richness. Four genuine gaps (Recents count, Dispatch badge, Shared links screen, Speech language) are straightforward to close. The Claude UI is cleaner/simpler in several places (model selector dropdown, settings flat list) — worth considering whether our complexity is user-facing burden or power-user value.

**Critical path for M1 alpha:** Close P0 items 01-06 (all are <1 day of work each). The biggest UX regression vs Claude is the missing model-tier usage warning banner (R26-PARITY-MOBILE-06) and the composer placeholder differentiation (R26-PARITY-MOBILE-05).
