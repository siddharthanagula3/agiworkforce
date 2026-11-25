---
id: "F013-12"
type: "feature"
title: "+ menu, output format, dictation and voice"
aliases: ["+ menu", "Add attachments and tools", "Attach menu", "Output", "Create file", "Output format", "Dictation", "Voice input", "Start voice mode", "Voice conversation", "Dictate with AGI Cloud"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.34", "S13.35", "S13.36", "S13.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-execution-boundaries", "api:POST /api/voice/transcribe"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-12 + menu, output format, dictation and voice

The + button lists ways to add files and context and switch tools on. Output makes the reply a Document, Presentation or Spreadsheet file. The microphone dictates into the box for review. The round voice button starts a hands-free conversation when the box is empty. Cloud features need our servers; Mobile dictation runs on the device.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.34](../../10-requirements/capabilities/013-composer-text-interaction.md#s1334), [S13.35](../../10-requirements/capabilities/013-composer-text-interaction.md#s1335), [S13.36](../../10-requirements/capabilities/013-composer-text-interaction.md#s1336), [S13.37](../../10-requirements/capabilities/013-composer-text-interaction.md#s1337).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 4) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects attach, library, folders, tools, temporary chat and output format in one menu; turns speech into text in the box; starts a voice conversation.

**Why it exists.** Matches ChatGPT and Claude composers: one place for everything attachable, and speech as an input (brief S13.34 to S13.37).

**Who uses it.** All chat users; Mobile users who dictate on the go; CLI users with /dictate and /voice.

**Problems it solves**

- Finding attach and tool controls
- Typing on a phone or when hands are busy
- Getting a file instead of chat text

**Use cases**

- Add photos and files from the + menu.
- Choose Output then Presentation to get a PowerPoint-style file.
- Dictate a message, edit, then send.
- Start a voice conversation hands free.

## 2. User experience

**Where to find it**

- Web and Desktop: + button, accessible name 'Add attachments and tools' (ChatComposerNew.tsx:5968); microphone and 'Start voice mode' button in the composer row (ChatComposerNew.tsx:6942,6956).
- Mobile: + opens the add sheet with Camera, Photos, Paste image, File, Create image, Create video, 'Create file', Web search, Deep research (AddToChatSheet.tsx:697-1235).
- VS Code: '+' button titled 'Attach or use tools' with menu 'Add context' (webviewContent.ts:3198,3357); mic titled 'Dictate with AGI Cloud' (webviewContent.ts:3362).
- Chrome: attach button with menu including Skills (side_panel.ts:4000-4049); mic with a first-use notice (messages.json spVoiceNotice).
- CLI: '/dictate' and '/voice' commands (tui_app.rs:4523,6343,6352).

**Before you start**

- Output needs a model with tools and a Cloud-managed turn; otherwise the row is disabled with 'Office file creation isn't available for this model.' (ChatComposerNew.tsx:6124-6128).
- Web dictation needs a Cloud-managed model, the setting on, and the feature not switched off (ChatComposerNew.tsx:2052-2054,6945).
- Web voice button needs voice capability and a managed model (ChatComposerNew.tsx:6955; WebChatPage.tsx:5907-5910).
- Mobile Output needs Cloud mode and a tools-capable model (AddToChatSheet.tsx:345-352).

**Screens and controls**

- Web + menu rows: 'Add photos & files', 'Add from library', 'Attach from local folder' (desktop), 'Attach clipboard', 'Run a local command', 'Use the browser', 'Use this computer' (desktop), 'Create image', 'Create video', 'Add working folder', 'Deep Research', 'Study', 'Output', 'Memory', 'Skills', 'Connectors', 'Plugins', temporary chat (ComposerPlusMenu.tsx:147-192,1260-1330).
- Output submenu radio rows Document, Presentation, Spreadsheet; choosing the checked row clears it (ComposerPlusMenu.tsx:986-1001; packages/contracts/cloud-contracts/src/skills.ts:22).
- Dictation bar: 'Discard recording', 'Stop recording and edit the transcript', Send, 'Try again', 'Upgrade' (DictationStrip.tsx:16-24).
- Mobile dictation strip with cancel, waveform, stop and send.

**Journey**

1. Click + and pick a row; the menu closes and a pill or attachment shows.
2. Output: expand 'Output', choose Document, Presentation or Spreadsheet; the + shows the format.
3. Send; the model is asked to build that file and reply in one or two sentences (request-processor.ts:6649-6659).
4. Dictation: click the microphone, speak, click Stop; the transcript lands in the box; send yourself, or choose Send in the strip.
5. Voice: with an empty box click 'Start voice mode'; the voice session opens.

**What the person sees and gets**

- Disabled mic shows a reason: 'Dictation is off in Voice settings' or the switched-off sentence (use-dictation.ts:37-52).
- Errors: 'The microphone could not be started. Try again.', 'Nothing was heard in that recording. Try again.' (use-dictation.ts:35-37).
- Announcements 'Recording started', 'Transcript ready' for screen readers (use-dictation.ts:28-33).

**Settings**

- Web: dictationEnabled switch (web-settings-store.ts:129); the text 'Dictation is off in Voice settings'.
- Mobile: Voice settings page (apps/mobile/src/features/settings/voice/index.tsx).
- Chrome: dictation language (messages.json spDictationSectionTitle).
- CLI: AGIWORKFORCE_VOICE_ALLOW_CLOUD environment variable opts in to sending audio to a hosted speech service (apps/cli/src/voice.rs:85).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web + menu with rows above and an Output submenu (ComposerPlusMenu.tsx:958-1010,1260-1330).
- Output format travels as office_format with office_creation; the server adds a system instruction and forces the Office file tool when the model accepts a forced tool (useChatStream.ts:4642; request-processor.ts:781,6649-6659).
- Mobile 'Create file' with Document, Presentation, Spreadsheet, cleared after use (AddToChatSheet.tsx:1181-1215; chatExecutionStore.ts:3283-3288).
- Web dictation: record, send audio to /api/voice/transcribe, insert text; Send from the strip appends and sends (use-dictation.ts; voice-input-store.ts:16,231).
- Server transcription route: rate limit, dictation kill switch, plan and unit allowance checks, privacy check, usage settle (apps/web/app/api/voice/transcribe/route.ts:27; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:294,500-512,574-600).
- Mobile dictation uses an on-device recognizer; hold to talk or tap; strip with stop and send (apps/mobile/src/features/voice/services/voiceInput.ts:291; ChatInput.tsx:1536).
- Mobile live voice needs Cloud, sign-in, native WebRTC module and https (liveVoiceAvailability.ts:21-47).
- VS Code dictation: button shown when the host enables it; audio posted to /api/voice/transcribe?surface=vscode (dictationClient.ts:30; ChatStateManager.ts:5710-5727).
- Chrome dictation uses the browser speech recognizer and appends text (apps/extension/src/features/side-panel/voice.ts:218-223).
- CLI /dictate fills the composer without sending; /voice runs push-to-talk conversation (tui_app.rs:7520-7540; voice.rs:75,310).
- CLI privacy lock: in Local privacy mode audio is never sent to a hosted speech service unless explicitly allowed (voice.rs:65-135).

**Incomplete**

- Output format is a Cloud-only file feature; the brief calls VS Code and Chrome missing and none was found.
- Web voice button is passed to the composer only for managed models, so own-key and Local chats have no voice entry (WebChatPage.tsx:5907,7672).
- Web dictation is unavailable for Local and own-key chats (ChatComposerNew.tsx:2052-2054).
- Brief says VS Code has no dictation; code shows a dictation button for managed and Auto chats (ChatStateManager.ts:5710-5722).
- Chrome voice conversation not found.

**Present but disconnected or switched off**

- Desktop system-wide dictation is gated off; in-window dictation works (doc: docs/product/experience-contract.md:641,669-674).

**Not available**

- Voice conversation on VS Code and Chrome.
- Output format on VS Code and Chrome.
- Web dictation without Cloud.

## 4. Required behaviour

**Established requirements**

- A + (attach) menu lists the ways to add files, media and context. (source: brief S13.35)
- Before sending, the user can choose an output format for the reply. (source: brief S13.34)
- A microphone control dictates speech into the composer text without sending, for review. (source: brief S13.36)
- A control starts a hands-free voice conversation from the composer. (source: brief S13.37)
- Product docs list Web voice as dictation only and VS Code voice as absent (out of date against code; code wins). (source: doc: docs/product/experience-contract.md:641)

**Acceptance criteria**

1. Open + on web; rows are reachable and each closes the menu on use.
2. Choose Output then Spreadsheet; send; a spreadsheet file is produced and the reply is one or two sentences.
3. Choose the same format again; it clears.
4. Dictate: text appears in the box and is not sent until Send is chosen.
5. Turn Dictation off in settings; the mic is disabled with the stated reason.
6. With text in the box or a reply running, the voice button is not shown.
7. Mobile in Local mode: dictation works with no sign-in, live voice says it needs Cloud.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Dictation should degrade with a reason, not vanish, in Local and own-key chats; web currently disables via isAvailable without a reason string in that branch [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a reason when dictation is blocked for Local or own-key on Web.
- [proposed] Offer on-device dictation on Web and Desktop for Local mode so it needs no subscription.
- [proposed] Add Output format to VS Code and Chrome or document why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Menu rows, Output submenu. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Wires menu, dictation, voice entry, Office toggles. |
| config | chat-output-format | `apps/web/lib/chat-output-format.ts` | Instruction text for the chosen format. |
| config | CHAT_OUTPUT_FORMAT_LABEL | `packages/contracts/cloud-contracts/src/skills.ts` | Labels Document, Presentation, Spreadsheet. |
| service | request-processor office format | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts office_format, adds notice and forced tool. |
| hook | useChatStream office fields | `apps/web/lib/hooks/useChatStream.ts` | Sends office_creation and office_format. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Recording state machine, kill-switch text, allowance refusal. |
| store | voice-input-store | `apps/web/features/chat/stores/voice-input-store.ts` | Captures audio and posts to /api/voice/transcribe. |
| component | DictationStrip | `apps/web/features/chat/components/Composer/DictationStrip.tsx` | Cancel, Stop, Send, retry, upgrade. |
| component | VoiceEntryButton | `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx` | Start voice mode button (VoiceInputButton.tsx in the same folder is the microphone). |
| endpoint | POST /api/voice/transcribe | `apps/web/app/api/voice/transcribe/route.ts` | Dictation admission and kill switch, then shared handler. |
| endpoint | transcriptions handler | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Plan, allowance, privacy, provider call, settle. |
| service | free voice allowance | `apps/web/lib/voice/free-voice-allowance.ts` | Free plan monthly dictation seconds. |
| component | mobile AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | + sheet, Create file. |
| component | mobile VoiceInputButton | `apps/mobile/src/features/voice/components/VoiceInputButton.tsx` | Dictation capture and strip. |
| service | mobile voiceInput | `apps/mobile/src/features/voice/services/voiceInput.ts` | On-device recognizer. |
| service | mobile liveVoiceAvailability | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Reasons live voice is unavailable. |
| service | VS Code dictationClient | `apps/extension-vscode/src/features/sidebar-webview/dictationClient.ts` | Uploads audio for transcription. |
| component | Chrome voice | `apps/extension/src/features/side-panel/voice.ts` | Browser speech recognition into the box. |
| command | CLI voice | `apps/cli/src/voice.rs` | Capture, backends, privacy gate, dictate. |
| command | CLI /dictate and /voice | `apps/cli/src/tui/tui_app.rs` | Slash handling and composer insert. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Output choice is stored as office format in composer toggles. | device | ChatComposerNew.tsx:6124-6132 |
| Send includes office_creation and office_format; the server adds an instruction and the Office file tool. | our servers | useChatStream.ts:4642; request-processor.ts:6649-6659 |
| Web dictation records audio in the browser and posts it to the server route. | device and our servers | voice-input-store.ts:231 |
| Server checks the kill switch, plan allowance and privacy setting, and sends audio to the transcription provider; audio is not stored. | outside service | transcriptions/route.ts:467,500-512 |
| Transcript returns and is inserted in the box. | device | use-dictation.ts:199-205 |
| Mobile dictation recognises speech on the device. | device | voiceInput.ts:288-304 |
| Chrome hands audio to the browser's own speech service; AGI receives only text. | outside service | apps/extension/_locales/en/messages.json spVoiceNotice text |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recorded audio (web, VS Code) | not stored; dropped after transcription per the route comment | No | transcriptions/route.ts:467 |
| Generated Office file | managed file storage via the Office file service | Yes with the chat | Follows Library rules (see SYS-files-artifacts-and-storage) |
| Free voice seconds used | server usage records (grantFreeVoiceSeconds, settleFreeVoiceSeconds) | Server only | unknown |

**Models and providers.** Transcription uses a hosted provider; the route default is provider openai with an allowlist check (transcriptions/route.ts:320,500). VS Code asks for the voice_transcription routing slot (dictationClient.ts:20). Output relies on a model that accepts tools and, when allowed, a forced tool choice (request-processor.ts:6650-6654). Mobile dictation uses no model of ours.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web dictation and voice need sign-in and a managed model; VS Code dictation needs managed sign-in; CLI managed backend needs a signed-in account; whether Mobile on-device dictation needs an account is not established (it depends on the canUseVoice capability, ChatInput.tsx:460). |
| Permissions | Browser or OS microphone permission; Chrome notice before first use; CLI privacy gate. |
| Subscription | Free plan has a monthly dictation allowance in seconds; paid plans use a voice_minutes unit allowance; refusals show 'Upgrade' when upgradable (free-voice-allowance.ts:47; transcriptions/route.ts:594-600; use-dictation.ts:55-62). |
| Limits and metering | Reservation and settlement per request, rate limit 'audio-transcription' (transcriptions/route.ts:294); CLI recording max 120 seconds (voice.rs MAX_RECORDING_SECS). |
| Feature flags | Dictation kill switch capability (kill-switches DICTATION_CAPABILITY) with reason text; per-version disable (route.kill-switch.test.ts). |
| Model compatibility | Output needs a tools-capable model (ChatComposerNew.tsx:1643-1645); Free restricted chats disable it. |
| Provider restrictions | Transcription provider must pass the privacy rule: a privacy setting can refuse a provider that may train on content (transcriptions/route.ts:506-512). |
| Local mode | Web: dictation and voice are unavailable when an on-device or own-key model is selected (ChatComposerNew.tsx:2052-2054; WebChatPage.tsx:5907). Mobile: dictation is on-device and live voice is refused in Local mode with a stated reason (liveVoiceAvailability.ts:25). CLI: Local privacy mode blocks cloud speech unless explicitly allowed (voice.rs:131-135). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Recording | Strip replaces the composer row; waveform bars. | ChatComposerNew.tsx:5828,6944 |
| Transcribing | Strip shows 'Transcribing'. | DictationStrip.tsx:21 |
| Empty transcript | Error 'Nothing was heard in that recording. Try again.' with retry. | use-dictation.ts:37 |
| Mic blocked or unsupported | Disabled with 'Voice input not supported in this browser' (VoiceInputButton.tsx:12); Chrome 'mic blocked' text. | VoiceInputButton.tsx:12-13; messages.json spVoiceMicBlocked |
| Allowance used up | Strip shows limit message and Upgrade when upgradable. | use-dictation.ts:55-62; DictationStrip.tsx:23 |
| Hidden window (quick ask) | Dictation is interrupted with a note. | ChatComposerNew.tsx:2108-2111 |
| Voice entry hidden | Not shown while a reply runs or when the box has text. | ChatComposerNew.tsx:6955 |
| Output unavailable | Row disabled with a title. | ChatComposerNew.tsx:6124-6128 |
| Offline | Transcription fails with the retry error; other behaviour not handled in the code. | use-dictation.ts:36 FALLBACK_TRANSCRIBE_ERROR; no offline branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: + menu (titles not read).
- `apps/web/features/chat/components/Composer/DictationStrip.test.tsx`: Round buttons on phones, cancel stop send offered, one bar per sample, discard on cancel.
- `apps/web/features/chat/hooks/useDictation.test.tsx`: Idle state, drops transcript when destination changes, uses current callbacks keeping send intent.
- `apps/web/features/chat/lib/dictation-machine.test.ts`: Dictation state machine (titles not read).
- `apps/web/app/api/voice/transcribe/__tests__/route.kill-switch.test.ts`: Admits when no switch, refuses before any provider is paid, per-version disable, developer API not covered.
- `apps/web/features/chat/components/Composer/VoiceEntryButton.test.tsx`: Voice entry button (titles not read).
- `apps/mobile/__tests__/ChatInputDictation.test.tsx`: Strip controls, send delegated, merge text edited while recording, draft kept when send rejected.
- `apps/extension-vscode/src/__tests__/dictationClient.test.ts`: VS Code upload client (titles not read).
- `apps/extension/__tests__/dictation-language.test.ts`: Chrome dictation language (titles not read).

**Test scenarios**

- **Output file**
  1. Cloud chat with a tools model.
  2. +, Output, Presentation.
  3. Send 'Quarterly review'.
  - Expected: A presentation file appears; reply is one or two sentences.
- **Dictation insert**
  1. Click mic, speak, Stop.
  - Expected: Text in the box; nothing sent.
- **Dictation off**
  1. Turn dictation off in Voice settings.
  - Expected: Mic disabled with 'Dictation is off in Voice settings'.
- **Voice button visibility**
  1. Empty box shows 'Start voice mode'; type a letter.
  - Expected: Button becomes Send.
- **Mobile Local**
  1. Local mode, tap mic; try /voice.
  - Expected: Dictation works on device; live voice refuses with a Local reason.
- **Kill switch**
  1. Set dictation closed via /api/me disabled features.
  - Expected: Mic disabled with the switched-off sentence.

**Where to look when it fails**

- API errors from POST /api/voice/transcribe (insufficient_quota, generic provider message).
- disabledFeatures in the /api/me response.
- CLI lines from voice.rs privacy gate.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Web and Desktop dictation and voice have no Local or own-key path, so they are unavailable there.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:2052-2054; WebChatPage.tsx:5907. Work needed: Add on-device speech for Local mode, free of subscription.
- **Brief is out of date: VS Code has dictation.** Affects: Documentation. Evidence: webviewContent.ts:3362. Work needed: Fix brief S13.36 and experience-contract.md:641.
- **No Output format on VS Code and Chrome; no voice conversation there either.** Affects: VS Code, Chrome. Evidence: brief S13.34, S13.37; none found. Work needed: Decide scope.
- **Task draft names Word, PowerPoint, Excel but labels are Document, Presentation, Spreadsheet.** Affects: Documentation. Evidence: skills.ts:22-26. Work needed: Use the code labels.
- **System-wide desktop dictation remains unwired.** Affects: Desktop. Evidence: docs/product/experience-contract.md:669-674. Work needed: Finish or keep gated.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-execution-boundaries
- api:POST /api/voice/transcribe

## Unknown

- Which exact speech recognizer Chrome uses and where it runs (browser speech service per messages.json notice).
- Whether Mobile dictation requires sign-in in Local mode (canUseVoice capability computation not read).
- Server retention of voice usage records.
- What TEMPORARY_CHAT_LABEL text is.
- Whether Office output is hidden when a Local model is selected on Web.
