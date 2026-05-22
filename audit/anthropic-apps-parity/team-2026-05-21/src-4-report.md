# src-4 — apps/mobile frontend audit

Audit slot: `src-4`
Scope: `apps/mobile/src/features/{chat,model-picker,artifacts,billing,paywall,settings,onboarding,voice,agents,connectors,auth}` + supporting expo-router routes under `apps/mobile/app/(app)/**`.
Audit mode: source-side, read-only. Image-side comparison hypothesized against Claude iOS norms only — no PNGs read.
Author: `src-4`

## Audit framing

Mobile is **native Expo / React Native** (Expo SDK 55, RN 0.84, React 19.2). It does NOT consume `packages/unified-chat`. The chat composer, message list, artifacts, model picker, settings, billing, paywall, voice, onboarding, agents, connectors, and auth surfaces are all duplicated as RN components under `apps/mobile/src/features/**`.

Repo-wide locks materially shape the gap analysis:

- `apps/mobile/lib/v1FeatureFlags.ts:22-70` — Mobile v1 is **local-only**. Flags `cloudChat`, `billing`, `auth`, `byokKeys`, `agents`, `dispatch`, `schedules`, `companion`, `messaging`, `connectorsCloudOnly`, `webSearch`, `computerUse`, `imageGen`, `crossDeviceSync` all default **false**. Many features below render in code but are gated to "Waitlist", "Locked", or `Alert` modals at runtime.
- `apps/mobile/AGENTS.md:21-25` — explicit "mobile must not become the heavy compute surface first; generated-file and long-running compute must delegate to Desktop/host."

The rubric below therefore distinguishes "feature shipped but disabled" (P0 vs Claude iOS) from "feature not implemented at all". I quote evidence and the runtime gate where relevant.

---

## Composer

**Evidence ref:**

- `apps/mobile/src/features/chat/components/ChatInput.tsx:37-360` (composer with model pill, [+], connectors, mic, send)
- `apps/mobile/src/features/chat/components/Composer/Composer.tsx:22-70` (Composer wrapper + TaskChips toggle)
- `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:54-265` (75% snap bottom sheet — attachments, modes, agent modes, effort, auto-approve, temporary chat, tool access)
- `apps/mobile/src/features/chat/components/CommandPalette.tsx:21-99` (4 slash commands: `/image`, `/voice`, `/compare`, `/export`)
- `apps/mobile/src/features/chat/components/TaskChips.tsx` (referenced from Composer.tsx:53; chip-mode quick presets)
- `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` (image/document chips above the text input)

**Current state:** Composer is a rounded, dark "card" with multiline TextInput, model pill on the left, [+] button opening `AddToChatSheet`, link icon for connectors, voice mic with long-press for full-screen voice mode, and a Send/Stop button. Offline placeholder switches to `"Offline — message will send on reconnect ({n} queued)"`. Slash palette appears as an overlay above the card when the user types `/`. The `AddToChatSheet` consolidates ~7 sections (Attachments, Chat mode, Agent mode, Effort, Session toggles, Tool availability, Config links).

**Gap delta vs Claude iOS:** Claude iOS composer is materially simpler — a single text field, attachment button, voice button, send button. AGI Mobile already has feature parity (attachments, voice, slash) and arguably exceeds Claude iOS with agent-mode/effort selectors and a richer AddToChatSheet. Hypothesized P1/P2 gaps: (a) Claude iOS shows an inline "Research", "Connect apps", "Drive picker", "Style", "Tools" chip strip _above_ the text field; AGI surfaces those inside `AddToChatSheet` instead, which adds a tap. (b) Claude iOS pill order is `attachment → voice` on right; AGI uses `connectors → mic → send`. (c) No "Web search" or "Extended thinking" composer toggle visible on the composer surface itself; only inside the model picker.

**Severity:** P1
**Hours:** 8

---

## Sidebar / Drawer / History

**Evidence ref:**

- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:1-220` (chat-first nav, utility strip, disabled "Keys/BYOK")
- `apps/mobile/src/features/sidebar/components/Sidebar.tsx:1` (re-exports DrawerContent)
- `apps/mobile/src/features/sidebar/components/ConversationList.tsx:1-120` (Pinned + Today/Yesterday/This Week/Older grouping)
- `apps/mobile/src/features/sidebar/components/ConversationItem.tsx`, `SidebarHeader.tsx`, `SearchBar.tsx`, `TagFilter.tsx`, `AutoTagBadge.tsx`
- `apps/mobile/app/(app)/(tabs)/chat.tsx:223-244` (header has hamburger + AGI brand + new-chat button)

**Current state:** A left drawer (`@react-navigation/drawer`) holds the primary nav (Chat, Artifacts, Code, Projects, Skills, Dispatch, Connectors) plus a utility strip (Models, disabled Keys/BYOK, Memory, Settings, About). The sidebar conversation list groups by `Pinned/Today/Yesterday/This Week/Older` with auto-tag badges and search.

**Gap delta:** Claude iOS sidebar is a single-pane recents list with project/folder grouping and account row at the bottom. AGI Mobile already has full conversation history with pinning, time grouping, search, and tags — exceeds Claude iOS. Hypothesized gap: Claude iOS sidebar consistently shows "New project" CTA at top and an account/avatar row at the bottom; AGI drawer leads with nav items and only shows a `DesktopCompanionWidget` instead of a focused account/avatar row. Search appears to be local-only (no cross-device server search since `FEATURES.cloudChat = false`).

**Severity:** P2
**Hours:** 6

---

## Model picker

**Evidence ref:**

- `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:66-362` (BottomSheet 50%/90%, search, AutoMode cards, Favorites, On-device / Cloud Managed sections, expand→thinking toggle)
- `apps/mobile/src/features/model-picker/components/ModelRow.tsx:28-210` (selected state, favorite star, install status: Ready/Download/downloading%/Retry/Soon/Locked, "With thinking" switch)
- `apps/mobile/src/features/model-picker/components/AutoModeCard.tsx`, `ProviderLogo.tsx`
- `apps/mobile/src/features/model-picker/installStore.ts`, `localModelRuntime.ts`, `service.ts`, `store.ts`, `tierGuard.ts`

**Current state:** Bottom-sheet picker (50%/90% snap) with search, Auto-mode cards at top, favorites section, then provider sections grouped by `surface = local | cloud_managed`. Each row shows provider logo, name, detail label, install state badge (Ready / Download / downloading% / Retry / Soon / Locked), favorite star (long-press to toggle), and an expand→`With thinking` switch when a model is reselected. Cloud-managed rows render with `availability='locked'`, a CloudOff explanation row, and disabled press.

**Gap delta:** Claude iOS only exposes Sonnet/Opus toggle with an "Extended thinking" switch. AGI Mobile model picker is far richer (multi-provider, multi-runtime, install state, thinking toggle per model). The main implicit gap is that — since `cloud_managed` models are locked behind the waitlist — the _value_ of the multi-provider picker is currently aspirational; in v1 only on-device entries are actually selectable. Compared to Claude iOS specifically, no gap. Hypothesized polish: Claude iOS shows a "favorites" star on its model rows on Pro+; AGI matches via `Star`. No "Quick switcher" keyboard shortcut surface on mobile.

**Severity:** no gap visible — needs cross-validation by the lead
**Hours:** 0

---

## Tool-call rendering

**Evidence ref:**

- `apps/mobile/src/features/chat/components/InlineToolCall.tsx:1-266` (borderless inline bar; expand opens a `BottomSheet` with Command / Request / Response panes)
- `apps/mobile/src/features/chat/components/ToolCallCard.tsx:1-100` (alternate card style with Status pill, ChevronDown, duration label)
- `apps/mobile/src/features/chat/components/MessageBubble.tsx:364-379` (tool calls rendered as left-bordered group inside assistant bubble)
- `apps/mobile/src/features/chat/components/StatusStep.tsx`, `ApprovalCard.tsx`, `ThinkingLine.tsx`, `ThinkingBottomSheet.tsx`

**Current state:** Two renderers exist: `InlineToolCall` (borderless §4 bar with leading status icon, name, optional status suffix, file path, chevron — tap opens a 50%/90% bottom sheet with `Command`, `Request`, `Response` blocks) and `ToolCallCard` (legacy card with status pill + duration). Assistant messages render tool calls inside a left-border group (`MessageBubble.tsx:367-378`), interspersed with `StatusStep` and `ApprovalCard` elements.

**Gap delta:** Claude iOS represents tool use as collapsible inline cards with "Running…/Done" pill and an expand-tap reveal of args + output. AGI Mobile matches this pattern. Hypothesized polish gaps: (a) Claude iOS preserves a "tool chain" timeline on the right margin; AGI uses a single-axis left border. (b) AGI's `ToolCallCard` (`apps/mobile/src/features/chat/components/ToolCallCard.tsx`) is duplicate with InlineToolCall — likely a leftover from a refactor; selecting the wrong one in some screen could cause inconsistency.

**Severity:** P2
**Hours:** 4

---

## Settings

**Evidence ref:**

- `apps/mobile/src/features/settings/index.tsx:1-790` (8 sections: Mode / Keys / Local AI / Connections / Voice / Preferences / Privacy / About)
- `apps/mobile/src/features/settings/personalization/index.tsx:1-80` (name, occupation, custom instructions, 4 sliders: warmth/enthusiasm/headers/emoji)
- `apps/mobile/src/features/settings/capabilities/index.tsx:1-100` (Local LLMs Active, Memory toggle, Web Search/Image Gen/Desktop Control waitlisted, BYOK locked)
- `apps/mobile/src/features/settings/notifications/index.tsx`
- `apps/mobile/src/features/settings/components/{MemoryItem.tsx, AddMemorySheet.tsx}`
- `apps/mobile/app/(app)/settings/{auto-approve.tsx, integrations.tsx, memory.tsx, memory-import.tsx, performance.tsx, storage.tsx}`

**Current state:** Settings is a `SectionList` with Mode (Local active / Local LLMs nav / Cloud Managed waitlist), Keys (Mobile BYOK locked), Local AI (Capabilities / Memory / Storage / Performance / Auto-Approve), Connections (Desktop Pairing if `FEATURES.companion`, Connectors Waitlist), Voice (on-device banner + locked never-train toggle + Voice/Language selector + Cloud Whisper waitlist), Preferences (Appearance pills: dark/light/system, Notifications, Personalization, Haptic Feedback toggle), Privacy (Privacy Policy, Terms), About (Help/FAQ, version row).

**Gap delta:** Claude iOS settings have: Account, Subscription, Connected Apps, Notifications, Appearance, Voice, Accessibility, About. AGI Mobile already covers Appearance/Voice/Notifications/About and adds Local-AI specifics. Hypothesized gaps: (a) **No Account/Subscription row exposed at all** — `FEATURES.auth = false` and `FEATURES.billing = false` mean the user has nowhere to view tier/usage/payment from Settings, whereas Claude iOS leads with "{name} · Free" or "Plus" and a manage button. (b) No "Accessibility" group (font scale, reduce motion, high contrast). (c) No "Data Controls" row equivalent to Claude's "Improve the model for everyone" toggle — AGI relies on the locked-on `Never train` voice toggle and a privacy disclosure modal at first-run.

**Severity:** P1
**Hours:** 12

---

## Onboarding

**Evidence ref:**

- `apps/mobile/app/(public)/onboarding.tsx:1-50` (3-screen flow: Hero → device-tier detection + model recommendation → first model download)
- `apps/mobile/src/features/onboarding/components/FirstRunDisclosureModal.tsx:1-193` (Article 50(1) / Apple 5.1.2(i) disclosure modal)
- `apps/mobile/src/features/onboarding/components/ModeCard.tsx:1-165` (Local Mode / Cloud Managed waitlist / Decide later)
- `apps/mobile/src/features/onboarding/components/ByokConsentModal.tsx` (188 lines)

**Current state:** Onboarding is privacy-first, no login, no cloud, no BYOK in v1. Screen 1 is a hero with "AGI runs on your device." tagline and "AGI Automation LLC · Delaware, USA + DPDP Act 2023" trust signal, followed by a bottom-sheet disclosure (composed via `@agiworkforce/compliance`). Screen 2 detects `LocalRuntimeTier` and recommends a default on-device model. Screen 3 stubs a first model download with progress UI (TODO note: storage-engineer wires the real hook). `ModeCard` exposes three modes including a Cloud Managed waitlist card rendered with `opacity: 0.64` and a `WAITLIST` pill.

**Gap delta:** Claude iOS onboarding is sign-in-first (Apple, Google, Email), then a 3-card value pitch, then directly into chat. AGI Mobile inverts that — local-first, no login. As a **product** stance this is intentional; as a **parity** gap vs Claude iOS, AGI Mobile lacks: (a) sign-in step entirely (would conflict with the lock); (b) interactive product tour (Claude iOS shows 3 swipeable cards); (c) push notification permission ask at the right moment (no `expo-notifications.requestPermissionsAsync()` is wired into onboarding even though the lib is present). Item (c) is an actual oversight, not a lock.

**Severity:** P2
**Hours:** 6

---

## Billing / Paywall

**Evidence ref:**

- `apps/mobile/src/features/paywall/components/ProPlusPaywall.tsx:1-254` (Pro+ multi-provider gate, `$49.99/mo`, external pricing URL `https://agiworkforce.com/pricing?from=mobile-provider-switch&tier=pro_plus&feature=multi_provider`)
- `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` (generic paywall bottom sheet — referenced from chat/[id].tsx)
- `apps/mobile/src/features/billing/components/UpsellCard.tsx:1-126` (Hobby upgrade, 7-day dismiss TTL via MMKV)
- `apps/mobile/src/features/billing/service.ts`, `apps/mobile/src/features/billing/store.ts`
- `apps/mobile/app/(app)/billing/` (route dir exists)

