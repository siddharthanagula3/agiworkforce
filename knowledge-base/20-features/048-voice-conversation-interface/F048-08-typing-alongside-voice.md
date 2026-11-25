---
id: "F048-08"
type: "feature"
title: "Typing alongside voice"
aliases: ["Typing alongside voice", "Continue in text", "Type while speaking (S48.24)", "Transcript editing (S48.23)", "Continue unfinished work in text (S48.38)", "Type instead", "Switch to text for this chat", "Voice mode composer"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.23", "S48.24", "S48.38"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "provider:openai", "plan:free", "SYS-chat-turn-pipeline", "SYS-voice-and-media", "SYS-memory-projects-and-context", "F048-10"]
basis: "code inspection"
second_reader: "9 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-08 Typing alongside voice

Lets a person leave live voice and keep going in the same chat by typing. On web the voice screen also has a typed field that sends a normal text turn while the call stays open. iPhone has 'Type instead' to leave the call. In the CLI, spoken text can be edited before sending, and Esc returns to the same typed session.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.23](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4823), [S48.24](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4824), [S48.38](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4838).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a way to move between speaking and typing without losing the conversation. Voice turns are saved as messages in the same chat as typed ones, so ending a call leaves a normal chat to continue (apps/web/features/chat/pages/WebChatPage.tsx:6739-6790).

**Why it exists.** Voice fails or is unwelcome at times: noisy rooms, limits reached, no microphone, sensitive text. The brief requires that unfinished work can continue in text (S48.38). The brief calls typing during voice and transcript editing not applicable, but the code has both on web and the CLI.

**Who uses it.** Web and Desktop users in a voice call, iPhone users in a live call, CLI users in /voice.

**Problems it solves**

- A usage limit or error ends the call but the task is not finished.
- Names, numbers and code are hard to speak.
- A wrong transcript is sent to the assistant (CLI lets the person fix it first).

**Use cases**

- Ask something by voice, then type a precise follow-up in the voice screen on web.
- Hit the voice limit, press 'Continue in text', and keep the same chat.
- On iPhone tap 'Type instead' to bring up the keyboard in the same chat.
- In the CLI press 'e' to edit the transcribed sentence, then Enter to send.

## 2. User experience

**Where to find it**

- Web and public Desktop: the voice screen's pill composer with a text field placeholder 'Type' (aria-label 'Type a message to send as a normal turn') and a round close button 'End voice session' (apps/web/features/chat/components/Voice/VoiceComposer.tsx:9-17, 101-110, 133-145). 'Continue in text' appears in the usage-limit and voice-unavailable rows (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:330-344).
- iPhone: 'Type instead' button (accessibility label 'Switch to text for this chat') at the bottom of the live bar, and 'Type a message instead' inside an error box (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:418, 704-718).
- CLI: /voice (alias /v) in the TUI or REPL; Esc leaves voice mode (apps/cli/src/tui/tui_app.rs:6352-6368; apps/cli/src/voice.rs:178-186).

**Before you start**

- A started voice session (web: managed Cloud chat; iPhone: Cloud chat; CLI: build with the voice feature, i.e. macOS or Windows release builds) (apps/cli/Cargo.toml:124-132; .github/workflows/release-cli.yml:240-278).

**Screens and controls**

- Web: text field, mic mute button, close button, 'Add' button 'Open this chat panel' (apps/web/features/chat/components/Voice/VoiceComposer.tsx:11-17, 87-146). Enter sends typed text; Space toggles mute only while the field is empty; Escape ends voice (lines 57-77).
- iPhone: 'Type instead', route button, mute, 'End live voice' (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:704-757).
- CLI prompt: '[ENTER to send, 'e' to edit, 'r' to re-record, ESC to discard]' (apps/cli/src/voice.rs:231-236).

**Journey**

1. Web typing during a call: 1. Start voice mode. 2. Click the 'Type' field and write a message. 3. Press Enter. 4. The call stays open; the message is sent as an ordinary chat turn and the reply is written, not spoken [inferred from apps/web/features/chat/hooks/use-voice-session.ts:893-896].
2. Web leaving voice: 1. Press the close button, or Escape, or 'Continue in text'. 2. The session closes and settles usage (apps/web/features/chat/hooks/use-voice-session.ts:501-506). 3. The normal composer returns in the same chat (apps/web/features/chat/pages/WebChatPage.tsx:7665-7675, 7793-7805).
3. iPhone: 1. Tap 'Type instead'. 2. The live bar hides and the chat input gets focus (apps/mobile/app/(app)/chat/[id].tsx:1779-1782). 3. Type in the same chat.
4. CLI: 1. Run /voice. 2. Hold Space to record, release. 3. Choose Enter, e, r or Esc. 4. Press Esc at the prompt to return to the typed prompt in the same session (apps/cli/src/tui/tui_app.rs:7556-7580). Esc means different things by prompt: at the record prompt it exits voice (apps/cli/src/voice.rs:574), and at the confirm prompt it discards only that sentence and stays in voice (apps/cli/src/voice.rs:599).

