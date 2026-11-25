---
id: "F110-05"
type: "feature"
title: "Voice requests that start work or make documents"
aliases: ["Voice to AGI Work task", "Voice to document", "Live voice", "Voice mode", "Starting a task (voice tool label)", "Creating a file (voice tool label)", "S110.07", "S110.08"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S110.07", "S110.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "plan:pro", "plan:free", "SYS-voice-and-media", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "F110-01", "api:POST /api/voice/live/sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-05 Voice requests that start work or make documents

In live voice, the voice model can hand a goal to the chat as an AGI Work task, or make a Word, PowerPoint, Excel, PDF or CSV file that appears as an 'Open' link or card. Works on web (and desktop through the hosted app) and on the phone in Cloud mode. CLI voice only turns speech into a typed prompt.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.07](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11007), [S110.08](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11008).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the live voice session two tools. 'agi_work' hands a goal to the chat client, which sends it as an AGI Work turn (apps/web/lib/voice/live-voice-tools.ts:343-362, 400-402; apps/web/features/chat/lib/live-voice-session.ts:746-770). The office file tool builds a document and the session lists it as an openable file (apps/web/lib/voice/live-voice-tool-runner.ts:151-190; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:471-500).

**Why it exists.** Competing assistants let a person talk and have work done. Retyping a spoken request defeats voice mode.

**Who uses it.** People who talk to the assistant on web, Desktop or the phone; terminal users who dictate.

**Problems it solves**

- Spoken requests for long work need a durable run, not a spoken answer
- A spoken request for a document needs a file
- Voice sessions end; the task must outlive them

**Use cases**

- Say 'research competitors and write me a report' and a background AGI Work task starts in the chat
- Say 'make a one page PDF of these notes' and tap 'Open'
- On the phone, ask for a spreadsheet and open it with the system share sheet
- In the terminal, press push-to-talk, review the text, send it to the agent

## 2. User experience

**Where to find it**

- Web: voice mode surface in chat (VoiceModeSurface.tsx); mic starts it. Desktop: same hosted app [inferred from AGENTS.md section 5; docs/product/experience-contract.md:641 says Desktop has in-window dictation only, which conflicts with the web code; code wins]
- Mobile: live voice bar in the chat screen (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx; chat screen apps/mobile/app/(app)/chat/[id].tsx:2834)
- CLI: command /voice in the terminal chat, built only with the 'voice' feature (apps/cli/src/lib.rs:74-100; apps/cli/Cargo.toml:126-132)
- VS Code, Chrome: none found; the contract table says Chrome has speech input only (docs/product/experience-contract.md:641)

**Before you start**

- Signed in; plan allows voice (apps/web/app/api/voice/live/sessions/route.ts:308-314)
- Work task tool: the client must list it as a hand-off and the plan must have the 'agi_work' capability, tiers pro and above (live-voice-tools.ts:400-402; billing-catalog.ts:354)
- Tools need a tool-capable live model and a plan with tool use allowed (live-voice-tools.ts:378)
- Mobile: Cloud mode, signed in, native build with WebRTC, secure server (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:17-47)
- Microphone permission

**Screens and controls**

- Web labels: 'Working on your request', 'Stop the task', 'Open', 'Continue in text', 'Try again', 'Resume' (VoiceModeSurface.tsx:40-62)
- Tool timeline with approval prompts for write-risk tools (requiresApproval true, live-voice-tools.ts:223-231)
- Mobile: 'Open <file>' button per file (VoiceToolFiles.tsx), LiveVoiceBar

**Journey**

1. 1. Start voice mode; the app opens a live session and passes the list of client hand-offs.
2. 2. Speak the request.
3. 3. For long work the voice model calls 'agi_work' with the goal. The tool needs approval (requiresApproval true). The server replies it was handed off.
4. 4. The client starts a work-mode send into the chat with the goal; the session shows 'An Work task started in the chat for: <goal>...' as a note (live-voice-session.ts:763-767).
5. 5. For a document the voice model calls the office tool; the server builds it and returns a file with a link under /api/files.
6. 6. Tap 'Open' (web opens a new tab; phone downloads then opens the share sheet).
7. 7. The work task continues in the chat after the call ends.

