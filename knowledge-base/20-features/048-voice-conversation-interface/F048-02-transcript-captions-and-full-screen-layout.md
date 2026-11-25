---
id: "F048-02"
type: "feature"
title: "Transcript, captions and full-screen layout"
aliases: ["Transcript", "Captions", "Live captions", "Focus mode", "Full-screen voice view", "Voice surface", "Hide the transcript and focus the orb", "Show captions", "Voice companion screen"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.03", "S48.04", "S48.21", "S48.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "F048-01", "F048-03", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-02 Transcript, captions and full-screen layout

Spoken turns from a voice call are written into the same chat as typed turns. Web has an optional 'Captions' panel showing the last four lines, and an orb tap that fades the transcript. Mobile shows captions in its live bar and has a separate full-screen on-device voice screen. The CLI prints what it heard.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.03](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4803), [S48.04](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4804), [S48.21](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4821), [S48.22](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4822).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns what the person and the assistant say into text in the chat, shows it live as optional captions, and offers a focused view where the transcript is hidden but the call keeps running.

**Why it exists.** People need to see what was heard, check mistakes, and find the conversation later. A voice call that leaves no text is hard to trust or reuse.

**Who uses it.** Everyone on a voice call; people who cannot hear well; people in noisy or silent places.

**Problems it solves**

- Misheard words can be seen and corrected by typing.
- The call is kept with the chat so it can be reopened and continued by typing.
- A clean full focus view for people who want only the orb.

**Use cases**

- Turn on Captions on web to read what the assistant says while listening to it.
- After a call, open the chat and read the spoken turns in the message list.
- Tap the orb to hide the transcript during a call, tap again to bring it back.
- On mobile, open the voice companion to read the on-device transcript and report a response.

## 2. User experience

**Where to find it**

- Web/Desktop: during a voice call the transcript is the normal message list above the voice surface (WebChatPage.tsx:7708-7722). Captions are in the plus menu titled 'In this chat' under 'This call', item 'Captions' (VoiceChatDock.tsx:18-26, 119-130; testid voice-captions-toggle). Focus mode: tap the orb (VoiceModeSurface.tsx:290-300).
- Mobile live: the LiveVoiceBar shows turns and a captions button with labels 'Show captions' and 'Hide captions' (LiveVoiceBar.tsx:78-79, 311). Mobile full screen: Settings > Voice > 'Open Voice Companion' (settings/voice/index.tsx:515) shows the orb, a session transcript and a typed composer (voice.tsx testIDs voice-session-transcript, voice-composer).
- CLI: after each recording a 'heard' line is printed and the assistant reply streams as formatted text (voice.rs:1212-1225, 240-300).

**Before you start**

- An active voice call (web, mobile live) or the on-device companion screen (mobile).
- Web captions need no extra setting; they start off every call (VoiceModeSurface.tsx:208).

**Screens and controls**

- Web orb: accessible label from the shared orb, 'Hide the transcript and focus the orb' and 'Show the transcript again' (packages/ui/unified-chat/src/components/VoiceOrb.tsx:12-15).
- Web 'Captions' menu item shown as a checkbox; panel region named 'Voice captions' with the text 'Captions will appear here as soon as someone speaks.' before any speech (VoiceCaptions.tsx:9-14).
- Each caption line is prefixed 'You' or 'Assistant' (VoiceCaptions.tsx:13-14, 43).
- Mobile companion: orb, phase label, transcript column, 'Report this response' on assistant lines, 'Type a message' field and 'Send typed message' button (voice.tsx:104-192).

**Journey**

1. 1. During a call the person speaks; partial text for their turn streams into the message list as a message that is still marked streaming.
2. 2. The assistant's reply text also streams in as its own message.
3. 3. When a turn is final the web app saves it to the chat history.
4. 4. Optional: open the plus menu and switch on 'Captions' to see the last four lines under the orb.
5. 5. Optional: tap the orb; the message list fades out and ignores pointer input; tap again to restore.
6. 6. End the call; the spoken turns remain in the chat and can be continued by typing.

**What the person sees and gets**

