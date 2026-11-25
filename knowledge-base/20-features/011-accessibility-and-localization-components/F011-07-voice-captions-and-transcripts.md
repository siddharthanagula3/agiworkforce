---
id: "F011-07"
type: "feature"
title: "Voice captions and transcripts"
aliases: ["Captions", "Voice captions", "Live captions", "Hide captions / Show captions (mobile)", "Voice transcript", "You said: line (CLI)", "S11.15", "S11.16"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S11.15", "S11.16"]
depends_on: ["SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "api:POST /api/voice/live/sessions", "api:POST /api/chat/conversations/[id]/messages", "file:apps/web/features/chat/components/Voice/VoiceCaptions.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-07 Voice captions and transcripts

Live voice conversations show what is said as on-screen text on Web, Desktop (the Electron window shows the hosted web app) and Mobile, and each finished turn is saved as a chat message. The CLI has no live captions: its push-to-talk /voice shows the transcribed words and sends them as a normal message.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.15](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1115), [S11.16](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1116).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the words of a spoken (live voice) conversation as text while it happens, labelled by speaker, and keeps each finished spoken turn in the chat so it can be read later. Web adds a toggle and a waiting message; Mobile shows a scrolling caption list; the CLI shows the recognised words after each recording.

**Why it exists.** People who are deaf, hard of hearing, in a noisy place or unable to listen need the words as text, and the brief wants a readable record kept with the chat (brief S11.15, S11.16).

**Who uses it.** Signed-in users of live voice on Web, Desktop and Mobile who want text; screen-reader users; CLI users who dictate with /voice.

**Problems it solves**

- Spoken words vanish unless they are also text.
- A voice call would leave no record in the chat history.
- Screen-reader users would hear every partial phrase twice if the captions panel announced itself (web sets aria-live off).

**Use cases**

- A user in a meeting turns on Captions in a web voice call and reads the assistant instead of listening.
- A mobile user scrolls the live captions during a call and selects a line to copy.
- After a call, a web user opens the chat and reads the saved You and Assistant turns.
- A CLI user runs /voice, reads 'You said:' and presses Enter to send.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): enter voice mode from the composer, open the voice chat dock menu, section 'Call', item 'Captions' (a checkbox item) (apps/web/features/chat/components/Voice/VoiceChatDock.tsx:122-131).
- Mobile: the live voice bar header has a captions button labelled 'Hide captions' or 'Show captions' (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:78-79, :309-313).
- CLI: the /voice slash command (and /dictate) in builds with the voice feature (apps/cli/src/lib.rs:81-103).
- VS Code and Chrome: not applicable (brief status n/a).

**Before you start**

- Web/Desktop: a managed (Cloud) chat, not a Local or own-key model, with the canUseVoice capability (apps/web/features/chat/pages/WebChatPage.tsx:5905-5922).
- A plan whose tier policy allows voice; otherwise the session start returns 403 (apps/web/app/api/voice/live/sessions/route.ts:311-317).
- Mobile: Cloud execution mode and sign-in; Local mode stays turn based (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-25).
- CLI: a build with the voice feature, a microphone, and a speech-to-text backend (apps/cli/src/voice.rs:101-140).

**Screens and controls**

- Web: 'Voice captions' region (role log) with lines labelled 'You' or 'Assistant'; waiting text 'Captions will appear here as soon as someone speaks.' (apps/web/features/chat/components/Voice/VoiceCaptions.tsx:7-12, :23-29).
- Mobile: scrolling list with labels YOU and AGI, text is selectable (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:438-461).
- CLI: line 'You said: <text>' then '[ENTER to send, e to edit, r to re-record, ESC to discard]' (apps/cli/src/voice.rs:1219-1221, :236-240).

**Journey**

1. Web: start a voice session from a Cloud chat.
2. Open the voice chat dock menu and choose Captions; the waiting message shows until someone speaks.
3. Speak; your line appears and is replaced in place as the partial text grows, then the assistant line appears.
4. Only the last four lines stay on screen.
5. Leave the call; the finished turns are in the chat as messages.
6. Mobile: start live voice; captions are on by default; press 'Hide captions' to hide them while the call continues.
7. CLI: run /voice, press the key to record, read 'You said:', then Enter, e, r or Esc.

**What the person sees and gets**

