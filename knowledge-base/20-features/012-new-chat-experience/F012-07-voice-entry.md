---
id: "F012-07"
type: "feature"
title: "Voice entry"
aliases: ["Voice mode", "Start voice mode", "Live voice", "Voice entry button", "VoiceEntryButton", "S12.14", "Meet Voice (mobile intro sheet)", "/voice (CLI and mobile slash command)"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S12.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "file:apps/web/app/api/voice/live/sessions/route.ts", "api:POST /api/voice/live/sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-07 Voice entry

A button next to the empty composer that starts a spoken, hands-free conversation. Web and desktop show it only for cloud-managed chats when the account may use voice. Mobile opens a voice intro, then a live voice chat. The CLI uses a push-to-talk /voice command. VS Code has no voice mode.

Area: [12. New-chat experience](README.md). Requirement items: [S12.14](../../10-requirements/capabilities/012-new-chat-experience.md#s1214).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person leave the typed box and talk to the assistant. On web and desktop the button 'Start voice mode' enters a voice session surface. On mobile it creates a 'Voice chat' conversation and opens it in live voice, or falls back to turn-based voice on the device. In the CLI /voice records with push-to-talk and sends the transcript as a message. (apps/web/features/chat/components/Composer/VoiceEntryButton.tsx:9) (apps/mobile/app/(app)/(tabs)/chat.tsx:1071) (apps/cli/src/voice.rs:1)

**Why it exists.** The area brief says the new-chat screen must let the user start a spoken (voice-mode) conversation (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.14). The mobile requirements say live voice is separate from dictation and must be labelled unavailable when it is (doc: docs/product/requirements.md, M-VOICE-004).

**Who uses it.** People on web, desktop, mobile and the CLI who want hands-free or spoken chat, including people who cannot type easily.

**Problems it solves**

- Typing is slow or impossible while walking, driving or when hands are busy.
- Dictation only fills the box; voice mode is a back-and-forth spoken chat.
- People need a clear reason when voice cannot be used (Local mode, signed out, switched off).

**Use cases**

- On web, click the round voice button in an empty composer and talk with a cloud model.
- On mobile, tap the voice button in the chat input, accept the first-use intro, pick a voice, and talk.
- In the CLI, type /voice, hold SPACE to record, release to send the transcript.
- On desktop, use the hosted web composer's voice button, or the desktop voice hotkey to toggle dictation.

## 2. User experience

**Where to find it**

- Web: round button labelled 'Start voice mode' at the end of the composer, shown instead of the send button while the field is empty and no turn is running (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955).
- Desktop: the public Electron window shows the hosted web app, so it is the same button (doc: AGENTS.md section 5, 'The public Desktop shows the hosted web app').
- Mobile: round button with accessibility label 'Start voice mode' and hint 'Opens hands-free voice conversation' in the chat input when it is idle and empty (apps/mobile/src/features/chat/components/ChatInput.tsx:2293); also the '/voice' slash command (apps/mobile/src/features/chat/components/ChatInput.tsx:1563).
- CLI: '/voice' or '/v' slash command in the line REPL and the TUI (apps/cli/src/repl/slash_commands.rs:530) (apps/cli/src/tui/tui_app.rs:6352).
- VS Code: none. Chrome: a microphone button labelled 'Voice input' exists in the side panel (apps/extension/src/side_panel.ts:14099); whether it is dictation or voice mode was not opened beyond its label (unknown).

**Before you start**

- Web: the canUseVoice capability is granted, the host passes a voice handler, and the chat is cloud-managed (no on-device model, no local turns, provider mode ManagedGateway or ManagedNative) (apps/web/features/chat/pages/WebChatPage.tsx:5907).
- Server: the plan must allow voice and the capability flag must be on, or the session request is refused (apps/web/app/api/voice/live/sessions/route.ts:308).
- Mobile: the canUseVoice capability; live voice also needs Cloud mode, a signed-in account, a native build with WebRTC and an https server; otherwise it stays turn based (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:21).
- CLI: a microphone and one transcription route (account, a provider key, or a local whisper program) (apps/cli/src/voice.rs:1).

**Screens and controls**

- Web: VoiceEntryButton (title and aria-label 'Start voice mode'); a separate dictation microphone button sits beside it (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6941).
- Web voice session: VoiceModeSurface, VoiceOrb, VoiceComposer, VoiceSettingsModal, AudioRoutePicker in apps/web/features/chat/components/Voice.
- Mobile: VoiceIntroHint, VoiceOnboardingSheet ('Meet Voice', Continue), VoicePickerSheet, VoiceInlineBar (apps/mobile/app/(app)/(tabs)/chat.tsx:1454).
- CLI: prompt text of push-to-talk; SPACE records, ESC exits (apps/cli/src/voice.rs:49).

**Journey**

1. Web: open a new chat with a cloud model; the composer is empty so the voice button replaces Send.
2. Click 'Start voice mode'; the page calls enterVoiceSession which stops any dictation and dispatches the enter event (apps/web/features/chat/stores/voice-session-store.ts:220).
3. The voice surface asks the server for a live session; the server checks capability, plan, allowance or budget, and reserves usage (apps/web/app/api/voice/live/sessions/route.ts:731).
4. Talk; captions and the orb show state; use settings for voice, language, pace.
5. Mobile: tap the voice button; first time a 'Meet Voice' sheet shows, then a voice picker, then startVoiceMode creates a 'Voice chat' conversation and opens it with voice=live (apps/mobile/app/(app)/(tabs)/chat.tsx:1114).
6. If live voice is unavailable but the on-device recognizer is guaranteed, mobile shows the inline turn-based voice bar with the reason (apps/mobile/app/(app)/(tabs)/chat.tsx:1076).

**What the person sees and gets**

- Web: voice orb, captions and announcements during the session; a usage-limit error is flagged so Retry is not offered (apps/web/features/chat/stores/voice-session-store.ts:63).
- Mobile: Alert 'Voice is unavailable' with 'The chat could not be started.' or the switched-off text; inline reason strings such as 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17).
- Mobile intro disclosure: 'Your voice is transcribed on this device and never recorded.' (on-device) or that audio streams to the voice provider and the transcript is saved (live) (apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:67).
- CLI: transcript is appended to the session labelled '(spoken)' in the TUI (apps/cli/src/tui/tui_app.rs:4469).

**Settings**

- Web: dictationEnabled setting and a billing 'disabledFeatures' switch affect dictation, not voice mode (apps/ web/features/chat/components/Composer/ChatComposerNew.tsx:1790).
- Web voice session store keeps voice, language, pace, reasoning (store name agi-web-voice-session) (apps/web/features/chat/stores/voice-session-store.ts:23).
- Mobile: voiceEnabled, voiceOnboardingSeen, start-with-voice-on-launch (apps/mobile/app/(app)/(tabs)/chat.tsx:1124) (apps/mobile/stores/settingsStore.ts:55).
- CLI: language argument to /voice, validated against supported languages (apps/cli/src/repl/slash_commands.rs:536).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web voice entry button renders only when a voice handler exists, canUseVoice is granted, no turn is streaming and the field is empty (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955).
- Web hands a handler to the composer only for managed models without local turns (apps/web/features/chat/pages/WebChatPage.tsx:5907) (apps/web/features/chat/pages/WebChatPage.tsx:7672).
- Server session route checks plan, flag, training opt-out, free allowance or paid budget and reserves usage (apps/web/app/api/voice/live/sessions/route.ts:308).
- Web dictation is refused for Local and own-key (DirectByok) selections and for conversations that hold local or own-key turns (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2048).
- Mobile voice entry, intro sheet, picker, live route push and on-device fallback are wired (apps/mobile/app/(app)/(tabs)/chat.tsx:1071).
- CLI /voice with push-to-talk and three transcription backends, with a cloud-egress gate for Local privacy sessions (apps/cli/src/voice.rs:980).

**Incomplete**

- CLI cannot be used as a spoken reply loop: the module records and transcribes; whether it speaks answers was not checked (unknown) (apps/cli/src/voice.rs:1).
- Desktop: no desktop-only code for the voice-mode button was found; it relies on the hosted web app (apps/web/features/chat/pages/WebChatPage.tsx:7672).

**Present but disconnected or switched off**

- Web voice button is hidden for Local and own-key chats because voiceManaged is false for them (apps/web/features/chat/pages/WebChatPage.tsx:5907).
- Chrome side-panel mic button is hidden unless canUseVoice is granted (apps/extension/src/side_panel.ts:15242).

**Not available**

- VS Code: no voice mode. A dictation client exists (apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts) but no live voice entry was found (brief: missing).
- Mobile Local mode: live voice is not offered ('Live voice runs in AGI Cloud') (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17).

## 4. Required behaviour

**Established requirements**

- From the new-chat screen the user can start a spoken (voice-mode) conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.14)
- Live voice mode is separate from dictation; if unavailable the UI labels it unavailable. (source: M-VOICE-004 (doc: docs/product/requirements.md))
- Voice privacy is documented so the user knows whether audio is local or provider/cloud. (source: M-VOICE-005 (doc: docs/product/requirements.md))
- No interim dictation text, as in ChatGPT and Claude (founder decision). (source: (doc: docs/decisions/2026-09-27-founder-decisions.md))