- Web: toast 'Part of this voice conversation could not be saved to your history.' when saving a final turn fails (WebChatPage.tsx:6772-6779).
- Web: captions are a visual aid only and are not announced a second time (aria-live off) (VoiceCaptions.tsx:25-30).
- Mobile: report sheet titled 'Report this response' (voice.tsx:60).
- CLI: the heard line and 'ENTER to send, e to edit, r to re-record, ESC to discard' (voice.rs:226-232).

**Settings**

- Web: none for captions or focus mode; both reset when the call ends (voice-session-store.ts:101-106, 120-127).
- Mobile: captions button state is per bar [inferred]; companion has typed composer.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: each transcript delta adds or updates a message with the turn id and a streaming flag, and each final turn is posted to the chat messages endpoint with skipLlm so it is stored without a new model answer (WebChatPage.tsx:6739-6785).
- Web captions: a panel of at most four lines; a line is replaced in place while its turn is partial (voice-captions.ts:3-31; VoiceCaptions.tsx).
- Web focus mode: the orb click toggles a store flag and the message list gets opacity 0 and pointer-events none, so the session continues (VoiceModeSurface.tsx:290-300; WebChatPage.tsx:618, 7717).
- Mobile live: final turns are appended to the chat store and marked for sync when the chat is Cloud (useLiveVoiceSession.ts:208-225; apps/mobile/stores/chat/chatMessageStore.ts:1161-1200). The bar shows turns and a captions toggle (LiveVoiceBar.tsx:169-181, 311).
- Mobile on-device companion has a scrollable transcript with selectable lines (voice.tsx testID voice-session-transcript; test VoiceConversationPtt.test.tsx:312, 373).
- CLI prints the heard transcript, lets the person edit it, then sends it (voice.rs:226-262).

**Incomplete**

- Web has no separate full-screen route; the 'full-screen' view is the in-page voice surface plus the orb focus fade (WebChatPage.tsx:7664-7672, 7717).
- Captions on web keep only the last four lines and are lost when the call ends (voice-captions.ts:3; VoiceModeSurface.tsx:208-209).
- CLI has no live captions: the brief marks them done, but only a post-recording 'heard' line exists (voice.rs:226).

**Present but disconnected or switched off**

- Web captions panel is off by default each call (VoiceModeSurface.tsx:208).

**Not available**

- VS Code and Chrome: no voice transcript surface for live voice (see F048-01).
- Transcript editing of a spoken turn after it is sent is not offered in the web voice surface; the brief marks it not applicable (brief S48.23).

## 4. Required behaviour

**Established requirements**

- Voice runs inside the chat view and the transcript of spoken turns appears in the same message list as typed turns. (source: brief S48.03)
- A separate full-screen voice layout exists with the transcript hidden or secondary. (source: brief S48.04)
- Live captions of both speakers can be shown during voice. (source: brief S48.21)
- A transcript of the voice conversation is displayed and kept with the chat. (source: brief S48.22)
- Transcript integrity: handle interim versus final text, ordering and persistence. (source: doc: docs/product/competitive-guidance.md:399-408 (item 126))

**Acceptance criteria**