**What the person sees and gets**

- Tool timeline entries labelled 'Starting a task' and 'Creating a file'
- Failure output text 'The task did not start because the chat could not send it right now...' (live-voice-session.ts:157-158)
- Image or file link in the tool results area
- CLI: line showing what was heard and a prompt '[ENTER to send, 'e' to edit, 'r' to re-record, ESC to discard]' (voice.rs:229-236)

**Settings**

- Voice, language and pace in voice settings (VoiceSettingsModal)
- CLI language option and the environment setting AGIWORKFORCE_VOICE_ALLOW_CLOUD for sending Local audio to cloud speech-to-text (voice.rs:85-86)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web live voice session and tool call route /api/voice/live/sessions/[sessionId]/tools; client hand-off for agi_work calls handleSend in work mode (WebChatPage.tsx:6801-6846; live-voice-session.ts:746-770)
- Voice office tool: builds and stores the file, returns files list (live-voice-tool-runner.ts:151-190)
- Web 'Open' link only for paths matching /api/files/<id> (VoiceModeSurface.tsx:67, 475)
- Mobile live voice with work-task hand-off (liveVoiceSession.ts:351-352, 437-445; chat/[id].tsx:1756-1762, 2834) and openable files (VoiceToolFiles.tsx; LiveVoiceBar.tsx:505)
- CLI voice: capture, speech-to-text, confirm, then the text is sent to the agent as if typed (voice.rs:249-270)

**Incomplete**

- The tool description says the task is 'tracked in Tasks'; the code that creates the tracked run is the normal work-mode send, not read here; tracking in Tasks is unverified (live-voice-tools.ts:343-350)
- The voice office call passes no executor or attachments, so verify_render and editing an attached file are not available in voice (live-voice-tool-runner.ts:155)
- Desktop is the hosted web app [inferred]; not tested

**Present but disconnected or switched off**

- Mobile live voice is off in Local mode: 'Live voice runs in AGI Cloud, so Local Mode stays turn based.' (liveVoiceAvailability.ts:17-25)
- The CLI voice code is not in Linux release builds (.github/workflows/release-cli.yml:240-278)
- Sandbox tools offered to voice only if the sandbox is ready (live-voice-tools.ts:404-406)

**Not available**

- VS Code: no voice
- Chrome: no live voice (speech input only per docs/product/experience-contract.md:641)
- CLI: no AGI Work task tool or document tool in voice; the CLI voice loop only sends the text (voice.rs:249-270). The brief marks CLI done for both; code does not support that.

## 4. Required behaviour

**Established requirements**

- A request made in voice mode becomes a durable AGI Work task (runs in background, tracked in Tasks) without the user retyping it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.07)
- A spoken request produces a document (docx, pdf, markdown artifact) the user can open from the voice session. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.08)
- The voice model gets the work task tool only when the client listed it and the plan has agi_work; the office file tool is in the list when tools are allowed. (source: apps/web/lib/voice/live-voice-tools.ts:378, 399-402)
- If the work task fails to start the user is told. (source: apps/web/features/chat/lib/live-voice-session.ts:157-158, 769)
- Live voice must be separate from dictation; if unavailable the UI says so without broken controls. (source: docs/product/requirements.md:910-921, 1003)
- The app says whether audio is local or provider/cloud. (source: docs/product/requirements.md:1004)

**Acceptance criteria**