**Acceptance criteria**

1. On web with a cloud model and an empty composer, 'Start voice mode' shows; typing a character replaces it with Send.
2. With a Local or own-key model selected, the button does not show and dictation is refused.
3. With canUseVoice off for the account, the button is absent on web and mobile shows 'Voice is unavailable'.
4. A plan without voice gets a 403 from the live session route and the UI shows the plan message.
5. Mobile in Local mode or signed out never opens live voice and shows the reason text.
6. First mobile use shows the 'Meet Voice' sheet once; later uses skip it.
7. CLI /voice with an unsupported language prints the supported list and does not record.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The button hides while a turn runs so a spoken session cannot start over a stream [inferred from sendButtonMode !== 'stop'].
- Voice minutes are metered against plan allowance and usage budgets, since the route reserves usage before a session [inferred from reserveManagedUsageRequest call].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a visible reason on web when the button is hidden because the model is Local or own-key, instead of hiding it silently.
- [proposed] Record in this knowledge base whether the Chrome mic button is dictation or voice mode.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceEntryButton | `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx` | Round 'Start voice mode' button for the web and desktop composer. |
| component | ChatComposerNew (voice slot) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Chooses voice button versus Send, gates on canUseVoice, hosts dictation with Local/own-key refusal (lines 2048, 2084, 6955). |
| screen | WebChatPage voice wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Computes voiceManaged and passes onEnterVoiceMode to the composer (lines 5907, 7672, 7800). |
| store | useVoiceSessionStore / enterVoiceSession | `apps/web/features/chat/stores/voice-session-store.ts` | Persisted voice session state (agi-web-voice-session) and the enter action. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | The voice conversation screen on web and desktop. |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Creates a live voice session: capability flag, plan, allowance or budget, training opt-out, usage reservation. |
| hook | useDictation / dictationSwitchedOffReason | `apps/web/features/chat/hooks/use-dictation.ts` | Separate dictation controller; honours billing switch-off. |
| hook | useDesktopVoiceHotkey | `apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts` | Desktop global hotkey that toggles dictation in the composer. |
| config | canUseVoice capability | `packages/contracts/types/src/capabilities.ts` | Capability id and default per surface. |
| service | capability handshake | `apps/web/lib/services/capability-handshake-service.ts` | Removes canUseVoice when the plan policy has allowVoice false (line 118). |
| screen | Mobile new chat screen voice logic | `apps/mobile/app/(app)/(tabs)/chat.tsx` | startVoiceMode, handleOpenVoiceMode, intro sheet, picker, launch-with-voice (lines 1071-1135, 1410, 1454). |
| component | ChatInput voice button | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile 'Start voice mode' button, /voice slash command, hold-to-talk dictation. |
| service | liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable (Local mode, signed out, no native module, insecure server). |
| component | VoiceOnboardingSheet | `apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx` | First-use 'Meet Voice' sheet and on-device or live disclosure. |
| component | VoicePickerSheet / VoiceInlineBar | `apps/mobile/src/features/voice/components` | Voice choice sheet and the turn-based inline voice bar. |
| command | /voice (CLI) | `apps/cli/src/repl/slash_commands.rs` | Parses /voice or /v with a language and returns SlashResult::Voice (line 530); TUI twin at apps/cli/src/tui/tui_app.rs:6352. |
| service | voice module (CLI) | `apps/cli/src/voice.rs` | Push-to-talk recording, backends, privacy egress gate, capability refusal. |
| service | CLI tier cache voice capability | `apps/cli/src/tier_cache.rs` | VOICE_CAPABILITY constant 'canUseVoice' used to refuse managed voice (line 282). |
| component | Chrome side panel mic button | `apps/extension/src/side_panel.ts` | 'Voice input' button gated by canUseVoice (lines 14099, 15242). |
| test | Voice tests (mobile) | `apps/mobile/__tests__/VoiceOnboarding.test.tsx` | Mobile voice intro tests; many sibling Voice*.test.tsx files. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks 'Start voice mode'; the composer calls the host handler. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2085 |
| enterVoiceSession cancels any dictation listening and dispatches the enter event to the session reducer. | device | apps/web/features/chat/stores/voice-session-store.ts:220 |
| The page asks the server for a live session. The server checks the canUseVoice flag, plan voice permission, free allowance or paid budget, and reserves usage. | our servers | apps/web/app/api/voice/live/sessions/route.ts:308 |
| Audio and replies run between the device and the live voice provider chosen by the server; the model comes from the live voice catalog. | outside service | apps/web/app/api/voice/live/sessions/route.ts:290 |
| Mobile checks Local mode, sign-in and native module, then creates a 'Voice chat' conversation and opens it with voice=live. | device and our servers | apps/mobile/app/(app)/(tabs)/chat.tsx:1089 |
| Mobile fallback: turn-based voice uses the on-device speech recognizer, with the disclosure that the voice is transcribed on the device. | device | apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:67 |
| CLI records with the default microphone, writes a temporary WAV, transcribes through the account, a provider key, or a local whisper program, then deletes the recording. | device and our servers | apps/cli/src/voice.rs:980 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice session settings (voice, language, pace, reasoning) | Browser storage key agi-web-voice-session | No sync found; per browser | Reset on logout through resetOnLogout (apps/web/features/chat/stores/voice-session-store.ts:80) |
| Live voice usage reservation and settlement | Managed usage tables in our database (table names not opened) | Server side | unknown |
| CLI temporary recording | Recordings folder on the device | No | Removed after transcription; stale ones swept (apps/cli/src/voice.rs:983) |
| Mobile voiceOnboardingSeen flag | Mobile settings store | unknown | unknown |