1. After a spoken exchange on web, both turns appear in the message list in order, and reloading the chat still shows them.
2. A final turn that fails to save produces the toast message and the turn stays visible.
3. Switching 'Captions' on shows 'You' and 'Assistant' lines, at most four, updating in place.
4. Tapping the orb hides the message list without ending the call, and tapping again restores it.
5. On mobile live voice, ending the call leaves the turns in the chat and they sync for Cloud chats.
6. Screen reader users do not hear every caption twice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Captions should survive a pause and resume; today caption state lives in the surface component, which is probably still mounted [inferred from VoiceModeSurface.tsx:208-209].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep a longer caption history or a scrollable captions view.
- [proposed] Add real captions on CLI only if a live path exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WebChatPage transcript handling | `apps/web/features/chat/pages/WebChatPage.tsx` | handleVoiceTranscript adds, updates and saves turns (6739-6785); focus fade (618, 7717). |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Holds caption state, orb focus click, captions panel mount (208-209, 290-300, 522). |
| component | VoiceCaptions | `apps/web/features/chat/components/Voice/VoiceCaptions.tsx` | Renders caption lines. |
| service | appendVoiceCaption | `apps/web/features/chat/components/Voice/voice-captions.ts` | Keeps last four lines, replaces partial lines. |
| component | VoiceChatDock | `apps/web/features/chat/components/Voice/VoiceChatDock.tsx` | 'Captions' switch in the plus menu. |
| store | useVoiceSessionStore focusMode | `apps/web/features/chat/stores/voice-session-store.ts` | focusMode flag and toggle (190). |
| component | Shared VoiceOrb | `packages/ui/unified-chat/src/components/VoiceOrb.tsx` | Orb button with focus and unfocus labels. |
| service | LiveVoiceSession turn building | `apps/web/features/chat/lib/live-voice-session.ts` | Builds user and assistant turns from transcript deltas (1201-1290). |
| endpoint | POST /api/chat/conversations/{id}/messages | `apps/web/features/chat/pages/WebChatPage.tsx` | Called from line 6762 to save each final voice turn with skipLlm. |
| component | LiveVoiceBar | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Mobile transcript stage and captions toggle. |
| hook | useLiveVoiceSession (mobile) | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | recordTurn keeps turns and appends final ones to the chat store (208-225). |
| store | chatMessageStore appendVoiceTurn | `apps/mobile/stores/chat/chatMessageStore.ts` | Adds the turn as a message and marks it for sync (1161-1200). |
| screen | Voice companion | `apps/mobile/app/(app)/voice.tsx` | Full-screen on-device voice with transcript column. |
| command | heard_line and run_voice_mode | `apps/cli/src/voice.rs` | CLI transcript display and edit (226-262, 1212-1225). |
| test | VoiceModeSurface tests | `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx` | Surface behaviours including pending utterance and orb layout. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The voice provider streams input and output transcript deltas over the data channel. | outside service | live-voice-session.ts:1011-1020 |
| The browser builds turns and decides when a turn is final using idle timers (assistant 2.5 s, overlap 0.8 s). | device | live-voice-session.ts:50-53, 1201-1290 |
| The web page shows partial turns in the message list and, when a turn is final, posts it to the chat messages endpoint. | device and our servers | WebChatPage.tsx:6739-6785 |
| Captions are formed from the same turns in the surface component. | device | VoiceModeSurface.tsx:187-189; voice-captions.ts |
| Mobile saves final turns to the local chat store and queues them for sync when the chat is Cloud. | device and our servers | chatMessageStore.ts:1161-1200 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Turn text with a client-made turn id | chat history on our servers (web); chat store on the phone | Yes for Cloud chats | With the chat |
| Caption lines | React state in the browser | No | Lost when the call ends |
| Focus mode flag | in-memory store | No | Reset when the session ends (voice-session-store.ts:120-127) |