- Web: caption lines with data-role and data-final attributes; error toast 'Part of this voice conversation could not be saved to your history.' if saving a turn fails (apps/web/features/chat/pages/WebChatPage.tsx:6779).
- Mobile: transcript appears in the chat list as user and assistant messages (apps/mobile/stores/chat/chatMessageStore.ts:1161-1200).
- CLI: '(no speech detected)', 'Transcription failed' messages (apps/cli/src/voice.rs:213-222).

**Settings**

- Web: Captions toggle state is local component state, off at the start of each voice surface (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:208).
- Mobile: captionsShown starts true (LiveVoiceBar.tsx:214).
- CLI: --voice-lang flag sets the speech language (apps/cli/src/lib.rs:5951-5956).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: caption lines are built from live transcript turns; a partial turn replaces its line in place (same turnId), empty text is ignored, and only the last 4 lines are kept (apps/web/features/chat/components/Voice/voice-captions.ts:3, :15-33).
- Web: the panel is role=log with aria-live=off so partial phrases are not announced (VoiceCaptions.tsx:23-24); a separate polite status region announces call state (apps/web/features/chat/components/Voice/voice-announcements.ts:1-40).
- Web: every transcript turn also goes to the chat store and, when final, is POSTed to /api/chat/conversations/:id/messages with skipLlm (apps/web/features/chat/pages/WebChatPage.tsx:6739-6788).
- Mobile: turns are shown while live and final turns are written to the chat store, and marked for cloud sync when the conversation is Cloud (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:204-222; apps/mobile/stores/chat/chatMessageStore.ts:1161-1200).
- CLI: recorded audio is transcribed, shown as 'You said:' and sent to the agent as a normal user message (apps/cli/src/voice.rs:204-290).

**Incomplete**

- Mobile captions have no waiting message and render nothing until a turn exists (LiveVoiceBar.tsx:438).
- CLI has no live captions and no spoken assistant output: it is record, then transcribe, then confirm, so 'captions' means the post-recording text only (apps/cli/src/voice.rs:1-9, :204-290).
- Caption labels on Web ('You', 'Assistant', waiting text, region name) and on Mobile (YOU, AGI, Hide captions, Show captions) are English literals, not translated (VoiceCaptions.tsx:7-12; LiveVoiceBar.tsx:78-79, :450).

**Present but disconnected or switched off**

- CLI voice is off by default: the Cargo feature 'voice' must be enabled, and Linux release builds leave it out (apps/cli/Cargo.toml:126-132; .github/workflows/release-cli.yml:227-229).
- Web/Desktop live voice is not offered when the chat is Local or own-key (voiceManaged false hides onEnterVoiceMode) (WebChatPage.tsx:5907-5911, :7672).

**Not available**

- VS Code and Chrome have no voice captions (brief n/a).
- Mobile Local mode has no live voice, so no live captions (liveVoiceAvailability.ts:17-25).

## 4. Required behaviour

**Established requirements**

- Spoken audio (voice conversations) can be shown as live captions. Web, desktop, mobile and CLI are marked done. (source: brief S11.15)
- A voice conversation leaves a readable text transcript kept with the chat. Web, desktop, mobile and CLI are marked done. (source: brief S11.16)
- Captions show a waiting message until someone speaks; the captions region does not announce every partial phrase because the transcript carries the same words. (source: code comment and constants in apps/web/features/chat/components/Voice/VoiceCaptions.tsx:7-12, :20-21)
- Voice: permission denied, absent microphone, transcription failure, mute, interruption and exit all have recoverable states; speech and text refer to the correct turn. (source: doc: docs/product/experience-contract.md (check W13))
- Do not claim realtime audio behaviour for a completed-text-to-speech path. (source: doc: docs/product/experience-contract.md (check W13))
- Transcript/edit-before-send exists for dictation. (source: doc: docs/product/requirements.md:920)

**Acceptance criteria**