**What the person sees and gets**

- Web: typed text is sent through the chat send path; a failed send shows the voice error row with 'Try again' (apps/web/features/chat/hooks/use-voice-session.ts:1004-1014; VoiceModeSurface.tsx:346-361).
- Web: spoken turns appear in the message list as they stream and are saved without a model call (apps/web/features/chat/pages/WebChatPage.tsx:6739-6788).
- CLI: spoken user messages are marked with a voice transcript label in the TUI history and a 'Voice session ended.' system line (apps/cli/src/tui/tui_app.rs:7566-7578).
- iPhone: no message of its own; the chat continues.

**Settings**

- Web: Voice settings dialog has 'Chat intelligence', which picks the model setting for typed replies when voice is open (apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:45-46, 396 area).
- CLI: --voice-lang and the default voice language (apps/cli/src/lib.rs:5952-5956).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web typed field inside voice (apps/web/features/chat/components/Voice/VoiceComposer.tsx:101-110; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:284-288).
- Web exit by close button, Escape, or the limit/unavailable 'Continue in text' (VoiceComposer.tsx:57-63; VoiceModeSurface.tsx:245-254, 330-344).
- Web voice turns written into the chat list and saved to history (apps/web/features/chat/pages/WebChatPage.tsx:6739-6790).
- iPhone leaving the call into the keyboard (apps/mobile/app/(app)/chat/[id].tsx:1779-1782).
- CLI edit before send, re-record and discard (apps/cli/src/voice.rs:238-256, 1078-1087); CLI hand-off into the same AgentSession (apps/cli/src/tui/tui_app.rs:7556-7580).
- CLI /dictate inserts the transcript into the composer instead of sending (apps/cli/src/tui/tui_app.rs:7520-7540).

**Incomplete**

- Web typed submit calls the send path even if the state machine ignores the event (statuses outside the list, for example entering) [inferred from apps/web/features/chat/hooks/use-voice-session.ts:1008-1013 and packages/ui/unified-chat/src/voice/voice-session-machine.ts:71-78, 139-147].
- iPhone live voice cannot take typed text while the call runs; the only way is to leave the call (apps/mobile/__tests__/LiveVoiceBar.test.tsx:558).

**Present but disconnected or switched off**

- CLI voice is compiled out of Linux release builds and of any build without the 'voice' feature; the stand-in command reports it (apps/cli/src/lib.rs:77-106; .github/workflows/release-cli.yml:240-278).

**Not available**

- Editing a spoken transcript on web and iPhone live voice (live transcript is shown as captions only); the web 'Do not send that' control only cancels the pending sentence (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:383-401).
- Typing during live voice on iPhone.
- VS Code and Chrome extension live voice (both marked missing in the brief S48.01).

## 4. Required behaviour

**Established requirements**

- The user can leave voice and continue the same unfinished conversation by typing. (source: S48.38)
- During voice the user can also type into the same conversation. (source: S48.24 (brief marks it not applicable; code disagrees on web))
- Where appropriate the user can correct a spoken turn before or after it is acted on. (source: S48.23 (brief marks it not applicable; CLI code disagrees))
- Voice runs inside the chat view and transcripts of spoken turns appear in the same message list as typed turns. (source: S48.03)

**Acceptance criteria**

