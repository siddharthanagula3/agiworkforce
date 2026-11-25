---
id: "F035-05"
type: "feature"
title: "Steer, pause, resume and cancel"
aliases: ["Steer", "Pause", "Resume", "Stop", "Cancel research", "Send as new message", "S35.15", "S35.17", "S35.18"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S35.15", "S35.17", "S35.18"]
depends_on: ["F035-01", "F035-02", "F035-06", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-05 Steer, pause, resume and cancel

While a research run is active the person can Steer it with a note, Pause it to resume later, or Stop it. Web has all three plus Resume with optional guidance; mobile has Pause, Stop and Resume or Retry but no Steer; VS Code can steer and stop a cloud run; Chrome is unverified.

Area: [35. Research workspace](README.md). Requirement items: [S35.15](../../10-requirements/capabilities/035-research-workspace.md#s3515), [S35.17](../../10-requirements/capabilities/035-research-workspace.md#s3517), [S35.18](../../10-requirements/capabilities/035-research-workspace.md#s3518).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Steer queues a message the loop reads between rounds. Pause asks the loop to stop at the next round and save what it gathered. Stop cancels the run. Resume starts a new request that carries earlier sources and finished steps [research-loop.ts:3171-3172,2092-2105,2039-2060].

**Why it exists.** Runs last minutes and cost money; people need to change direction or stop without losing what was gathered (doc: docs/product/experience-contract.md:781).

**Who uses it.** People running Deep Research on web, desktop (hosted web), mobile, and VS Code users managing cloud tasks.

**Problems it solves**

- A run heads the wrong way.
- The person must leave and come back.
- A run must stop to protect spend.

**Use cases**

- Steer: 'focus on EU rules'.
- Pause now and resume tomorrow with a note.
- Stop a run that is no longer needed.

## 2. User experience

**Where to find it**

- Web and Desktop: buttons in the status bar: 'Steer', 'Pause', 'Resume' (or the Resume form with guidance) and 'Retry' [ResearchActivity.tsx:510-560,640-678]. Stop is the chat's general stop control, which cancels the cloud run [useChatStream.ts:5424].
- Mobile: 'Pause' and 'Stop' buttons on the research card, and 'Resume' or 'Retry' after it ends [ResearchRunCard.tsx:651,660,679; chatExecutionStore.ts:5525].
- VS Code: cloud task detail list items 'Steer' and 'Stop this task' [apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:166-181].

**Before you start**

- Steer and Pause need an active phase (planning or searching) and a run id [ResearchActivity.tsx:315-318].
- Mobile Pause is hidden during writing [ResearchRunCard.tsx:464].

**Screens and controls**

- Steer form: text box 'Add a focus, a question or a source to cover' and Send; after sending 'Your guidance is applied when the current step finishes, and the plan updates to follow it.' [ResearchActivity.tsx:589,614].
- If the run ended before reading the note: 'Not read before the task finished' with 'Send as new message' [ResearchActivity.tsx:628].
- Pause label turns into 'Pausing…'; aria label 'Pause this research after the current step' [ResearchActivity.tsx:531].
- Resume guidance box 'Add guidance for the rest of the research (optional)' [ResearchActivity.tsx:662].

**Journey**

1. Run is searching.
2. Click Steer, type, Send; or click Pause.
3. For Pause, wait for the label 'Research paused'.
4. Later click Resume (optionally with a note).
5. Or stop the run from the chat stop control; the bar says 'Research stopped (stopped by you)'.

**What the person sees and gets**

- Toasts: 'This research cannot be paused. Stop it instead to keep what it found.' (no run id), 'Could not pause this research. It is still running.', 'This research cannot take guidance now. Pause it and resume with your note.', 'Could not send your guidance. The research is still running.' [WebChatPage.tsx:6044,6054,6067,6082].
- Read note shows as a progress item 'Read your message' [research-loop.ts:2968-2975 region].
- Server 409 messages for a run that cannot be paused or steered [pause/route.ts:50-56; steer/route.ts:70-86].

**Settings**

- Steer length and queue size limits come from MAX_CLOUD_AGENT_RUN_STEER_LENGTH and MAX_CLOUD_AGENT_PENDING_STEERS [steer/route.ts:35-70].
- Resume guidance maximum 2,000 characters [research.ts:375].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pause: POST run pause, 202; loop checks at the start of each gathering round, saves the run as interrupted with reason 'Paused. Resume to continue from where it stopped.', then emits plan, sources, status paused and stop [pause/route.ts:67; research-loop.ts:3171,2092-2105; research.ts:373].
- Steer: POST run steer, 202; secret check; withdraw with DELETE; the loop reads steers at each round start (with a re-plan) and once before writing (note only) [steer/route.ts:93; steer/[steerId]/route.ts:70; research-loop.ts:3172,3422].
- Cancel: POST run cancel; client confirms by polling; the loop checks before each tool call and turn; it stores 'interrupted' with 'Research was cancelled.', emits task-state cancelled and stop reason cancelled [runs/[runId]/route.ts:112; cancel-cloud-run.ts:7-20; research-loop.ts:2039-2060].
- Client abort without a run id marks the run interrupted [useChatStream.ts:3830-3835].
- Resume: new request with sources, completed steps, approved steps, deliverable, guidance; new idempotency key [WebChatPage.tsx:5965-6030; useChatStream.research.test.tsx].
- Mobile Pause uses the cloud run client; Stop calls cancelMobileCloudAgentRun [apps/mobile/app/(app)/chat/[id].tsx:1085-1099; chatExecutionStore.ts:5525].
- VS Code steer and stop with confirmation text 'the task cannot be resumed from here' [cloudRunDetail.ts:262-285,314-331].

**Incomplete**

- Pause is only read at the start of a gathering round; a pause requested during the writing turn is not acted on, so the run completes [research-loop.ts:3171 is the only pauseIfRequested call] [inferred].
- Steer read before writing does not re-plan [research-loop.ts:3422].
- Mobile Resume has no guidance box [ResearchRunCard.tsx:679; chatExecutionStore.ts:5729-5860].
- VS Code has no Pause and no Resume for research (the client type lists resumeRun but no UI call was found) [cloudRunDetail.ts:37].
- Chrome extension has a generic managed-run cancel; research use is unverified (apps/extension/__tests__/managed-run-control.test.ts).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Steer in the mobile research card: none found (mobile has steerRun only for task views, apps/mobile/src/features/tasks/cloudRunSteer.ts:16).
- CLI: nothing.

## 4. Required behaviour

**Established requirements**

- While research runs the user can steer it and the run adapts (mobile missing). (source: brief S35.15)
- The user can pause and resume from where it stopped. (source: brief S35.17)
- The user can cancel; it stops and records that it was cancelled. VS Code done, Chrome unverified. (source: brief S35.18)
- Cancellation stops new side effects; resume without rerunning completed actions unnecessarily. (source: doc: docs/product/experience-contract.md:781)

**Acceptance criteria**

1. Clicking Steer then Send shows the queued text and the plan later contains a 'Your guidance' step.
2. Clicking Pause ends the run at the next round with label 'Research paused' and a stored interrupted report with the paused reason.
3. Resume continues without repeating completed searches.
4. Stop ends the run, stores 'Research was cancelled.' and the bar shows 'Research stopped (stopped by you)'.
5. Pause with no run id shows the toast text above.
6. A queued steer can be withdrawn and sent as a normal message.
7. Steer containing a secret is rejected with 400.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pause during writing should either be refused or honoured.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Steer to mobile and Pause to VS Code.
- [proposed] Refuse or label a pause during writing.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchActivity controls | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Steer, Pause, Resume, Send as new message |
| hook | research-run-controls context | `apps/web/features/chat/components/research/research-run-controls.ts` | Action handler contract |
| hook | pause, steer, retry handlers | `apps/web/features/chat/pages/WebChatPage.tsx` | Calls the run client and shows toasts |
| endpoint | POST /runs/{runId}/pause | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts` | Requests a pause |
| endpoint | POST /runs/{runId}/steer | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts` | Queues a steer |
| endpoint | DELETE /runs/{runId}/steer/{steerId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts` | Withdraws a steer |
| endpoint | POST /runs/{runId} (cancel) | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Cancels a run |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Pause, cancel and steer flags in the database |
| service | research loop pause, steer, cancel | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Reads the flags at boundaries |
| service | buildResearchRunOptions | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Binds isPauseRequested, takeSteerMessages, isCancellationRequested |
| other | cancelCloudRunAndConfirm | `apps/web/features/chat/lib/cancel-cloud-run.ts` | Cancel then poll until terminal |
| component | ResearchRunCard | `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Mobile Pause, Stop, Resume, Retry buttons |
| screen | chat screen handlers | `apps/mobile/app/(app)/chat/[id].tsx` | handlePauseResearch, stop, resume |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | resumeResearch and stop cancel the run |
| component | cloudRunDetail | `apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts` | VS Code Steer and Stop for cloud runs |
| test | ResearchActivity tests | `apps/web/features/chat/components/research/ResearchActivity.test.tsx` | Retry and Resume controls |
| test | managed-run-control tests | `apps/extension/__tests__/managed-run-control.test.ts` | Chrome managed run cancel (generic) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends pause, steer or cancel to the run endpoint with a CSRF token. | device and our servers | WebChatPage.tsx:6040-6085; pause/route.ts:33-37 |
| Server stores a pause, steer or cancel flag on the cloud agent run row and writes an audit event for pause. | our servers | pause/route.ts:41-48; steer/route.ts:60-66 |
| The running loop polls the flags at round and tool boundaries. | our servers | research-run-options.ts:153-165; research-loop.ts:3171-3172 |
| Loop saves an interrupted report and ends the stream with a stop event. | our servers | research-loop.ts:2092-2105,2039-2060 |
| Resume sends a new request with the carried material. | device and our servers | WebChatPage.tsx:5992-6020 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pause, cancel and steer flags and queued steer text | cloud agent run storage | server side | unknown |
| Interrupted report row with gathered sources and steps | table research_reports | server side | as F035-06 |

**Models and providers.** A steer with a re-plan costs one more model call; the same routed model is used [research-loop.ts:2918-2935].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the run must belong to the person (row-level scope). |
| Permissions | Only the owner can pause, steer or cancel; steer text passes the secret gate [steer/route.ts:50-58]. |
| Subscription | No separate gate; same as the run. |
| Limits and metering | Rate limit class llm-completion on pause and steer; maximum pending steers; searches already running are charged as usual. |
| Feature flags | none found in the code. |
| Model compatibility | None. |
| Provider restrictions | None. |
| Local mode | Cloud only; a local run does not exist for research. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No run id yet | Toast: cannot be paused; stop instead. | WebChatPage.tsx:6043-6045 |
| Run waiting on approval or ended | Server 409 only a working task can be paused or steered. | pause/route.ts:56; steer/route.ts:84 |
| Pause then steer | Steer disabled while pausing; pause disabled while a steer is queued. | ResearchActivity.tsx:518,528 |
| Run ended before reading the steer | Offer to send it as a normal message. | ResearchActivity.tsx:625-640 |
| Stop confirmation fails | Run reference kept and error shown; confirmation polls up to 30 times. | cancel-cloud-run.ts:4-5; useChatStream.ts:5424-5440 |
| Pause read fails | Logged; the run continues. | research-loop.ts:2076-2086 |
| Offline | Toast on failure; the run may still be running. | WebChatPage.tsx:6054 |
| Accessibility | Buttons have aria-labels; touch targets enlarge on coarse pointers. | ResearchActivity.tsx:231-235,531 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchActivity.test.tsx`: Resume for interrupted runs, Retry, disabled while in flight
- `apps/web/lib/hooks/useChatStream.research.test.tsx`: Interrupt on cancel, resume payload, new request key
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.test.ts`: Loop pause, steer, cancel paths (large file; not read in full)
- `apps/mobile/src/features/chat/components/research/__tests__/ResearchRunCard.test.tsx`: Stop action, stopped run, retry
- `apps/extension/__tests__/managed-run-control.test.ts`: Chrome managed run cancel and confirmation

**Test scenarios**

- **Pause and resume**
  1. Start an approved run
  2. Click Pause after round 1
  3. Click Resume with a note
  - Expected: Paused label and stored interrupted report; resumed run does not repeat finished searches
- **Steer**
  1. Click Steer, send 'focus on cost'
  2. Wait for round 2
  - Expected: Progress item 'Read your message' and a 'Your guidance' step
- **Stop**
  1. Press the chat stop control during searching
  - Expected: Bar 'Research stopped', stored row says Research was cancelled.
- **No run id**
  1. Click Pause immediately on a fresh run
  - Expected: Toast 'This research cannot be paused…'
- **Mobile Stop**
  1. Press Stop on the mobile card
  - Expected: Run cancel request is sent and the card shows stopped

**Where to look when it fails**

- Audit event agent_run_lifecycle_changed with status pause_requested.
- 409 messages from pause and steer routes.
- Log 'pause request could not be read; the run continues'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)
- VS Code: [70-qa/test-plans/vscode/035-research-workspace.md](../../70-qa/test-plans/vscode/035-research-workspace.md)
- Chrome: [70-qa/test-plans/chrome/035-research-workspace.md](../../70-qa/test-plans/chrome/035-research-workspace.md)

## 10. Gaps and dependencies

- **No Steer on mobile research card** Affects: Mobile. Evidence: no steer call in ResearchRunCard.tsx. Work needed: Add a steer control using the cloud run client
- **Pause ignored during the writing turn** Affects: All apps. Evidence: research-loop.ts:3171. Work needed: Honour or refuse with a clear message
- **VS Code has no Pause or Resume for research** Affects: VS Code. Evidence: cloudRunDetail.ts:154-181. Work needed: Add actions
- **Chrome research control unverified** Affects: Chrome. Evidence: only a generic managed run test. Work needed: Verify or build
- **Mobile Resume lacks a guidance note** Affects: Mobile. Evidence: ResearchRunCard.tsx:679. Work needed: Add the optional note
- Not built on: CLI (from the capability ledger).

**Depends on**

- F035-01
- F035-02
- F035-06
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- SYS-security-and-privacy

## Unknown

- Whether the Chrome extension can cancel a Deep Research run (only a generic managed run test exists).
- Retention of pause and steer flags.
- Whether VS Code lists research runs in its cloud task list (a 'Research task' title exists; list filter not checked).
- Whether a durable workflow run honours cancel as fast as a request-scoped one.