1. On a plan with agi_work, speaking a multi-step request starts one work-mode send in the chat with the spoken goal.
2. On a plan without agi_work the voice model is not offered the task tool.
3. If the chat cannot send, the voice model is told the task did not start.
4. A spoken request for a PDF yields an 'Open' link that opens the file.
5. The 'Open' link appears only for /api/files paths.
6. On the phone in Local mode live voice is unavailable with the stated reason.
7. CLI /voice in a Local session without a local speech program and without the opt-in refuses to send audio to the cloud.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The task should appear in Tasks with the same goal [inferred from S110.07; not verified]
- Voice documents should support attached source files [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass attachments and the render executor to the voice office tool
- [proposed] Correct the brief for CLI voice or build the CLI hand-off
- [proposed] Update the experience contract table, which lists Web voice as dictation only

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | live-voice-tools | `apps/web/lib/voice/live-voice-tools.ts` | Tool registry, work task tool, office tool, sandbox tools, approval flags |
| service | live-voice-tool-runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs a tool call: work task hand-off message, office file build and store |
| endpoint | voice tool call route | `apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts` | Server side of a tool call (liveVoiceToolCallPath) |
| endpoint | voice session create | `apps/web/app/api/voice/live/sessions/route.ts` | Plan check, free allowance, billing hold, function tool list, voice_live slot |
| service | voice session lib | `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts` | Settlement of voice minutes |
| service | live-voice-session (web client) | `apps/web/features/chat/lib/live-voice-session.ts` | WebRTC session, tool bridge, onStartWorkTask |
| hook | use-voice-session | `apps/web/features/chat/hooks/use-voice-session.ts` | Passes onStartWorkTask with owner and authority |
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Voice UI, tool results and Open links |
| component | WebChatPage voice hand-off | `apps/web/features/chat/pages/WebChatPage.tsx` | handleVoiceStartWorkTask sends in work mode (6801-6846) |
| service | live voice contracts | `packages/contracts/cloud-contracts/src/live-voice-tools.ts` | LIVE_VOICE_WORK_TASK_TOOL name agi_work, tool call path |
| service | liveVoiceSession (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Mobile session, hand-off list, files |
| service | liveVoiceAvailability (mobile) | `apps/mobile/src/features/voice/services/liveVoiceAvailability.ts` | Local mode and sign-in reasons |
| component | VoiceToolFiles (mobile) | `apps/mobile/src/features/voice/components/VoiceToolFiles.tsx` | Open file buttons (download and share) |
| component | LiveVoiceBar (mobile) | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Mobile voice UI and tool outcomes |
| component | mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | handleVoiceStartWorkTask (1756-1762) |
| service | CLI voice | `apps/cli/src/voice.rs` | Push-to-talk capture, speech-to-text, confirm, send; Local egress gate |
| config | CLI voice feature | `apps/cli/Cargo.toml` | voice feature flag (lines 126-132) |
| service | office file service | `apps/web/lib/services/managed-office-file-service.ts` | Builds the voice document (see F110-01) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client creates a live session, sending the list of client hand-offs ('agi_work' when it can start a work task). | device and our servers | live-voice-session.ts:540-541; sessions/route.ts:474 |
| Server checks sign-in, plan voice allowance, tenant, billing hold; picks the live model from the voice_live routing slot; builds the tool list. | our servers | sessions/route.ts:189, 284-314, 346-370, 474-486 |
| Audio flows between the device and the live voice provider over a real-time connection created by the server. | outside service | live-voice-session.ts:455-541 (RTCPeerConnection); sessions/route.ts:237 (provider key name only) |
| The voice model calls a tool; the client posts it to the tools route; approval is applied for write-risk tools. | device and our servers | live-voice-session.ts:746-770; live-voice-tools.ts:223-231 (requiresApproval true) |
| For agi_work the server only returns 'handed off'; the client then starts a work-mode send with the goal in the chat. | device | live-voice-tool-runner.ts:254-257; WebChatPage.tsx:6801-6817 |
| The chat turn runs as an AGI Work request on our servers (work_mode agiwork). | our servers | request-processor.ts:1040 (work_mode agiwork treated as agentic); run tracking not read |
| For a document the server builds the file, stores it, and returns a files list; the UI shows 'Open'. | our servers | live-voice-tool-runner.ts:151-190; VoiceModeSurface.tsx:471-500 |
| CLI: audio is captured on the device and transcribed by a local speech program, or by cloud speech-to-text when allowed, then sent to the agent. | device | apps/cli/src/voice.rs:1-10, 426-440, 456-481; cloud use of managed or key-based speech only in non-Local or with opt-in |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Voice audio | Streamed to the live voice provider; not stored by the client | Provider side | unknown |
| Voice session record, minutes and settlement | Server tables via voice-session-store.ts | Server side | unknown |
| Generated document | Our file storage, linked from /api/files/<id> | Server data | unknown |
| Work task goal and run | The chat conversation and agent run store (not read) | Yes through chat sync [inferred] | unknown |
| CLI recorded audio WAV | Temporary WAV file on the device (voice.rs:945-960) | No | deletion not read |

**Models and providers.** The live model comes from the voice_live routing slot and must be an unmanaged-provider-free live model (sessions/route.ts:189-198); the provider key setting is named OPENAI_KEY_ENV in code, so the live provider is provider:openai [inferred]. The voice model decides when to call tools. Chat model for the work task is whatever the chat uses. CLI speech-to-text backends: managed account, a key-based cloud service, or a local program (voice.rs:1-10).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Live voice session creation needs a user; sign-in reason on mobile 'Sign in to use live voice; this chat stays turn based.' (liveVoiceAvailability.ts:18). |
| Permissions | Write-risk tools need approval (live-voice-tools.ts:143, 175, 186, 223-231). Temporary chat rules apply in the runner (live-voice-tool-runner.ts:327-337). |
| Subscription | Capability 'canUseVoice' and tier policy allowVoice (sessions/route.ts:308-314); free voice allowance in seconds (route.ts:346); tools only if tier allowToolUse; agi_work tier pro and above (billing-catalog.ts:354). |
| Limits and metering | Voice minutes metered (unit voice_minutes, route.ts:370); free allowance function freeVoiceAllowanceSeconds; tool output truncated for voice (MAX_VOICE_TOOL_OUTPUT_CHARS in live-voice-tool-runner.ts). |
| Feature flags | Mobile native module and secure server; CLI 'voice' feature at build; CLI environment AGIWORKFORCE_VOICE_ALLOW_CLOUD. |
| Model compatibility | Backend model with tools false gives no tools (live-voice-tools.ts:378). |
| Provider restrictions | Live voice backend must resolve to a live model of an allowed provider; failure throws (sessions/route.ts:189-198, 319-322). Google user data rules apply to connector tools (live-voice-tool-runner.ts:198-203). |
| Local mode | Web: no Local mode. Mobile Local mode: live voice not available (turn based only). CLI: Local session blocks cloud speech-to-text unless AGIWORKFORCE_VOICE_ALLOW_CLOUD=1, and needs a local speech program otherwise (voice.rs:456-481, 131-141). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Work task cannot start | Tool returns an error output telling the voice model to ask the person to type the request with Work mode on | live-voice-session.ts:157-158, 769; liveVoiceSession.ts:111-112, 445 |
| Goal missing | 'The task needs a goal in words, so it did not start.' | live-voice-tool-runner.ts:76, 254-257 |
| Reconnect | Label 'Reconnecting, attempt', option 'Continue that session' or 'Use my settings' | VoiceModeSurface.tsx:40-62 |
| Paused | Text 'Paused. The call is closed and nothing is being used. Resume ...' | VoiceModeSurface.tsx:61-62 |
| Slow tool | 'is taking longer than usual' | VoiceModeSurface.tsx:54 |
| Stop | 'Stop the task' keeps the call open | VoiceModeSurface.tsx:52-53 |
| Usage exhausted | Upgrade action shown | VoiceModeSurface.tsx:44 |
| Mobile file open fails | Alert 'Could not open this file' | VoiceToolFiles.tsx:48-53 |
| CLI no speech detected, transcription failure | '(no speech detected)'; error and retry offer | voice.rs:215-226 |
| Accessibility | Mobile open buttons have role button and label 'Open <name>' | VoiceToolFiles.tsx:70-76 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/voice/__tests__/live-voice-tools.test.ts`: Tool resolution; offers nothing to a model that cannot call tools; every write-risk tool behind approval; names every tool it cannot run
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts`: Approval parity (by file name) [inferred]
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.temporary-chat.test.ts`: Temporary chat rule (by file name) [inferred]
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Web live session client (by file name) [inferred]
- apps/web/features/chat/components/Voice/__tests__/VoiceModeSurface.test.tsx (not found) (not found): Voice surface (by file name) [inferred]
- `apps/web/app/api/voice/live/sessions/route.test.ts`: Session creation (by file name) [inferred]
- `apps/web/lib/voice/__tests__/free-voice-allowance.test.ts`: Free voice allowance (by file name) [inferred]
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Mobile live voice bar (by file name) [inferred]

**Test scenarios**

- **Voice starts a work task**
  1. On a plan with agi_work start voice mode
  2. Say 'research three competitors and write a report'
  3. Approve the tool if asked
  4. End the call
  - Expected: A work-mode turn with that goal appears in the chat and keeps running; check it in Tasks (unverified).
- **Plan without agi_work**
  1. Use a lower plan, start voice, ask for long work
  - Expected: The voice model has no task tool; it answers or declines.
- **Voice makes a PDF**
  1. Say 'make a one page PDF summary of our talk'
  2. Tap 'Open'
  - Expected: A file opens in a new tab on web; share sheet on phone.
- **Task cannot start**
  1. Cause the chat send to be blocked then ask for a task
  - Expected: Voice model is told the task did not start and tells the person.
- **Phone Local mode**
  1. Switch to Local mode and enter voice
  - Expected: Live voice unavailable with the Local mode reason; turn based voice remains.
- **CLI Local gate**
  1. In a Local session with no local speech program and no opt-in run /voice
  - Expected: Refusal with the privacy boundary message; no audio leaves the device.

**Where to look when it fails**

- Log events live_voice_not_configured, live_voice_unpriced, live_voice_function_tools_failed, live_voice_reservation_failed (sessions/route.ts)
- Error code model_may_train (403) on voice
- Output text WORK_TASK_NOT_STARTED
- CLI error text 'Privacy boundary blocked...' (voice.rs:465-475)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Brief says CLI done for task and document; code only sends transcribed text** Affects: CLI users. Evidence: voice.rs:249-270; no work-task or document tool in CLI voice. Work needed: Correct brief or add a hand-off
- **Brief says mobile document missing; code has open buttons for voice files** Affects: Mobile. Evidence: VoiceToolFiles.tsx; LiveVoiceBar.tsx:505. Work needed: Update brief to done; test
- **Tracked in Tasks not verified** Affects: Web, Mobile, Desktop. Evidence: Only a description string says so (live-voice-tools.ts:343-350). Work needed: Trace the work-mode send to the Tasks list and test it
- **Voice office tool lacks attachments and render check** Affects: Web, Mobile. Evidence: live-voice-tool-runner.ts:155. Work needed: Pass attachments and executor
- **Experience contract table is out of date for Web and Desktop voice** Affects: Docs. Evidence: docs/product/experience-contract.md:641 versus VoiceModeSurface code. Work needed: Update the document
- **No VS Code or Chrome voice** Affects: VS Code, Chrome. Evidence: none found. Work needed: Decide scope
- **Desktop behaviour not verified** Affects: Desktop. Evidence: Hosted web app [inferred]. Work needed: Run on the desktop build
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- plan:pro
- plan:free
- SYS-voice-and-media
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- F110-01
- api:POST /api/voice/live/sessions

## Unknown

- Whether the work task appears in Tasks and how it is tracked
- Retention of voice audio and generated files
- How the desktop app behaves with voice
- Which live voice provider and model are configured in production
- CLI release builds with voice on non-Linux platforms (release-cli.yml:278 sets the feature; matrix not fully read)
- Whether the phone voice office tool supports the same formats
