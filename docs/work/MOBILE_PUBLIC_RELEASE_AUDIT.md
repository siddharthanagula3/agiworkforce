# AGI Workforce Mobile Public Release Audit

Status: Current, unresolved register for the mobile surface
Owner: Mobile lead
Last updated: 2026-09-14
Scope: `apps/mobile` (Expo SDK 57, React Native 0.86.2, Expo Router 57) on iOS
and Android, measured against the current ChatGPT and Claude mobile apps.

This is the one canonical mobile release audit. It lives in `docs/work/`
because that is the row `AGENTS.md` §11 assigns to release readiness, and
because `scripts/check-repo-organization.mjs` refuses unregistered root files
and records why earlier root-level audit artifacts were deleted. Rows that
become code-cited defects move to `docs/agent-context/known-flaws.md`; product
scope moves to `audit/capability-gaps.csv`. A finding closed here is deleted,
not archived; git carries the history.

## How this audit was produced, and what it cannot claim

- Audit date 2026-09-14, branch `claude/agi-workforce-mobile-audit-m7999y`,
  head at `83e0283a`.
- Evidence: full code read of `apps/mobile` (about 74,000 lines under `src/`,
  plus `app/`, `services/`, `stores/`, `lib/`, `native/`), the release scripts
  under `apps/mobile/scripts/release`, the store listing files, and the
  monorepo contracts they depend on. Six parallel code audits (startup and
  navigation, chat, voice, models and local AI and billing, settings and
  design, store readiness and security) and two dated research passes
  (competitor mobile behaviour, current HealthKit and Expo documentation).
- Executed: the mobile Jest suite (376 suites, 3,471 tests, all pass on
  this checkout), `tsc --noEmit` for both mobile tsconfigs (clean), the node
  release scripts (21 pass), `pnpm check:expo-deps` (fails, 36 outdated
  packages), `pnpm check:tls-pins` (passes, pinning inert by design),
  `pnpm release:verify-privacy-declarations` and
  `pnpm release:verify-store-listings` (both pass).
- **No iPhone, iPad, Android device, simulator or emulator was available.**
  Every rendering, gesture, keyboard, audio-route, permission-prompt,
  background and performance claim below is code-read unless the row says
  `OBSERVED` or cites a CI run. The only runtime verification the repository
  performs is the Detox smoke in `.github/workflows/ci.yml` (`mobile-e2e`),
  which launches a release simulator build and asserts that first-run
  onboarding renders. It passed on the latest `main` run (2026-09-14,
  job "Mobile E2E (iOS simulator)"). `release-mobile.yml` has never run.
- Competitor claims carry a source and date, and `UNVERIFIED` where none was
  found. Apple HealthKit claims come from developer.apple.com pages fetched
  on 2026-09-14.

## Executive summary

**Release recommendation: NOT READY.**

| Severity | Open |
| -------- | ---: |
| P0       |    2 |
| P1       |   14 |
| P2       |   32 |
| P3       |   27 |
| P4       |   11 |

**Top launch blockers**

1. A Local-mode conversation whose persisted model id no longer resolves
   falls through to the managed-cloud stream with no consent and no label
   (MOBILE-001), and the mobile trust-boundary test that should catch it
   tests functions it declares itself (MOBILE-010).
2. Local Mode chats are silently cut to their last 100 messages and 200
   conversations on every persist, with no server copy to recover from
   (MOBILE-002).
3. Live voice streams raw microphone audio off-device behind an onboarding
   sheet that says nothing is recorded or sent (MOBILE-003), keeps the
   microphone and peer connection open when backgrounded (MOBILE-004), has no
   audio-session configuration at all (MOBILE-005), and appears in neither
   store's privacy declaration as audio data (MOBILE-006).
4. Android can delete a conversation from the chat screen with no
   confirmation (MOBILE-008), and Android action menus built on `Alert.alert`
   drop every button after the third, so Delete and Cancel are unreachable
   on Cloud chats (MOBILE-009).
5. The biometric App Lock has no escape hatch; a user whose biometrics change
   can only reinstall, which deletes all local conversations (MOBILE-007).
6. Two settings surfaces persist a state the app cannot honour: the
   permission "Access level" radio (MOBILE-011) and the Performance thermal
   and battery pause toggles (MOBILE-013). The language picker offers 12
   languages and localises six strings (MOBILE-015).
7. No store screenshots exist in the repository (MOBILE-016), 36 Expo
   packages are behind the SDK 57 expected versions (MOBILE-048), and the
   release workflow has never been exercised.

**Strongest areas**

- Secrets and storage: Clerk tokens in the platform keychain, MMKV encrypted
  with a CSPRNG key in SecureStore, no BYOK keys on device, https-only
  allowlisted outbound links, WebViews with empty origin allowlists for
  untrusted content, SHA-256 verified GGUF downloads with resumable
  transfers.
- Settings information architecture: grouped native lists, native switches,
  a shared screen shell with a consistent back control, contextual
  permission requests with correct "Open Settings" routing, in-app account
  deletion, disciplined reviewer notes.
- Composer and streaming correctness: SSE with stall watchdog and
  sequence de-duplication, drafts persisted per conversation, offline queue
  with honest composer state, FlashList v2 with bottom anchoring, swipe-up
  reading does not get yanked back to the bottom.
- Accessibility labelling: 93% of interactive elements carry a label, no
  `allowFontScaling={false}`, reduce-motion honoured in 12 files, one icon
  library across 181 files, zero hover or web-only props anywhere.
- Store configuration hygiene: production-only entitlements, target API 36
  with a dated rationale, privacy manifest and Play data-safety file kept in
  agreement by a script, HealthKit absence guarded by a test.

**Weakest areas**

- Trust-boundary enforcement on mobile is asserted in prose and not proven
  by an executable guard.
- Live voice lifecycle and audio-session ownership.
- Controls that persist a preference nothing reads (permissions, performance,
  voice input, auto-listen, language).
- Local AI install lifecycle outside onboarding: no cancel, generic errors,
  stale "Ready" after deletion, no free-space check, ExecuTorch and AICore
  paths bypass the Wi-Fi and checksum policy that GGUF has.
- Navigation architecture: every `(app)` route is a drawer screen, so there
  is no native stack, no iOS swipe-back and no native header anywhere in the
  signed-in app; a vestigial hidden `Tabs` layer sits inside the drawer.
- Android-specific correctness: `Alert.alert` used as a menu, root-level
  hardware Back veto, uncapped storage permission, opaque notification icon.

## Phase 1: mobile codebase map

