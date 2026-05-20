# GAP-MOBILE — `apps/mobile/` vs Anthropic Claude iOS + Android (May 2026)

> **Method.** Read every authoritative source under `apps/mobile/` (43 screens, ~140 components, 27 services, 16 stores, 9 lib helpers) and triangulated against the canonical reference at `tasks/research/anthropic-claude-suite-may-2026.md` §6 (Claude Mobile), §3 (Cowork incl. §6.5 Dispatch), §1.5 (Skills), §1.6 (Memory), §1.4 (Connectors directory), §B (feature × surface matrix). All file:line citations are absolute paths. No reference iOS/Android screenshots exist in the corpus (ui-08 explicitly flags this) — claims here are based on Anthropic's docs + product release notes (ChatGPT/Gemini/Claude convergence on the bottom-tab nav + composer-`+`-button + voice-mode-orb pattern is the de-facto baseline).
>
> **Reference-corpus screenshot gap (ui-08).** `~/Desktop/reference/ui/` has 219 PNGs covering Claude Desktop, Codex CLI, ChatGPT-web, Gemini-web, Perplexity-web — and **zero** Claude/ChatGPT/Gemini _mobile_ screenshots. Every mobile finding here is sourced from textual references, not visual diff.

---

## Have (one line each)

- **Drawer navigation** — 6 primary destinations (`Chat`, `Skills`, `Projects`, `Dispatch`, `Connectors`, `Settings`) at `components/drawer/DrawerContent.tsx:32-38`; permanent-on-iPad / overlay-on-iPhone toggle at `app/(app)/_layout.tsx:38`. (Pivot away from bottom tabs is a deliberate decision.)
- **Composer with `+` menu** — `ChatInput.tsx:35-352` opens `AddToChatSheet.tsx` exposing Camera / Photos / File / Skills, plus chat-mode (Chat/Research/Create), agent mode (Ask/Auto/Plan/Bypass), Effort axis, Auto-approve cycle, Temporary chat, Web search / Image gen / Health toggles, Project picker, Style picker, Tool access (Auto/On-demand/Always), Connectors entry.
- **Voice input button (3 gestures)** — `components/voice/VoiceInputButton.tsx:35-342`: tap = Whisper STT, hold ≥300ms = Deepgram PTT (with backend-minted ephemeral token + Whisper fallback), long-press = full voice-mode.
- **Voice conversation orb (full-screen)** — `components/voice/VoiceConversationScreen.tsx:1-407` with idle / listening / thinking / speaking phases, animated waveform, mute, end-call, swipe-down-to-dismiss; auto-listens after AI finishes speaking.
- **Voice presets (5)** — `lib/voicePresets.ts:12-53` (Aurora, Nova, Sage, Ember, Atlas) mapped to system TTS voices via keyword heuristic.
- **Push notifications with 4 priority tiers** — `services/notifications.ts:63-104` (critical/high/normal/low; per-Android-channel + iOS time-sensitive + DnD bypass on critical).
- **In-app notification center** — `services/notifications.ts:439-525` (50-item ring buffer + `useNotificationCenter` hook + dedicated screen at `app/(app)/notifications/index.tsx`).
- **Push-token registration flow** — `services/notifications.ts:149-199` POSTs Expo push token + device id to `/api/mobile/push-token` after auth gate is settled.
- **Background fetch** — `services/backgroundFetch.ts:26-85` polls `/api/mobile/agent-status` every interval, fires generic-count approval notification (lock-screen privacy-safe).
- **Dispatch (mobile→desktop persistent thread)** — `app/(app)/dispatch/index.tsx:1-589` with desktop-status header (latency badge), task-result cards (working/completed/failed), QR pairing prompt, offline queueing banner, clear-thread, deep-link from `agiworkforce://pair/<code>` and HTTPS App-Link at `_layout.tsx:286-312`.
- **Dispatch realtime** — `services/dispatchRealtime.ts` subscribes to Supabase Realtime channel; `subscribeToDispatch` lifecycle wired in `_layout.tsx:189-205`.
- **Dispatch HMAC signing** — `lib/dispatchHmac.ts` (CRIT-MOB-02 fix), salt at `lib/dispatchAgentValidator.ts`. (Cross-surface gap: desktop has zero implementation per MEMORY.md §apps/mobile.)
- **QR-code pairing** — `components/companion/QRScanner.tsx` + `app/(app)/companion/index.tsx:1-610` with full state machine: disconnected / connecting / connected / stale / reconnecting / session_expired / error; reconnect countdown banner, manual reconnect, Cmd+J-style heartbeat indicator, demo walkthrough.
- **Approval modal + audit logging** — `components/shared/ApprovalModal.tsx` + `useApprovalModal` + `services/heartbeat.ts:logApprovalDecision()` writes user_id / tool / approve|reject / reason to backend.
- **Camera capture** — `app/(app)/camera.tsx:1-100+` with flash, retake, quality 0.85, prompt input, vision-AI send-to-new-conversation flow.
- **Photo library + multi-select** — `(tabs)/chat.tsx:126-156` via `expo-image-picker.launchImageLibraryAsync` (5-photo limit, ordered selection).
- **File picker** — `(tabs)/chat.tsx:158-173` via `expo-document-picker` (pdf, doc, docx, txt, csv whitelist).
- **Recording overlay** — `components/voice/RecordingOverlay.tsx` shows live waveform + duration + cancel/send while user speaks.
- **Memory CRUD UI** — `app/(app)/settings/memory.tsx:1-348` with search, 6-category filter (All/Coding/Research/Writing/Preferences/General), pull-to-refresh, sync button, FAB add, edit/delete via `MemoryItem` + `AddMemorySheet`.
- **Memory backend service** — `services/memory.ts` calls `/api/memory*` (list, create, update, delete, search, sync).
- **Projects UI** — `app/(app)/(tabs)/projects.tsx:1-305` with create/edit modal (name, description, custom instructions), active-project chip, long-press → edit/delete.
- **Project selector bar in chat** — `components/chat/ProjectSelectorBar.tsx`.
- **Settings (5 groups, 18 items)** — `(tabs)/settings.tsx:267-429`: Account (Profile, Subscription, Usage), AI Configuration (Default Model, Capabilities, Auto-Approve), Connections (Desktop Pairing, Connectors), Preferences (Appearance, Voice & Language, Notifications, Personalization, Haptic), About (Help, Privacy, Terms, Sign out, Version).
- **Capabilities sub-screen** — `app/(app)/settings/capabilities.tsx:32-138` with 4 toggles: Web Search / Image Gen / Memory / Desktop Control.
- **Auto-approve sub-screen** — `app/(app)/settings/auto-approve.tsx`.
- **Personalization sub-screen** — `app/(app)/settings/personalization.tsx` (mirrors Claude's "What should Claude call you").
- **Connectors browser (11 connectors / 4 categories)** — `components/connectors/connectorData.ts:78-152` (Google Drive, Dropbox, OneDrive, GitHub, Linear, Jira, Notion, Slack, Teams, Gmail, Google Calendar) at `app/(app)/connectors/index.tsx`.
- **Style picker (4 styles)** — `StyleSelector.tsx:14-23` (Normal, Concise, Detailed, Creative).
- **Effort picker (4 levels)** — `AddToChatSheet.tsx:75-76` (low / medium / high / max), gated on `provider.supportsEffort`.
- **Agent modes (4)** — Ask / Auto / Plan / Bypass per `AddToChatSheet.tsx:75`.
- **Temporary chat toggle** — `components/chat/TemporaryChatToggle.tsx` + `AddToChatSheet.tsx:611-644` (Anthropic-style Incognito; purple `EyeOff` chip).
- **Schedules** — `app/(app)/schedules/{index,create}.tsx`, `services/schedules.ts`, `stores/scheduleStore.ts`, recurrence picker, run history.
- **Slash-command palette (4 commands)** — `CommandPalette.tsx:21-46`: `/image`, `/voice`, `/compare`, `/export`.
- **Image generation** — `services/imagegen.ts` calls API gateway with DALL-E 3 / GPT Image 1 / SDXL routing; `ImageGenProgress.tsx`, `GeneratedImage.tsx`, `ImageFullScreen.tsx` UI.
- **TTS playback** — `services/tts.ts` + `useVoicePlayback` hook auto-speaks completed assistant messages in chat detail (`chat/[id].tsx:106-127`).
- **Conversation export sheet** — `ConversationExportSheet.tsx` + `services/fileCreation.ts` exports PDF / Text / Markdown / Copy-all via `expo-print` + `expo-sharing`.
- **Compare-models screen** — `app/(app)/compare.tsx` runs two model streams side-by-side with TTFT + token count metrics.
- **Cross-device conversation sync** — `services/conversationSync.ts` + `MobileSyncService.startBackgroundSync` wired in `_layout.tsx:215-245` (3-device merge against Supabase).
- **Realtime sync** — `services/realtime.ts` subscribes to conversations/messages tables.
- **Biometric gate** — `hooks/useBiometricGate.ts` + `lib/biometricFlagStore.ts` + `expo-local-authentication`; cold-start lock screen at `_layout.tsx:469-506`.
- **Encrypted MMKV storage** — `lib/mmkv.ts:initMmkvEncryption` (key from SecureStore).
- **Deep-link handlers** — `_layout.tsx:286-396` for `agiworkforce://pair/...`, HTTPS App-Link `agiworkforce.com/pair`, HTTPS App-Link `agiworkforce.com/auth/reset-password` (PKCE + legacy-fragment fallback).
- **Share-intent inbound** — `_layout.tsx:404-429` parses `text/plain` + `image/*` shares to `share-preview.tsx` (sanitizes, length-caps to 100 KB, wraps in `<shared_via_intent>` XML tag).
- **Markdown rendering** — `MessageContentRenderer.tsx` + `lib/markdown.ts`.
- **Inline artifact card** — `InlineArtifactCard.tsx`, full-screen viewer at `ArtifactFullScreen.tsx` for code/email/research/image/chart/document.
- **Citation chips + collapsible sources** — `CitationChip.tsx`, `CollapsibleSources.tsx`.
- **Thinking line + bottom sheet** — `ThinkingLine.tsx` (collapsed) + `ThinkingBottomSheet.tsx` (expanded reasoning).
- **Tool-call card + status step** — `ToolCallCard.tsx`, `StatusStep.tsx`.
- **Approval card inside chat** — `ApprovalCard.tsx`.
- **Quoted-reply bar** — `QuotedReplyBar.tsx` (`> Speaker: text\n\n` prefix injected at send-time).
- **Message reactions (thumbs up/down) + edit + retry + delete** — `MessageBubble.tsx:111-` (double-tap cycles).
- **Conversation tag-filter chips** — `components/sidebar/{TagFilter,AutoTagBadge}.tsx` + `services/autotag.ts`.
- **Conversation search** — `(tabs)/chat.tsx:206-212` + `useChatStore.searchConversations`.
- **Network status banner** — `hooks/useNetworkStatus.ts` + offline placeholder + `services/offlineQueue.ts`.
- **Paywall bottom sheet** — `PaywallBottomSheet.tsx` triggered by chatStore `paywallError`.
- **Pro+ paywall card** — `components/Paywall/ProPlusPaywall.tsx` + `components/billing/UpsellCard.tsx`.
- **Tier guard** — `services/tierGuard.ts`, `stores/tierStore.ts`, refresh on app foreground at `_layout.tsx:107-120`.
- **TLS pinning** — `lib/pinning.ts`, `services/secureFetch.ts`.
- **Apple authentication** — `expo-apple-authentication` declared in `package.json:31` + `app.json:85` (Sign in with Apple compliance for App Store).
- **Calendar + Contacts permissions** — `expo-calendar`, `expo-contacts`, `services/deviceIntegrations.ts`.
- **External-URL allowlist** — `lib/safeOpenURL.ts` blocks `intent://`, `javascript:` redirects.
- **Drawer recents (last 5 conversations)** — `DrawerContent.tsx:177-205`.
- **Conversation starters (6)** — `ConversationStarters.tsx:17-49` (Write Code, Write Content, Research, Brainstorm, Analyze, Explain).
- **Notification preferences** — `app/(app)/settings/notifications.tsx` + `stores/notificationPrefsStore.ts`.
- **Companion demo walkthrough** — `components/companion/CompanionDemoWalkthrough.tsx`.
- **Agent dashboard inside companion** — `components/companion/AgentDashboard.tsx`, execution stream at `ExecutionStream.tsx`, tool timeline at `agents/ToolTimeline.tsx`.
- **Health-data bridge (iOS only via HxF app)** — `services/healthData.ts:1-176` reads `/api/health-context` snapshot; gated behind `EXPO_PUBLIC_FEATURE_HEALTH_CONTEXT` (default off pending backend).
- **Messaging integrations screen** — `app/(app)/messaging/index.tsx` + `services/messaging.ts` for Slack/Teams-flavoured external messaging connectors.

---

## Partial (gap detail + effort)

### 1. Bottom-tab nav (Anthropic ships) — **PARTIAL: replaced with drawer**

- **What Anthropic has (§6.1):** Bottom-tab nav: Chats, Projects, Artifacts (gallery), Settings.
- **What we have:** Drawer-only — bottom tabs hidden at `(app)/(tabs)/_layout.tsx:14-15`. Routes preserved for compat; tab bar is `display: none`. The drawer has six destinations but no Artifacts gallery destination.
- **Gap:** No Artifacts gallery view. Different navigation paradigm — defensible but a UX departure from competitors. Tablet behavior (permanent drawer) is correct mirror of claude.ai web.
- **Effort:** 0.5d if we want to add an Artifacts route to the drawer; 2d to add a hybrid drawer-on-iPhone-bottom-tabs-when-explicitly-opted-in pattern.

### 2. Composer voice-mode orb — **PARTIAL: behind long-press, not first-class icon**

- **What Anthropic has (§6.1):** Composer fixed-bottom with `+` (camera, photo library, file, voice, connectors), `microphone` (push-to-talk transcription), `sound-wave` (full-duplex voice mode beta) as **three discrete buttons**.
- **What we have:** One unified mic button at `VoiceInputButton.tsx:35-99` triple-mode (tap / hold / long-press). Voice-mode is opened only by long-press ≥600ms. No always-visible "sound-wave" icon next to mic.
- **Gap:** Discoverability. New users won't know long-press opens voice mode. Anthropic's UX is "one tap to enter voice mode."
- **Effort:** 1d — split into separate mic + sound-wave buttons; minor layout work in `ChatInput.tsx`.

### 3. Voice mode language coverage — **PARTIAL: English-keyword presets only**

- **What Anthropic has (§6.2):** "Multiple voices on mobile; English-only beta."
- **What we have:** 5 preset voices (`voicePresets.ts:12-53`) but the keyword matcher is hardcoded English (`v.language.startsWith('en')`). Ranges from Aurora (warm/clear) → Atlas (deep/resonant) — equivalent variety.
- **Gap:** Same English-only constraint as Anthropic, but no localization scaffolding (no `i18n` package wired) — when Anthropic expands, we'd lag.
- **Effort:** 0.5d minimum for non-English voice keyword tables; multi-day to fully localize.

### 4. Voice mode TTS quality — **PARTIAL: `expo-speech` system TTS, no ElevenLabs/OpenAI**

- **What Anthropic has:** Anthropic-managed cloud TTS (high quality, neural).
- **What we have:** `services/tts.ts:1-50` uses `expo-speech` (system iOS/Android voices). Comment at `tts.ts:1-7` says "Cloud TTS (ElevenLabs, OpenAI) can be added as a provider later."
- **Gap:** Robotic on Android stock voices; no streaming TTS; voice variety limited to OS voices.
- **Effort:** 3-5d — wire ElevenLabs streaming TTS through API gateway, add token-streaming support to `VoiceConversationScreen.tsx:243-264`.

### 5. Push-to-talk transcription — **PARTIAL: works, but Deepgram backend dependency**

- **What Anthropic has:** Built-in PTT in composer.
- **What we have:** PTT path at `VoiceInputButton.tsx:158-229` via Deepgram Nova-3 with backend-minted ephemeral tokens (`services/voice.ts:19-46`). Falls back to server Whisper if backend unavailable.
- **Gap:** Two-layer dependency (backend + Deepgram) is fragile. No on-device transcription fallback.
- **Effort:** 2d — wire Apple Speech Framework / Android SpeechRecognizer for offline fallback path.

### 6. Push notifications — **PARTIAL: Expo Push only, no APNs/FCM tokens directly**

- **What Anthropic has (§6.4):** Native APNs/FCM push for Cowork-task-completed, Dispatch-result, Code-Remote-Control-needs-review, scheduled-task-ready.
- **What we have:** Expo Push (`getExpoPushTokenAsync` at `services/notifications.ts:177`), 4 priority tiers, all 4 trigger types implemented (task_completed, agent_approval_needed, agent_failed, schedule_triggered, companion_connected, chat_message). Categorization logic at `notifications.ts:610-630`.
- **Gap:** Going through Expo's push relay adds latency + a third-party dependency. EAS-managed certs only.
- **Effort:** 5-7d to migrate to native APNs + FCM with raw tokens (significant infra work).

### 7. Dispatch flow — **PARTIAL: mobile end shipped, desktop end missing**

- **What Anthropic has (§6.5):** Persistent single-thread chat in Cowork that lives on phone + executes on desktop. Pair via QR. Three access tiers: files-only / browser / full computer use. Live tool-call feed + push on completion.
- **What we have:** `app/(app)/dispatch/index.tsx:1-589` is the most complete Dispatch UI of any open-source clone. QR pairing scanner + status header + connection state machine + result cards + offline queue + clear-thread.
- **Gap (per MEMORY.md §apps/mobile):** "**desktop has zero implementation of `dispatchHmac`/`dispatchSalt`; transitional unsigned-message path expires 2026-06-05**." Mobile is ready; desktop side is not. Also: no Cowork-style 3-tier access scope picker (files-only / browser / full computer use) — current pairing grants implicit full access.
- **Effort:** Outside this scope (desktop work). Mobile-side: 1d to wire 3-tier scope-picker UI in pairing flow.

### 8. Pairing — **PARTIAL: QR flow works, no Cowork-tier scope choice**

- **Reference (§3.1):** Cowork onboarding has 5 steps including "Allow computer use? per-app gating consent" + "Keep your computer awake while Claude works."
- **What we have:** `companion/index.tsx:436-475` Disconnected view with QR scan + 3-step instructions. No tier-of-access prompt. Demo walkthrough exists at `CompanionDemoWalkthrough.tsx`.
- **Gap:** Per-app permission UI is desktop-side; mobile pairing implicitly grants whatever the desktop offers. No "Allow computer use?" mobile prompt.
- **Effort:** 1d for mobile-side scope chooser if we add per-tier permissioning to the pairing protocol.

### 9. Health connector iOS-only — **PARTIAL: indirect via HxF companion app**

- **What Anthropic has (§6.7):** Native HealthKit on iOS, Health Connect on Android 14+. US-only Pro/Max.
- **What we have:** `services/healthData.ts:1-176` reads from a separate iOS-only "HxF" companion app via `/api/health-context` REST endpoint. Mobile does NOT bind directly to HealthKit (no `expo-health-kit` import). Backend endpoint `/api/health-context` does not exist (`services/healthData.ts:60-65` flag-gated off by default).
- **Gap:** Three-deep dependency chain (HxF app → HxF backend cache → our backend → mobile app). Not direct, not US-only-gated, not Android-supported. Anthropic's pattern is direct HealthKit/HealthConnect read.
- **Effort:** 3-5d for direct HealthKit binding (custom EAS dev-client + native module); 5-7d for Health Connect parity (Android 14+).

### 10. Settings — **PARTIAL: no Privacy / Memory / Connectors / Claude Code tabs**

- **Reference (§1.2):** claude.ai settings has 10 tabs incl. Privacy, Capabilities, Connectors, Claude Code, Profile/Personalization.
- **What we have:** 5 groups / 18 items; missing: Privacy tab (model-training opt-out), Connectors tab (lives at `/(app)/connectors` separately), Billing tab (deferred to subscription portal URL), Claude-Code tab.
- **Gap:** No org/seat model (Team/Enterprise N/A on mobile per Anthropic), but consumer Privacy controls are absent.
- **Effort:** 2d — add Privacy tab + Memory tab redirect; integrate Connectors visually under settings.

### 11. Memory UI — **PARTIAL: full CRUD but no Pause / Reset / Import**

- **Reference (§1.6):** Settings → Memory has list + per-row delete + "Reset memory" + "Pause memory" + import-from-ChatGPT/Gemini/Grok at `claude.com/import-memory`.
- **What we have:** `settings/memory.tsx:1-348` has full CRUD + search + 6-category filter + sync. Missing: Pause toggle, hard Reset button, import flow.
- **Effort:** 1.5d.

### 12. Projects UI — **PARTIAL: no file knowledge upload, no skills/connectors scoping**

- **Reference (§1.3):** Projects have files (30 MB/file, no count limit, falls back to RAG over context window), Skills + Connectors scoping, Cowork-in-Projects.
- **What we have:** `(tabs)/projects.tsx` only stores name + description + custom instructions text field. No file upload, no Skills attachment, no Connectors attachment, no Cowork integration.
- **Gap:** "Project knowledge" entirely missing.
- **Effort:** 5d — file upload + storage flow, Skills scoping picker, Connectors scoping.

### 13. Connectors directory — **PARTIAL: 11 hardcoded vs 200+**

- **Reference (§1.4):** 200+ connectors at `claude.com/directory/connectors`, 14+ categories, "Interactive" MCP-Apps marker, custom-MCP-URL "+ Add custom connector" entry.
- **What we have:** `connectorData.ts:78-152` lists 11 hardcoded connectors / 4 categories (Cloud / Productivity / Communication / Email & Calendar). No directory fetch, no custom-MCP-URL, no Interactive marker, no per-action permission editor (Auto / On-demand mode lives in chat composer instead).
- **Effort:** 3d — replace static list with `/api/connectors/directory` fetch + custom-URL input.

### 14. Plugins / Marketplace — **MISSING (Anthropic ships, partial signal here)**

- **What Anthropic has (§5.11, §B):** `claude plugin marketplace add <repo>`, claudemarketplaces.com 4,200+ skills / 770+ MCP servers / 2,500+ marketplaces. On mobile this is "partial" per matrix.
- **What we have:** Zero. No `services/plugins.ts`, no MCP servers, no marketplace listing. Skills screen is a placeholder (`skills/index.tsx:13-52`).

### 15. Skills UI — **PARTIAL: listed in drawer but screen is placeholder**

- **Reference (§1.5):** Skills have folders + YAML, browse-skills directory in Customize → Skills, partner directory.
- **What we have:** `app/(app)/skills/index.tsx:13-52` is "Coming soon" placeholder. Skills entry from `AddToChatSheet.tsx:183-187` routes to this placeholder.
- **Effort:** 7d — directory fetch, install flow, per-conversation enablement, OAuth for skill-required Anthropic-account connection.

### 16. Artifacts gallery — **MISSING as a destination, but inline/full-screen viewer exists**

- **Reference (§6.1):** Artifacts is a top-level tab on mobile.
- **What we have:** `ArtifactFullScreen.tsx`, `InlineArtifactCard.tsx`, `GeneratedImage.tsx`, `ImageFullScreen.tsx` for inline use. **No standalone "all my artifacts across conversations" gallery view.**
- **Effort:** 2.5d — gallery screen + indexing query; reuse existing artifact components.

### 17. Slash commands — **PARTIAL: 4 of ~60+**

- **Reference (§5.2):** 60+ built-in slash commands (`/help`, `/clear`, `/compact`, `/rewind`, `/fork`, `/resume`, `/model`, `/effort`, `/plan`, `/auto-mode`, `/sandbox`, `/output-style`, `/agents`, `/skills`, `/hooks`, `/init`, `/team-onboarding`, `/security-review`, `/loop`, `/simplify`, `/debug`, `/batch`, `/status`, `/usage`, `/cost`, `/context`, `/doctor`).
- **What we have:** `CommandPalette.tsx:21-46` lists 4: `/image`, `/voice`, `/compare`, `/export`. Mobile is allowed to ship a subset, but core CLI commands (`/clear`, `/compact`, `/model`, `/help`) are absent.
- **Effort:** 2d for the conversation-control subset.

### 18. Calendar/Contacts integrations — **PARTIAL: permissions wired, no agent-using-them flow**

- **Manifest:** `expo-calendar`, `expo-contacts` declared in `package.json:30,33`.
- **Code:** `services/deviceIntegrations.ts` exposes permission helpers; `settings/integrations.tsx` shows status. **No actual agent flow that reads/writes calendar events or contacts.** Permissions purely informational.
- **Effort:** 2.5d to wire calendar-event / contact tools into the agent loop.

### 19. Reset password — **PARTIAL: HTTPS App Link path only**

- Already documented at `_layout.tsx:340-396`. PKCE-preferred + legacy-fragment fallback. App Links via `agiworkforce.com/auth/reset-password` only — mobile does not handle Anthropic's `claude.ai/...` URLs (correct: separate product).

### 20. iOS Control Center — **PARTIAL: documentation only**

- **Code:** `app/(app)/widget-setup.tsx:255-301` shows static how-to instructions for iOS 18 Control Center tile. **No actual `expo-control-center` / native module to register a tile.**
- **Gap:** User must manually add via Settings; no programmatic registration.
- **Effort:** 3d via custom native module (no off-the-shelf Expo plugin).

---

## Missing (per category)

### Bottom-tab nav

- **MISSING.** Replaced with drawer. No Artifacts gallery destination either way.

### Composer

- **MISSING:** Discrete `microphone` and `sound-wave` icons. Currently overloaded onto one button.
- **MISSING:** "Web Search toggle" / "Code Execution toggle" / "Extended Thinking toggle" / "Research mode" gear icons that ChatGPT/Claude expose top-level on the composer. Ours buries these under `+` menu.

### Camera

- All P0 features ship: capture, flash, retake, prompt, vision-AI send. No gap.

### Photo library

- **MISSING:** Live Photos / video selection (only static images).
- **MISSING:** EXIF stripping is implicit (`exif: false`) but no "Remove location data" UX surface.

### Voice mode (full-duplex)

- **MISSING:** Interrupt detection. Ours requires user to tap orb during speaking phase to interrupt (`VoiceConversationScreen.tsx:280-285`); Claude detects voice activity automatically.
- **MISSING:** Multi-turn-with-context — our `handleVoiceSendMessage` at `(tabs)/chat.tsx:183-195` returns a synthetic placeholder string `"I received your message: ..."` rather than the real LLM response. **The voice mode does NOT actually stream the model's response back through TTS in the chat-tab entry path** (it does in chat-detail via `useVoicePlayback`).
- **MISSING:** Background-audio (continue speaking when user backgrounds the app).
- **MISSING:** Real-time waveform of AI's spoken response (we render waveform off audioLevel proxy).

### Push-to-talk transcription

- All major paths covered. Minor: no "Visual Voicemail"-style waveform replay.

### Push notifications

- **MISSING:** Notification grouping by conversation (Anthropic groups per agent + per Cowork task).
- **MISSING:** Quick-action buttons on notifications (Approve / Reject inline). Currently tap navigates to in-app modal.
- **MISSING:** Live Activities (iOS 16+) for in-flight Cowork/Dispatch tasks.

### Dispatch flow

- **MISSING:** 3-tier access-scope picker (files-only / browser / full computer use) at pair-time.
- **MISSING:** "Steer" inline-comment box for in-flight tasks (Anthropic §3.3).
- **MISSING:** Task list view with filter ("Running / Awaiting approval / Completed / Failed"). Ours shows messages-as-stream.
- **MISSING:** "Schedule recurring task" entry from Dispatch (Anthropic §3.4). We have `schedules/` but no Dispatch integration.

### Pairing

- **MISSING:** Email-based pairing fallback when QR scanning fails. Anthropic's docs are silent here too, so this is wishlist parity.
- **MISSING:** Multiple paired desktops (one mobile + N desktops) — code path implicitly assumes 1:1.

### Health connector iOS-only

- **MISSING:** Direct HealthKit binding. Currently routes through HxF companion app + `/api/health-context` (which doesn't exist).
- **MISSING:** Workouts / sleep stages / cycle tracking categories.
- **MISSING:** Permission scope editor.

### Siri Shortcuts iOS-only

- **MISSING — entirely.** No INIntent / `@AppIntent` definitions. `widget-setup.tsx:191-253` shows user how to manually create a shortcut, but with **no exposed shortcut intent** in the app there is nothing to wire to. App Store reviewers will reject "Siri Shortcuts" marketing if not actually exposed.
- **Effort:** 3d for the basics (StartChat / OpenVoiceMode / PairDesktop intents) via custom native module.

### Reminders integration (iOS)

- **MISSING — entirely.** `expo-reminders` is not in package.json. Anthropic Mobile §6.7 calls this out as iOS-only feature.
- **Effort:** 2d (custom EventKit module via EAS dev-client).

### Widgets Android-only

- **MISSING — entirely.** No `android/app/src/main/res/xml/<widget>.xml`, no `AppWidgetProvider` Java/Kotlin class, no `expo-android-widget` plugin. `widget-setup.tsx:303-332` shows how-to docs to a widget that doesn't exist.
- **Effort:** 4-5d for "New Chat" + "Voice Mode" + "Latest Conversations" tiles (Glance API).

### Health Connect Android-only

- **MISSING — entirely.** Health bridge is iOS+HxF only; `healthData.ts:140-143` returns `false` for Android.
- **Effort:** 3-5d (Health Connect SDK is Android 14+, Kotlin native module).

### File upload

- **MISSING:** Drag-and-drop UX (mobile-typical: long-press + share-sheet flow exists; native FileProvider drag from Files app to AGI Workforce icon does not).
- **MISSING:** OCR pre-extraction for images (Anthropic-side server processes; we just pass through bytes).
- **MISSING:** 30 MB / 20-file enforcement client-side. AddToChatSheet has no max-file-count guard.

### Settings

- **MISSING:** Privacy tab — model-training opt-in/out for consumer plans (consumer Pro/Max default OFF in Anthropic's setup).
- **MISSING:** Latex render toggle, Analysis tool toggle, Custom visuals toggle.
- **MISSING:** Memory import (from ChatGPT / Gemini / Grok).
- **MISSING:** Voice mode preferences sub-screen (only system-voice picker exists).
- **MISSING:** Sign-out-all-sessions, account deletion entry.
- **MISSING:** MFA enrollment surface.

### Account

- **MISSING:** In-app subscription change (we open external billing portal via `/api/portal`). Anthropic has in-app upgrade.
- **MISSING:** Profile picture upload.
- **MISSING:** Email change / password change.

### Memory UI

- **MISSING:** Pause memory (keep existing, stop new writes).
- **MISSING:** Reset memory (irreversible delete-all).
- **MISSING:** Memory import from ChatGPT/Gemini/Grok at `claude.com/import-memory`-equivalent.

### Projects UI

- **MISSING:** File knowledge upload.
- **MISSING:** Skill scoping (default-enable specific Skills for project).
- **MISSING:** Connector scoping.
- **MISSING:** Cowork-in-Projects integration.
- **MISSING:** Project sharing (org-wide via Team/Enterprise — N/A for mobile).
- **MISSING:** Default model + default style per project.

### Artifacts gallery

- **MISSING — entirely as destination.** No "All artifacts ever generated" view.
- **MISSING:** Publish/Unpublish artifact (Anthropic §1.7, §1.9).
- **MISSING:** Live Artifacts (auto-refresh against connected MCP servers, Apr 2026 §1.9).
- **MISSING:** Persistent storage (20 MB per published artifact).
- **MISSING:** Direct API calls from artifact (artifact-as-app pattern).
- **MISSING:** MCP-connected artifacts.

### MCP / plugins / skills directory

- **MISSING — entirely.** No MCP support on mobile.
- **MISSING — entirely.** No plugin/marketplace.
- **MISSING — placeholder only.** Skills screen is "Coming soon."

### Connector authoring + custom-MCP URL

- **MISSING — entirely.** No `+ Add custom connector` URL paste.

### Cross-provider

- The full multi-provider routing exists in `services/streaming.ts` and `lib/models.ts` (we maintain the multi-provider differentiator); no Anthropic-side gap here. Compare-models view at `compare.tsx` shows two providers side-by-side.

---

## Per-axis percentage

| Axis                         | Have-% | Notes                                                                                                                                                                                                                            |
| ---------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools (chat)**             |    70% | Web search, image gen, file read/write inline cards, citation chips, thinking, tool-call cards all present. Missing: code execution sandboxed env, Extended Thinking toggle, Research mode, MCP tools.                           |
| **Web search**               |    80% | Toggle + citations + collapsible sources wired. Missing: hover-preview chips, in-line numbered footnotes (we use sources block).                                                                                                 |
| **Answering**                |    75% | Markdown, math (via lib/markdown), reasoning bottom sheet, retry/edit/delete, reactions all ship. Missing: Latex toggle, Custom visuals (chart-as-artifact), branched-fork conversation.                                         |
| **MCP**                      |     0% | None. Anthropic mobile inherits remote-MCP from claude.ai account; we're not wired.                                                                                                                                              |
| **Plugins**                  |     0% | None.                                                                                                                                                                                                                            |
| **Skills**                   |     5% | Drawer entry + placeholder. No directory, no install, no per-conversation enablement.                                                                                                                                            |
| **Voice**                    |    65% | Recording, PTT, voice-mode orb, 5 presets, TTS playback, transcription on AI-completion ships. Missing: cloud-TTS quality, interrupt detection, background audio, real AI-response speak path in chat-tab entry, multi-language. |
| **Push**                     |    70% | Expo Push, 4 priority tiers, 6 trigger types, in-app center. Missing: Live Activities, notification grouping, quick-actions, native APNs/FCM.                                                                                    |
| **Dispatch**                 |    60% | Mobile end is best-in-class; desktop end + 3-tier access scope picker + "Steer" inline + task-status list missing.                                                                                                               |
| **Camera**                   |    95% | All major flows present. Missing: video capture.                                                                                                                                                                                 |
| **Files**                    |    70% | DocumentPicker for pdf/doc/docx/txt/csv whitelist + image upload. Missing: 30 MB / 20-file enforcement, OCR pre-extract, drag-and-drop.                                                                                          |
| **Memory**                   |    75% | Full CRUD + search + sync + 6-category filter. Missing: Pause, Reset, import.                                                                                                                                                    |
| **Settings**                 |    60% | 5 groups / 18 items. Missing: Privacy tab, MFA, sign-out-all, in-app subscription, account deletion entry, voice prefs sub-screen, profile-picture upload.                                                                       |
| **Projects**                 |    30% | Name + description + custom instructions only. Missing: file knowledge, skill scoping, connector scoping, default model, default style.                                                                                          |
| **Artifacts**                |    50% | Inline + full-screen viewer ships. Missing: gallery, publish, persistent storage, live, direct-API.                                                                                                                              |
| **Connectors**               |    35% | 11 hardcoded vs 200+ Anthropic. No custom-URL, no per-action permission editor (Auto/OnDemand only at conversation level).                                                                                                       |
| **Health**                   |    25% | Indirect via HxF companion app, iOS-only, backend endpoint absent.                                                                                                                                                               |
| **Siri Shortcuts**           |     5% | Documentation only — no actual `INIntent` exposed.                                                                                                                                                                               |
| **Reminders (iOS)**          |     0% | None.                                                                                                                                                                                                                            |
| **Widgets (Android)**        |     5% | Documentation only — no widget XML / Glance code.                                                                                                                                                                                |
| **Health Connect (Android)** |     0% | None.                                                                                                                                                                                                                            |

---

## Surface percentage

**~52%** — `apps/mobile/` covers about half the Anthropic Mobile surface area as documented in §6.

Breakdown:

- **Chat composition + voice flow:** ~70% (best-in-class for non-Anthropic; still missing cloud TTS quality, interrupt detection, surface-level voice-mode icon).
- **Dispatch:** ~70% (mobile end excellent; desktop end + 3-tier scope picker absent).
- **Push notification + in-app center:** ~75%.
- **Memory + Projects + Artifacts + Connectors + Skills directory:** ~30% combined (significant gaps).
- **Platform-exclusive features (Siri / Widgets / HealthKit-direct / Reminders / Health Connect):** ~5%.
- **MCP / Plugins / Marketplace:** 0%.

Caveat: the matrix above evaluates _parity_ with Anthropic Claude Mobile. AGI Workforce's own differentiators (multi-provider switching mid-conversation, BYOK, cross-provider session continuity via `llm-normalize`) are NOT in scope for this gap analysis — they are features Claude Mobile does not have.

---

## Effort to reach 100% (days)

| Bucket                                                                                |             Days | Notes                                                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------: | --------------------------------------------------------------------------------------------------------------------- |
| Composer mic + sound-wave split                                                       |                1 | UI refactor in `ChatInput.tsx`.                                                                                       |
| Cloud TTS (ElevenLabs streaming)                                                      |                4 | Backend endpoint + token streaming + UI.                                                                              |
| Voice mode interrupt detection + real LLM response speak path                         |                3 | Voice activity detection module + wire `(tabs)/chat.tsx:183-195` to actual streaming response.                        |
| Live Activities (iOS)                                                                 |                4 | Custom native module + tier-1 EAS dev-client.                                                                         |
| Notification quick-actions + grouping                                                 |                3 | iOS Notification Service Extension + Android grouping keys.                                                           |
| Native APNs + FCM (replace Expo Push)                                                 |                7 | Significant infra; certs, .p8, FCM project rotation.                                                                  |
| Dispatch 3-tier scope picker + Steer inline + task list                               |                5 | UI + protocol updates.                                                                                                |
| Memory Pause / Reset / Import                                                         |              1.5 | Local-only state for Pause; backend RPC for Reset; dialog for Import-from-other.                                      |
| Projects: file knowledge upload                                                       |                5 | RAG indexing pipeline UI; backend upload route assumed.                                                               |
| Projects: skill + connector scoping                                                   |                3 | Picker UI; depends on Skills + Connectors directory.                                                                  |
| Connectors: directory fetch + custom-URL                                              |                3 | Replace static list with `/api/connectors/directory`; add custom-MCP URL paste.                                       |
| Skills directory + install + enablement                                               |                7 | Largest scope item; full design needed.                                                                               |
| MCP support on mobile                                                                 |                8 | Server-side MCP relay + mobile client. Wishlist — Anthropic mobile inherits from web account.                         |
| Plugins / Marketplace                                                                 |                5 | Wishlist; defer.                                                                                                      |
| Artifacts gallery                                                                     |              2.5 | New screen + index query.                                                                                             |
| Artifacts publish / persistent / live / direct-API                                    |                6 | Largest "platform" feature; backend-heavy.                                                                            |
| Siri Shortcuts (iOS)                                                                  |                3 | Custom native module — `INIntent` definitions for StartChat / OpenVoiceMode / PairDesktop.                            |
| Reminders integration (iOS)                                                           |                2 | EventKit native module.                                                                                               |
| Android home-screen widgets                                                           |                5 | Glance API; "New Chat" + "Voice Mode" + "Latest" tiles.                                                               |
| Health Connect (Android 14+)                                                          |                5 | Kotlin native module.                                                                                                 |
| Direct HealthKit (iOS)                                                                |                4 | Replace HxF indirection.                                                                                              |
| iOS Control Center tile                                                               |                3 | Custom native module.                                                                                                 |
| Photo library: live-photos / video / OCR                                              |                3 | OCR via on-device Vision framework + remote fallback.                                                                 |
| File upload: 30 MB / 20-file client guard + drag-and-drop                             |                2 | Client validation + iOS UIDropInteraction.                                                                            |
| Settings: Privacy / MFA / sign-out-all / account-deletion / voice-prefs / profile-pic |                4 | Multi-screen.                                                                                                         |
| Slash command set expansion (`/clear`, `/compact`, `/model`, `/help`, ...)            |                2 | Conversation-control subset.                                                                                          |
| **Total (sequential, single agent)**                                                  | **~95-100 days** | Add ~25% buffer for review/QA → **~120 days**.                                                                        |
| **Parallel (3-4 agents on independent buckets)**                                      |  **~35-45 days** | Critical path: cloud TTS + Skills directory + Projects file knowledge + native APNs are independently parallelizable. |

---

## Cross-cutting ground-truth notes (no parity claim — informational)

- **MEMORY.md confirms 43 .tsx screens + drawer pivot, RN 0.83.6** (vs `package.json:61` reads RN `0.84.0` — slight discrepancy with MEMORY.md's "0.83.6". Treat MEMORY.md as the snapshot date authority.)
- **Dispatch implementation = 597 LOC + 181 LOC realtime** per MEMORY.md; reads: `dispatch/index.tsx` 589 + `services/dispatchRealtime.ts` (not read in full but cited).
- **MMKV + biometric + secure-storage chain** intact at `_layout.tsx:42-396`.
- **iOS bundle: `com.agiworkforce.app`, iOS min 15.1 (SDK-derived from Expo)** per MEMORY.md.
- **Cross-surface gap (per MEMORY.md):** desktop has zero `dispatchHmac`/`dispatchSalt` impl; transitional unsigned-message path expires 2026-06-05.
- **The 3-device sync, Realtime channel subscriptions, biometric gate, encrypted MMKV, deep-link guards, App-Link hijack defenses** are all top-shelf — none of these are P0 gaps vs Anthropic.
- **The mobile app currently surpasses Anthropic Claude Mobile** in: notification priority granularity (4 tiers vs Anthropic's docs being silent), schedule UI (we ship; Anthropic mentions Cowork-only schedule from desktop), multi-provider chat (Anthropic locks to Claude only).

---

_End of GAP-MOBILE._ Compiled 2026-05-08. Re-snapshot when Anthropic ships next mobile changelog or when our Phase 1 plan starts the Skills + Plugins + MCP work.