1. On Web, with captions off, no element with test id voice-captions exists; after choosing Captions the toggle reports aria-checked true and the waiting text shows.
2. Emit a partial then a final turn with the same turnId: exactly one caption line shows the final text, labelled You or Assistant.
3. After five different turns only the last four caption lines remain.
4. The captions region has aria-live off and role log.
5. After a final turn, a POST to the conversation messages endpoint is made and the turn is in the chat list; a failed POST shows the toast.
6. On Mobile, 'Hide captions' removes the transcript and keeps the call status 'Listening'; 'Show captions' brings back every turn.
7. On the CLI, a recording with no speech prints '(no speech detected)' and nothing is sent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A caption line shows both user and assistant speech because the same turn feed drives it [inferred from deliverTranscript, use-voice-session.ts:456-462].
- Desktop users see the Web behaviour because the public Desktop window shows the hosted web app (AGENTS.md section 5) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give Mobile captions a waiting message and a live-region role to match Web.
- [proposed] Move caption labels into the translation catalog.
- [proposed] Re-state the brief's CLI status as 'push-to-talk dictation text', since the CLI has no live captions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceCaptions | `apps/web/features/chat/components/Voice/VoiceCaptions.tsx` | Web caption panel, role log, aria-live off, waiting message, You/Assistant labels |
| service | appendVoiceCaption | `apps/web/features/chat/components/Voice/voice-captions.ts` | Replaces a partial line in place, keeps last 4 lines |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Holds caption state, renders VoiceCaptions when open, wires onCaption |
| component | VoiceChatDock | `apps/web/features/chat/components/Voice/VoiceChatDock.tsx` | Menu item 'Captions' (menuitemcheckbox) |
| hook | useVoiceSession / deliverTranscript | `apps/web/features/chat/hooks/use-voice-session.ts` | Sends each transcript turn to both the caption sink and the transcript sink |
| service | live voice session client | `apps/web/features/chat/lib/live-voice-session.ts` | Turns provider transcript delta events into user and assistant turns |
| service | handleVoiceTranscript | `apps/web/features/chat/pages/WebChatPage.tsx` | Adds or updates chat messages and POSTs final turns to history |
| endpoint | POST /api/chat/conversations/:id/messages | `apps/web/app/api/chat/conversations/[id]/messages/route.ts` | Stores a voice turn without calling the model (skipLlm) |
| endpoint | POST /api/voice/live/sessions | `apps/web/app/api/voice/live/sessions/route.ts` | Starts a live voice session; checks plan, capability and usage budget |
| service | voice status announcements | `apps/web/features/chat/components/Voice/voice-announcements.ts` | Polite status text for call state (separate from captions) |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Mobile captions button and scrolling transcript |
| hook | useLiveVoiceSession | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Keeps live turns and writes final turns to the chat store |
| store | appendVoiceTurn | `apps/mobile/stores/chat/chatMessageStore.ts` | Adds a voice turn to the conversation and marks it for sync when Cloud |
| service | live voice availability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable (Local mode, signed out) |
| command | run_voice_mode | `apps/cli/src/voice.rs` | CLI push-to-talk: record, transcribe, show 'You said:', confirm, send |
| config | voice Cargo feature | `apps/cli/Cargo.toml` | Compiles audio capture; off by default |
| config | release-cli workflow | `.github/workflows/release-cli.yml` | Linux builds omit the voice feature |
| service | tier policy allowVoice | `packages/contracts/types/src/model-catalog.ts` | Per-plan voice permission read by the session route |
| test | VoiceComposer.a11y.test | `apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx` | Tests toggle, in-place partial, aria-live off, transcript still delivered |
| test | LiveVoiceBar.test | `apps/mobile/__tests__/LiveVoiceBar.test.tsx` | Tests hide/show captions and selectable text |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the user enters voice mode in a managed chat; the page asks the server to start a live session. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:5907-5922; apps/web/app/api/voice/live/sessions/route.ts:311-317 |
| The server checks sign-in, plan voice permission and the usage budget, then asks the managed voice provider to open a session. | our servers | apps/web/app/api/voice/live/sessions/route.ts:284-358, :533 |
| The browser streams microphone audio and receives transcript delta events from the session. | outside service | apps/web/features/chat/lib/live-voice-session.ts:1011-1016 |
| The client groups deltas into user and assistant turns and emits each (partial or final). | device | apps/web/features/chat/lib/live-voice-session.ts:1201-1231 |
| Each turn is sent to the caption sink (foreground only) and to the transcript sink. | device | apps/web/features/chat/hooks/use-voice-session.ts:456-462 |
| Final turns are POSTed to the conversation messages route and stored. | our servers | apps/web/features/chat/pages/WebChatPage.tsx:6753-6788 |
| Mobile: same event feed; final turns are written to the on-device chat store, and queued for sync when the conversation is Cloud. | device and our servers | apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:204-222; apps/mobile/stores/chat/chatMessageStore.ts:1161-1200 |
| CLI: audio is captured and written to a temporary WAV file, transcribed by the chosen backend (AGI account, OpenAI API key, or a local program), shown, then sent. | device and our servers | apps/cli/src/voice.rs:927-990 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Caption lines (last 4) | Web React state only | no | Lost when the voice surface unmounts (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:209) |
| Voice transcript turns as chat messages | Web chat store and server conversation messages; Mobile on-device chat store (store:chat messages) and Cloud sync for Cloud chats | Web: via POST when final; Mobile: only Cloud conversations are marked for sync | Follows normal chat retention; no voice-specific rule found |
| CLI recording WAV | A temporary recordings folder created with owner-only permissions, with a sweep of stale recordings | no | Stale files are swept (apps/cli/src/voice.rs:900-930, :970) |