| Item                     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK                 | `expo ~57.0.12` (expected `~57.0.22` per `check:expo-deps`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| React Native / React     | 0.86.2 / 19.2.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Expo Router              | `~57.0.12`, typed routes on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| New Architecture, Hermes | SDK 57 defaults (on). Nothing in `app.config.js`, `package.json`, `metro.config.js` or `babel.config.js` pins `newArchEnabled` or `jsEngine`; `react-native-nitro-modules` and `@kingstinct`-style Nitro deps require New Architecture, so a silent flip would fail loudly, but the state is inferred, not asserted                                                                                                                                                                                                                                                                                                                     |
| Development build        | `expo-dev-client`, EAS `development` profile (simulator, Debug); `scripts/ios-device-dev.sh` for a physical device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| EAS                      | `eas.json`: `appVersionSource: remote`, `autoIncrement` on preview/beta/production, `requireCommit: true`, node 24.18.0, pnpm 9.15.3, m-medium iOS, medium Android, submit profiles for ASC and Play internal track                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Config plugins           | expo-asset, expo-iap, expo-font, expo-splash-screen (light and dark lockups), expo-background-task, expo-image, expo-router, expo-secure-store, expo-build-properties (minSdk 26, compile/target 36), @clerk/expo, expo-speech-recognition, expo-localization, expo-calendar, expo-camera, expo-image-picker, expo-sqlite (SQLCipher), expo-updates, expo-web-browser, expo-local-authentication, expo-document-picker, expo-sharing, llama.rn, plus eight local plugins under `native/` and the inert TLS pinning plugin. `expo-apple-authentication` and `expo-notifications` are added only when production entitlements are enabled |
| Local native modules     | iOS: Foundation Models, Share Inbox, Translate, Vision OCR, App Intents (Ask, Analyze Image, Scan, Set Reminder, Start Chat, Summarize, Transcribe, Translate), Share Extension. Android: AICore (ML Kit GenAI), Translate, Vision OCR, share-intent rewrite. All wired by config plugins; the iOS project is gitignored and generated                                                                                                                                                                                                                                                                                                  |
| Native dependencies      | llama.rn 0.10, react-native-executorch 0.8.4, react-native-webrtc 124, react-native-mmkv 3, react-native-nitro-modules, reanimated 4.5, gesture-handler 2.32, screens 4.26, safe-area-context 5.7, @shopify/flash-list 2.0.2, @gorhom/bottom-sheet 5.2, react-native-webview 13.16, @expo/dom-webview, expo-iap 5.3                                                                                                                                                                                                                                                                                                                     |
| Storage                  | MMKV (encrypted; key in SecureStore `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) for stores and drafts; expo-sqlite with SQLCipher; SecureStore for the Clerk token cache; expo-file-system `Documents/models/` for local model files                                                                                                                                                                                                                                                                                                                                                                                                              |
| Authentication           | Clerk (`@clerk/expo`), native auth options, age gate raised only on the way to Cloud sign-in, Local Mode usable with no account (locked rule in `app/_layout.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Networking               | `services/api.ts` (`guardedFetch`, 401 refresh-then-sign-out with an escape), `services/streaming.ts` (SSE over `expo/fetch`, stall watchdog, sequence de-dup), NetInfo for connectivity                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Voice                    | Dictation and companion: `expo-speech-recognition` on-device. Live voice: `react-native-webrtc` to `/api/voice/live/sessions`. TTS: `expo-speech`. No audio-session code                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Notifications            | `expo-notifications`, token lifecycle scoped to the Clerk account, four Android channels, allow-listed tap destinations, background fetch via `expo-background-task`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Files                    | expo-image-picker (PHPicker on iOS, `selectionLimit: 5`), expo-camera, expo-document-picker, validation in `attachmentValidation.ts`, staged handoff through `composerHandoff.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Local models             | Four tiers: Apple Foundation Models, Android AICore, ExecuTorch, llama.rn GGUF; `installStore.ts` and `services/modelDownload.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| HealthKit                | **Not implemented.** No dependency, entitlement, purpose string or disclosure; guarded by `__tests__/ios-store-submission-config.test.ts`. See the HealthKit section                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Works in Expo Go         | Nothing that touches llama.rn, ExecuTorch, WebRTC, MMKV, the share extension, App Intents, AICore or Foundation Models. The app is a development-build product; Expo Go is not a supported target and this audit does not treat it as one                                                                                                                                                                                                                                                                                                                                                                                               |

Routes: 87 files under `app/`, three groups. `(auth)` is a native `Stack`.
`(public)` is a bare `Slot`. `(app)` is `expo-router/drawer` with every
screen registered as a hidden `Drawer.Screen`; `(app)/(tabs)` is a `Tabs`
navigator with the tab bar removed. `legal/` is the only `Stack` with a
native header in the signed-in app.

Modal and sheet inventory: 13 files on `@gorhom/bottom-sheet` (model picker,
add-to-chat, voice onboarding, voice picker, paywall, and others) and 22
hand-rolled `<Modal>` files, eight of which (the `edge-cases` modals) are
never mounted.

## Mobile product matrix

Sources are dated; `UNVERIFIED` means no primary source was found on
2026-09-14 and the cell must not be treated as fact. Classification: COMMON
(both leaders), 2+ (at least two of the referenced apps), SPECIFIC (one
product), N/R (not relevant to AGI Workforce).

| Capability                           | ChatGPT iOS                                                                                                                       | Claude iOS                                                                                                       | ChatGPT Android | Claude Android                                                    | AGI Workforce iOS                                                                                        | AGI Workforce Android             | Gap                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| Dictation (mic to text)              | Yes, free plan (help.openai.com voice FAQ, 2026-09-14)                                                                            | Yes; mic icon, arrow to send, X to cancel (support.claude.com 10065434, dated 2026-07-23)                        | Presumed same   | Same article                                                      | Yes, on-device, tap / hold / long-press                                                                  | Yes                               | COMMON. Errors after start are silent (MOBILE-025); locale never checked (MOBILE-026)  |
| Live voice with barge-in             | Full-duplex GPT-Live, interruption (9to5mac 2026-07-08; help.openai.com voice FAQ)                                                | Hands-free plus push-to-talk; "start speaking again, Claude will stop" (support.claude.com 11101966, 2026-09-14) | UNVERIFIED      | Same article                                                      | Yes, cloud WebRTC, server-signalled barge-in, mute, text fallback                                        | Yes                               | COMMON. Disclosure, lifecycle and audio session defects (MOBILE-003..006)              |
| Voice transcript saved to chat       | UNVERIFIED                                                                                                                        | Yes (11101966)                                                                                                   | UNVERIFIED      | Yes                                                               | Yes (`appendVoiceTurn`)                                                                                  | Yes                               | 2+. Onboarding copy denies it (MOBILE-003)                                             |
| Camera / photo input from voice mode | Yes, paid tiers (secondary sources 2026)                                                                                          | UNVERIFIED                                                                                                       | UNVERIFIED      | UNVERIFIED                                                        | Inline voice bar has an attach control; live voice has none                                              | Same                              | SPECIFIC. Not required                                                                 |
| Background / lock-screen voice       | UNVERIFIED                                                                                                                        | UNVERIFIED                                                                                                       | UNVERIFIED      | UNVERIFIED                                                        | Not built (MS-13); on-device modes stop cleanly, live voice does not (MOBILE-004)                        | Same                              | Fix the teardown, do not add the capability                                            |
| Attachments: camera, photos, files   | Yes; 512 MB per file, 80 files per 3 h (help.openai.com 8555545)                                                                  | Yes; limits UNVERIFIED                                                                                           | Same limits     | UNVERIFIED                                                        | Yes; 5 per pick, validated types and sizes                                                               | Yes                               | COMMON. No upload progress or retry (MOBILE-020)                                       |
| Share-to-app                         | UNVERIFIED                                                                                                                        | Share menu via App Intent (support.claude.com 10263469, 2026-07-09)                                              | UNVERIFIED      | UNVERIFIED                                                        | iOS share extension, `intent/share`                                                                      | SEND, SEND_MULTIPLE, PROCESS_TEXT | 2+. iOS share dropped when signed out (MOBILE-024)                                     |
| Share conversation / response        | Yes, may include files (help.openai.com 7925741)                                                                                  | Yes, snapshot, files excluded (support.claude.com 10593882)                                                      | Presumed        | Same                                                              | Shared links settings, export, share sheet on messages                                                   | Same                              | COMMON                                                                                 |
| Long-press message actions           | Copy, "Branch in new chat" (secondary 2026)                                                                                       | UNVERIFIED                                                                                                       | Same            | UNVERIFIED                                                        | Copy, retry, export, delete via ActionSheet / Alert                                                      | Alert truncated (MOBILE-009)      | COMMON. Android menus broken                                                           |
| Model selection                      | Paid only; picker with effort slider (secondary, 2026-08-06)                                                                      | Per-mode model choice (MacRumors 2026-07-24)                                                                     | Presumed        | UNVERIFIED                                                        | Sheet grouped by On-device then provider, favourites, recents, search, effort                            | Same                              | Grouping reads as provider catalog (MOBILE-071); Compare uses wrong scope (MOBILE-012) |
| Connectors / MCP                     | UNVERIFIED on mobile                                                                                                              | Remote MCP usable, configured on web only (support.claude.com 11176164)                                          | UNVERIFIED      | Same                                                              | Directory, OAuth via in-app browser, disconnect confirm                                                  | Same                              | SPECIFIC. OAuth uses the wrong browser API (MOBILE-036)                                |
| Agentic work in the app              | Work mode (pricing page)                                                                                                          | Cowork in sidebar, background in cloud, permission alerts (MacRumors 2026-07-07)                                 | UNVERIFIED      | Same                                                              | AGI Work toggle, Tasks screen, approvals, background fetch                                               | Same                              | COMMON                                                                                 |
| Memory                               | UNVERIFIED mobile UI                                                                                                              | On by default across surfaces (2026, weak citation)                                                              | UNVERIFIED      | Same                                                              | Memory, import, summary screens                                                                          | Same                              | 2+                                                                                     |
| Projects                             | Yes                                                                                                                               | Yes                                                                                                              | Yes             | Yes                                                               | Yes, tab plus detail                                                                                     | Yes                               | COMMON. Light-theme chips unreadable (MOBILE-041)                                      |
| Widget / App Intents / Siri          | UNVERIFIED                                                                                                                        | Widget, Control Center action, "Ask Claude" intent (10263469)                                                    | UNVERIFIED      | Widget with chat, camera, dictation (support.claude.com 10534883) | Eight App Intents, widget setup screen                                                                   | Widget setup screen               | SPECIFIC. Transcribe intent discards its file (MOBILE-030)                             |
| Purchase and restore                 | In-app purchase, "Restore purchases" in Settings (help.openai.com 8346573)                                                        | Apple / Google billing, cancel on the originating store (support.claude.com 8325617)                             | Play billing    | Play billing                                                      | StoreKit code shipped and switched off; "Upgrade plan" leads to a dead end (MOBILE-037)                  | Same                              | COMMON. Not purchasable in 1.2.0 by decision (MS-5)                                    |
| iPad support                         | Yes (App Store listing, 2026-09-14)                                                                                               | Yes (App Store listing)                                                                                          | n/a             | n/a                                                               | `supportsTablet: true`, persistent drawer at 1000pt+, all iPad orientations written by the config plugin | n/a                               | COMMON                                                                                 |
| Health data                          | ChatGPT Health, web and iOS, US 18+; App Privacy declares Health & Fitness (openai.com 2026-01-07, MacRumors 2026-07-23, listing) | None; App Privacy declares no Health & Fitness (listing 2026-09-14)                                              | UNVERIFIED      | None                                                              | None (removed July 2026, approved build MS-1)                                                            | N/A                               | SPECIFIC. See HealthKit section                                                        |
| New-chat screen content              | UNVERIFIED                                                                                                                        | UNVERIFIED                                                                                                       | UNVERIFIED      | UNVERIFIED                                                        | Minimal: context line plus composer, by decision                                                         | Same                              | Intentional; not a defect                                                              |
| Notifications                        | UNVERIFIED                                                                                                                        | UNVERIFIED                                                                                                       | UNVERIFIED      | UNVERIFIED                                                        | Push on sign-in with no primer (MOBILE-021)                                                              | Same                              | Fix timing                                                                             |

Interaction conventions worth learning (dated in the research notes): one
disclosure per voice mode, transcripts saved and said so, a stop control
that stays in the lower right of the chat, push-to-talk as a fallback in
noisy rooms, connector configuration kept on web with mobile consuming it,
long-running work surfaced as a sidebar entry with permission alerts, an
explicit "Restore purchases" row, share snapshots that state whether files
are included.

## Route matrix

Back column: "shell" is `SettingsScreenShell` (labelled back arrow with a
`backHref` fallback); "arrow+fb" is a hand-rolled arrow with a
`canGoBack` fallback; "drawer" means only the hamburger. No `(app)` route
has iOS swipe-back or a native header (MOBILE-050). Verified: R = code read,
T = Jest, CI = Detox smoke on the simulator.

| Route                               | iOS | Android | Entry                          | Back/Close                 | Loading | Empty   | Error   | Offline           | Accessible                 | Runtime verified |
| ----------------------------------- | --- | ------- | ------------------------------ | -------------------------- | ------- | ------- | ------- | ----------------- | -------------------------- | ---------------- |
| `(public)/onboarding`               | ✓   | ✓       | first run                      | n/a by design              | ✓       | n/a     | ✓       | ✗                 | ✓                          | CI (hero only)   |
| `(public)/age-gate`                 | ✓   | ✓       | onboarding, Cloud sign-in      | only with `returnTo` (051) | n/a     | n/a     | ✓       | ✓                 | ✓                          | T                |
| `(auth)/login`, `reset-password`    | ✓   | ✓       | Cloud toggle, universal link   | native Stack, dismissible  | ✓       | n/a     | ✓       | ✗                 | ✓                          | T                |
| root lock screen                    | ✓   | ✓       | App Lock on                    | **none** (007)             | n/a     | n/a     | ✗       | n/a               | ✓                          | T (stays locked) |
| `(tabs)/chat` (new chat)            | ✓   | ✓       | drawer, intents, notifications | drawer                     | ✓       | minimal | ✓       | composer queue    | ✓                          | R,T              |
| `chat/[id]`                         | ✓   | ✓       | list, notification, deep link  | **drawer only** (050)      | ✓       | ✓       | ✓       | banner + queue    | targets < 44pt (054)       | R,T              |
| `chats/index`                       | ✓   | ✓       | drawer                         | drawer                     | ✗ (019) | ✓ false | ✗ (019) | ✗                 | ✓                          | R,T              |
| `(tabs)/projects`, `projects/[id]`  | ✓   | ✓       | drawer                         | drawer / arrow             | ✗ / ✓   | ✓ / ✗   | ✗ / ✓   | ✗                 | chips 1.04:1 light (041)   | R                |
| `library`, `artifacts`              | ✓   | ✓       | drawer, artifact card          | drawer                     | ✓       | ✓       | ✓ / ✗   | ✗                 | ✓                          | R                |
| `skills`, `reports`, `tasks`        | ✓   | ✓       | drawer                         | arrow+fb                   | ✓       | ✓       | ✓       | ✗                 | 36pt target on tasks       | R                |
| `schedules/index`, `create`         | ✓   | ✓       | drawer, notification           | arrow+fb                   | ✓       | ✓       | ✓       | ✗                 | 1 unlabelled, 34pt         | R                |
| `companion/*`                       | ✓   | ✓       | drawer, pair link              | arrow                      | ✓       | ✗       | ✓       | connection banner | ✓                          | R,T              |
| `connectors/*`                      | ✓   | ✓       | settings, drawer               | shell                      | ✓       | ✓       | ✓       | ✗                 | 32/34pt targets            | R,T              |
| `notifications/index`, `profile`    | ✓   | ✓       | drawer                         | arrow+fb                   | n/a     | ✓       | n/a     | n/a               | ✓                          | R                |
| `settings/*` (32 screens)           | ✓   | ✓       | settings root                  | shell                      | mostly  | partial | mostly  | local ✓ / cloud ✗ | 24 radios as buttons       | R,T (snapshots)  |
| `settings/permissions/[permission]` | ✓   | ✓       | permissions                    | shell                      | ✗       | n/a     | ✓       | n/a               | **state is fiction** (011) | R,T              |
| `settings/app-language`             | ✓   | ✓       | general                        | shell                      | saving  | ✓       | ✗       | ✓                 | ✓ radio                    | R,T (picker)     |
| `settings/performance`              | ✓   | ✓       | settings                       | shell                      | ✓       | ✗       | ✓       | ✓                 | fixed 48pt                 | R (dead toggles) |
| `models`, `compare`                 | ✓   | ✓       | chat, drawer                   | arrow                      | ✓       | ✗       | ✓       | ✗                 | raw hex on compare         | R,T              |
| `voice` (companion)                 | ✓   | ✓       | long-press mic, intent         | arrow, 54pt                | ✓       | n/a     | silent  | ✗                 | ✓                          | R,T              |
| `camera`, `scan`, `translate`       | ✓   | ✓       | attach sheet, intents          | arrow+fb                   | ✓       | ✗       | ✓       | ✗                 | ✓                          | R,T              |
| `share-preview`, `reminder-review`  | ✓   | ✓       | share intents, App Intents     | back                       | ✗ / ✓   | n/a     | ✓       | ✗                 | 1 unlabelled               | R,T              |
| `widget-setup`, `feedback`, `about` | ✓   | ✓       | drawer, settings               | arrow                      | n/a     | n/a     | ✓       | ✗                 | 36/40pt targets            | R,T              |
| `legal/*`, `legal/licenses`         | ✓   | ✓       | about, drawer                  | native Stack header        | n/a     | n/a     | n/a     | n/a               | double top inset (083)     | R,T              |
| `error` (root)                      | ✓   | ✓       | boundary                       | **dead Go Back** (040)     | n/a     | n/a     | self    | n/a               | 30pt target                | R                |
| `(app)`, `(auth)`, `(public)` error | ✓   | ✓       | boundary                       | back with fallback         | n/a     | n/a     | self    | n/a               | ✓                          | R                |
| `+not-found`                        | ✓   | ✓       | bad link                       | Go Home                    | n/a     | n/a     | self    | n/a               | ✓                          | R                |

## Native capability matrix

| Capability          | iOS                                                                                                     | Android                                            | Permission                                                     | Background                                                | Offline                           | Status                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| Camera              | expo-camera, expo-image-picker                                                                          | same                                               | contextual; denial alert has no Settings button (057)          | n/a                                                       | works                             | Usable; denial dead end                                                        |
| Photos              | PHPicker, limited access needs no path                                                                  | image picker                                       | contextual                                                     | picker survives via staged handoff (unverified on device) | works                             | Usable                                                                         |
| Files               | expo-document-picker                                                                                    | same                                               | none                                                           | n/a                                                       | works                             | No upload progress / retry (020)                                               |
| Microphone          | expo-speech-recognition, WebRTC                                                                         | same; RECORD_AUDIO                                 | contextual on first tap; two conflicting purpose strings (061) | on-device modes stop; live voice does not (004)           | dictation works offline on-device | Audio session unmanaged (005)                                                  |
| Voice               | dictation, companion, live                                                                              | same                                               | mic + speech                                                   | see above                                                 | live voice needs network          | Disclosure wrong (003); settings unwired (027, 028)                            |
| Notifications       | expo-notifications, categories                                                                          | four channels; POST_NOTIFICATIONS merged           | requested automatically on Cloud sign-in (021)                 | background fetch task                                     | n/a                               | Denied state invisible; icon opaque on Android (045)                           |
| Share sheet         | out: expo-sharing, Share API; in: share extension + App Intents                                         | out: same; in: SEND / SEND_MULTIPLE / PROCESS_TEXT | none                                                           | cold start handled through `intent/share`                 | works                             | iOS inbound dropped when signed out (024)                                      |
| Deep links          | `agiworkforce://pair`, `intent/*`; universal `/pair`, `/auth/reset-password` in production entitlements | same via VIEW intent filters with autoVerify       | none                                                           | handled on resume                                         | n/a                               | No connector callback link (036); logged-out notification tap hits login (052) |
| Local inference     | Foundation Models, ExecuTorch, llama.rn                                                                 | AICore, ExecuTorch, llama.rn                       | none                                                           | no handling of download or generation in background       | fully offline                     | Lifecycle gaps (013, 014, 032..035, 073)                                       |
| Apple Health        | not implemented                                                                                         | N/A                                                | none                                                           | n/a                                                       | n/a                               | Approved build MS-1, external gate; see below                                  |
| Biometric lock      | expo-local-authentication                                                                               | same                                               | Face ID string present                                         | re-locks on background                                    | works                             | No escape hatch (007)                                                          |
| Calendar, Reminders | expo-calendar, contextual                                                                               | calendar only                                      | plugin strings                                                 | n/a                                                       | n/a                               | OK                                                                             |
| Contacts            | dependency linked, never called                                                                         | same                                               | no usage string                                                | n/a                                                       | n/a                               | Remove (046)                                                                   |

## Apple Health / HealthKit

**Architecture status: D, not implemented.** Verified on 2026-09-14: no
HealthKit framework use, no `react-native-health`,
`@kingstinct/react-native-healthkit` or similar dependency, no
`com.apple.developer.healthkit` entitlement, no `NSHealthShareUsageDescription`
or `NSHealthUpdateUsageDescription`, no Health & Fitness disclosure in the
privacy manifest or the listing labels, and no Android Health Connect
reference. `apps/mobile/__tests__/ios-store-submission-config.test.ts`
enforces that every submission surface declares health data only when the
app integrates HealthKit; it passes in both directions. The residual copy in
`store-listing/REVIEWER-NOTES-IOS.md`, `apps/web/app/mobile/legal/page.tsx`
and a comment in `settings/integrations.tsx` are all disclaimers that the
feature was removed, not promises that it exists.

The Apple Health connector was removed in July 2026 (STB-21) because its
backing `GET /api/health-context` service never existed. The commit named in
`docs/compliance/dpdp-audit-log.md` (`93ca123df`) is not present in this
clone, so the rationale is doc-sourced. The founder's 2026-08-01 decision
keeps an Apple Health vertical (MS-1) as an approved, externally gated build.

Under the rule that what already exists must be finished before anything is
added, this audit does **not** implement HealthKit. It records the design
constraints that any implementation must satisfy, from Apple documentation
fetched on 2026-09-14, so the build starts from the right shape.

### HealthKit matrix

Nothing is requested today. The rows below are the minimum a read-only
"answer questions about my activity, sleep and heart rate" feature would
justify, and are recorded so nobody requests the full catalogue by default.

| Health type                                                                                                                 | Read         | Write | Feature requiring it                              | Permission copy | Local processing                              | Sent to AI?          | Stored? | Verified |
| --------------------------------------------------------------------------------------------------------------------------- | ------------ | ----- | ------------------------------------------------- | --------------- | --------------------------------------------- | -------------------- | ------- | -------- |
| `stepCount`                                                                                                                 | proposed     | no    | "How active was I this week?"                     | none yet        | daily sums, averages                          | derived summary only | no      | n/a      |
| `distanceWalkingRunning`                                                                                                    | proposed     | no    | same                                              | none yet        | daily sums                                    | derived              | no      | n/a      |
| `activeEnergyBurned`                                                                                                        | proposed     | no    | same                                              | none yet        | daily sums                                    | derived              | no      | n/a      |
| `appleExerciseTime`, `appleStandTime`                                                                                       | proposed     | no    | same                                              | none yet        | daily sums                                    | derived              | no      | n/a      |
| `HKWorkoutType`                                                                                                             | proposed     | no    | "Summarize my workouts"                           | none yet        | list, totals                                  | derived              | no      | n/a      |
| `sleepAnalysis` (asleep values)                                                                                             | proposed     | no    | "How did I sleep?"                                | none yet        | nightly merge of overlaps, time-zone metadata | derived              | no      | n/a      |
| `heartRate`, `restingHeartRate`, `walkingHeartRateAverage`                                                                  | proposed     | no    | trend questions                                   | none yet        | daily averages                                | derived              | no      | n/a      |
| `heartRateVariabilitySDNN`, `respiratoryRate`, `oxygenSaturation`, `bodyTemperature`, `height`, `bodyMass`, `bodyMassIndex` | not proposed | no    | no feature                                        | none            | n/a                                           | n/a                  | no      | n/a      |
| Nutrition, clinical records                                                                                                 | no           | no    | no feature; clinical needs a separate entitlement | none            | n/a                                           | n/a                  | no      | n/a      |

### Constraints for the MS-1 build (Phase 5 of the plan)

- **Read denial is not observable.** Apple: "your app cannot determine whether
  or not a user has granted permission to read data. If you are not given
  permission, it simply appears as if there is no data of the requested type"
  (`HKHealthStore.authorizationStatus(for:)`, fetched 2026-09-14). The only
  positive read signal is the limited-history window. UI states must be
  "not requested", "authorization flow completed", "data available", "no
  data available", "manage in Apple Health". Never "you denied Sleep".
- **Read-only.** `NSHealthShareUsageDescription` only; no
  `NSHealthUpdateUsageDescription`, no write types, no background delivery
  until a passive-update feature exists.
- **Keep iPad.** Do not add `healthkit` to `UIRequiredDeviceCapabilities`;
  Apple states that key limits the app to iPhone.
- **Guideline 5.1.3 and 5.1.1(vi).** No third-party use, no iCloud storage
  of health data, disclose the specific types collected. Sending health
  summaries to a cloud model provider is the judgment call: it must be
  gated by execution mode, disclosed in the connection screen, excluded from
  Local Mode routing to cloud, kept out of logs and traces, and excluded
  from fallback providers.
- **Native shape.** `@kingstinct/react-native-healthkit` 15.1.0 (published
  2026-09-11, Nitro, ships an Expo config plugin, MIT) is the maintained
  option; `react-native-health` last released 2024-10; `expo-health` does not
  exist. A local Expo Module is the fallback. Entitlement and purpose string
  go through `withEntitlementsPlist` / `withInfoPlist` so prebuild keeps them.
- **Aggregate on device.** Steps averaged this week is arithmetic, not a
  model call. Use `HKStatisticsQuery` with cumulative sums and source
  separation; merge overlapping sleep samples; honour
  `HKMetadataKeyTimeZone`; use the user's calendar boundaries.
- **Disconnect semantics.** The app cannot revoke HealthKit authorization;
  "Disconnect" means stop querying, clear cached summaries, and point to
  Health app settings.
- **Android** does not load the module and shows no Health entry. Health
  Connect is a separate future parity item, not part of MS-1.
- **Physical iPhone validation** before the feature is called ready.

## Performance matrix

Nothing below was measured on a device in this audit. The repository has no
mobile performance instrumentation beyond the Performance settings screen's
benchmark and the mislabelled voice chip (MOBILE-059).

| Metric              | Value                                                                                                | Mark         |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| Cold start          | splash held until MMKV and fonts, then a second spinner until auth and biometric (049); 5 s watchdog | HYPOTHESIZED |
| Warm start          | tier refresh on every foreground, non-blocking                                                       | HYPOTHESIZED |
| Navigation          | drawer replace, no native stack transitions                                                          | HYPOTHESIZED |
| New chat            | immediate, no network                                                                                | HYPOTHESIZED |
| First-token latency | no client timestamps between send and first delta                                                    | not measured |
| Stream rendering    | per-token full-list map, double parse and code re-tokenise (017); user-visible cost unmeasured       | HYPOTHESIZED |
| Long-chat scrolling | FlashList v2, memoised rows; local persist capped at 100 messages (002)                              | HYPOTHESIZED |
| Model picker        | bottom sheet, no measurement                                                                         | HYPOTHESIZED |
| Voice startup       | permission on first tap; no timing                                                                   | not measured |
| Local model startup | no "loading" state exposed, no timing                                                                | not measured |
| Health query        | not implemented                                                                                      | n/a          |
| CI simulator smoke  | release build 25 min, onboarding assertion passes                                                    | OBSERVED     |

## Findings

Format: ID, severity, platform, area, route, component. Root cause is marked
Verified (read directly in source or executed) or Hypothesis (needs a device
or a build). Severities follow the scale in the brief and are not inflated.

### MOBILE-001 A Local-mode conversation with an unresolvable model id is streamed to managed cloud

Severity: P0 | Platform: Both | Area: Trust boundary | Route: chat | `stores/chat/chatExecutionStore.ts:914-930, 1430, 1652`
Evidence: `shouldUseLocalRuntime = executionMode === 'local' && isSelectableModelId(requestedModel)`. The guards after it refuse local-mode-with-cloud-model and cloud-mode-with-local-model, but local mode with a model that is in neither list passes every check, skips the cloud block, and reaches the `else` branch that calls `streamChat`. Retry, edit and offline replay reuse `message.model` without revalidation (`:2931`, `:3033`, `:3066`, `:3115`; `hooks/useNetworkStatus.ts:45`), and nothing sanitises `conversation.model` when the local catalog drops an id.
Reproduction: needs two catalog versions; the code path is exact.
Expected: fail closed with "this model is no longer available", as `resolveLocalModelRef` already does.
Actual: prompt and full history sent to AGI Cloud with no consent and no label change.
Root Cause: Verified (path); reachability Hypothesis.
Recommended Correction: one guard after `:914` returning an error when `executionMode === 'local' && !shouldUseLocalRuntime`, mirroring the two existing guards.
Shared Impact: the invariant is shared; the guard is mobile's.
Verification: a case in the rewritten trust-boundary suite (MOBILE-010) asserting `streamChat` is never reached.

### MOBILE-002 Local chats are permanently truncated to 100 messages and 200 conversations on every persist

Severity: P0 | Platform: Both | Area: Data loss | Route: all Local chats | `stores/chat/chatMessageStore.ts:1143-1156`
Evidence: `partialize` slices `messages[id]` to the last `MAX_MESSAGES_PER_CONVERSATION` (100) and `conversations` to `MAX_CONVERSATIONS` (200). Local Mode is device-only ("Local on this device", `ChatsListScreen.tsx:407`).
Reproduction: exceed 100 messages in Local Mode, kill and reopen.
Expected: full history, or an explicit user-visible policy.
Actual: older messages and the 201st conversation vanish silently.
Root Cause: Verified.
Recommended Correction: keep the hot slice bounded but page older messages into per-conversation MMKV keys (the store already shards via `getConversationMessageStore`), so the cap bounds writes without losing history.
Verification: persist 150 messages, rehydrate, assert 150. No test covers partialize today.

### MOBILE-003 Voice onboarding says nothing is recorded or sent, then starts a cloud WebRTC session

Severity: P1 | Platform: Both | Area: Privacy disclosure | Route: chat | `src/features/voice/components/VoiceOnboardingSheet.tsx:146`, `app/(app)/chat/[id].tsx:852-886`
Evidence: the only first-run sheet reads "Your voice is transcribed on this device to hear you. Nothing is recorded or stored." It gates both modes; `startVoiceMode` picks live voice whenever `liveVoiceModeUnavailableReason` is null, and live voice adds the mic track to a peer connection (`liveVoiceSession.ts:181,202`) and persists transcripts (`useLiveVoiceSession.ts:92-100`).
Expected: the disclosure describes the mode about to run.
Actual: a blanket on-device claim precedes an off-device stream.
Root Cause: Verified.
Recommended Correction: branch the disclosure row on the same predicate `startVoiceMode` uses.
Verification: extend `__tests__/voice-onboarding.test.tsx` for both predicate states. **Fixed in this branch**; see the change log at the end.

### MOBILE-004 Live voice keeps the microphone and peer connection open when backgrounded

Severity: P1 | Platform: Both | Area: Lifecycle | Route: chat (LiveVoiceComposer) | `src/features/voice/hooks/useLiveVoiceSession.ts:103-193`
Evidence: no `AppState` listener in the hook; teardown is bound only to `active` and unmount. No `UIBackgroundModes`, no foreground service (MS-13 unbuilt). `settings/voice/index.tsx:338-341` promises the opposite. The on-device path already stops on background (`useVoiceConversation.ts:256-267`).
Expected: close the session on any non-active state and tell the user.
Actual: mic track and peer stay open; billing continues; UI shows "Listening" over a dead session on return.
Root Cause: Verified (gap); OS outcome Hypothesis.
Recommended Correction: an `AppState` listener in the same effect calling the existing close and finish path. No new native capability.
Verification: unit test driving `AppState` with a fake session; device check of the iOS mic indicator. **Fixed in this branch.**

### MOBILE-005 No audio session category, mode, route or interruption handling exists

Severity: P1 | Platform: iOS, Android secondary | Area: Audio session | Route: all voice | absence across `apps/mobile`
Evidence: zero occurrences of `AVAudioSession`, `setCategory`, `RTCAudioSession`, `InCallManager`, expo-audio mode APIs. TTS is spoken right after a recognition session ends with whatever configuration the recognizer left.
Expected: speaker output by default in hands-free modes, an explicit category, route-change and interruption observers.
Actual: route is whatever the last library set; WebRTC's `playAndRecord` defaults to the earpiece on iOS (Hypothesis, device needed); incoming calls unhandled.
Root Cause: Verified (absence).
Recommended Correction: one small module that owns the session, invoked from `LiveVoiceSession.start/dispose` and the companion enable/disable effect.
Verification: device tests of companion playback, live voice, AirPods connect and disconnect, incoming call.

### MOBILE-006 Audio data is collected off-device and declared nowhere

Severity: P1 | Platform: Both | Area: Store disclosure | `app.config.js` privacy manifest, `store-listing/ios/PrivacyInfo.xcprivacy`, `store-listing/android/data-safety.json`, both reviewer notes
Evidence: live voice streams microphone audio to the server; `NSPrivacyCollectedDataTypes` lists Email, Name, OtherUserContent, PhotosorVideos, UserID, DeviceID; the Play data-safety file lists the same seven; the iOS listing advertises "On-device voice transcription". `verify-privacy-declarations.mjs` only checks the two files agree with each other, so a type missing from both is invisible to it.
Expected: `NSPrivacyCollectedDataTypeAudioData` and the Play "Voice or sound recordings" type, and a live-voice row in the reviewer notes.
Actual: neither declares audio.
Root Cause: Verified.
Recommended Correction: add the audio entry to all three files and a live-voice row to the reviewer notes; extend the verifier to require an audio declaration when `getUserMedia({ audio` exists in source.
Verification: `pnpm release:verify-privacy-declarations`, `ios-store-submission-config.test.ts`. **Declarations fixed in this branch**; the verifier extension is open.

### MOBILE-007 The biometric lock screen has no escape hatch

Severity: P1 | Platform: Both | Area: Auth | Route: root lock | `src/features/auth/components/AppLockOverlay.tsx`, `src/features/auth/hooks/useBiometricGate.ts:43-77`
Evidence: the lock renders one action, Unlock; every failure path stays locked; the only switch that disables the lock is behind the gate. Main has since moved the lock from a tree-replacing screen to an overlay above the mounted app (`ce34b7d9`), which fixes resume discarding the open conversation but not the lock-out.
Reproduction: enable App Lock, remove enrolment and passcode, relaunch.
Expected: a way to sign out and reset the lock without reinstalling.
Actual: Unlock fails forever; reinstalling deletes all local conversations.
Root Cause: Verified; fail-closed was deliberate (`biometric-gate.test.tsx`), the escape was never added.
Recommended Correction: a second destructive action, "Reset app lock and sign out", confirmed with the consequence named, calling `clearAuthSession()` and `clearBiometricFlag()`.
Verification: component test on the overlay; device pass with enrolment removed. **Fixed in this branch**, as an optional `onReset` on `AppLockOverlay` that the cover variant never shows.

### MOBILE-008 Android deletes a conversation from the chat screen with no confirmation

Severity: P1 | Platform: Android | Area: Conversation actions | Route: `chat/[id]` | `app/(app)/chat/[id].tsx:1086-1113`
Evidence: the iOS branch confirms with "This cannot be undone"; the Android branch calls `deleteConversation` directly, and its four-button `Alert` loses Cancel to the three-button cap.
Expected: the confirm that `useConversationActions.ts:104-118` already implements.
Actual: immediate irreversible delete.
Root Cause: Verified.
Recommended Correction: hoist the confirm out of the platform branch; the chat screen should call the canonical `useConversationActions` rather than keep a private copy (AGENTS.md §3).
Verification: test under `Platform.OS = 'android'` asserting a second alert precedes deletion. **Fixed in this branch.**

### MOBILE-009 Android action menus built on `Alert.alert` drop every button after the third

Severity: P1 | Platform: Android | Area: Conversation and message actions | `src/features/conversation-actions/useConversationActions.ts:92-121`, `src/features/chat/components/MessageBubble.tsx:444-463`, `app/(app)/chat/[id].tsx:1086-1113`
Evidence: React Native's Android `Alert` keeps at most three buttons (`Alert.js:96-100`, `buttons.slice(0, 3)`). The conversation menu has five buttons on a Cloud chat; the assistant message menu has five; the chat header menu has four.
Expected: Rename, Pin, Archive, Delete, Cancel.
Actual: Delete and Cancel never render on Cloud chats; message delete is unreachable for assistant messages.
Root Cause: Verified (RN source read).
Recommended Correction: replace the Android `Alert`-as-menu with a bottom sheet (the repo already has `AddToChatSheet` on `@gorhom/bottom-sheet`), keeping `Alert` for two-button confirms; add a test that no Android `Alert.alert` receives more than three buttons.
Verification: `chats-list-screen.test.tsx` extended.

### MOBILE-010 The mobile trust-boundary test asserts against functions it defines itself

Severity: P1 | Platform: Both | Area: Trust boundary | `apps/mobile/__tests__/trust-boundary.test.ts:1-140`
Evidence: the file imports one fixture and re-declares `executionModeForModel` and `providerForExecutionMode` with a hardcoded `CLOUD_MODEL_PREFIXES` that exists nowhere in the product. 21 tests pass and would pass if `src/features/chat/utils/conversationMode.ts` were deleted.
Expected: AGENTS.md §6 names a per-surface `trust-boundary.test.ts` as the enforcement.
Actual: a tautology, plus a model-id literal (AGENTS.md §4).
Root Cause: Verified.
Recommended Correction: import the product's `conversationMode` helpers, drive cases from the catalog, and add the MOBILE-001 case against a mocked transport. Check the other surfaces' trust-boundary tests for the same shape before trusting them.
Verification: mutate `conversationMode.ts` and confirm red. **Partly addressed in this branch**: `__tests__/chatStore.test.ts` carried eleven streaming tests that sent a fixture model through an untyped conversation and asserted a cloud stream, which is the MOBILE-001 path; they now run on a cloud-seeded conversation, and a new case asserts a local conversation with an unresolvable model is refused before any transport is called. The self-referential `trust-boundary.test.ts` rewrite is still open.

### MOBILE-011 The permission "Access level" radio is a dead control that persists a false privacy state

Severity: P1 | Platform: Both | Area: Permissions | Route: `settings/permissions/[permission]` | `src/features/settings/permissions/detail.tsx:139,149-188,294`; `stores/permissionsStore.ts:49-52,66-76`
Evidence: the radio paints from `userIntent`, which has one read site and gates nothing; choosing "Don't allow" writes the intent and only offers an alert to open Settings; the store keeps the intent when the OS still reports granted. A never-requested permission is labelled "Access Denied".
Expected: read-only OS status plus "Open Settings"; request only when undetermined.
Actual: the screen shows "Don't allow" while the OS still grants the microphone and the app still records.
Root Cause: Verified.
Recommended Correction: delete `userIntent`; derive levels from `osStatusToLevel`; add an "undetermined" label.
Verification: extend `permissionStatusLabel.test.tsx` with the granted-after-deny case.

### MOBILE-012 Compare opens a local-only model picker on a Cloud-only screen

Severity: P1 | Platform: Both | Area: Model picker | Route: `compare` | `src/features/compare/index.tsx:418-421`
Evidence: both `ModelPickerSheet`s omit `modelScope`, which defaults to `'local'` (`ModelPickerSheet.tsx:156`); Compare refuses to send outside Cloud mode and streams through `streamChat`.
Expected: the cloud catalog.
Actual: only on-device models; picking one sends a local id to the cloud endpoint, which fails.
Root Cause: Verified.
Recommended Correction: `modelScope="cloud"` on both sheets; consider making the prop required.
Verification: component test asserting a cloud row renders. **Fixed in this branch.**

### MOBILE-013 Performance ships two dead toggles that claim to protect the device

Severity: P1 | Platform: Both | Area: Local AI | Route: `settings/performance` | `app/(app)/settings/performance.tsx:305-362,875-891`
Evidence: `perf-pause-at-thermal-v1` and the battery key are written and read only by the screen; no inference path reads them; `expo-battery` is not a dependency; `ThermalThrottleModal` and `BatteryLowModal` are exported and never mounted.
Expected: inference pauses at serious thermal state and below 15% battery, as the labels promise.
Actual: nothing changes.
Root Cause: Verified.
Recommended Correction: gate the local send path in `chatExecutionStore` on the thermal flag using `performanceMonitor.getThermalState()` and mount the existing modal; for battery either add `expo-battery` or delete the toggle. Deleting is the honest minimum.
Verification: component test on the local send gate; device run under thermal load.

### MOBILE-014 Opening the Models screen can start a multi-gigabyte AICore download on cellular with no consent

Severity: P1 | Platform: Android | Area: Local AI | `apps/mobile/native/android/AGIAICoreModule.kt:71-96`
Evidence: `getCapabilities()` calls `triggerBackgroundDownload` when the feature is `DOWNLOADABLE`, with no network check, no prompt and no progress channel; it is invoked on every mount of `models.tsx`, the picker and the Performance screen.
Expected: an explicit, Wi-Fi-gated action with progress, as the GGUF path enforces.
Actual: a silent tariffed download.
Root Cause: Verified.
Recommended Correction: remove the implicit trigger; expose `downloadSystemModel()` as its own method called from `prepareModel` behind the shared network gate, emitting progress.
Verification: device only; unit-assert the trigger is gone from `getCapabilities`.

### MOBILE-015 The language picker offers 12 languages and localises six strings

Severity: P1 | Platform: Both | Area: i18n | Route: `settings/app-language`, every screen | `src/i18n/index.ts:33-40`, `src/features/settings/app-language/index.tsx:56-134`
Evidence: i18next is initialised with 12 locales and RTL support, and a direction change reloads the app; `useTranslation` or `t(` appears in three files (settings general, app-language, root layout). Every chat, settings, alert and error string is an English literal, and chat layouts use physical `paddingLeft` rather than logical edges.
Expected: a localised app, or no picker.
Actual: selecting Arabic mirrors the layout and reloads; everything stays English.
Root Cause: Verified.
Recommended Correction: for this release, hide the picker behind the existing `v1FeatureFlags` pattern or restrict it to English; then migrate strings through the shared shells first. Add a guard counting `t(` adoption against offered locales.
Verification: `app-language-settings.test.tsx` extended.

### MOBILE-016 No store screenshots exist

Severity: P1 (external) | Platform: Both | Area: Store readiness | `apps/mobile/store-listing/screenshots/`
Evidence: the directory holds only `RUNBOOK.md`; the runbook itself records that no Android AVD exists and no Android screenshot has ever been captured. App Store Connect requires the 6.9-inch iPhone and 13-inch iPad slots; Play requires phone screenshots.
Recommended Correction: run `pnpm screenshots:required` on the release machine after the P1 UI fixes land, and commit the composites.
Verification: files present; `pnpm screenshots:verify`.

### MOBILE-017 Every streamed token re-runs a whole-list map, a double markdown parse and a full code re-tokenise

Severity: P2 | Platform: Both | Area: Streaming performance | `stores/chat/chatExecutionStore.ts:1708-1852`, `MessageBubble.tsx:546-549`, `MessageContentRenderer.tsx:341`
Evidence: `onDelta` has no batching; it parses the accumulated raw twice per delta, rebuilds the whole conversation array and writes two stores; `renderMarkdownContent` is memoised only on content, which changes per token, so the regex parse and `tokenizeCode` rerun over the full message each time. `streamingContent` is written per token and read nowhere.
Expected: smooth append.
Actual: O(n²) work per turn; frame cost unmeasured (Hypothesis).
Recommended Correction: coalesce deltas on a ~50 ms timer or rAF; memoise completed rows on id; skip syntax highlighting while a block is still streaming; delete `streamingContent`.
Verification: a test counting store writes for N deltas; device profile on a mid-range Android.

### MOBILE-018 Deleting a message never asks for confirmation, and is unreachable on Android

Severity: P2 | Platform: Both | Area: Message actions | `MessageBubble.tsx:435-437,456-462`
Evidence: both platforms delete on the first tap; the Android assistant menu has five buttons so Delete is dropped anyway (MOBILE-009). No confirm primitive exists on mobile (MOBILE-062).
Recommended Correction: route through the shared confirm once it exists; until then the two-button alert the conversation path uses.

### MOBILE-019 The chats list shows "No chats yet" while loading and has no error or retry state

Severity: P2 | Platform: Both | Area: Empty and error states | Route: `chats/index` | `src/features/chat/ChatsListScreen.tsx:150-152,466-491`
Evidence: `isLoadingConversations` is consumed nowhere in UI; the empty component renders unconditionally; a failed cloud fetch shows the same copy; no `RefreshControl`.
Recommended Correction: render `MessageSkeleton` while loading and add pull-to-refresh calling `loadConversations`.
Verification: `chats-list-screen.test.tsx` loading and error cases.

### MOBILE-020 Attachments have no upload progress, failure state or retry

Severity: P2 | Platform: Both | Area: Attachments | `AttachmentPreview.tsx`, `ChatInput.tsx:321-323`
Evidence: no progress or upload API in the composer or execution store; attachments are cleared from the composer as soon as the send is accepted, so a mid-send failure loses them.
Root Cause: Hypothesis (send path for large files not traced on device).
Recommended Correction: confirm on device whether files are inlined or uploaded separately, then add per-attachment state.

### MOBILE-021 Push permission is requested automatically on Cloud sign-in with no primer, and the reviewer notes say the opposite

Severity: P2 | Platform: Both | Area: Notifications | `app/_layout.tsx:280-306`, `services/notifications.ts:125-148`, `store-listing/REVIEWER-NOTES-IOS.md`
Evidence: `registerForPushNotifications` calls `requestPermissionsAsync` from a root-layout effect; a denial returns null and is surfaced nowhere. The reviewer notes state every permission is requested on first use from a user action.
Recommended Correction: request only from the Settings → Permissions row or a primer; register the token only when already granted; show the denied state in notification settings; fix the notes in the same change.
Verification: `notification-auth-gate.test.ts` extended.

### MOBILE-022 Android hardware Back is claimed by the root layout ahead of the drawer

Severity: P2 | Platform: Android | Area: Navigation | `app/_layout.tsx:623-644`
Evidence: the only `BackHandler` registration in app code runs in the root layout's effect, which fires after all descendants, so it dispatches first and returns true unconditionally.
Expected: Back closes an open drawer.
Actual (Hypothesis): Back navigates the screen underneath with the drawer open, or shows the exit toast with the drawer open. Bottom sheets register later and win.
Recommended Correction: consult drawer state before `canGoBack`, returning false when a drawer or sheet is open.
Verification: Detox spec; jsdom cannot see listener order.

### MOBILE-023 "Press back again to exit" fires on non-root screens

Severity: P2 | Platform: Android | Area: Navigation | `app/_layout.tsx:626-643`
Evidence: the toast branch runs whenever history is empty; age gate, onboarding and reset-password are entered with `replace`.
Recommended Correction: gate on `segments` resolving to the home route.

### MOBILE-024 iOS share-extension content is silently dropped for a signed-out Local user

Severity: P2 | Platform: iOS | Area: Share-to-app | `app/_layout.tsx:474-490`
Evidence: `subscribeToIOSShareInbox` is gated on `isClerkSignedIn`; the Android path is gated only on `isInitialized`. Local Mode is fully usable without an account.
Recommended Correction: drop `isClerkSignedIn` from the gate. **Fixed in this branch.**

### MOBILE-025 Recognition errors after start are silent in companion and inline voice

Severity: P2 | Platform: Both | Area: Dictation | `src/features/voice/hooks/useVoiceConversation.ts:77-81,164-172`
Evidence: `onCaptureError` is wired only to the start throw; later `no-speech`, `network`, `language-not-supported` land in a rejection handler that resets to idle with no message; `voiceCaptureErrorMessage` already produces the copy and is never called there.
Recommended Correction: call the error callback or set the transcript preview in the rejection handler and the empty-transcript branch.

### MOBILE-026 On-device recognition is required for the device locale without checking the locale's model exists

Severity: P2 | Platform: Both, worse on Android | Area: Dictation | `src/features/voice/services/voiceInput.ts:110-117,145-156,214-221`
Evidence: `requiresOnDeviceRecognition: true` with the device locale; `getSupportedLocales()` is never called; the Android package hint is only a `<queries>` entry.
Recommended Correction: check supported locales once; either pick a supported locale or fall back to network recognition with a disclosure.

### MOBILE-027 Speech language, chosen voice and rate never reach the code that listens or speaks

Severity: P2 | Platform: Both | Area: Voice settings | `voiceInput.ts:110-117`, `VoicePickerSheet.tsx:82-84`, `app/(app)/chat/[id].tsx:1136`
Evidence: recognition reads the device locale, not `speechLanguage`; the in-chat picker writes only `selectedPresetId`, which nothing reads at speak time; the inline bar calls `TTS.speak(text, callbacks)` with no voice or rate.
Recommended Correction: resolve the preset the way the settings screen does and route every playback through `useVoicePlayback`.

### MOBILE-028 The "Voice Input" and "Auto-listen" toggles are connected to nothing

Severity: P2 | Platform: Both | Area: Voice settings | `src/features/settings/voice/index.tsx:346-358`
Evidence: `voiceEnabled` and `autoListenEnabled` have no runtime consumer.
Recommended Correction: read `voiceEnabled` where the mic entry points render, seed `autoListenRef` from the setting, or remove both switches.

### MOBILE-029 The voice companion labels a cloud model round-trip "ON-DEVICE"

Severity: P2 | Platform: Both | Area: Privacy claim | Route: `voice` | `app/(app)/voice.tsx:38,236-239`
Evidence: an unconditional ON-DEVICE badge and "Processing on-device" during the phase that runs `sendMessage` against the selected model.
Recommended Correction: scope the badge to STT and TTS and branch the model line on execution mode.

### MOBILE-030 The "Transcribe with AGI" App Intent discards the audio file it accepts

Severity: P2 | Platform: iOS | Area: App Intents | `native/ios/AGIAppIntents/TranscribeIntent.swift:12-25`, `app/_layout.tsx:596-598`, `voiceInput.ts:266-269`
Evidence: the intent dispatches `audioUri`; the JS handler pushes the live companion and never reads it; `transcribeOnDevice` voids its argument.
Recommended Correction: implement file transcription or remove the intent from `AppShortcuts.swift` before submission.

### MOBILE-031 Unmounting during the permission await can leave a recognizer running with no owner

Severity: P2 | Platform: Both | Area: Lifecycle | `voiceInput.ts:132-221`, `useVoiceConversation.ts:150-178`
Root Cause: Hypothesis (ordering verified, race not reproduced).
Recommended Correction: a cancelled flag re-checked immediately before `.start(...)`.

### MOBILE-032 ExecuTorch downloads bypass the Wi-Fi gate and the checksum

Severity: P2 | Platform: Both | Area: Local AI | `src/features/model-picker/installStore.ts:133,255-259`, `packages/platform/local-llm/src/tier2.ts`
Evidence: the preset branch never enters `modelDownload.ts`; the installed record carries `sha256: null`.
Recommended Correction: hoist the network gate into a policy helper called at the top of `prepareModel`, next to `tier2LoadModel` in the shared package; state honestly when integrity cannot be verified.

### MOBILE-033 Every download failure is replaced with one generic message

Severity: P2 | Platform: Both | Area: Local AI | `installStore.ts:266-276`, `onboarding.tsx:337-348`
Evidence: typed `ModelDownloadError` kinds are discarded; onboarding maps them to actionable copy; the `wifi_required` string refers to a setting that exists only in onboarding.
Recommended Correction: extract onboarding's map into `describeModelDownloadError` and use it in both places; add or reword the Wi-Fi-only preference.

### MOBILE-034 A download started from the model picker cannot be cancelled

Severity: P2 | Platform: Both | Area: Local AI | `ModelRow.tsx:50,60`, `installStore.ts:196,242-265`
Recommended Correction: `cancelModel` on the store calling the existing `cancelDownload`; render a cancel control instead of disabling the row.

### MOBILE-035 Deleting a model in Storage leaves the picker showing it as Ready

Severity: P2 | Platform: Both | Area: Local AI | `app/(app)/settings/storage.tsx:110-119`, `installStore.ts:156-172,280`
Recommended Correction: `forgetModel(modelId)` on the store, called from the deletion handler.

### MOBILE-036 Connector OAuth uses the browser API that cannot observe the redirect

Severity: P2 | Platform: Both, worse on Android | Area: Connectors | `lib/safeOpenURL.ts:63-73`, `src/features/settings/cloud-connectors/index.tsx:704-721`, `ConnectorDetailScreen.tsx:326-337`
Evidence: `openBrowserAsync`, no `openAuthSessionAsync`, no callback deep link; completion is inferred by re-fetching after the browser closes. On Android the promise resolves once the tab is presented (Hypothesis), so "not connected yet" can fire mid-consent.
Recommended Correction: `openAuthSessionAsync` with an `agiworkforce://connectors/callback` redirect registered in the intent filters.

### MOBILE-037 A free-tier account is offered "Upgrade plan" that leads to a dead end

Severity: P2 | Platform: Both | Area: Billing | `src/features/settings/cloud-billing/index.tsx:145-193,325-331`, `PaywallBottomSheet.tsx:259`
Evidence: with the IAP catalog disabled the row opens a sheet whose only content is "Plan changes aren't available in the app yet."
Recommended Correction: gate the row on `nativeIap.catalog?.enabled || canRecoverBilling`; drop the external-link icon.

### MOBILE-038 No dated store billing-policy research backs the outbound billing links

Severity: P2 | Platform: Both | Area: Compliance | `docs/research/`, `store-listing/REVIEWER-NOTES-ANDROID.md:379-425`
Evidence: five outbound destinations touch commerce; the reviewer notes argue account-management status without citing policy text or a date; AGENTS.md §10 requires dated research in `docs/research/`.
Recommended Correction: a dated policy note covering Apple 3.1.1 / 3.1.3 and the Play Payments policy, referenced from both reviewer notes. Whether any link violates current policy is not determined here.

### MOBILE-039 The global offline banner sits under the status bar, duplicates the chat banner, and flashes at launch

Severity: P2 | Platform: Both | Area: Safe areas and offline | `src/features/edge-cases/components/OfflineBanner.tsx:60-83`, `hooks/useNetworkStatus.ts:22`, `app/(app)/chat/[id].tsx:1284-1300`
Evidence: `position: absolute, top: 0` with no inset; the only global offline affordance; `isOnline` initialises to `false` so the banner animates in on every launch until NetInfo resolves; the chat screen renders its own banner as well.
Recommended Correction: `paddingTop: insets.top`, initial state unknown rather than offline, remove the per-screen duplicate. **Inset and initial-state fixed in this branch.**

### MOBILE-040 The root error boundary's "Go Back" does nothing when history is empty

Severity: P2 | Platform: Both | Area: Error handling | `app/error.tsx:30-52,110-113`
Evidence: no fallback when `canGoBack()` is false, unlike the three sibling boundaries; raw `error.message` shown; 30pt button.
Recommended Correction: `router.replace('/(app)')` fallback, fixed copy, 44pt. **Fixed in this branch.**

### MOBILE-041 Light theme has AA contrast failures down to 1.04:1, and no mobile contrast test exists

Severity: P2 | Platform: Both | Area: Design system | `src/features/projects/components/ProjectHeader.tsx:17-64`, `src/ui/theme/tokens.ts:12`, plus `compare/index.tsx:521`, `translate.tsx:348`, `settings/index.tsx:70`, `permissions/index.tsx:88`
Evidence: computed WCAG ratios over the light background: project chips 1.04:1, privacy chip "Stays local" 1.36:1, amber 1.27:1, sky 1.47:1; `textMuted` on elevated surfaces 3.32:1 across 634 call sites. `ProjectHeader` applies six dark-mode pastels in both themes. The web has `theme-contrast.test.ts`; mobile has none.
Recommended Correction: per-theme `*Text` roles in `tokens.ts` per `.claude/rules/ui-colour-and-interaction.md`; darken light `textMuted` to about 0.62 alpha; port the contrast test to `apps/mobile/__tests__`.

### MOBILE-042 985 lines of edge-case modals ship unreachable, one carrying a private Apple URL scheme

Severity: P2 | Platform: Both (iOS review risk) | Area: Dead code | `src/features/edge-cases/components/*Modal.tsx`, `StorageFullModal.tsx:13-22`
Evidence: eight modals exported and mounted nowhere; `edge-cases.test.tsx` proves they render; `StorageFullModal` calls `Linking.openURL('App-Prefs:...')`, a private scheme that also bypasses `safeOpenURL`, and passes a bare Android action string to `openURL`.
Recommended Correction: delete the eight components and their tests; if one is wanted, mount it once through the confirm primitive with `Linking.openSettings()`. **Deleted in this branch.**

### MOBILE-043 `READ_EXTERNAL_STORAGE` is declared uncapped, and three permissions duplicate plugin-provided ones

Severity: P2 | Platform: Android | Area: Permissions | `app.config.js` `android.permissions`
Evidence: `expo-image-picker` and `expo-file-system` declare the permission with `maxSdkVersion="32"`; the app's bare declaration wins in the merge (Hypothesis on merged output). `CAMERA`, `USE_BIOMETRIC`, `USE_FINGERPRINT` are already merged by their plugins; `USE_FINGERPRINT` is deprecated.
Recommended Correction: keep only `RECORD_AUDIO` in `android.permissions`. **Fixed in this branch**; verify the merged manifest on the next Android prebuild.

### MOBILE-044 Local model files (about 2 GB) live in the iOS Documents directory with no backup exclusion

Severity: P2 | Platform: iOS | Area: Storage | `services/modelDownload.ts:59`
Evidence: `MODELS_DIR` is under `documentDirectory`; no `NSURLIsExcludedFromBackupKey` anywhere.
Recommended Correction: set the exclusion after each download through the existing iOS native-module plugin, or migrate to Application Support with a one-time move.

### MOBILE-045 The Android notification icon has no alpha channel

Severity: P2 | Platform: Android | Area: Assets | `assets/notification-icon.png`
Evidence: 96×96, RGB, no alpha (sharp metadata); Android tints from the alpha mask, so this renders as a white square.
Recommended Correction: replace with a white-on-transparent silhouette.

### MOBILE-046 `expo-contacts` is a shipped dependency with no call site and no usage string

Severity: P2 | Platform: Both | Area: Dependencies | `apps/mobile/package.json`
Recommended Correction: remove it and regenerate the licence list with `scripts/generate-oss-licenses.mjs`. Not done in this branch: the lockfile must be rewritten by pnpm, and this sandbox cannot resolve one git-hosted dependency of `packages/tools/mcp`, so the manifest change was reverted rather than shipped with a stale lock.

### MOBILE-047 Three Android config plugins patch generated Kotlin by regex and silently no-op on a miss

Severity: P2 | Platform: Android | Area: Expo config | `native/android/withAGIAICore.cjs:26,77-93`, `withAGITranslate.cjs:77-93`, `withAGIVisionOCR.cjs:77-93`
Evidence: `String.replace` with a non-matching anchor writes the file back unchanged; `withAGIShareIntent.cjs` throws on a miss and is the correct pattern.
Recommended Correction: throw when the output equals the input. **Fixed in this branch.**

### MOBILE-048 36 Expo packages are behind the SDK 57 expected versions

Severity: P2 | Platform: Both | Area: Expo config | `apps/mobile/package.json`
Evidence: `pnpm check:expo-deps` exits 1 (expo 57.0.12 vs ~57.0.22, expo-updates, expo-router, expo-notifications and 32 more).
Recommended Correction: `npx expo install --fix` from `apps/mobile` and let pnpm write the lockfile; re-run the suite. Not done in this branch because the lockfile guard requires a package-manager run the maintainers should own.

### MOBILE-049 A second full-screen spinner follows the native splash, in a possibly unhydrated theme

Severity: P3 | Platform: Both | Area: Startup | `app/_layout.tsx:170,641-654`
Recommended Correction: release the splash on the same predicate the render gate uses, keeping the 5 s watchdog.

### MOBILE-050 Chat detail has no Back control, and no `(app)` route has swipe-back

Severity: P3 | Platform: Both, worse on iOS | Area: Navigation | `app/(app)/_layout.tsx:34-92`, `app/(app)/chat/[id].tsx:1187-1200`
Evidence: every route is a `Drawer.Screen`; `handleBack` exists and is used only after delete.
Recommended Correction: render a back arrow when `canGoBack`; structurally, nest a `Stack` inside the drawer for detail routes.

### MOBILE-051 The age-gate back arrow is inert on one of its two entry paths

Severity: P3 | Platform: Both | `app/(public)/age-gate.tsx:44-48`, `app/_layout.tsx:404,419`
Recommended Correction: render the arrow only when `returnTo` resolves.

### MOBILE-052 A notification tapped while signed out routes to the sign-in wall

Severity: P3 | Platform: Both | `services/notifications.ts:294-297`
Evidence: contradicts the locked Local-first rule in `app/_layout.tsx:371-388`.
Recommended Correction: navigate to `/(app)`.

### MOBILE-053 Notification listeners and the initial notification are skipped in Local mode

Severity: P3 | Platform: Both | `app/_layout.tsx:299-303`
Recommended Correction: keep the mode guard on registration only.

### MOBILE-054 Touch targets under 44pt on the most-used controls

Severity: P3 | Platform: Both | Area: Accessibility
Evidence: send and stop button 32pt (`SendButton.tsx:76-93`), message action row 40pt (`MessageBubble.tsx:138-146`), composer mic 32pt (`VoiceInputButton.tsx:350-369`), scroll-to-bottom 36pt, drawer rows 34pt (`DrawerContent.tsx:182,440,488`), and 18 settings controls from 28pt (`settings/voice/index.tsx:184`) to 40pt without `hitSlop`.
Recommended Correction: `hitSlop` matching `common.tsx:48`; drawer rows to 44. **Send, mic and message action targets fixed in this branch**; main separately fixed the chat header controls (`b613c6e0`) and the notifications entry point (`c05183c9`). The drawer rows and the settings controls remain.

### MOBILE-055 Feedback and haptics gaps

Severity: P3 | Platform: Both | Area: Haptics
Evidence: message copy is silent at three call sites while code-block copy fires a success haptic; no haptic on stop, long-press menu open, attachment added, live voice connected, or voice error; 13 call sites in `scan.tsx`, `ArtifactFullScreen.tsx`, `FileExportButton.tsx`, `GeneratedImage.tsx`, `ImageFullScreen.tsx` ignore `hapticsEnabled`; "close voice" uses Heavy where the rest use Medium. Nothing fires during streaming.
Recommended Correction: one `haptics` helper reading the store, with an ESLint `no-restricted-imports` rule banning direct `expo-haptics` imports outside it.

### MOBILE-056 Two autoscroll mechanisms run against each other during streaming

Severity: P3 | Platform: Both | `MessageList.tsx:78-87,141-145`
Recommended Correction: delete the timer effect and rely on FlashList's `maintainVisibleContentPosition`.

### MOBILE-057 Camera permission denial is a dead end

Severity: P3 | Platform: Both | `app/(app)/chat/[id].tsx:704-711`
Recommended Correction: two-button alert with `Linking.openSettings()` through the permissions registry. **Fixed in this branch.**

### MOBILE-058 Large paste is diverted to an attachment while the TextInput is controlled

Severity: P3 | Platform: Android (suspected) | `ChatInput.tsx:378-418`
Root Cause: Hypothesis; needs a device.

### MOBILE-059 Nothing measures voice latency, and the chip shown is mislabelled

Severity: P3 | Platform: Both | `useVoiceConversation.ts:69-71`, `app/(app)/voice.tsx:243-249`
Recommended Correction: relabel to "transcription" and hide it for self-finalised captures, or instrument the real stages.

### MOBILE-060 Listening has no client-side timeout

Severity: P3 | Platform: Android | `voiceInput.ts:214-221`
Recommended Correction: a single max-listen timer calling `stopCapture()`.

### MOBILE-061 Two different purpose strings are declared for the microphone and speech keys

Severity: P3 | Platform: iOS | `app.config.js:73-80` vs `:244-249`
Recommended Correction: give the plugin the descriptive strings so precedence stops mattering. **Fixed in this branch.**

### MOBILE-062 No confirm primitive on mobile: 172 hand-rolled `Alert.alert` calls

Severity: P3 | Platform: Both | repo-wide
Recommended Correction: `hooks/useConfirmAction.ts` with a required consequence field; migrate the 36 destructive sites; guard against `style: 'destructive'` outside it.

### MOBILE-063 Three contradictory colour palettes; `teal` and `terraCotta` both resolve to neutral ink

Severity: P3 | Platform: Both | `src/ui/theme/tokens.ts`
Evidence: main has since made `tailwind.config.js` read `agiBrandScale` from `@agiworkforce/design-tokens` and `tokens.ts` read `agiRadii` from it (`c03074d0`, `5749f51e`), so the third palette and the radius ladder now have one owner. What remains is the naming: `teal` and `terraCotta` still resolve to the same neutral ink in every theme (`tokens.ts:5-6,73-74,151-152`), so two tokens named for hues are neither that hue nor distinguishable from each other.
Recommended Correction: rename both to role tokens (`accentFill`, `accentFillSecondary`) or delete the unused one, and add the missing `*Text` role.

### MOBILE-064 Six header implementations, two sheet stacks, a vestigial tab layer, 34pt drawer rows

Severity: P3 | Platform: Both
Recommended Correction: promote the settings shell header to a shared `ScreenHeader`; collapse the `Modal`-based sheets onto the bottom-sheet primitive; delete `(tabs)`; drawer rows to 44.

### MOBILE-065 Fixed-height headers and single-line labels clip at large Dynamic Type

Severity: P3 | Platform: Both | six screens still at `height: 58` (`permissions/detail.tsx:195,230`, `settings/workspace.tsx:226`, `shared-links.tsx:116`, `reflect.tsx:97`, `archived-chats.tsx:214`), `about.tsx` at 48, `SettingsRow` `numberOfLines={1}`
Evidence: main added `TextScaleBoundary` (`cf5d2036`), which remounts the tree when the reader changes their text size so iOS re-measures instead of painting large text into boxes measured small. That fixes the live-change case; a fixed `height` still cannot grow, so the clipping at large sizes stands.
Recommended Correction: `minHeight`, allow two lines.

### MOBILE-066 Thirteen modals lack `accessibilityViewIsModal`; 24 single-choice rows announce as buttons

Severity: P3 | Platform: Both
Recommended Correction: follow `AddMemorySheet.tsx:105` and `app-language/index.tsx:164-166`.

### MOBILE-067 `AddMemorySheet` actions sit in the home-indicator area

Severity: P3 | Platform: Both | `AddMemorySheet.tsx:106-113`
Recommended Correction: `paddingBottom: Math.max(20, insets.bottom + 8)`.

### MOBILE-068 Predictive back at targetSdk 36 is neither adopted nor opted out

Severity: P3 | Platform: Android | `app/_layout.tsx:623-643`, `app.config.js:225-228`
Root Cause: Hypothesis; verify against current RN and Android 16 documentation on a device.

### MOBILE-069 Five icon-only controls without an accessibility label

Severity: P3 | Platform: Both | `app/(app)/schedules/index.tsx:325`, `app/(app)/settings/memory.tsx:357`, `QuickSchedule.tsx:274,302`, `permissions/detail.tsx:197`, `share-preview/index.tsx:144`

### MOBILE-070 Models screen favourites and recents announce "Select" but reopen the sheet, and cloud favourites are invisible

Severity: P3 | Platform: Both | `app/(app)/models.tsx:94-98,167-183,203-219`
Recommended Correction: select on press; build the lists from `getModelListForCloudAccess`.

### MOBILE-071 Cloud sections read as a raw provider catalog

Severity: P3 | Platform: Both | `ModelPickerSheet.tsx:65-90`, `service.ts:213-216,246`
Recommended Correction: group by `tier` with the provider as row metadata; drop raw ids from search. Design change; run through the design skill; likely belongs in `packages/ui/unified-chat`.

### MOBILE-072 A plan downgrade silently swaps the selected model

Severity: P3 | Platform: Both | `src/features/model-picker/store.ts:232-252`
Recommended Correction: a one-shot inline notice naming old and new model.

### MOBILE-073 Storage never shows free space and downloads have no pre-flight check

Severity: P3 | Platform: Both | `app/(app)/settings/storage.tsx:236-266`, `modelDownload.ts:426-430`

### MOBILE-074 No crash or error reporting exists

Severity: P3 (informational) | Platform: Both
Evidence: deliberate and disclosed in four places; a post-launch crash produces no signal. Adding it later must update the privacy manifest, data-safety file, web legal page and reviewer notes together.

### MOBILE-075 No screenshot protection on Android when App Lock is on

Severity: P3 | Platform: Android
Evidence: main added the app-switcher cover (`d33269f6`): `useBiometricGate` now reports `isCovered` and `AppLockOverlay` paints over the app before iOS takes its snapshot. Android still has no `FLAG_SECURE`, so its recents thumbnail and screenshots of connector secrets and chat content are unprotected.
Recommended Correction: `FLAG_SECURE` on Android while App Lock is on.

### MOBILE-076 Background fetch registers regardless of mode; its notification has no Android channel

Severity: P4 | Platform: Android | `app/_layout.tsx:308-338`, `services/backgroundFetch.ts:87-99`

### MOBILE-077 The active chat does not restore after a process kill

Severity: P4 | Platform: Both | `stores/chat/chatViewStore.ts:297-306`, `app/index.tsx`
A product decision to record, not assert.

### MOBILE-078 Dead `handleAttach` in the composer

Severity: P4 | `ChatInput.tsx:422-424`. **Deleted in this branch.**

### MOBILE-079 Live voice hardcodes a public STUN server and no TURN

Severity: P4 | `liveVoiceSession.ts:186-188`
Recommended Correction: return `iceServers` from the session endpoint.

### MOBILE-080 `environmentAvailability` is hardwired behind a truncated comment

Severity: P4 | `src/features/model-picker/service.ts:78-84`

### MOBILE-081 Model-id-shaped literals as Compare defaults

Severity: P4 | `src/features/compare/index.tsx:63-64`

### MOBILE-082 `legal/article-50` double-applies the top inset

Severity: P4 | `app/legal/article-50.tsx:57`. **Fixed in this branch.**

### MOBILE-083 Explanatory comments in product code, one truncated mid-sentence

Severity: P4 | `settings/index.tsx:152-154,178-180,283-286,646-648`, `permissions/index.tsx:136`, `cloud-connectors/index.tsx:1002-1004`

### MOBILE-084 `toOsStatus` reports a soft-denied permission as undetermined

Severity: P4 | `src/features/settings/permissions/registry.ts:33-37`

### MOBILE-085 TLS pinning ships inert with placeholder pins

Severity: P4 (acceptable) | `lib/pinning.ts`, `native/withAGITlsPinning.cjs`
Fails closed on standard TLS; `check:tls-pins` passing does not mean pinning is on. Provision real SPKI hashes per the runbook in `lib/pinning.ts:126-145` when ready.

### MOBILE-086 New Architecture and Hermes are inferred from SDK defaults, not pinned

Severity: P4 | `app.config.js`, `package.json`
Recommended Correction: set `newArchEnabled: true` explicitly so a template change fails loudly.

## Prioritised execution plan, by root cause

Phase 0, privacy, health data, data loss: MOBILE-001 (guard), MOBILE-010
(real trust-boundary test), MOBILE-002 (paged local history), MOBILE-003,
MOBILE-006, MOBILE-029 (voice disclosures), MOBILE-011 (dead permission
control), MOBILE-014 (AICore consent), MOBILE-007 (lock escape).

Phase 1, crashes, startup, auth, navigation: MOBILE-040, MOBILE-049,
MOBILE-022, MOBILE-023, MOBILE-050, MOBILE-051, MOBILE-052, MOBILE-053,
MOBILE-086.

Phase 2, chat, composer, streaming: MOBILE-008, MOBILE-009 (one Android menu
primitive), MOBILE-018, MOBILE-062 (one confirm primitive), MOBILE-017,
MOBILE-056, MOBILE-019, MOBILE-020, MOBILE-058, MOBILE-078.

Phase 3, back, close, sheets, keyboard, safe areas: MOBILE-039, MOBILE-067,
MOBILE-082, MOBILE-064 (shared header, one sheet stack, delete `(tabs)`).

Phase 4, voice, camera, files, permissions: MOBILE-004, MOBILE-005,
MOBILE-025, MOBILE-026, MOBILE-027, MOBILE-028, MOBILE-030, MOBILE-031,
MOBILE-059, MOBILE-060, MOBILE-061, MOBILE-057, MOBILE-021, MOBILE-024,
MOBILE-043, MOBILE-046, MOBILE-084.

Phase 5, HealthKit (MS-1, externally gated): implement read-only per the
constraints above with `@kingstinct/react-native-healthkit` or a local Expo
Module, config plugin for entitlement and purpose string, on-device
aggregation, provenance line "Using Apple Health", execution-mode gating,
logging exclusion, physical iPhone validation, then the store disclosures
the guard test will demand.

Phase 6, offline, lifecycle, notifications, deep links: MOBILE-036,
MOBILE-076, MOBILE-077, MOBILE-045, MOBILE-053.

Phase 7, local AI: MOBILE-013, MOBILE-032, MOBILE-033, MOBILE-034,
MOBILE-035, MOBILE-073, MOBILE-044, MOBILE-072.

Phase 8, accessibility, responsiveness, platform polish: MOBILE-054,
MOBILE-055, MOBILE-065, MOBILE-066, MOBILE-069, MOBILE-068, MOBILE-075,
MOBILE-015 (hide the picker now, localise later).

Phase 9, design system and dead code: MOBILE-041 (tokens plus contrast
test), MOBILE-063, MOBILE-042, MOBILE-071, MOBILE-070, MOBILE-079,
MOBILE-080, MOBILE-081, MOBILE-083.

Phase 10, store validation: MOBILE-016 (screenshots), MOBILE-048 (expo
install --fix), MOBILE-038 (dated policy research), MOBILE-037, MOBILE-047,
first run of `release-mobile.yml`, TestFlight and Play internal track.

Phase 11, full regression on physical devices: everything listed under
"could not verify" below, on a Dynamic Island iPhone, an older notched
iPhone, a small iPhone, an iPad, a punch-hole Android with gesture
navigation and one with three-button navigation, at 100% and 200% text.

## Final release gate

| Workflow                            | Function                | Native UX  | Entry      | Exit       | Keyboard   | Safe area  | Gesture    | Permission | Lifecycle  | Network    | Performance | Accessibility | Privacy         | iOS/Android |
| ----------------------------------- | ----------------------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- | ----------- | ------------- | --------------- | ----------- |
| Startup and auth                    | pass                    | pass       | pass       | fail (007) | n/a        | fail (039) | n/a        | n/a        | unverified | pass       | unverified  | pass          | pass            | fail (022)  |
| New chat and send                   | pass                    | pass       | pass       | pass       | unverified | pass       | pass       | n/a        | pass       | pass       | unverified  | fail (054)    | fail (001)      | fail (009)  |
| Read a long chat                    | fail (002)              | pass       | pass       | fail (050) | unverified | pass       | unverified | n/a        | pass       | pass       | unverified  | pass          | pass            | pass        |
| Attach photo/file                   | pass                    | pass       | pass       | pass       | unverified | pass       | n/a        | fail (057) | unverified | fail (020) | unverified  | pass          | pass            | pass        |
| Dictation                           | pass                    | pass       | pass       | pass       | pass       | pass       | pass       | pass       | pass       | pass       | unverified  | fail (054)    | pass            | fail (026)  |
| Live voice                          | pass                    | unverified | pass       | pass       | n/a        | pass       | n/a        | pass       | fail (004) | pass       | unverified  | pass          | fail (003, 006) | unverified  |
| Model picker                        | pass                    | pass       | pass       | pass       | pass       | pass       | pass       | n/a        | pass       | pass       | unverified  | pass          | fail (012)      | pass        |
| Local model install                 | partial                 | fail (034) | pass       | pass       | n/a        | pass       | n/a        | n/a        | fail       | fail (032) | unverified  | pass          | fail (014)      | fail (014)  |
| Settings                            | partial (011, 013, 015) | pass       | pass       | pass       | pass       | pass       | pass       | fail (011) | pass       | partial    | pass        | partial (066) | fail (011)      | pass        |
| Projects, library, schedules, tasks | pass                    | pass       | pass       | pass       | pass       | pass       | pass       | n/a        | pass       | partial    | pass        | fail (041)    | pass            | pass        |
| Notifications                       | pass                    | fail (021) | pass       | pass       | n/a        | n/a        | n/a        | fail (021) | pass       | n/a        | n/a         | pass          | pass            | fail (045)  |
| Share in and out                    | pass                    | pass       | pass       | pass       | n/a        | pass       | n/a        | n/a        | unverified | pass       | n/a         | pass          | pass            | fail (024)  |
| Billing                             | off by decision         | pass       | fail (037) | pass       | n/a        | pass       | n/a        | n/a        | n/a        | pass       | n/a         | pass          | pass            | pass        |
| Apple Health                        | not built               | n/a        | n/a        | n/a        | n/a        | n/a        | n/a        | n/a        | n/a        | n/a        | n/a         | n/a           | n/a             | n/a         |

Special Health release gate: not applicable until MS-1 is built; every item
in the brief's gate is recorded in the constraints section above and must be
checked on a physical iPhone before the feature is declared ready.

## Could not verify without a device

iOS swipe-back and drawer transitions; Android Back ordering against drawer
and sheets; the splash to spinner to UI sequence and theme flash; every OS
permission prompt and the lock-out itself; universal-link association files
on the server; share extension and Android SEND end to end; background task
budgeting and token rotation; offline banner overlap on notched devices;
streaming interrupted by a real connectivity drop; state after a real
process kill; per-token frame cost; keyboard avoidance and sheet-over-keyboard
collisions; long-press versus native text selection; audio routing, AirPods,
interruptions, the orange mic indicator after backgrounding; Android speech
without Google services; local inference, thermal and RAM behaviour;
download resume and background; `openBrowserAsync` resolve timing on Android;
IAP end to end in a sandbox; merged Android manifest; `NSPrivacyAccessedAPITypes`
completeness against pods; VoiceOver and TalkBack traversal; Dynamic Type
clipping thresholds; reduce-motion under Reanimated 4.5; the help pages
behind the Support links.

## Final question

If thousands of users installed AGI Workforce tomorrow and used it as they
use ChatGPT or Claude: the first thing to break is trust. A Local-mode user
whose local model was renamed in a catalog update would have a private
conversation streamed to the cloud without being asked. A voice user would
read that nothing leaves the device, then have their microphone streamed to
a server, and if they took a call or locked the phone the microphone would
stay open. A user who turned a permission to "Don't allow" in the app's own
settings would believe it was revoked when it was not. A heavy Local-mode
user would lose everything before the last 100 messages the first time the
app restarted. A user who enabled App Lock and later reset Face ID would be
locked out with no way back except a reinstall that deletes their chats.

The second thing to break is Android. Menus lose their Delete and Cancel
buttons, a chat can be deleted with one tap and no confirmation, the
hardware Back button fights the drawer, the notification icon is a white
square, and opening the Models screen can start a multi-gigabyte download on
cellular.

The third is the feeling of finish: a language picker that changes nothing,
performance toggles that protect nothing, voice settings that the voice
code never reads, a Transcribe shortcut that opens the microphone instead of
transcribing the file, an Upgrade button that opens a sheet saying upgrades
are unavailable, an offline banner that hides under the status bar and
flashes at every launch, a chat you cannot swipe back from, and project
labels invisible in light mode.

What would not break is most of what a ChatGPT or Claude user does all day:
type, attach, stream, stop, retry, copy, share, switch models, read the
answer, manage settings, sign in and out. That core is sound and largely
native. It is surrounded by controls that were built to the edge of the UI
and never wired through, and by a privacy story that the code does not yet
keep. Finish those, prove the trust boundary with a test that can fail, put
the app on real phones, and it becomes submittable.

## Changed in this branch

Fixes landed alongside this audit, each validated by the mobile Jest suite
and typecheck; every one is device-independent and root-cause:

- MOBILE-001: fail-closed guard for Local mode with an unresolvable model, with a store test that asserts no transport is called.
- MOBILE-003: voice onboarding discloses the mode about to run.
- MOBILE-004: live voice ends on background.
- MOBILE-006: audio data declared in the privacy manifest, the locked
  `.xcprivacy` copy, the Play data-safety file and both reviewer notes.
- MOBILE-007: lock screen gains a confirmed "Reset app lock and sign out".
- MOBILE-008: chat-screen delete confirms on both platforms.
- MOBILE-012: Compare pickers use the cloud scope.
- MOBILE-024: iOS share inbox subscribed regardless of sign-in.
- MOBILE-039: offline banner respects the top inset and starts unknown.
- MOBILE-040: root error boundary always has a working exit.
- MOBILE-042: unreachable edge-case modals and the private URL scheme removed.
- MOBILE-043: Android permission list reduced to what plugins do not provide.
- MOBILE-047: Android config plugins fail loudly on a missed anchor.
- MOBILE-054: send, stop, mic and message-action targets reach 44pt.
- MOBILE-057: camera denial offers Open Settings.
- MOBILE-061: one microphone and speech purpose string.
- MOBILE-078: dead composer handler removed.
- MOBILE-082: article-50 inset applied once.