1. Ending voice on web leaves the same chat open with every voice turn visible in the message list.
2. Typing in the web voice field and pressing Enter sends one text turn and the call stays open.
3. Escape or the close button ends the call and releases the microphone.
4. On iPhone 'Type instead' hides the live bar, closes the call and focuses the chat input in the same chat.
5. In the CLI 'e' opens the transcript for editing and the edited text, not the original, is sent.
6. The usage-limit row on web shows 'Continue in text' and pressing it ends the session.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A typed reply during a call should not be spoken unless the person asks [inferred from replyComplete spoken false at apps/web/features/chat/hooks/use-voice-session.ts:893-896].
- Voice and typed turns should share one history order [inferred from apps/web/features/chat/pages/WebChatPage.tsx:6739-6790].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief: S48.24 done on web, S48.23 done in the CLI.
- [proposed] Offer typing during a live call on iPhone.
- [proposed] Show the label 'Continue in text' on the normal exit, not only in error rows.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceComposer | `apps/web/features/chat/components/Voice/VoiceComposer.tsx` | Type field, mute, close; Enter, Space and Escape handling. |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Renders composer, sending chip, limit and error rows with 'Continue in text'. |
| hook | useVoiceSession.submitTyped / exit | `apps/web/features/chat/hooks/use-voice-session.ts` | Sends typed text through onSend; exit closes and settles the session (1004-1014, 501-506). |
| store | voice-session-store | `apps/web/features/chat/stores/voice-session-store.ts` | Holds the voice state machine instance used by the surface. |
| service | voiceSessionReducer | `packages/ui/unified-chat/src/voice/voice-session-machine.ts` | typedSubmit and exit transitions (139-147, 102-103). |
| component | WebChatPage voice wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | handleVoiceSend (6793-6799), handleVoiceTranscript (6739-6790), swaps composer and VoiceModeSurface (7665-7675, 7793-7805). |
| component | ChatComposerNew voice entry | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Shows the voice entry button when the field is empty (6955-6956). |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | 'Type instead' and 'Type a message instead' controls. |
| component | LiveVoiceComposer | `apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx` | Connects bar to useLiveVoiceSession; exit calls onEnded(null). |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | handleSwitchLiveVoiceToText (1779-1782), handleLiveVoiceEnded (1771-1777), mounts LiveVoiceComposer (2826). |
| hook | useLiveVoiceSession | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Appends final voice turns to the chat store (204-225). |
| store | chatMessageStore appendVoiceTurn | `apps/mobile/stores/chat/chatMessageStore.ts` | Stores voice turns in the conversation (line 394). |
| command | /voice and /dictate (CLI TUI) | `apps/cli/src/tui/tui_app.rs` | Slash parsing (6352-6368) and run (7520-7580). |
| service | run_voice_mode and edit_transcript | `apps/cli/src/voice.rs` | Record, transcribe, confirm, edit, send (75-300, 1078-1087). |
| config | voice feature gate | `apps/cli/Cargo.toml` | Voice feature off by default (124-132). |
| config | CLI release build flags | `.github/workflows/release-cli.yml` | Voice built on macOS and Windows only (240-278). |
| endpoint | POST /api/chat/conversations/{id}/messages | `apps/web/features/chat/pages/WebChatPage.tsx` | Saves a final voice turn with skipLlm (6759-6770). |
| test | VoiceComposer test | `apps/web/features/chat/components/Voice/VoiceComposer.test.tsx` | Enter sends, Space only when empty, Escape exits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: Enter in the voice field calls submitTyped, which always forwards the text to the chat send path. The state moves to streaming only from listening, muted, transcribing, sending, speaking or error; in other states it stays as it was. A failed send dispatches fail. | device | apps/web/features/chat/hooks/use-voice-session.ts:1004-1014; apps/web/features/chat/pages/WebChatPage.tsx:6793-6799; packages/ui/unified-chat/src/voice/voice-session-machine.ts:71-78, 139-147 |
| The typed message goes through the normal chat pipeline on our servers to the chat's model. | our servers | apps/web/features/chat/pages/WebChatPage.tsx:6793-6799 (handleSend) [inferred: server leg not opened here] |
| Each final spoken turn is added to the list and saved to the conversation without a model call. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:6739-6770 |
| Leaving voice closes the realtime connection, then records the session close and its usage. | device and our servers | apps/web/features/chat/hooks/use-voice-session.ts:464-499; apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:165 |
| iPhone: 'Type instead' hides the bar; the effect cleanup closes the call and settles it. | device and our servers | apps/mobile/app/(app)/chat/[id].tsx:1779-1782; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:450-463, 492-503 [inferred link] |
| CLI: audio is recorded locally, then transcribed by the signed-in AGI account, the OpenAI transcription API, or a local whisper binary; the text is sent to the agent session like typed text. | device and our servers | apps/cli/src/voice.rs:427-443, 257-285, 968-1010 |
| CLI Local privacy mode blocks cloud transcription unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1. | device | apps/cli/src/voice.rs:62-72, 458-500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice turns (user and assistant text) | table:messages via /api/chat/conversations/{id}/messages (table name not opened); mobile chat message store | Yes for web (saved to history); mobile sync path unknown | Kept as normal chat messages; deleted with the chat [inferred] |
| Voice session record (settings, pointer into transcript, no audio) | table:voice_sessions | Server side | Per apps/web/app/subprocessors/page.tsx:115: no audio is stored; retention period not found |
| CLI recording WAV | Temporary folder under the CLI recordings root | No | Stale folders are swept (apps/cli/src/voice.rs:884-926) |

