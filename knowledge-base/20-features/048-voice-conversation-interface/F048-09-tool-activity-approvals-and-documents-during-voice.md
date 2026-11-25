---
id: "F048-09"
type: "feature"
title: "Tool activity, approvals and documents during voice"
aliases: ["Tool activity during voice", "Approve an action during Voice (S48.27)", "View tool results during Voice (S48.26)", "Open a generated document from Voice (S48.28)", "voice-tool-approval", "Stop the task", "What the actions returned"]
area: "48 Voice conversation interface"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S48.26", "S48.27", "S48.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "provider:openai", "plan:free", "plan:pro", "plan:max", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F048-09 Tool activity, approvals and documents during voice

While a live voice call is running, the screen shows what tools the assistant is using and what they returned, asks for approval on screen before sensitive actions, and links to files a tool made. Approval is by tapping Allow or Deny, never by speaking. Tool text is cut to 32,000 characters before the voice model reads it.

Area: [48. Voice conversation interface](README.md). Requirement items: [S48.26](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4826), [S48.27](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4827), [S48.28](../../10-requirements/capabilities/048-voice-conversation-interface.md#s4828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the live voice assistant run tools (web fetch, code, Office files, connector tools, AGI Work tasks) and keeps the person informed and in control through on-screen status, results, approvals and a Stop the task button.

**Why it exists.** Spoken conversation hides what the assistant is doing. Sensitive actions need explicit consent that a spoken 'yes' cannot give safely, so the prompt tells the model a spoken yes does not approve (apps/web/lib/voice/live-voice-tools.ts:437-445).

**Who uses it.** Web and Desktop (via the hosted web app) and iPhone users in live voice; the CLI uses its own agent prompts [unknown details].

**Problems it solves**

- Silent actions during a call.
- Approvals missed because they were only spoken.
- Very long tool output overloading the voice model.
- Generated files unreachable from the call.

**Use cases**

- Ask the assistant to make a spreadsheet; open it from the voice screen when done.
- Ask it to fetch a web page; see 'is taking longer than usual' if it is slow, and stop the task.
- An action needs approval; see the same risk card as in typed chat and tap Allow or Deny.
- See a tool-produced image in place on the call screen.

## 2. User experience

**Where to find it**

- Web and public Desktop: inside the voice screen above the composer (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:470-520, 570-600).
- iPhone: inside the live voice bar (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:470-640, 660-700).
- CLI: spoken text is sent to the agent session like typed text, so tool output and approvals are those of the CLI session (apps/cli/src/voice.rs:257-285) [CLI approval path not traced].

**Before you start**

- A started Cloud live voice session where the plan allows voice (apps/web/app/api/voice/live/sessions/route.ts:311).
- For approvals: the server must offer a tool that needs one; tools the person's Tool approvals setting asks about every time may be withheld from voice instead (apps/web/lib/voice/live-voice-tools.ts:447-462).

**Screens and controls**

- Status line with spinner: the latest tool label, or 'Working on your request', plus 'is taking longer than usual' when slow, and a button 'Stop the task' with hint 'Stops the running action and keeps the call open.' (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:51-55, 226-233, 582-598).
- Tool results timeline (data-testid voice-tool-results); images show inline with a link; other files show 'Open <file name>' (VoiceModeSurface.tsx:470-508, 56).
- Approval card: the same ToolApprovalCard used in typed chat, with risk review; approvals without a review are treated as high risk (VoiceModeSurface.tsx:96-120; test VoiceModeSurface.test.tsx:568-615).
- iPhone: header 'Waiting for your approval', buttons from the shared labels 'Allow' and the deny label, a high-risk notice for high or critical tiers (LiveVoiceBar.tsx:80, 511-640); results box 'What the actions returned' with 'Did not complete' on failure; 'Open <file>' buttons (LiveVoiceBar.tsx:83-84; VoiceToolFiles.tsx:62-92); 'Stop the task' (LiveVoiceBar.tsx:674-694).

**Journey**

1. 1. In a live call ask for something that needs a tool.
2. 2. The status line names the tool being run.
3. 3. If approval is needed an approval card appears and the assistant says it is waiting for approval on screen (apps/web/features/chat/lib/live-voice-session.ts:413-420).
4. 4. Tap Allow or Deny. Deny sends 'rejected'.
5. 5. The result is added to the results list; the assistant speaks the outcome.
6. 6. If a file was made, tap 'Open <name>'. Web opens a new tab; Desktop opens a detached file window; iPhone downloads it and opens the share sheet.

**What the person sees and gets**

- Tool result list with failed ones marked (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:212-224).
- Web: unknown or failed tool results flow back to the model as text up to 32,000 characters then '[output truncated for voice]' (apps/web/lib/voice/live-voice-tool-runner.ts:67, 127-131).
- iPhone alert 'Could not open this file' on download failure (VoiceToolFiles.tsx:52-55).
- Spoken progress notes: after about 3 seconds of waiting the assistant may say it is still working (apps/web/features/chat/lib/live-voice-session.ts:86-101).

**Settings**

- Tool approvals setting (its policy is loaded for the voice session) (apps/web/app/api/voice/live/sessions/route.ts:98 import of loadToolApprovalPolicy; apps/web/lib/voice/live-voice-tools.ts:447-462).
- Connectors on or off for the chat (apps/web/app/api/voice/live/sessions/route.ts: connectorsAllowedForTurn near line 466).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web tool activity, results, approvals, Stop the task, file links and inline images (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:226-233, 470-520, 582-598).
- Approval round trip: the tool route answers 'approval_required', the bridge holds the call, the person's decision is resent with the call (packages/contracts/cloud-contracts/src/live-voice-tools.ts:147-206; apps/web/features/chat/lib/live-voice-session.ts:742-770).
- Server tool runner: bounded output, file persistence for Office files, approval gate shared with typed chat (apps/web/lib/voice/live-voice-tool-runner.ts:127-131, 151-190; apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts).
- Desktop opens generated files in a separate window and closes it after a download (apps/desktop/electron/windowPolicy.ts:262-269, 271, 332-340).
- iPhone tool activity, results (last 3 kept), approvals with risk notice, Stop the task and document opening through download and share (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:69, 354-361; apps/mobile/src/features/voice/components/VoiceToolFiles.tsx:37-60).

**Incomplete**

- Only files whose address matches /api/files/<id> are linkable (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:67-72; VoiceToolFiles.tsx:18-22).
- Tools the approvals setting asks about every time may be left out of the session, so the person is told to type the request instead (apps/web/lib/voice/live-voice-tools.ts:447-462). How this meets the approval card path is not fully traced.

**Present but disconnected or switched off**

- checkSpokenSuccessClaim and the onUnverifiedClaim callback exist in the web session but the voice hook does not pass the callback (apps/web/features/chat/lib/live-voice-session.ts:144-155, 167; apps/web/features/chat/hooks/use-voice-session.ts:605-679) [inferred from the callbacks list].

**Not available**

- Approving by voice: explicitly refused by the prompt (apps/web/lib/voice/live-voice-tools.ts:441-444).
- Document opening on iPhone is NOT missing (brief says missing); it exists (apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:505).
- Maps in tool results: none found.

## 4. Required behaviour

**Established requirements**

- Tool activity and results from a voice turn are viewable during the conversation. (source: S48.26)
- An action needing approval can be approved or denied without leaving voice. (source: S48.27)
- A document generated during voice can be opened from the voice view. (source: S48.28)
- Writes requiring approval cannot execute before that approval. (source: doc: docs/product/experience-contract.md:788 (W14))

**Acceptance criteria**

1. A running tool shows its label within the call screen; after the tool's timeout the label gains 'is taking longer than usual'.
2. An approval-needing action does not run until Allow is pressed; Deny leaves it unrun and the assistant says so.
3. Saying 'yes' aloud does not approve.
4. A tool that returns over 32,000 characters reaches the voice model cut with '[output truncated for voice]'.
5. A generated file is listed and 'Open <name>' opens it on web, Desktop and iPhone.
6. 'Stop the task' cancels the running work and keeps the call open.
7. A failed tool result is shown as failed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Approval cards should behave like typed chat (risk review) [inferred from VoiceModeSurface.tsx:96-120].
- The web session should flag a spoken completion claim with no tool result [inferred from the unused callback].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Wire onUnverifiedClaim to a visible notice or remove the dead hook.
- [proposed] State in product copy that approvals are tap-only.
- [proposed] Show which tools were withheld because of the approvals setting.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | VoiceModeSurface | `apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` | Status line, Stop the task, results, files, approvals. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Shared approval card used by voice (imported at VoiceModeSurface.tsx:26). |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Shared results timeline. |
| hook | useVoiceSession | `apps/web/features/chat/hooks/use-voice-session.ts` | Stores activity, approvals, outcomes; decideToolApproval (1000-1002); cancelBackendWork (975-977). |
| service | LiveVoiceSession | `apps/web/features/chat/lib/live-voice-session.ts` | Tool bridge setup (409-433), decideToolApproval (742), callTool (746-770), 20 second default tool timeout (55). |
| service | LiveVoiceToolBridge | `packages/contracts/cloud-contracts/src/live-voice-tools.ts` | Holds calls, publishes approvals, resends decision, flushes outputs to the model (118-225). |
| endpoint | POST /api/voice/live/sessions/{sessionId}/tools | `apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts` | Runs a tool call: CSRF, sign-in, rate limit, session lookup (22-60, 87). |
| service | live-voice-tool-runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Executes tools, approval gate, 32,000 character cap, Office file creation and storage. |
| service | live-voice-tools | `apps/web/lib/voice/live-voice-tools.ts` | Offered tool list, approval and withheld-tool prompt notices (275, 368, 437-462). |
| config | voice prompts | `apps/web/lib/voice/live-voice-prompts.ts` | Live and backend instruction prompts. |
| service | desktop window policy | `apps/desktop/electron/windowPolicy.ts` | Opens /api/files links in a detached window (262-269, 332-340). |
| component | LiveVoiceBar (mobile) | `apps/mobile/src/features/voice/components/LiveVoiceBar.tsx` | Activity, results, approvals, Stop the task. |
| component | VoiceToolFiles | `apps/mobile/src/features/voice/components/VoiceToolFiles.tsx` | Download and share generated files. |
| service | liveVoiceSession (mobile) | `apps/mobile/src/features/voice/services/liveVoiceSession.ts` | Same tool bridge on react-native-webrtc (decideToolApproval at 424). |
| hook | useLiveVoiceSession (mobile) | `apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts` | Keeps approvals, activity, outcomes (348-361, 547-549). |
| service | CLI agent send | `apps/cli/src/voice.rs` | Sends transcript to AgentSession (257-285). |
| test | approval parity test | `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts` | Voice approvals match typed chat. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The realtime voice model decides to call a function tool; the browser receives the call over the data channel. | outside service | apps/web/features/chat/lib/live-voice-session.ts:42, 409-433; packages/contracts/cloud-contracts/src/live-voice-tools.ts:128-135 |
| The bridge posts the call to our tool route. | device | apps/web/features/chat/lib/live-voice-session.ts:746-752 |
| Our server checks CSRF, sign-in, rate limit and the session, then applies the approval gate and tool permissions. | our servers | apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts:22-60; apps/web/lib/voice/live-voice-tool-runner.ts:19-31 |
| If approval is needed the server returns approval_required; the screen shows the card and the model is told to say it waits for approval. | our servers | packages/contracts/cloud-contracts/src/live-voice-tools.ts:185-189; apps/web/features/chat/lib/live-voice-session.ts:413-420 |
| Tap Allow or Deny; the browser resends the call with the decision. | device | packages/contracts/cloud-contracts/src/live-voice-tools.ts:147-153 |
| The tool runs (web fetch with egress guard and site rules, code sandbox, Office file creation, connector tools) and output is cut to 32,000 characters. | our servers | apps/web/lib/voice/live-voice-tool-runner.ts:137-190, 127-131 |
| Output goes back over the data channel and the model speaks the result. | outside service | packages/contracts/cloud-contracts/src/live-voice-tools.ts:208-219 |
| Opening a file: web link in a new tab; Desktop detached window; iPhone download then share sheet. | device | VoiceModeSurface.tsx:495-503; apps/desktop/electron/windowPolicy.ts:332-340; apps/mobile/src/features/voice/components/VoiceToolFiles.tsx:44-49 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated Office file | File storage via persistGeneratedFileBytes, linked to the conversation | Server side, reachable at /api/files/<id> | Kept as a library file [inferred]; retention not traced (apps/web/lib/voice/live-voice-tool-runner.ts:157-168) |
| Tool outcomes on screen | Web: voice session store; iPhone: hook state, last 3 | No | Cleared when the call ends or the account changes (apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:464-474) |
| Tool call audit | Via recordToolCallAudit (imported by the runner) | Server side | unknown |

**Models and providers.** The realtime voice model comes from the managed voice_live slot (OpenAI). The delegated backend model depends on the plan (getVoiceLiveBackendModel) (apps/web/app/api/voice/live/sessions/route.ts:311-318). Whether a tool is offered depends on the provider's ability to take function tools; if the provider rejects them the session retries with hosted tools only (apps/web/app/api/voice/live/sessions/route.ts: log 'The live voice provider rejected the function tools').

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; tool route re-checks the signed-in user and session ownership (apps/web/app/api/voice/live/sessions/[sessionId]/tools/route.ts:24, 44-60). |
| Permissions | Approval gate and connector tool permissions apply; critical tools always ask; chat grants are ignored in temporary chats (apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts:132, 207). Google user-data connectors do not run when the voice model's provider may train (apps/web/lib/voice/live-voice-tool-runner.ts:77-78). |
| Subscription | Voice itself needs a plan with allowVoice; tool availability tied to plan beyond that: none found in the code read. |
| Limits and metering | Tool output 32,000 characters; tool timeout 20 seconds default; backend work is metered into the session by a usage meter (apps/web/features/chat/lib/live-voice-session.ts:624-626; apps/web/lib/voice/live-voice-backend-cost.ts). |
| Feature flags | canUseVoice; workspace site rules can turn off web search in voice (apps/web/lib/voice/live-voice-tools.ts:430-435). |
| Model compatibility | Live voice only; the chosen chat model does not run these tools. |
| Provider restrictions | Managed OpenAI voice route only. |
| Local mode | No live voice in Local mode on web or iPhone, so none of this appears (apps/web/features/chat/pages/WebChatPage.tsx:5907-5911; apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:25). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Tool slow | Label gets 'is taking longer than usual' after the timeout and a warning icon. | apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:226-233, 587-589 |
| Tool failed | Shown as failed; iPhone adds 'Did not complete'. | VoiceModeSurface.tsx:220-221; LiveVoiceBar.tsx:490 |
| Approval pending | Delegation timers are held so the wait is not counted as slow. | apps/web/features/chat/lib/live-voice-session.ts:413 |
| Deny | Call resolves as rejected; the voice model is told it did not run. | apps/web/lib/voice/live-voice-tool-runner.ts:70-72 |
| Work task could not start | Tool returns an error text telling the assistant to ask the person to type it with Work mode on. | apps/web/features/chat/lib/live-voice-session.ts:157-158, 769 |
| Stopped task | The model is told not to report its result. | apps/web/features/chat/lib/live-voice-session.ts:58-59 |
| File link not under /api/files | Not shown. | VoiceModeSurface.tsx:67-72, 475 |
| Account changes mid-call | iPhone clears results and ends the call. | apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:464-474 |
| Offline | Tool call failure becomes an error output 'The action could not run: ...'. | packages/contracts/cloud-contracts/src/live-voice-tools.ts:177-183 |
| CLI approvals and documents | not traced; unknown. | apps/cli/src/voice.rs:257-285 sends to AgentSession |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Voice/VoiceModeSurface.test.tsx`: Agent status line with stop (516), approval card with risk (568, 597), tool results and images/links (290, 616).
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.approval-parity.test.ts`: Voice approvals match typed approvals, denial, grants, temporary chats.
- `apps/web/lib/voice/__tests__/live-voice-tools.test.ts`: Tool list and prompts (case names not read).
- `apps/web/app/api/voice/live/sessions/[sessionId]/tools/__tests__/route.test.ts`: Tool route (case names not read).
- `apps/web/features/chat/lib/live-voice-session.test.ts`: Web session (case names not read).
- `apps/mobile/__tests__/LiveVoiceBar.test.tsx`: Running tool and slow label (225), results and failure (250), open document (275), file after account change (304), approval decision (330), high and low risk (466, 484), image (442).
- `apps/mobile/__tests__/live-voice-session.test.ts`: Mobile session service (case names not read).

**Test scenarios**

- **Approval by tap**
  1. Start voice on web with a connector tool that asks before running.
  2. Ask the assistant to use it.
  3. Say 'yes' aloud.
  4. Tap Allow.
  - Expected: Nothing runs after the spoken yes; the tool runs after Allow.
- **Long output**
  1. Ask the assistant to fetch a very long page.
  - Expected: The result is cut at 32,000 characters with '[output truncated for voice]' in the output passed to the model.
- **Open a document**
  1. Ask for a spreadsheet.
  2. Wait for the result.
  3. Tap 'Open <name>' on web, Desktop and iPhone.
  - Expected: Web: new tab; Desktop: detached window; iPhone: share sheet.
- **Stop the task**
  1. Ask for a slow task.
  2. Tap 'Stop the task'.
  - Expected: Work stops, the call stays open, the assistant does not report the stopped result.
- **CLI approval**
  1. Run /voice in the CLI and ask for an action needing approval.
  - Expected: Unknown; to be observed and recorded.

**Where to look when it fails**

- Server log 'live_voice_function_tools_failed' and 'live_voice_function_tools_rejected' in apps/web/app/api/voice/live/sessions/route.ts.
- Tool results marked 'The action could not run' in the results list.
- Provider notice 'The voice service could not do that. You can keep talking or ask again.' (apps/web/features/chat/lib/live-voice-session.ts:73).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/048-voice-conversation-interface.md](../../70-qa/test-plans/web/048-voice-conversation-interface.md)
- Desktop: [70-qa/test-plans/desktop/048-voice-conversation-interface.md](../../70-qa/test-plans/desktop/048-voice-conversation-interface.md)
- Mobile: [70-qa/test-plans/mobile/048-voice-conversation-interface.md](../../70-qa/test-plans/mobile/048-voice-conversation-interface.md)
- CLI: [70-qa/test-plans/cli/048-voice-conversation-interface.md](../../70-qa/test-plans/cli/048-voice-conversation-interface.md)

