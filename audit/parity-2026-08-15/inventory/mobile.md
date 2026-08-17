# apps/mobile — Deep Inventory Audit

Scope: `apps/mobile` (Expo/React Native). Read-only inventory against a native-mobile
bar. Methodology: every capability traced UI → state → API/IPC → runtime → result →
persistence → UI, and classified COMPLETE / PARTIAL / UI_ONLY / BACKEND_ONLY / MOCKED /
DEAD / BROKEN / HIDDEN / DUPLICATED / NEEDS_VALIDATION with file:line evidence.

Read first: `apps/mobile/AGENTS.md` (mobile-app / mobile-native-store lanes; Local +
public-alpha Cloud only, **no BYOK**), `apps/mobile/app.config.js`, root
`docs/agent-context/known-flaws.md` (many mobile items already tracked there — this
report cross-checks and re-verifies current code state rather than re-discovering from
zero).

**Overall impression**: this is the most mature surface in the monorepo audited so far.
Engineering discipline is unusually high — extensive self-documenting comments explain
_why_ a boundary exists, `FEATURES` flags are commented with what's real vs gated, and
307 test files in `__tests__/` assert real behavior (mocking only the native boundary),
not snapshot-only smoke tests. Most gaps found are deliberately flagged in code/comments
as gated-pending-backend, not silently faked.

---

## 1. Navigation structure

- Expo Router (`expo-router`) file-based routing, typed routes
  (`experiments.typedRoutes: true`, `apps/mobile/app.config.js:412`).
- Root stack: `app/_layout.tsx` (Clerk provider, launch-splash hold/release, deep-link
  routing, MMKV init, background-task lifecycle, push registration).
- Auth split: `(public)` (age-gate, onboarding) → `(auth)` (login, reset-password) →
  `(app)` (authenticated/local area).
- `(app)/_layout.tsx` uses `expo-router/drawer` (`Drawer`), **not** a bottom tab bar —
  `(app)/(tabs)/_layout.tsx:1-22` explicitly hides the `Tabs` bar (`tabBar={() => null}`)
  and is "retained for route compatibility" only; real navigation is
  `src/features/drawer/components/DrawerContent.tsx` (COMPLETE — slide-out on phone,
  `drawerType: 'permanent'` on iPad via `useResponsiveLayout`).
- Drawer primary items: Chats, Projects, Library, Schedules (cloud-tagged), Remote
  (companion) — `DrawerContent.tsx:61-95`. "AGI Work" row conditionally shown
  (`showAgiWork = appMode==='cloud' && canUseBillingPlanCapability(tier,'agi_work')`,
  `DrawerContent.tsx:277`) navigating to `/(app)/agents` (the **cloud-tasks** screen,
  see §7, not the disabled legacy Agents feature).
- ~80 routes under `app/`. Every drawer-hidden `Drawer.Screen` still resolves via file
  routing; screens gated by `FEATURES.*` render `<FeatureUnavailable/>` instead of a
  blank/crash (verified pattern, §9).

## 2. Local vs Cloud vs BYOK — verified against AGENTS.md claim

**Claim in `apps/mobile/AGENTS.md`: "no direct provider-key entry." Confirmed true.**

- `grep -rn BYOK` across `src/services/stores` only finds _comments enforcing the
  absence_ of BYOK, never an implementation:
  `src/features/chat/utils/sessionLabeling.ts:10` ("Mobile has no BYOK mode"),
  `lib/v1FeatureFlags.ts` → `byokKeys: false` with comment "Legacy direct-provider
  credential entry is not exposed on Mobile."
  `__tests__/priority-level-1/security/auth-and-authz.test.ts` asserts stale tiers
  (`hobby`, `pro_plus`) map to `local`, not BYOK escalation.