**Current state:** Three surfaces: `UpsellCard` (free→Hobby with feature bullets, dismissible 7-day TTL), `ProPlusPaywall` (multi-provider gate, Pro+ pricing, deep-links to web pricing page), and `PaywallBottomSheet` (generic, opened on `paywallError` from `chatStore`). The Pro+ paywall CTA opens an external URL via `openExternalUrl`; **there is no StoreKit IAP wiring** — no `react-native-iap`/`expo-store-kit`/Apple IAP receipt validation. Per PRD lock memory, "StoreKit IAP default globally at 15% via Apple Small Business Program; EU external-link entitlement-gated"; the code does not match this lock.

**Gap delta:** Claude iOS uses **StoreKit-native paywall** (Apple's subscription sheet via `StoreKit.subscribe()`); no external-link redirect. AGI Mobile redirecting to a web pricing page is a **direct violation of App Store Guideline 3.1.1** and would be rejected on submission unless the EU external-link entitlement is in effect for the user's storefront. This is the highest-severity gap I found in the mobile audit. Additionally, no in-app subscription management UI, no restore-purchase button, no receipt verification.

**Severity:** P0
**Hours:** 40

---

## Artifacts

**Evidence ref:**

- `apps/mobile/src/features/artifacts/index.tsx:1-386` (ArtifactsGalleryScreen with grid, Get Inspired card, modal preview, copy+share)
- `apps/mobile/src/features/artifacts/data.ts` (static `RECEIVED_ARTIFACTS`)
- `apps/mobile/src/features/artifacts/types.ts`
- `apps/mobile/src/features/chat/components/InlineArtifactCard.tsx`, `ArtifactFullScreen.tsx`
- `apps/mobile/app/(app)/artifacts/`

**Current state:** Read-only gallery (`apps/mobile/src/features/artifacts/index.tsx:48-103`) with 2/3-column grid, Get Inspired CTA, artifact card preview, and modal preview. Modal shows artifact content with Copy and Share buttons. **The disclosure text explicitly says** `"Mobile only previews, copies, and shares this artifact. Regeneration and execution stay on Desktop or Cloud Managed environments."` (`apps/mobile/src/features/artifacts/index.tsx:366-368`). Inline artifact cards in chat (`InlineArtifactCard.tsx`) open `ArtifactFullScreen` modal.

**Gap delta:** Claude iOS Artifacts pane supports live rendering of HTML/React/Mermaid/SVG/Markdown and an interactive preview. AGI Mobile is text-only preview with Copy/Share — by design (PRD lock: mobile must not be heavy-compute). Compared to Claude iOS, AGI Mobile **lacks**: (a) HTML/SVG/Mermaid rendering, (b) ability to regenerate or edit an artifact, (c) full-screen iframe sandbox preview, (d) artifact version diff. All four are intentional v1 carve-outs per AGENTS.md:21-25.

**Severity:** P1
**Hours:** 24

---

## Computer-use / Browser-automation

**Evidence ref:**

- `apps/mobile/lib/v1FeatureFlags.ts:62-63` (`computerUse: false`)
- `apps/mobile/src/features/settings/capabilities/index.tsx:73-80` (Desktop Control marked Waitlist)
- `apps/mobile/src/features/connectors/components/ConnectorItem.tsx`, `connectorData.ts:43-72` (11 OAuth connector entries — Drive, Dropbox, OneDrive, GitHub, Linear, Jira, Notion, Slack, Teams, Gmail, Google Calendar)
- `apps/mobile/app/(app)/(tabs)/chat.tsx:88-97` — handler shows an Alert when `FEATURES.connectorsCloudOnly` is false

**Current state:** Connectors UI exists (icons, descriptions, toggle/Connect buttons) but the entire OAuth flow is gated behind `FEATURES.connectorsCloudOnly`, which is `false`. Tapping a connector entry from chat raises an `Alert` ("Connectors require Cloud Managed"). No computer-use or browser-automation client code in mobile — feature is entirely waitlisted.

**Gap delta:** Claude iOS does not expose computer-use directly (it is a Claude.ai web/desktop feature). For OAuth connectors, Claude iOS has Google Drive picker and Connected Apps in Settings → Connected Apps. AGI Mobile has the **inventory** UI but no working OAuth flow. P0 gap if v1 ships with Cloud Managed dependence; P1 in current local-only stance.

**Severity:** P1
**Hours:** 16

---

## Voice (input + voice mode)

**Evidence ref:**

- `apps/mobile/src/features/voice/components/VoiceInputButton.tsx`, `RecordingOverlay.tsx`, `Waveform.tsx`, `VoiceConversationScreen.tsx:1-200`, `VoiceReview.tsx`, `VoiceSelector.tsx`, `VoiceRecording.tsx`
- `apps/mobile/src/features/voice/services/voice.ts:1-60` (on-device STT via `voiceInput.ts`; cloud Whisper/Deepgram present but guarded with `CloudVoiceDisabledError` for v1)
- `apps/mobile/src/features/voice/hooks/useVoicePlayback.ts` (TTS playback)
- `apps/mobile/src/features/voice/voicePresets.ts`
- `apps/mobile/src/features/settings/index.tsx:330-430` (On-device-by-default banner + locked never-train + Cloud Whisper waitlist)

**Current state:** Full voice stack: tap-to-record (push-to-talk overlay), long-press → full-screen "Advanced Voice"-style conversation screen (radial gradient + center orb + waveform + Listening/Thinking/Speaking phases with Reanimated shared-value animations + mute + end-call). STT is on-device (`expo-speech-recognition`), TTS via `expo-speech`. `voiceCommands` cleanup (`@agiworkforce/utils`) handles e.g. "send", "delete". Cloud Whisper waitlisted.

**Gap delta:** Claude iOS Voice Mode = a single waveform orb with mute and end-call. AGI Mobile **exceeds** Claude iOS in animation polish and explicit Listening/Thinking/Speaking phase labels. Hypothesized polish gaps: (a) Claude iOS surfaces voice picker (Cove / Maple / Ember / Vale etc.) as a top settings row; AGI surfaces it as a BottomSheet selector. (b) Claude iOS shows real-time transcription text overlay; AGI shows a `transcriptPreview` state but its rendering is not visible at lines 1-200 read. (c) No on-screen response to "voice command" cancel words documented in `cleanupVoiceDictation`.

**Severity:** P2
**Hours:** 5

---

## Agents

**Evidence ref:**

- `apps/mobile/src/features/agents/components/AgentCard.tsx:1-100` (status-tinted card with name, model, progress %, current step, last-updated relative time)
- `apps/mobile/src/features/agents/components/AgentStatusBadge.tsx`, `ToolTimeline.tsx`
- `apps/mobile/stores/agentStore.ts`
- `apps/mobile/lib/v1FeatureFlags.ts:41-42` (`agents: false`)
- `apps/mobile/app/(app)/(tabs)/agents.tsx`, `apps/mobile/app/(app)/agents/`

**Current state:** Agent surfaces are coded but `FEATURES.agents = false`. `AgentCard` renders a single agent with status (running/completed/failed/waiting), progress bar, current step, and tool timeline. The Agents tab and routes exist.

**Gap delta:** Claude iOS has no equivalent agent concept exposed in the app. This is **AGI-specific scope**, not Claude parity. From a Claude-parity lens, no gap exists.

**Severity:** no gap visible — needs cross-validation by the lead
**Hours:** 0

---

## Connectors

(Covered above under Computer-use/Browser-automation — same source files.)

---

## Auth

**Evidence ref:**

- `apps/mobile/src/features/auth/components/LoginForm.tsx:1-121` (email/password sign-in + sign-up + forgot password)
- `apps/mobile/src/features/auth/components/OAuthButtons.tsx:1-143` (Apple Sign-In with raw + hashed nonce; Google OAuth with PKCE, HTTPS App Links instead of custom scheme, server-side code exchange via `exchangeCodeForSession`)
- `apps/mobile/src/features/auth/store.ts`, `apps/mobile/src/features/auth/hooks/`, `apps/mobile/src/features/auth/services/ageGate.ts`
- `apps/mobile/lib/v1FeatureFlags.ts:35-36` (`auth: false`)
- `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/app/(auth)/reset-password.tsx`

**Current state:** Full auth stack present in code: Apple Sign-In with hashed nonce, Google PKCE OAuth using HTTPS App Links (HIGH-MOB-04 hardening note in `OAuthButtons.tsx:46-65`), email/password with reset link. **Gated off** in v1 (`FEATURES.auth = false`). Routes `(auth)/login.tsx` and `(auth)/reset-password.tsx` exist.

**Gap delta:** Claude iOS opens with Apple/Google/Email sign-in. AGI Mobile has the **implementation** but it's not exposed in v1. The gap is **runtime exposure**, not implementation. Specific to Claude iOS comparison: Apple is correctly implemented, Google is implemented more robustly than Claude's typical pattern (PKCE + HTTPS callback + server-side code exchange). No Magic Link / Passwordless option visible.

**Severity:** P1
**Hours:** 8

---

## History / Projects

**Evidence ref:**

- `apps/mobile/src/features/projects/components/ProjectCard.tsx`
- `apps/mobile/src/features/projects/store.ts`
- `apps/mobile/app/(app)/(tabs)/projects.tsx`
- `apps/mobile/src/features/sidebar/components/ConversationList.tsx:81-120` (project filter prop), `apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx`
- `apps/mobile/lib/v1FeatureFlags.ts:25-27` (`projects: true` — ships in v1)

**Current state:** Projects is a v1 feature (founder decision 2026-05-18). Projects tab exists; conversations can be filtered by `projectId`; `ProjectSelectorBar` rides on top of the chat composer letting the user assign or switch a chat into a project.

**Gap delta:** Claude iOS Projects = a per-project pane with files/instructions/chats and a "+ New chat in this project" CTA. AGI Mobile has Projects in the drawer + as a tab + as a selector bar above the composer. Need cross-validation whether AGI's project schema includes per-project system prompts / files / starred chats — `ProjectCard.tsx` and `store.ts` not fully read. Hypothesized P1 gap: per-project files/instructions feature may be absent.

**Severity:** P1
**Hours:** 10

---

## Memory

**Evidence ref:**

- `apps/mobile/src/features/memory/store.ts`, `services/`
- `apps/mobile/src/features/settings/components/AddMemorySheet.tsx`, `MemoryItem.tsx`
- `apps/mobile/app/(app)/settings/memory.tsx`, `memory-import.tsx`
- `apps/mobile/src/features/settings/index.tsx:521-528` (Memory nav row with description "Local memory facts and import/export controls")

**Current state:** Memory is local-first: facts stored locally, addable via `AddMemorySheet`, browsable in `memory.tsx`, importable via `memory-import.tsx`. Toggleable from Capabilities screen.

**Gap delta:** Claude iOS exposes a Memory toggle and lets the user see/manage what Claude remembers — AGI Mobile matches and adds local-first storage plus import. No gap visible.

**Severity:** no gap visible — needs cross-validation by the lead
**Hours:** 0

---

## Search (across history and inline)

**Evidence ref:**

- `apps/mobile/src/features/sidebar/components/SearchBar.tsx`
- `apps/mobile/src/features/sidebar/components/ConversationList.tsx:80-110` (filters by `searchQuery` and `searchResults`)
- `apps/mobile/lib/v1FeatureFlags.ts:59-60` (`webSearch: false`)

**Current state:** Local conversation search (title-only at line 108: `c.title.toLowerCase().includes(searchQuery)`), with an optional `searchResults` prop for server-side snippet search (currently unused since `cloudChat` is off). No in-message full-text search. No web search composer toggle.

**Gap delta:** Claude iOS has (a) recents search in the sidebar (titles + first-message), and (b) "Web search" tool toggle inline in the composer. AGI Mobile has (a) but only title-based, and lacks (b) since web search is waitlisted. Inline message search missing.

**Severity:** P1
**Hours:** 8

---

## Attachments / Multi-modal

**Evidence ref:**

- `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` (preview strip)
- `apps/mobile/app/(app)/(tabs)/chat.tsx:99-188` (camera, photos library, document picker — image, PDF, DOCX, TXT, CSV — using `expo-image-picker` and `expo-document-picker`)
- `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:54-130` (the attachment section in the bottom sheet)
- `apps/mobile/src/features/chat/components/GeneratedImage.tsx`, `ImageGenProgress.tsx`, `ImageFullScreen.tsx`
- `apps/mobile/src/features/image/services/imagegen.ts` (image generation client)
- `apps/mobile/app/(app)/scan.tsx`, `camera.tsx`, `image.tsx`

**Current state:** Multi-image (up to 5), camera, and file picker (PDF/DOCX/TXT/CSV) wired with proper permission prompts. Image attachments render full-width up to 320px in the message bubble. `ImagePicker` config sets `quality: 0.85, exif: false`. Image generation exists via `/image` slash command but gated by `FEATURES.imageGen` (false) and falls back to an Alert ("Image generation requires Cloud Managed").

**Gap delta:** Claude iOS supports image attachments, document attachments (PDF), and inline image rendering. AGI Mobile matches exactly. Claude iOS does **not** support image generation; AGI Mobile has the slash command stubbed but waitlisted. No video attachment (Claude doesn't either). No audio file attachment (Claude doesn't either). Hypothesized gap: Claude iOS supports OCR + extracted-text preview on the attached PDF/image; not evident in `AttachmentPreview.tsx` (which shows file name + size only). However a `vision.ts` service exists at `apps/mobile/src/features/image/services/vision.ts` (modified file per `git status`) and tests at `__tests__/vision-ocr-fallback.test.ts` indicate vision OCR is being wired.

**Severity:** P2
**Hours:** 6

---

## Slash commands

**Evidence ref:**

- `apps/mobile/src/features/chat/components/CommandPalette.tsx:21-99` (`/image`, `/voice`, `/compare`, `/export`)

**Current state:** Slash palette opens when the user types `/`. Four commands available. The handler in chat/[id].tsx:201-217 intercepts `/image ` and produces an Alert if `FEATURES.imageGen = false`.

**Gap delta:** Claude iOS does not have a slash-command system; its quick-actions live in a button row above the keyboard ("Help me write", "Brainstorm", "Code", etc.). AGI's slash palette is a developer-style affordance closer to Claude.ai web than Claude iOS. Not a parity gap with Claude iOS specifically — possibly a polish gap if the design lock prefers iOS-native chips over slash menus.

**Severity:** P2
**Hours:** 3

---

## Keyboard shortcuts

**Evidence ref:** No `useKeyboard` shortcut handling found in chat input or message list. iPad hardware-keyboard `KeyboardAvoidingView` is used (`apps/mobile/app/(app)/chat/[id].tsx:6-12`) but no shortcut wiring.

**Current state:** No app-level keyboard shortcuts.

**Gap delta:** Claude iOS supports a small set of iPad keyboard shortcuts (`⌘N`, `⌘K`, `⌘↩` to send). Not visible in AGI Mobile. Minor since most users are phone-only, but iPad parity gap.

**Severity:** P2
**Hours:** 4

---

## Push notifications

**Evidence ref:**

- `package.json:75` (`expo-notifications: ~55.0.22` installed)
- `apps/mobile/src/features/settings/notifications/index.tsx`, `apps/mobile/app/(app)/settings/notifications.tsx`, `apps/mobile/stores/notificationPrefsStore.ts`
- No `requestPermissionsAsync` call wired into onboarding (`apps/mobile/app/(public)/onboarding.tsx:1-50` read; no notifications import in the head).

**Current state:** Notifications preferences UI is present and `expo-notifications` is installed, but the permission ask is not wired into onboarding (typical Apple HIG pattern is just-in-time at the moment of usefulness — e.g., "We'll ping you when your local model finishes downloading"). Background fetch is via `expo-background-fetch`/`expo-task-manager` but the link to user-visible local notifications during model download is not evident.

**Gap delta:** Claude iOS asks for push permission on first chat completion and uses notifications for "Your shared chat got a reply" etc. AGI Mobile has the plumbing but the just-in-time prompt is not in onboarding nor model-download flow. Useful for download progress.

**Severity:** P2
**Hours:** 4

---

## Native storage / Secrets

**Evidence ref:**

- `apps/mobile/lib/mmkv.ts` (MMKV encrypted storage facade — referenced from `UpsellCard.tsx:15`, `voicePresets.ts`, etc.)
- `apps/mobile/lib/secureStorage.ts`, `lib/biometricFlagStore.ts`, `lib/pinning.ts`
- `apps/mobile/package.json:93` (`react-native-mmkv: ^3.2.0`)
- `apps/mobile/package.json:75` (`expo-secure-store: ~55.0.13`)
- `apps/mobile/package.json:70` (`expo-local-authentication: ~55.0.13`)

**Current state:** MMKV (encrypted) used for dismissed-state TTLs and prefs; SecureStore for sensitive data; expo-local-authentication for biometric flag gating. `FEATURES.byokKeys = false` — no key entry UI yet.

**Gap delta:** Claude iOS uses Keychain for auth tokens and standard `UserDefaults` for prefs. AGI Mobile pattern (MMKV + SecureStore + biometric flag) is more capable. No gap.

**Severity:** no gap visible — needs cross-validation by the lead
**Hours:** 0

---

## Summary roll-up

| Surface area                                | Severity | Hours   |
| ------------------------------------------- | -------- | ------- |
| Composer                                    | P1       | 8       |
| Sidebar / Drawer / History                  | P2       | 6       |
| Model picker                                | —        | 0       |
| Tool-call rendering                         | P2       | 4       |
| Settings                                    | P1       | 12      |
| Onboarding                                  | P2       | 6       |
| Billing / Paywall (StoreKit IAP)            | **P0**   | 40      |
| Artifacts                                   | P1       | 24      |
| Computer-use / Connectors                   | P1       | 16      |
| Voice                                       | P2       | 5       |
| Agents                                      | —        | 0       |
| Auth (runtime exposure)                     | P1       | 8       |
| Projects (per-project files / instructions) | P1       | 10      |
| Memory                                      | —        | 0       |
| Search                                      | P1       | 8       |
| Attachments / Multi-modal (OCR)             | P2       | 6       |
| Slash commands                              | P2       | 3       |
| Keyboard shortcuts                          | P2       | 4       |
| Push notifications                          | P2       | 4       |
| Native storage / Secrets                    | —        | 0       |
| **Total**                                   |          | **164** |

## Notable observations for the lead

1. **The P0 finding is StoreKit IAP**: `apps/mobile/src/features/paywall/components/ProPlusPaywall.tsx:78-84` opens an external pricing URL, which is non-compliant with Apple Guideline 3.1.1 outside of the EU external-link entitlement. This will block App Store submission. Memory locks this at 15 % via Apple Small Business Program — but code does not match the lock.
2. **`v1FeatureFlags.ts` is the single most important file for understanding mobile state.** Many features audited above have full implementations but are off-by-default in v1. The audit reflects current runtime exposure, not code completeness.
3. **Duplicate tool-call renderers (`InlineToolCall.tsx` and `ToolCallCard.tsx`)** suggest in-flight refactor and risk of inconsistent UI between screens.
4. **Onboarding push-notification ask is missing** — easy win for model-download UX.
5. **Personalization sliders are AGI-specific and well-built** (`personalization/index.tsx:29-34`) — could be cited as a place AGI exceeds Claude iOS.