## 10. Gaps and dependencies

- **The brief says document open is missing on iPhone, but it exists** Affects: iPhone, documentation. Evidence: apps/mobile/src/features/voice/components/VoiceToolFiles.tsx:37-60; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:505. Work needed: Correct S48.28 to done on iPhone.
- **The first draft said approvals should be answerable by voice or tap; the code makes them tap only on purpose** Affects: All live voice surfaces. Evidence: apps/web/lib/voice/live-voice-tools.ts:441-444. Work needed: Confirm that tap-only is the product decision and update the requirement.
- **Unverified-claim check is defined but not used by the voice hook** Affects: Web voice users. Evidence: apps/web/features/chat/lib/live-voice-session.ts:144-155, 167; apps/web/features/chat/hooks/use-voice-session.ts:605-679. Work needed: Wire to the UI or delete.
- **Tools the approvals setting asks about every time are withheld in voice** Affects: People with strict approval policies. Evidence: apps/web/lib/voice/live-voice-tools.ts:447-462. Work needed: Decide whether approvals through the card should apply to them too.
- **CLI approval and document behaviour in voice not traced; brief cites unrelated lines** Affects: CLI. Evidence: Brief cites .github/workflows/release-cli.yml:229 and apps/cli/src/voice.rs:956 which are a checkout step and a WAV write. Work needed: Trace the agent session approval path and record it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- provider:openai
- plan:free
- plan:pro
- plan:max
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-voice-and-media

## Unknown

- How the CLI session asks for approval during voice and how it opens generated documents.
- Whether withheld tools (approvals setting) and the approval card both occur in one session; interplay not fully traced.
- Value of LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS.
- Retention and audit table for voice tool calls.
- Exact text of the deny label (taken from TOOL_APPROVAL_ACTION_LABELS.deny, not read).
- Whether Electron closes the detached file window correctly in practice; no run recorded.