- Local/Cloud boundary is enforced **inside the send path itself**, not just at the UI
  layer: `stores/chat/chatExecutionStore.ts:855-892` computes `executionMode` per
  conversation and hard-rejects a Cloud model in a Local-mode thread and vice versa
  before any network/inference call — COMPLETE, defense-in-depth (matches the
  AGENTS.md "Local to BYOK must be explicit fork" rule's spirit, applied to Local/Cloud
  since BYOK doesn't exist here).
- Local inference: `localGenerate()` from `@agiworkforce/local-llm`, invoked at
  `stores/chat/chatExecutionStore.ts:1446` with real streaming (`onToken` callback
  driving `updateLocalStream`), token-rate measurement, and abort-signal wiring.
  `src/features/model-picker/localModelRuntime.ts` resolves the on-device model file
  path from `storage/installedModels.ts`, throwing an actionable error
  ("not downloaded yet... open Models and download it") rather than silently no-oping
  when the model isn't on disk — COMPLETE.
- Cloud path: `services/streaming.ts`, Clerk-token-bridged (`ClerkTokenBridge` in
  `app/_layout.tsx`), gated by `FEATURES.cloudChat` (true, public alpha) and
  `getRemoteChatDisabledReason()` (`services/remoteChatGate.ts`), which itself respects
  the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch server-side.
- Routing (Auto mode): `src/features/chat/utils/cloudDispatchRouting.ts` is a thin,
  pure adapter into the **shared** `@agiworkforce/routing` package — same 5-turn
  sticky-pivot / >50K long-context guard as the web server
  (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, per the file's
  own comment) — cross-surface consistency is real, not just claimed.
- **Vision (image understanding) local route is honestly PARTIAL**:
  `src/features/image/services/vision.ts:1-20` documents three tiers (tier-3 GGUF+mmproj
  VL pack → tier-2 ExecuTorch VLM → OCR+text-LLM fallback) and states outright: _"The VL
  route stays dormant until the mobile GGUF+mmproj install path lands... today that path
  is device-QA-gated, so real devices resolve to OCR."_ Classification: **PARTIAL** — the
  routing/fallback logic is real and never fakes a result, but the top-tier local
  multimodal path is not reachable on shipping devices yet (self-disclosed).

## 3. Chat experience

- Composer: `src/features/chat/components/Composer/Composer.tsx`,
  `ChatInput.tsx` — attachments, voice button, model selector, mode toggle, send button
  all wired through `stores/chat/chatExecutionStore.ts` (3113 lines; the central
  send/stream/dispatch state machine for both Local and Cloud).
- Streaming: both local (`localGenerate` `onToken`) and cloud (`services/streaming.ts`
  SSE-style delta stream) paths update the same `streamingContent`/message-store shape,
  including live "thinking" timers (`thinkingStartTimes`) — COMPLETE.
- Message actions: edit (`MessageEditModal.tsx`), retry, copy
  (`CodeBlockCopyButton.tsx`), export (`ConversationExportSheet.tsx`,
  `FileExportButton.tsx`), quote-reply (`QuotedReplyBar.tsx`), report/flag
  (`ReportFlagButton.tsx` → `services/contentReport.ts`, real intake endpoint per
  `known-flaws.md` "MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01 — resolved").
- Model selection: `ModelSelectorButton.tsx` → `ModelPickerSheet.tsx` →
  `src/features/model-picker/store.ts`/`service.ts`/`catalogSelectability.ts` — catalog
  driven, tier-gated (`tierGuard.ts`), no hardcoded model IDs found in production code
  (only comments explaining _why_ IDs must come from the catalog, e.g.
  `src/features/chat/actions/mediaMode.ts:18`).
- Attachments: `AttachmentPreview.tsx`, `attachmentValidation.ts` — real size/type
  validation with actionable inline error text (not a placeholder), e.g.
  `attachmentValidation.ts:107-108` for cloud file-size limits.
- Approvals-in-chat: `src/features/chat/components/ApprovalCard.tsx`, wired at
  `MessageBubble.tsx:768-773` (`onApprove={handleApprove}`, `onReject={handleReject}`) —
  distinct from the companion/remote-desktop `AgentDashboard.tsx` `ApprovalCard` (two
  same-named components in different features, not a collision since neither imports
  the other — worth noting as a **naming DUPLICATION** risk for future maintainers, not
  a functional bug).
- Interactive cards, artifacts (`InlineArtifactCard.tsx`, `ArtifactFullScreen.tsx`,
  `SafeArtifactPreview.tsx` with `sandboxedArtifactHtml.ts`), math (`MathBlock.tsx`),
  citations (`CitationChip.tsx`, `CollapsibleSources.tsx`), web-search result cards,
  paywall bottom sheet (`PaywallBottomSheet.tsx`) — all present with dedicated tests
  under `src/features/chat/components/__tests__/`.

## 4. Voice, camera, OCR, translate — native modules

- **STT**: `src/features/voice/services/voiceInput.ts` — real `expo-speech-recognition`
  binding (iOS `SFSpeechRecognizer`, Android `SpeechRecognizer`), on-device-only mode
  documented ("Audio bytes do not leave the device when `requiresOnDeviceRecognition:
true`"). COMPLETE.
- **TTS**: `src/features/voice/services/tts.ts` — `expo-speech` system TTS, real
  promise-wrapped `Speech.speak` with race-condition guard (`Speech.stop()` before every
  speak). Comment: "Cloud TTS (ElevenLabs, OpenAI) can be added as a provider later" —
  honest about not shipping cloud TTS. `known-flaws.md` "MOBILE-VOICE-CLOUD-TTS-DISABLED"
  entry confirms this was previously mislabeled and was fixed to say "Cloud voice isn't
  available on mobile yet" rather than a misleading "Requires AGI Cloud access."
- **Camera**: `app/(app)/camera.tsx` — real `expo-camera` `CameraView`, capture → preview
  → prompt → `useChatStore().sendMessage()` with attachment. COMPLETE.
- **OCR / Vision native modules**: `native/ios/AGIVisionOCR.swift`/`.m`,
  `native/android/AGIVisionOCR.kt` + `withAGIVisionOCR.cjs` config plugin (injects ML Kit
  text-recognition Gradle dep + registers the package) — real native modules, wired
  into `src/features/image/services/ocr.ts` (used as vision fallback, §2).
- **Translate**: `native/ios/AGITranslate.swift` (Apple Translation framework,
  `NSTranslationUsageDescription` declared), `native/android/AGITranslateModule.kt` (ML
  Kit Translate) + `withAGITranslate.cjs`. `services/translateService.ts:73-75` calls
  `NativeModules['AGITranslate']` directly — real native bridge, not a stub. `app/(app)/
translate.tsx` is the UI. COMPLETE.
- **Tier-1 on-device LLM**: `native/android/AGIAICoreModule.kt` (ML Kit GenAI /
  AICore) + `native/ios/AGIFoundationModels.swift` (Apple Foundation Models) — both
  registered via config plugins, surfaced through `@agiworkforce/local-llm`'s
  `getSystemModelForTier1Runtime` (`src/features/model-picker/localModelRuntime.ts:29-31`).
- **Tier-3 universal**: `llama.rn` (GGUF via `llama.rn` Expo plugin,
  `app.config.js` plugins list) — models downloaded at runtime into
  `Documents/models/`, not bundled (per plugin comment).
- Document scan: `app/(app)/scan.tsx` — camera + OCR + prompt flow, same pattern as
  camera.tsx.

## 5. Deep links, universal links, App Intents / Siri, Android intents

- Universal Links (iOS): `associatedDomains: ['applinks:agiworkforce.com']` gated to
  production/preview entitlement builds (`app.config.js:44`), verified host allow-list
  in `src/integrations/universalLinks.ts` (`VERIFIED_UNIVERSAL_LINK_HOSTS =
{'agiworkforce.com'}`). Handled paths: `/pair`, `/pair/*`, `/auth/reset-password` — a
  code comment explains a prior incident where declaring the bare host swallowed
  _every_ marketing/docs/blog URL with no handler (dead-end), fixed by enumerating exact
  paths and pinning them to a regression test
  (`__tests__/android-intent-filters.test.ts`, which derives the expected set from the
  **web** side's `apps/web/lib/server/mobile-app-association.ts` — real cross-surface
  contract test, not independently hand-maintained).
- Android App Links: generated `android/app/src/main/AndroidManifest.xml` (read from
  disk) shows `autoVerify="true"` intent-filter for exactly those 3 paths, matching
  `app.config.js`'s `android.intentFilters` — VERIFIED consistent, COMPLETE.
- Share-sheet **in**: Android `SEND`/`PROCESS_TEXT` intent filters (text/plain only,
  intentionally — comment: "the app has no image ingestion path for shares, so image/\*
  must not be advertised"), rewired through `MainActivity.kt` by
  `native/android/withAGIShareIntent.cjs` into the `agiworkforce://intent/share` deep
  link (RN `Linking` doesn't surface raw intent extras, per comment). iOS: real Share
  Extension (`native/ios/AGIShareExtension/ShareViewController.swift`) writing to an App
  Group (`group.com.agiworkforce.app.share`), consumed via
  `src/features/share-preview/iosShareInbox.ts` → `NativeModules.AGIShareInbox` (native
  module confirmed present: `native/ios/AGIShareInbox.swift`/`.m`) — real cross-process
  handoff, not a stub. `app/(app)/share-preview.tsx` is the review UI. COMPLETE.
- Share-sheet **out**: `expo-sharing` plugin present; used from export/share flows
  (`ConversationExportSheet.tsx`, `FileExportButton.tsx`).
- Siri / App Intents (iOS): `native/ios/AGIAppIntents/*.swift` — 7 real `AppIntent`
  types (AskAGI, Summarize, AnalyzeImage, Transcribe, Translate, ScanIntent,
  SetReminderIntent, StartChat) plus `AppShortcuts.swift` phrase registrations and a
  dedicated test target (`AGIAppIntentsTests/`). Deep-link URL contract tested against
  the actual Swift source in `__tests__/app-intents-deeplink.test.ts` (reads
  `SetReminderIntent.swift` + `app/_layout.tsx` off disk and asserts the URL shapes
  agree) — genuinely verified wiring, not assumed. COMPLETE.
- **`app/(app)/widget-setup.tsx` — DEAD route.** File-level comment says the screen is
  "(defer)... TL has paused active development pending v1.1 widget work." The actual
  screen (`src/features/widget-setup/index.tsx`) was refactored to a _Siri Shortcuts_
  how-to (no home-screen widget claims — comment explicitly documents removing false
  Quick Actions/Control Center/widget claims that had no native target). But **no
  navigation entry point reaches it**: `rg -n "widget-setup"` across `app/` and `src/`
  finds only the route file itself, its own test, and the `Drawer.Screen` registration
  in `app/(app)/_layout.tsx:119` (hidden, `options={HIDDEN}`) — no `router.push`/`href`
  to `/widget-setup` anywhere in the drawer, settings, or onboarding. Classification:
  **DEAD** (reachable only by typing the URL manually / deep link that doesn't exist
  either).

## 6. Native home-screen widgets — absent, correctly not claimed

- No WidgetKit / Android App Widget provider code anywhere (`native/ios`, `native/
android` both searched — zero widget-kit files). `widget-setup` screen (§5) no longer
  claims widgets exist (comment explicitly documents this correction). Consistent, no
  false-availability badge found.

## 7. Remote control of Desktop agents ("Companion")

Genuinely one of the most complete features audited. Real WebRTC:

- `stores/connectionStore.ts` — `react-native-webrtc` (`RTCPeerConnection`,
  `RTCSessionDescription`, `RTCIceCandidate`), `SignalingClient` from
  `@agiworkforce/utils/signaling`, HMAC-signed control messages
  (`lib/dispatchHmac.ts`: `deriveDispatchSecret`, `signMessage`, `verifyMessage`),
  per-field payload validation (`lib/dispatchAgentValidator.ts`, capped at
  `MAX_AGENTS_PER_UPDATE`).
- Manual pairing (`services/manualPairing.ts`): real HTTP claim exchange
  (12-char code → 64-hex pair token → WS URL), explicit code comment that manual entry
  is _not_ chat/data egress — no Clerk token, chat content, or account metadata sent.
- `src/features/companion/components/DispatchTaskComposer.tsx` +
  `stores/dispatchTaskStore.ts` — dispatch task lifecycle (`sending` → server lifecycle
  states → terminal states `ready_for_review/completed/failed/cancelled/rejected`), gated
  by `FEATURES.dispatch: true` and "only when the paired Desktop has explicitly enabled
  Settings → Cowork → Dispatch" (comment, `v1FeatureFlags.ts`).
- QR pairing (`QRScanner.tsx`), connection quality/heartbeat (`services/heartbeat.ts`,
  `ConnectionQuality` type), approvals surfaced in `AgentDashboard.tsx` `ApprovalCard`
  (§3) driven by real `pendingApprovals` state from the connection store.
- **Legacy "Agents" desktop-monitor screens are correctly disabled and gracefully
  gated**: `FEATURES.agents = false` (comment: "Legacy Desktop-companion agent monitor
  and control screens"). Every consumer (`(tabs)/agents.tsx:65`, `agents/[id].tsx:306`,
  `companion/agent/[id].tsx:131`) checks the flag first and renders
  `<FeatureUnavailable feature="Agents" />` — no dead-end, no crash, no fake data behind
  the flag. Classification: **HIDDEN** (correctly, with an honest fallback UI), not
  broken.
- **Separate, currently-live "AGI Work" / Cloud Tasks screen** at `app/(app)/agents/
index.tsx` (same URL segment as the legacy tab route but a distinct file — Expo
  Router resolves `/(app)/agents` to `agents/index.tsx`, not `(tabs)/agents.tsx`) is
  gated on `FEATURES.cloudTasks = true` and calls
  `createMobileCloudAgentRunClient()` (`services/streaming.ts`) for real
  `CloudAgentRun` data (`@agiworkforce/cloud-contracts`). COMPLETE, and worth noting
  the **potential navigation-clarity risk**: two differently-gated "Agents" surfaces
  share almost-identical route naming (`(tabs)/agents` vs `agents/index`), which is a
  maintenance/confusion risk even though today's flag state resolves it correctly.

## 8. Billing / IAP

- Real StoreKit2/Play Billing via `expo-iap` (`app.config.js` plugins list; Android
  manifest confirms `com.android.vending.BILLING`).
- `src/features/billing/useMobileIap.ts:229,261` — real `iap.requestPurchase()` calls.
- Server round-trip verified: `src/features/billing/mobileIapService.ts:95` (`GET
/api/mobile/iap/catalog?platform=`) and `:104` (`POST /api/mobile/iap/verify`) — not
  a client-trust purchase flow; catalog product definitions are cross-checked against
  `getMobileIapProductDefinition()` (shared contract) before being trusted, guarding
  against a tampered/replayed catalog response (`parseCatalogProduct`,
  `mobileIapService.ts:20-43`).
- `FEATURES.billing = false` deliberately disables only the external Stripe "Manage
  billing" portal link (App Store Guideline 3.1.1 risk, per comment) — this does
  **not** disable native purchases, which are a separate code path. Read-only usage
  display (`FEATURES.usageDashboard = true`) is explicitly split out and marked "real
  data, not a stub; verified 2026-07-05" in the flag comment.
- `src/features/settings/cloud-usage/index.tsx:159` — "Usage dashboard coming soon" is
  reachable only if `FEATURES.usageDashboard` were false; today it's true, so this
  branch is dead in practice but present as an honest fallback if the flag flips.
  Classification: **HIDDEN** (flag-gated fallback copy, not currently shown).

## 9. Feature-flag gated surfaces (all verified honestly gated, not faked)

`lib/v1FeatureFlags.ts` is unusually well-commented; cross-checked each flag against its
guard sites:

| Flag                                                                                                               | Value | Guard sites checked                                                                                                                                             | Verdict                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `agents`                                                                                                           | false | `(tabs)/agents.tsx:65`, `agents/[id].tsx:306`, `companion/agent/[id].tsx:131`, `settings/auto-approve.tsx:56` (copy adapts)                                     | HIDDEN, correctly                                                             |
| `computerUse`                                                                                                      | false | `AddToChatSheet.tsx:137,772` (toggle hidden, not disabled-but-visible)                                                                                          | HIDDEN, correctly                                                             |
| `crossDeviceSync`                                                                                                  | false | `projects/service.ts:6`, `projects/[id].tsx:188` (cloud-store fallback still renders cloud projects correctly per in-code comment about a previously-fixed bug) | HIDDEN, correctly, with a documented prior-bug fix                            |
| `billing`                                                                                                          | false | `billing/service.ts:21` throws; `cloud-billing/index.tsx` conditionally renders manage-billing rows                                                             | HIDDEN (native IAP unaffected)                                                |
| `connectors`                                                                                                       | true  | `settings/cloud-connectors/index.tsx`                                                                                                                           | Real directory fetch, but **19/21 catalog providers 501 server-side** (§10)   |
| `dispatch`, `schedules`, `companion`, `skills`, `webSearch`, `research`, `imageGen`, `codeExecution`, `cloudTasks` | true  | spot-checked each has a real backend call site                                                                                                                  | COMPLETE per flag's own comment, not re-litigated individually here for space |

## 10. Connectors — PARTIAL, honestly surfaced

- `src/features/settings/cloud-connectors/index.tsx` fetches a real directory
  (`fetchConnectorDirectory()`), supports GitHub App install flow and encrypted custom
  remote-MCP connectors end-to-end.
- Per `known-flaws.md` (MOBILE-CONNECTORS-501, low severity, still open as of this
  read): ~19/21 catalog providers' "Connect" button shows an honest "Coming soon" alert
  because the server `POST /api/connectors` returns 501 for those providers — verified
  still true in current code: `cloud-connectors/index.tsx:510` (`'Coming soon'`) and
  `:612` (rendered "Coming soon" badge). This is **backend-truthful UI**, not fake
  functionality — the gap is server-side per-provider OAuth registration, out of mobile
  scope. Classification: **PARTIAL** (client fully wired; most providers
  **BACKEND_ONLY-unimplemented**, correctly disclosed rather than faked).

## 11. Memory

- Local: SQLite-backed (`storage/memory.ts`), consolidation/compaction services
  (`src/features/memory/services/consolidation.ts`, `memoryCompactor.ts`), RAG chunking
  and indexing for local semantic recall (`ragChunker.ts`, `ragIndex.ts`).
- Cloud: **physically separate** MMKV namespace (`stores/memory/cloudMemoryStore.ts`,
  namespace `'memory-store-cloud'`) with a hard-rule comment that local/cloud memory
  "MUST NEVER co-mingle" — client-generated UUIDv7 IDs, server compare-and-swap
  versioning, tombstone-based delete propagation (`isDeleted` flag retained until
  server ack). This is a serious, correct offline-sync design, not a toy.
- Per-turn injection: `buildPersonalContextBlocks()`
  (`src/features/memory/services/personalContext.ts`) bounds memory injection
  (`MAX_MEMORY_FACTS=50`, `MAX_MEMORY_TOTAL_CHARS=8000`) and fences untrusted memory
  content (`fenceUntrustedMemoryContent`) before it reaches the model — a real
  prompt-injection mitigation, not just documentation.
- `app/(app)/settings/memory.tsx`, `memory-summary.tsx`, `memory-import.tsx` are all
  present with distinct real flows (search, summary, import).

## 12. Projects

- Local projects (on-device, `src/features/projects/store.ts`) vs Cloud-synced
  projects (`stores/projects/cloudProjectStore.ts`,
  `stores/projects/projectSyncStateStore.ts`) — both real, `projects/[id].tsx` renders
  the correct header per project provenance (§9 table, `crossDeviceSync` note).
- `(tabs)/projects.tsx` — create/search/instructions UI, real form fields (not
  placeholder-only stubs — the `placeholder=` hits in the earlier grep are genuine
  `TextInput` placeholder props, not "TODO" markers).

## 13. Settings surface (extensive; spot-checked, not exhaustively re-audited per screen)

~35 settings screens under `app/(app)/settings/`. Notable:

- `settings/permissions/` — **deliberately excludes Location**: `types.ts` and
  `registry.ts` both carry an explicit comment that a prior `location` entry with stub
  adapters (hard-returning `'undetermined'`, no real `expo-location` dependency) was
  **removed** rather than left half-wired: _"A half-wired permission in the type
  registry is worse than none... re-adding location means adding the dependency and a
  real adapter together, never the type alone."_ This is exactly the discipline
  `CLAUDE.md`'s "Finish what you start" rule asks for, applied retroactively — good
  finding to cite as a positive precedent, not a defect.
- `settings/cloud-connectors/AddCustomConnectorModal.tsx` — real custom MCP connector
  entry (name, SSE URL, optional auth token) posting to a real endpoint (§10).
- `settings/shared-links.tsx` — comment states this _used_ to ship as a "Coming soon"
  placeholder and was fixed because that was "wrong twice" (implies real sharing now
  exists); not independently re-verified end-to-end in this pass — flag for
  **NEEDS_VALIDATION** if shared-links parity matters to the audit's next phase.
- `settings/performance.tsx:442` — "Build a minimal generate stub that drives the
  inference" is a benchmarking harness comment (perf-test scaffold), not a
  user-facing fake feature — reviewed the surrounding code and it invokes the real
  local-inference path to measure tokens/sec, so "stub" here means "minimal input,"
  not "fake output."

## 14. Edge cases, offline, error, empty states

- `services/offlineQueue.ts` — real MMKV-persisted FIFO retry queue, exponential
  backoff (1s/2s/4s capped), account-provenance-scoped (`OfflineQueueProvenance`) so a
  queued Local-mode message never retries against a since-switched Cloud account.
- `src/features/edge-cases/components/OfflineBanner.tsx` — the **only** edge-case
  component actually mounted (`app/_layout.tsx` imports and renders it directly).
- **Finding — a whole edge-case UX library is built, unit-tested, and never mounted
  anywhere in the app:**
  `BatteryLowModal.tsx`, `ThermalThrottleModal.tsx`, `StorageFullModal.tsx`,
  `ModelLoadingFirstRunModal.tsx`, `FileTooLargeModal.tsx`, `ImageTooLargeModal.tsx`,
  `FileUnreadableModal.tsx`, `MessageErrorScreen.tsx`, `CloudTeaseModal.tsx` — all in
  `src/features/edge-cases/components/`, all exported from the barrel
  (`src/features/edge-cases/index.ts` → `components/index.ts`), all with locked copy in
  `copy.ts`, all covered by `__tests__/edge-cases.test.tsx` (renders the component in
  isolation + asserts CTA callback fires). `rg` across `app/` and `src/` for each
  component name (excluding the edge-cases directory and its own test/copy files)
  returns **zero** import sites. Cross-checked the real failure paths these were
  presumably meant to cover: `attachmentValidation.ts:107-108` handles "file too large"
  via **inline error text in the composer**, not `FileTooLargeModal` — confirming a
  second, different mechanism actually ships for that case, and the modal component is
  superseded/unused rather than pending integration. No battery/thermal-state listener
  (e.g. `expo-battery`, native thermal API) was found calling
  `BatteryLowModal`/`ThermalThrottleModal` at all — there is no trigger condition wired
  to fire them even if they were mounted.
  **Classification: DEAD** (built + tested in isolation, never reachable by a user).
  This is a legitimate "half-wired capability" under `CLAUDE.md`'s finish-what-you-start
  rule — the UI exists but reaches nothing, and (for Battery/Thermal specifically)
  there's also no sensor wired on the other end.

## 15. Dead code (non-edge-case)

- **`src/features/sidebar/**`— confirmed DEAD.**`Sidebar.tsx`, `ConversationList.tsx`,
`ConversationItem.tsx`, `SearchBar.tsx`, `SidebarHeader.tsx`, `TagFilter.tsx`,
`AutoTagBadge.tsx`—`rg -n "from '@/src/features/sidebar"`across the entire app
returns zero hits outside the directory itself. Live navigation is`DrawerContent.tsx`(§1); this appears to be a superseded pre-drawer sidebar
implementation. Already flagged in`known-flaws.md` as a cleanup item, confirmed
  still present and still unreferenced in this read.
- `app/(app)/widget-setup.tsx` — DEAD route, no entry point (§5).

## 16. Tests

- 307 files under `__tests__/`, organized including a `priority-level-1/security/`
  tier (`auth-and-authz.test.ts`, `data-isolation.test.ts`, `privacy-boundary.test.ts`,
  `provider-routing.test.ts`).
- Spot-checked `data-isolation.test.ts`: exercises the **real** `secureStorage` adapter
  (`lib/secureStorage`) with only the native `expo-secure-store` module mocked at the
  boundary — asserts device-only Keychain flag, key-sanitization against path-traversal
  (`../../etc/passwd` → `.._.._etc_passwd`), locked-keychain-returns-null (not throw),
  and write-failure propagation (doesn't swallow). This is genuine security-relevant
  test coverage, not a rubber-stamp smoke test.
- `__tests__/app-intents-deeplink.test.ts` reads real Swift source
  (`native/ios/AGIAppIntents/SetReminderIntent.swift`) and `app/_layout.tsx` off disk to
  assert the deep-link URL contract both sides agree on — an actual cross-language
  consistency check, unusual and valuable.
- `__tests__/android-intent-filters.test.ts` derives its expected value from the
  **web** surface's `mobile-app-association.ts`, catching drift between what the app
  declares and what the web AASA/assetlinks endpoints actually serve.
- Known pre-existing test-infra gap (from `known-flaws.md`, re-confirmed applicable):
  `jest.setup.js` mocks reanimated/worklets/expo-notifications/webview but not
  `expo-secure-store`; any suite whose import graph touches a SecureStore-backed store
  outside a test that mocks it itself will fail to run standalone. Not re-verified via
  an actual `jest` invocation in this read-only pass (no test execution performed) —
  flagged as **NEEDS_VALIDATION** if the audit's next phase runs the suite.

## 17. Store-listing / release readiness (tracked separately, cross-referenced)

Not app code, but affects "is this shippable": `known-flaws.md` lists three still-OPEN
mobile store-listing items as of this read: `MOBILE-STORE-LISTING-NATIVE-BILLING-COPY`
(operator-blocked), `MOBILE-IOS-SCREENSHOTS-INCOMPLETE`, and
`MOBILE-STORE-LISTING-FOUNDER-PHONE` (founder-blocked). These are outside `apps/mobile`
code proper (`store-listing/` copy/screenshots) but block store submission; listed here
for completeness since the task scope included "store metadata."

## 18. Cross-surface tier-naming issue — verified RESOLVED on mobile

`known-flaws.md`'s `WEB-TIER-NAMING-HOBBY-STALE-01` (2026-07-16) called out
`apps/mobile/services/api.ts` and `services/streaming.ts` defaulting `requiredTier` to
the removed `'hobby'` tier. Re-checked current code: `services/api.ts:346` now defaults
to `'basic'`, `services/streaming.ts:394` now defaults to `'pro'`. The only remaining
`hobby` references in `apps/mobile` are in **tests**, deliberately checking that the
removed tier is handled safely (`trust-boundary.test.ts:126-131`,
`priority-level-1/security/auth-and-authz.test.ts:37-40`, "no privilege escalation from
removed tiers"). **Mobile side of that cross-surface issue is resolved**; whether
web/CLI legal-copy sides are still stale is outside this scope (see the web/CLI
inventories).

---

## Summary table

| Area                                                             | Classification                           | Evidence                                                   |
| ---------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Local on-device inference                                        | COMPLETE                                 | `chatExecutionStore.ts:1446`, `localModelRuntime.ts`       |
| Cloud chat (public alpha)                                        | COMPLETE                                 | `streaming.ts`, `remoteChatGate.ts`, kill-switch respected |
| BYOK                                                             | Absent (correctly, per AGENTS.md)        | `v1FeatureFlags.ts` `byokKeys:false`, no impl found        |
| Local↔Cloud boundary enforcement                                 | COMPLETE                                 | `chatExecutionStore.ts:855-892`                            |
| Vision — OCR fallback                                            | COMPLETE                                 | `image/services/ocr.ts`, native OCR modules                |
| Vision — on-device VL (tier-3)                                   | PARTIAL (self-disclosed dormant)         | `image/services/vision.ts:1-20`                            |
| STT / TTS                                                        | COMPLETE                                 | `voice/services/voiceInput.ts`, `tts.ts`                   |
| Cloud TTS                                                        | Not shipped, honestly labeled            | `tts.ts` comment, known-flaws entry                        |
| Camera / scan / OCR                                              | COMPLETE                                 | `camera.tsx`, `scan.tsx`                                   |
| Native translate                                                 | COMPLETE                                 | `translateService.ts:73-75`, native modules                |
| Universal/App Links                                              | COMPLETE                                 | `universalLinks.ts`, manifest cross-check                  |
| Share sheet in (iOS ext + Android intents)                       | COMPLETE                                 | `AGIShareInbox`, `withAGIShareIntent.cjs`                  |
| Siri / App Intents                                               | COMPLETE                                 | `AGIAppIntents/*.swift` + deep-link test                   |
| Home-screen widgets                                              | Absent, correctly not claimed            | no WidgetKit/AppWidget code found                          |
| `widget-setup` screen                                            | DEAD                                     | no nav entry point                                         |
| Remote control of Desktop (companion)                            | COMPLETE                                 | `connectionStore.ts` real WebRTC/HMAC                      |
| Legacy Agents monitor                                            | HIDDEN (flagged off, graceful)           | `FEATURES.agents=false` + `FeatureUnavailable`             |
| Cloud Tasks / "AGI Work"                                         | COMPLETE                                 | `agents/index.tsx`, `cloudTasks:true`                      |
| IAP / native billing                                             | COMPLETE                                 | `useMobileIap.ts`, server verify round-trip                |
| Connectors                                                       | PARTIAL                                  | directory real; 19/21 providers 501 server-side            |
| Memory (local + cloud sync)                                      | COMPLETE                                 | physically separated stores, CAS + tombstones              |
| Projects (local + cloud)                                         | COMPLETE                                 | correctly gated `crossDeviceSync`                          |
| Offline queue                                                    | COMPLETE                                 | `offlineQueue.ts`                                          |
| Edge-case UX library (battery/thermal/storage/file-error modals) | DEAD                                     | zero import sites, no sensor trigger                       |
| `src/features/sidebar/**`                                        | DEAD                                     | superseded by drawer, zero imports                         |
| Permissions registry                                             | COMPLETE, Location deliberately excluded | `permissions/registry.ts`, `types.ts`                      |
| Tests                                                            | Real behavioral coverage                 | `data-isolation.test.ts`, `app-intents-deeplink.test.ts`   |
| Tier-naming (`hobby`) cross-surface bug                          | RESOLVED on mobile                       | `api.ts:346`, `streaming.ts:394`                           |

---

## Files most worth a maintainer's attention (highest-signal for follow-up)

- `apps/mobile/src/features/edge-cases/components/` (9 of 10 components dead — either
  wire them up or delete them; §14)
- `apps/mobile/src/features/sidebar/**` (dead, superseded; §15)
- `apps/mobile/app/(app)/widget-setup.tsx` + `src/features/widget-setup/index.tsx`
  (dead route; either link it from Settings or drop it; §5)
- `apps/mobile/src/features/settings/cloud-connectors/index.tsx:510,612` (19/21
  providers still 501 server-side; tracked, not a mobile-side bug; §10)
- `apps/mobile/src/features/image/services/vision.ts` (top-tier on-device VL path
  dormant pending device QA; §2)