**Models and providers.** Transcription of the person's speech and the assistant's speech text come from the live voice session on the voice_live slot model; no separate transcription call is made on web or live mobile (live-voice-session.ts:1011-1020). Which model is not recorded here. The on-device mobile companion uses on-device recognition (voice.tsx:82-100). CLI uses a transcription backend described in F048-05.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as F048-01: signed in for web and live mobile; the on-device mobile companion works without Cloud. |
| Permissions | Microphone. Saving the transcript uses the chat messages endpoint under the user's session. |
| Subscription | Follows the voice allowance; captions and focus mode add no cost. Transcript saving is not metered separately [inferred; none found in the code]. |
| Limits and metering | Captions capped at 4 lines (voice-captions.ts:3). Stored turns are normal chat messages. |
| Feature flags | none found in the code for captions or focus mode. |
| Model compatibility | Any session the voice_live slot model opens emits the transcript events; if a model did not, captions would stay empty [inferred]. |
| Provider restrictions | Same managed-provider limit as F048-01. |
| Local mode | Web: not applicable, no voice in Local. Mobile Local: the on-device companion transcript is stored in the local chat store and not sent to Cloud (voice.tsx:82-100; settings/voice/index.tsx:'Voice on this device'). CLI Local: transcript is the local text only when a local speech binary is used (voice.rs:458-510). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No speech yet | Captions panel shows the waiting line. | VoiceCaptions.tsx:9-14, 33-35 |
| Partial turn | A caption and message are updated in place, not duplicated. | voice-captions.ts:15-31; WebChatPage.tsx:6746-6752 |
| Save failure | Toast shown once per chat id. | WebChatPage.tsx:6772-6779 |
| User and assistant talk at once | Turns are finalized by an 800 ms overlap rule. | live-voice-session.ts:52, 1201-1260 |
| Account changes mid-call | Transcript publication is suppressed after the original login retires. | useVoiceSession.test.tsx:301 |
| Reduced motion | The orb gets a reducedMotion flag; the focus fade is a CSS opacity transition, whether it is disabled for reduced motion is not handled in the code seen. | use-voice-session.ts:742; WebChatPage.tsx:618 |
| Offline | Transcript cannot be saved; the same toast appears; offline queueing for web voice turns not handled in the code seen. | WebChatPage.tsx:6760-6780 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Pending utterance chip, reconnect state, orb layout, paused call.
- `apps/web/features/chat/components/Voice/VoiceChatDock.test.tsx`: Captions switch as a checkbox item that says whether captions are on.
- `apps/web/features/chat/components/Voice/VoiceOrb.test.tsx`: Web orb states.
- `packages/ui/unified-chat/src/components/__tests__/VoiceOrb.test.tsx`: Shared orb behaviour.
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Finalizing buffered transcript before terminal failure and close windows.
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Bar rendering, stage, status text.
- `apps/mobile/__tests__/VoiceConversationPtt.test.tsx`: Companion transcript shown, scrollable, copyable, typed composer.

**Test scenarios**

- **Transcript persists**
  1. Have a 2 turn voice exchange on web.
  2. End the call.
  3. Reload the page and open the chat.
  - Expected: Both turns are in the message list in order.
- **Captions toggle**
  1. Start voice.
  2. Plus menu > Captions on.
  3. Speak and listen to the reply.
  - Expected: At most 4 lines labelled You and Assistant, updating in place; off again hides them.
- **Focus mode**
  1. Start voice in a chat with messages.
  2. Tap the orb twice.
  - Expected: First tap fades the list and ignores clicks on it; the call continues; second tap restores it.
- **Save failure**
  1. Block the messages endpoint in dev tools.
  2. Finish a spoken turn.
  - Expected: Toast about part of the conversation not saved.
- **Mobile live captions**
  1. Start live voice in a Cloud chat on the phone.
  2. Press 'Show captions'.
  - Expected: Captions appear; ending the call leaves turns in the chat.

**Where to look when it fails**

- Browser console: '[voice] Could not save a voice turn to history:' with the HTTP status.
- Server route logs for POST /api/chat/conversations/{id}/messages.
- Mobile: markMessageForSync queue for the chat.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **CLI captions and transcript are not live; brief says done.** Affects: CLI users.. Evidence: apps/cli/src/voice.rs:226-262.. Work needed: Correct the brief or add streaming display.
- **Web has no true full-screen voice layout; only an in-page focus fade.** Affects: Web and desktop users wanting a separate screen.. Evidence: WebChatPage.tsx:7664-7672, 7717.. Work needed: Decide whether the fade meets S48.04 or build a dedicated view.
- **Captions are limited to four lines and not kept.** Affects: People relying on captions for access.. Evidence: voice-captions.ts:3.. Work needed: Longer history or a scrollable log.
- **Offline save of web voice turns is not handled.** Affects: Web users with flaky networks.. Evidence: WebChatPage.tsx:6760-6780.. Work needed: Queue and retry.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- F048-01
- F048-03
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations

## Unknown

- Exact path of the messages table behind POST /api/chat/conversations/{id}/messages was not opened.
- Whether the focus fade respects reduced motion.
- Whether mobile captions state persists between calls.
- Whether the brief's CLI 'transcript' item meant the heard line or the session scrollback.