**Models and providers.** Web live voice uses a catalog-resolved live model and a plan-dependent backend model chosen on the server, not by the user (apps/web/app/api/voice/live/sessions/route.ts:290). Voice is only offered for managed (Cloud) models; own-key and Local selections are excluded (apps/web/features/chat/pages/WebChatPage.tsx:5907). CLI transcription can use the AGI account, an OpenAI key, or a local whisper program (apps/cli/src/voice.rs:1). Provider names for live voice were not read: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and desktop: signed-in account needed for the live session route (user id read at session creation). Mobile: signed-in for live voice, none for turn-based on-device voice. CLI: account only for the managed backend. |
| Permissions | Microphone permission on mobile and browser (mobile has permission alerts: apps/mobile/src/features/voice/components/voicePermissionAlert.ts). On the server the canUseVoice capability must be available for the subject (apps/web/app/api/voice/live/sessions/route.ts:308). |
| Subscription | A plan whose tier policy has allowVoice is required; otherwise 403 (apps/web/app/api/voice/live/sessions/route.ts:318). Free plans get a seconds allowance (freeVoiceAllowanceSeconds) and paid plans are checked against a budget and a voice_minutes allowance (apps/web/app/api/voice/live/sessions/route.ts:340). Exact plan names: unknown here. |
| Limits and metering | Sessions are reserved in blocks (LIVE_VOICE_BLOCK_SECONDS) with a lease; usage is settled, abandoned sessions are settled before the allowance is read (apps/web/app/api/voice/live/sessions/route.ts:380). Numbers are config in code, not restated here. |
| Feature flags | canUseVoice capability flag evaluated per user, workspace, plan and surface (apps/web/app/api/voice/live/sessions/route.ts:299). Dictation can also be switched off by a billing 'disabledFeatures' entry (apps/web/features/chat/hooks/use-dictation.ts:44). |
| Model compatibility | Only managed gateway or managed native models (apps/web/features/chat/pages/WebChatPage.tsx:5907). |
| Provider restrictions | The session refuses when the live voice model or the backend model may train on inputs and the user opted out, or the chat carries Google user data (apps/web/app/api/voice/live/sessions/route.ts:330). |
| Local mode | Web: no voice-mode button and dictation is off for Local selections. Mobile: live voice is off in Local mode ('Live voice runs in AGI Cloud, so Local Mode stays turn based.') but on-device turn-based voice can run where the recognizer is guaranteed (apps/mobile/app/(app)/(tabs)/chat.tsx:1069). CLI Local privacy sessions gate cloud transcription (apps/cli/src/voice.rs:980). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Field has text | Voice button is replaced by Send. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955 |
| Turn is streaming | Voice button hidden (Stop shows); voice toggle ignored while streaming. | apps/web/features/chat/pages/WebChatPage.tsx:5921 |
| Usage limit reached | Store marks the error as a usage limit so retry is not offered. | apps/web/features/chat/stores/voice-session-store.ts:63 |
| Browser blocks assistant audio | playbackBlocked state until the user taps. | apps/web/features/chat/stores/voice-session-store.ts:65 |
| Connection dropped / session ended / provider error (mobile) | Specific message strings, keep talking after provider error. | apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:6 |
| Microphone denied (mobile) | 'Microphone access was denied. Allow the microphone to use live voice.' | apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:5 |
| Chat could not be started (mobile) | Alert, or fall back to turn-based voice with a reason. | apps/mobile/app/(app)/(tabs)/chat.tsx:1096 |
| Offline | Web composer send is disabled when online is false; voice-specific offline handling not found. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6978 |
| Accessibility | Web button has title and aria-label; mobile button has label, hint and role. | apps/mobile/src/features/chat/components/ChatInput.tsx:2293 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/VoiceEntryButton.test.tsx`: Button name 'Start voice mode' and phone touch area classes.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Voice mode screen rendering.
- `apps/web/features/chat/pages/__tests__/WebChatPage.shortcuts.test.tsx`: Page shortcuts that touch voice toggle (mentions enterVoiceSession).
- `apps/mobile/__tests__/VoiceOnboarding.test.tsx`: Mobile voice intro.
- `apps/mobile/__tests__/CapabilityKillSwitchConsumers.test.tsx`: Mobile consumers of canUseVoice switch-off.
- `apps/mobile/__tests__/VoiceConversationPtt.test.tsx`: Push-to-talk in the voice conversation.
- `packages/contracts/types/src/__tests__/capabilities.test.ts`: Capability definitions including canUseVoice.
- `apps/cli/src/voice.rs`: 18 in-file Rust tests on recording, backends and privacy gate (count by test attribute).

**Test scenarios**

- **Web voice button on a cloud model**
  1. Sign in with a plan that allows voice.
  2. Open a new chat and pick a managed model.
  3. Leave the composer empty.
  - Expected: 'Start voice mode' appears; clicking opens the voice surface.
- **Web voice hidden for Local**
  1. Select an on-device or own-key model.
  2. Look at the empty composer.
  - Expected: No voice button; dictation start is refused.
- **Plan without voice**
  1. Use an account whose plan has voice off.
  2. Start voice mode.
  - Expected: Server returns 403 with the plan message and the UI shows it.
- **Mobile first use**
  1. Fresh install in Cloud mode, signed in.
  2. Tap the voice button.
  - Expected: 'Meet Voice' sheet, then picker, then a new 'Voice chat' opens in live voice.
- **Mobile Local mode**
  1. Switch to Local mode.
  2. Tap the voice button.
  - Expected: Live voice not started; inline turn-based voice shows 'Live voice runs in AGI Cloud...' where the on-device recognizer exists.
- **CLI voice**
  1. Run the CLI, type /voice en (use a supported code).
  2. Hold SPACE, speak, release.
  - Expected: Transcript appears as a message; ESC exits voice mode.

**Where to look when it fails**

- Server log events live_voice_unpriced and voice_session_expiry_failed (apps/web/app/api/voice/live/sessions/route.ts:271).
- Error codes VOICE_USAGE_NOT_IN_PLAN and model_may_train in the session response.
- Mobile Alert titles 'Voice is unavailable'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **Web voice entry hides silently for Local and own-key chats; no reason shown.** Affects: Web and desktop users on Local or own-key models. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:5907. Work needed: Show a short unavailable reason in the composer (requirement M-VOICE-004 style).
- **VS Code has no voice mode.** Affects: VS Code. Evidence: brief S12.14 status missing. Work needed: Decide scope; product doc not found.
- **Brief status for Chrome is absent but a mic button exists.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:14099. Work needed: Open the Chrome voice code and classify it as dictation or voice mode.
- **Brief line numbers for web and mobile voice code have drifted (for example ChatComposerNew.tsx:5181 is no longer the voice button).** Affects: Anyone following the brief. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6955. Work needed: Refresh the brief's code references.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- file:apps/web/app/api/voice/live/sessions/route.ts
- api:POST /api/voice/live/sessions

## Unknown

- Which live voice provider and model the session uses at run time (read from catalog, not opened).
- Whether the CLI speaks replies aloud.
- Whether the Chrome mic button is dictation or voice mode.
- Tables used for voice usage reservation.
- Exact plan names with allowVoice true.
- Whether voiceOnboardingSeen syncs across devices.