**Models and providers.** Web and Mobile live voice runs on a managed voice backend chosen by plan from the model catalog; the route refuses to start if the backend is not a live model (apps/web/app/api/voice/live/sessions/route.ts:319-322). The provider's transcript events feed captions. The CLI transcribes through the AGI account, an OpenAI key or a local program, and a Local session may not use the cloud OpenAI path without AGIWORKFORCE_VOICE_ALLOW_CLOUD=1 (apps/cli/src/voice.rs:455-482).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Mobile live voice need a signed-in account (route uses getClerkAuthUser, apps/web/app/api/voice/live/sessions/route.ts:10). CLI managed transcription needs the AGI account; the OpenAI and local backends do not. |
| Permissions | Microphone permission is needed on every surface; Mobile shows an alert on denial (apps/mobile/src/features/voice/components/voicePermissionAlert.ts). |
| Subscription | Live voice needs a plan whose tier policy has allowVoice, else 403 with a not-in-plan message; free plans have a metered free allowance in seconds (apps/web/app/api/voice/live/sessions/route.ts:311-317, :344-358; apps/web/lib/voice/free-voice-allowance.ts:47). CLI managed transcription checks the voice capability from the tier cache (apps/cli/src/voice.rs:960-966). |
| Limits and metering | Voice seconds are metered per session and the budget can end the session (apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts). Exact quotas per plan: unknown. |
| Feature flags | The route asserts a capability flag 'canUseVoice' (route.ts:296-300); the web client also reads useCapability('canUseVoice') (WebChatPage.tsx:5905). |
| Model compatibility | Live voice is available only when the selected chat model resolves to a managed provider mode (ManagedGateway or ManagedNative) (WebChatPage.tsx:5907-5911). |
| Provider restrictions | The route refuses voice when the user opted out of training and a model may train on inputs (route.ts:324-340). |
| Local mode | No live voice, so no live captions, on Web and Mobile in Local mode (WebChatPage.tsx:5907-5911; liveVoiceAvailability.ts:17-25). The CLI Local session can only use the on-device program unless the user opts in to cloud egress (voice.rs:455-482). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no one has spoken) | Web shows the waiting message; Mobile renders nothing | VoiceCaptions.tsx:9, :29; LiveVoiceBar.tsx:438 |
| Partial turn | Line replaced in place by turnId, not appended | voice-captions.ts:15-33 |
| Whitespace-only text | Ignored | voice-captions.ts:19-20 |
| More than four turns | Only the last four shown; full text stays in the chat | voice-captions.ts:3, :33 |
| Call ended while a turn finalizes | A final turn is still delivered to the transcript, but captions only update for the foreground call | use-voice-session.ts:456-460 |
| Saving a final turn fails | Console warning and an error toast; the turn stays in local state | WebChatPage.tsx:6775-6783 |
| Usage limit reached | Web shows an upgrade button and 'continue in text' | VoiceModeSurface.tsx:325-335 |
| Offline or reconnect | Web has reconnect attempts (reconnectAttempt, reconnectMaxAttempts); Mobile shows 'Reconnecting live voice...'. Caption behaviour during reconnect: unknown | VoiceComposer.a11y.test.tsx:70-72; LiveVoiceBar.tsx:163-166 |
| Screen reader | Web captions are silent (aria-live off) by design; Mobile caption list has no live-region role found | VoiceCaptions.tsx:24; LiveVoiceBar.tsx (no live region on transcript block, :438-461) |
| CLI recording too short or no speech | Skipped with a dim message, or '(no speech detected)' | apps/cli/src/voice.rs:190-196, :213-217 |
| CLI backend missing | Voice mode exits with install and sign-in guidance | apps/cli/src/voice.rs:130-140 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx`: Captions off by default, toggle aria-checked, in-place partial replacement, speaker roles, transcript still delivered, aria-live off, status announcements
- `apps/web/features/chat/components/Voice/VoiceChatDock.test.tsx`: Captions menu item is a checkbox item that reports on/off
- `apps/web/features/chat/components/Voice/VoiceComposer.test.tsx`: Captions toggle not shown in some states (line 37)
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Live session turn building (contents not opened in detail)
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Hide and show captions, selectable caption text, bare header controls
- `apps/mobile/__tests__/LiveVoiceFocus.test.tsx`: Live voice hook with mocked appendVoiceTurn
- `apps/cli/src/voice.rs`: Inline tests: transcript carries no terminal escape, heard_line

**Test scenarios**

- **Web captions on and partial replacement**
  1. Open a Cloud chat on a paid plan
  2. Start voice, open dock menu, choose Captions
  3. Speak a long sentence
  - Expected: Waiting text, then one You line that grows in place; assistant reply appears as an Assistant line; no screen-reader announcement of the partials
- **Transcript kept**
  1. Finish a call with at least two turns
  2. Leave voice mode
  3. Reload the chat
  - Expected: User and assistant turns are in the chat history
- **Save failure**
  1. Block the messages endpoint
  2. Finish a turn
  - Expected: Toast 'Part of this voice conversation could not be saved to your history.'
- **Mobile hide captions**
  1. Start live voice in a Cloud chat
  2. Press Hide captions
  3. Press Show captions
  - Expected: List disappears and returns with all turns; status stays Listening
- **Local mode**
  1. Switch to a Local model or Local chat
  2. Look for a voice-mode entry
  - Expected: No live voice entry on Web; Mobile says live voice runs in AGI Cloud
- **CLI dictation**
  1. Run a voice-enabled build, /voice
  2. Record a phrase
  3. Press e, edit, Enter
  - Expected: 'You said:' shows the phrase, edited text is sent as a normal message

**Where to look when it fails**

- Web console warning '[voice] Could not save a voice turn to history:'
- HTTP 403 voice not in plan, or 'model_may_train' from /api/voice/live/sessions
- CLI messages 'Transcription failed', 'No transcription backend available', 'Privacy boundary blocked'
- Guards check:voice-session-parity and check:voice-session-metering exist in package.json (not run)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **CLI has no live captions or spoken audio; the brief marks captions done** Affects: CLI users. Evidence: apps/cli/src/voice.rs:1-9, :204-290; brief cites voice.rs:956 which is the transcribe function. Work needed: Correct the brief wording or add a caption concept for the CLI
- **Mobile has no waiting message and no live-region role on captions** Affects: Mobile screen-reader users. Evidence: LiveVoiceBar.tsx:438-461. Work needed: Add a waiting line and decide the announcement policy
- **Caption labels are not translated** Affects: Web, Desktop and Mobile non-English users. Evidence: VoiceCaptions.tsx:7-12; LiveVoiceBar.tsx:78-79, :450. Work needed: Move strings to the catalog
- **Web caption default is off, Mobile default is on; no stored preference** Affects: Web and Mobile users who need captions every time. Evidence: VoiceModeSurface.tsx:208; LiveVoiceBar.tsx:214. Work needed: Decide a shared default and remember the choice
- **Brief code citations are stale: WebChatPage.tsx:4978-5009 does not hold the voice transcript code (now at 6739)** Affects: Engineers using the brief. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6739. Work needed: Refresh brief citations

**Depends on**

- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- api:POST /api/voice/live/sessions
- api:POST /api/chat/conversations/[id]/messages
- file:apps/web/features/chat/components/Voice/VoiceCaptions.tsx

## Unknown

- Exact voice quota per plan.
- Whether captions keep updating during a reconnect.
- Whether desktop's Electron window adds any caption behaviour beyond the hosted web app (only dictation bar code was seen).
- Whether CLI session history stores the transcribed text with a voice marker (it is sent as an ordinary user message).
- Which managed provider serves live voice in production (set by catalog).