**Models and providers.** Spoken turns on web use the realtime model from the voice_live routing slot (on a managed provider route) for speech and the plan's backend slot model for delegated work (apps/web/app/api/voice/live/sessions/route.ts:189-193, 311-318). A typed turn uses the chat's selected model, or the 'Chat intelligence' choice set in Voice settings (apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:45). CLI transcription uses AGI managed, OpenAI Whisper API with OPENAI_API_KEY, or a local whisper binary (apps/cli/src/voice.rs:1-6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | iPhone live voice needs a Cloud chat and a signed-in user (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:19-28). Web voice is gated by the route's auth and scoped-db check (apps/web/app/api/voice/live/sessions/route.ts). CLI managed transcription needs 'agi login'; other backends need a key or binary (apps/cli/src/voice.rs:127-143). |
| Permissions | Microphone permission. CLI asks for agreement before recording and states where audio goes (apps/cli/src/voice.rs:379-420). |
| Subscription | Opening voice needs a managed-compute subscription state that is allowed, the canUseVoice capability and a plan with allowVoice (apps/web/app/api/voice/live/sessions/route.ts:279-318, 336-348). Free has allowVoice with 10 minutes a calendar month (packages/contracts/types/src/model-catalog.ts:1234-1259; apps/web/lib/voice/free-voice-allowance.ts:47-52). Paid plans are charged against the usage budget. Typing has no separate rule. |
| Limits and metering | Voice minutes are metered per call (see F048-10). Free plan voice is capped at 10 minutes per calendar month (voiceMinutesPerMonth: 10), and a session started on that allowance keeps it for its whole length; this is why the 'Continue in text' row exists (packages/contracts/types/src/model-catalog.ts:1255-1257; apps/web/lib/voice/free-voice-allowance.ts:47-65). Typing and the typed model turn follow normal chat limits, not voice minutes [inferred]. The CLI records at most 120 seconds and ignores clips under 300 ms (apps/cli/src/voice.rs:33-39). |
| Feature flags | canUseVoice (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2084, 6955); CLI cargo feature 'voice' (apps/cli/Cargo.toml:132). |
| Model compatibility | Live voice on web is blocked for chats on a local model or non-managed provider; those chats keep the text composer (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911). The web gate requires that the chat's model use a managed provider mode (ManagedGateway or ManagedNative) (apps/web/app/api/voice/live/sessions/route.ts:189-193). The route also refuses with 403 'model_may_train' when a user's stored chats may train models, the live or backend model does not keep inputs out of training, and the chat holds Google user data (apps/web/app/api/voice/live/sessions/route.ts:320-340). |
| Provider restrictions | Web live voice needs a chat on a managed provider route (not necessarily OpenAI). The live model comes from the voice_live slot, and the backend model from the plan's backend slot (apps/web/app/api/voice/live/sessions/route.ts:189-193). CLI transcription may use OpenAI, AGI managed or local whisper. |
| Local mode | Web: no voice entry in a Local chat; typing continues as normal. iPhone: 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-18). CLI Local privacy mode: cloud transcription is refused unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1; a local whisper binary works with no egress (apps/cli/src/voice.rs:62-72, 481-483). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Voice unavailable in this chat | Row shows the reason and 'Continue in text'. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:334-345; apps/web/features/chat/hooks/use-voice-session.ts:828-833 |
| Voice refused because stored chats may train models (web) | The route replies 403 'model_may_train' when the live or backend model does not keep inputs out of training and the chat holds Google user data; the person lands in text. | apps/web/app/api/voice/live/sessions/route.ts:320-340 |
| Usage limit reached | Row with 'Upgrade' and 'Continue in text'. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:314-333 |
| Typed send fails | State becomes error with a send-failed message and retry. | apps/web/features/chat/hooks/use-voice-session.ts:1009-1011 |
| Space key while typing | Space only toggles mute when the field is empty and focus is not on a button. | apps/web/features/chat/components/Voice/VoiceComposer.tsx:70-75; test line 67-82 |
| Mute while a turn is in flight | Mute flag is kept without leaving streaming or speaking. | packages/ui/unified-chat/src/voice/voice-session-machine.ts:175-178 |
| Page hidden or closed | The live session ends on pagehide. | apps/web/features/chat/hooks/use-voice-session.ts:924-933 |
| CLI Esc key | At the record prompt Esc exits voice; at the confirm prompt it discards only that sentence and stays in voice. | apps/cli/src/voice.rs:574, 599 |
| CLI transcript empty or too short | '(no speech detected)' or '(recording too short, skipped)', loop continues. | apps/cli/src/voice.rs:213-216, 205-210 |
| CLI transcription error | Shows error and offers a retry. | apps/cli/src/voice.rs:219-224, 357-376 |
| Screen reader | Group labelled 'Voice mode composer'; status announced through a polite live region. | apps/web/features/chat/components/Voice/VoiceComposer.tsx:82; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:412-414 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceComposer.test.tsx`: Field, mute, close only; Enter sends; Space rules; Escape exits.
- `apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx`: Live-region announcements and captions.
- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Usage-limit row with Upgrade and way back to text (lines 323-406), pending-sentence chip.
- `apps/web/features/chat/hooks/useVoiceSession.test.tsx`: Enter, exit with settlement, transcript delivery.
- `packages/ui/unified-chat/src/voice/voice-session-machine.test.ts`: State machine transitions (file listed; per-case coverage not read).
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Denied microphone with retry and a way back to the keyboard (line 129); no add control (line 558).
- `apps/cli/src/voice.rs`: Inline Rust unit tests from line 1223 (names not read).
- `apps/web/e2e/voice-mode-layout.spec.ts`: Voice layout end to end; contents not read.

**Test scenarios**

- **Type during a web call**
  1. Start a Cloud chat, press 'Start voice mode'.
  2. Type 'what is 12 times 12' in the 'Type' field, press Enter.
  - Expected: The call stays open, the message appears in the chat list, and a written reply appears.
- **Leave voice and continue**
  1. Speak one question, wait for the reply.
  2. Press the close button 'End voice session'.
  3. Type a follow-up in the normal composer.
  - Expected: Both spoken turns are in the list; the follow-up continues the same chat.
- **Limit then text**
  1. Use a Free account with the 10 minute allowance used up.
  2. Start voice mode.
  - Expected: A limit row with 'Upgrade' and 'Continue in text' appears; pressing the second ends voice.
- **iPhone type instead**
  1. Open a Cloud chat on iPhone, start live voice.
  2. Tap 'Type instead'.
  - Expected: Live bar hides, keyboard opens in the same chat, call is closed.
- **CLI edit transcript**
  1. Run /voice in a macOS build.
  2. Hold Space, say a sentence, release.
  3. Press 'e', change a word, confirm.
  - Expected: The edited sentence is sent and appears marked as a voice transcript.

**Where to look when it fails**

- Web console warning '[voice] Could not save a voice turn to history:' and toast 'Part of this voice conversation could not be saved to your history.' (apps/web/features/chat/pages/WebChatPage.tsx:6772-6781).
- Toast 'This voice session did not close cleanly...' (apps/web/features/chat/hooks/use-voice-session.ts:309-312).
- Table voice_sessions on the server; close route logs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **Brief says typing during voice and transcript editing are not applicable, but web has a typed field and the CLI has transcript edit** Affects: Testers and documentation. Evidence: apps/web/features/chat/components/Voice/VoiceComposer.tsx:101-110; apps/cli/src/voice.rs:238-246. Work needed: Correct S48.23 and S48.24 in the brief.
- **iPhone live voice cannot be typed into while the call is open** Affects: iPhone users. Evidence: apps/mobile/__tests__/LiveVoiceBar.test.tsx:558; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:704-718. Work needed: Decide whether the same typed field should exist; otherwise record as intended.
- **No way to edit a spoken sentence on web or iPhone** Affects: Web, Desktop, iPhone. Evidence: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:383-401 only cancels. Work needed: Optional: edit before send.
- **Typed submit is forwarded even if the voice state ignores it** Affects: Web edge case. Evidence: apps/web/features/chat/hooks/use-voice-session.ts:1008-1013. Work needed: Confirm and guard if wrong.
- **VS Code and Chrome have no live voice, so there is nothing to type alongside** Affects: VS Code, Chrome. Evidence: S48.01 statuses in the brief. Work needed: None unless live voice is planned there.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- provider:openai
- plan:free
- SYS-chat-turn-pipeline
- SYS-voice-and-media
- SYS-memory-projects-and-context
- F048-10

## Unknown

- Whether a typed reply during a web call is ever spoken; only inferred it is not.
- Mobile sync path for voice turns and the table that holds web chat messages (not opened).
- Contents of apps/web/e2e/voice-mode-layout.spec.ts and CLI inline tests.
- How the CLI REPL (non-TUI) hands control back; only the TUI path was read.
- Whether the 'Open this chat panel' dock button should also be a way to type.

## Second reader's check

A second reader checked 13 statements of this page against the code: 9 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 6):** "Web: Enter calls submitTyped, which marks the state as streaming and calls the chat send path; the call stays open" The code shows: The reducer sets streaming only from the SUBMITTABLE statuses (listening, muted, transcribing, sending, speaking, error). In any other status the state is unchanged, but onSend is still called. A failed send dispatches fail. The page lists this under Incomplete but the section 6 row states it unconditionally. (packages/ui/unified-chat/src/voice/voice-session-machine.ts:71-78, 139-147; apps/web/features/chat/hooks/use-voice-session.ts:1004-1014). **Corrected:** Enter calls submitTyped, which always forwards the text to the chat send path. The state moves to streaming only from listening, muted, transcribing, sending, speaking or error; in other states it stays as it was.
- **Partly wrong (section 7):** "Subscription: 'Typing in a call has no rule of its own. Opening voice needs allowVoice on the plan' (route.ts:311)" The code shows: Line 311 is the allowVoice check. Before it, the route also requires a managed-compute subscription (evaluateManagedComputeSubscriptionAccess) and the canUseVoice capability flag. The Free tier has allowVoice true with voiceMinutesPerMonth 10, so Free can open voice, held to a monthly allowance. Plans with no free allowance go through assessVoiceBudget against the usage budget. (apps/web/app/api/voice/live/sessions/route.ts:279-318, 336-348; packages/contracts/types/src/model-catalog.ts:1234-1259; apps/web/lib/voice/free-voice-allowance.ts:47-52). **Corrected:** Opening voice needs a managed-compute subscription state that is allowed, the canUseVoice capability and a plan with allowVoice. Free has allowVoice with 10 minutes a calendar month. Paid plans are charged against the usage budget. Typing has no separate rule.
- **Partly wrong (section 7):** "Account: 'Web and iPhone live voice need sign-in (liveVoiceAvailability.ts:19)'" The code shows: Line 19 is the mobile sign-in reason only; liveVoiceModeUnavailableReason checks Local mode first and then sign-in. The cited file says nothing about web. Web sign-in is not shown by this citation. (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:19-28). **Corrected:** iPhone live voice needs a Cloud chat and a signed-in user (liveVoiceAvailability.ts:19-28). For web, cite the route's auth and scoped-db check in apps/web/app/api/voice/live/sessions/route.ts.
- **Partly wrong (section 7):** "Provider restrictions: 'Live voice is managed OpenAI only'; limits: CLI records at most 120 seconds and ignores clips under 300 ms" The code shows: The 120 s and 300 ms limits are correct (voice.rs:33-39). The live model is the voice_live routing slot, not a fixed OpenAI model. The web gate requires only that the chat's model use a managed provider mode (ManagedGateway or ManagedNative), not OpenAI. (apps/cli/src/voice.rs:33-39; apps/web/app/api/voice/live/sessions/route.ts:189-193; apps/web/features/chat/pages/WebChatPage.tsx:5907-5911). **Corrected:** Web live voice needs a chat on a managed provider route. The live model comes from the voice_live slot, and the backend model from the plan's backend slot.

**Facts the page missed**

- Free plan voice is capped at 10 minutes per calendar month (voiceMinutesPerMonth: 10), and a session started on that allowance keeps it for its whole length. This is why the 'Continue in text' row exists, but the access table never states the monthly cap: packages/contracts/types/src/model-catalog.ts:1255-1257; apps/web/lib/voice/free-voice-allowance.ts:47-65.
- The web route also refuses to open voice for a user whose stored chats may train models, when the live or backend model does not keep inputs out of training, and the chat holds Google user data. The reply is 403 'model_may_train'. This is another reason the user lands in text: apps/web/app/api/voice/live/sessions/route.ts:320-340.
- In the CLI, Esc means different things by prompt: at the record prompt it exits voice (voice.rs:574), and at the confirm prompt it discards only that sentence and stays in voice (voice.rs:599). The journey and the page's 'Esc returns to typed session' do not separate the two.
