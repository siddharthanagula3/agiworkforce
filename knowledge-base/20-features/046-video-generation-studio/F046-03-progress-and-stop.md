---
id: "F046-03"
type: "feature"
title: "Progress and stop"
aliases: ["Progress and stop", "Stop generating", "Creating your video", "Video progress", "Cancel request (S46.28)", "Progress display (S46.26)", "Resume checking", "Generations (mobile library section)"]
area: "46 Video-generation studio"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.26", "S46.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "api:GET /api/media/video/status", "api:POST /api/media/video/cancel", "api:GET /api/media/jobs", "table:video_generation_jobs", "provider:google", "provider:openrouter", "file:apps/web/lib/services/video-job-reconciliation-service.ts", "file:apps/web/lib/workflows/video-generation-workflow.ts", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-sync-and-continuity", "F046-01", "F046-04", "F046-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-03 Progress and stop

While a clip is made, the chat shows a placeholder with elapsed time and, when the provider reports it, a percentage. Stop generating asks the server to cancel. For Google and OpenRouter the provider cannot stop the clip, so cancel only means the result is not delivered or charged. The job runs on the server whether or not the page stays open.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.26](../../10-requirements/capabilities/046-video-generation-studio.md#s4626), [S46.28](../../10-requirements/capabilities/046-video-generation-studio.md#s4628).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows that a durable server-side video job is running, polls its status about every 5 seconds, and lets the person ask to cancel. The job keeps running on our servers if the person leaves; they can resume checking later.

**Why it exists.** A clip takes a minute or more. People need feedback, a way to back out, and confidence they are not charged for a clip they stopped or that failed.

**Who uses it.** Anyone generating a video on web (and the public desktop), mobile when released, and Chrome (progress only).

**Problems it solves**

- Not knowing whether the job is alive.
- Paying for a clip nobody wanted.
- Losing the result when the tab is closed.

**Use cases**

- Watch the percentage climb on web.
- Press Stop generating after realising the prompt was wrong.
- Return to a chat after an hour and press Resume checking.

## 2. User experience

**Where to find it**

- Web chat: the assistant message shows 'Creating your video' (with ' with <model>' when known) and a dot-field frame sized to the aspect ratio (apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx:35-38, 204-222).
- Mobile chat (when released): card 'Generating video…' / 'Queued with the provider…' with a thin bar and 'Stop generating' (apps/mobile/src/features/chat/components/VideoGenProgress.tsx:23-30, 118-176).
- Mobile library: 'Generations' section listing in-flight and failed jobs with 'Open chat', 'Try again' and 'Cancel' actions (apps/mobile/src/features/library/MediaJobsSection.tsx:20-26, 146-186).
- Web library: the shared library host wires a cancel action for video jobs to /api/media/video/cancel (apps/web/features/library/components/LibraryView.tsx:244-252).
- Chrome side panel: text 'Creating your video. This usually takes a minute or two.' or 'Creating your video, N% done.' and later 'Your video is still being made. Open this chat again later to see it.' No stop control (apps/extension/_locales/en/messages.json spVideoCreating*, spVideoStillRunning).

**Before you start**

- A started job with a task id; the Stop button only appears once a task id exists (MediaGenerationPlaceholder.tsx:257).
- Signed in as the owner of the job; the server checks ownership.

**Screens and controls**

- Web: elapsed clock ('Elapsed' read by screen readers), a percentage pill with role='progressbar' (aria-label 'Video progress', 0 to 100) only when the server reports progress (MediaGenerationPlaceholder.tsx:244-256), a 'Stop generating' button at the top right that reads 'Stopping…' while sending and disappears once accepted (257-272).
- Web, after the 5 minute watch window: panel 'Your video is still being generated' with 'Resume checking' (MessageBubble.tsx:3300-3338).
- Web, failure panel 'Video generation ended' (MessageBubble.tsx:3351).
- Mobile: VideoGenProgress with a determinate bar only when progress is a number, hint 'This usually takes a minute or two. You can keep using the app.', button 'Stop generating' (aria 'Stop generating this video'), error 'Could not stop this generation: <reason>' (VideoGenProgress.tsx:123-174).

**Journey**

1. 1. Send a video (F046-01). The placeholder appears with the elapsed clock.
2. 2. The page polls status every 5 seconds (useMediaGeneration.ts:94-95, 657-659).
3. 3. When the server reports a percentage it appears (and the message metadata stores videoProgress).
4. 4. To stop, press 'Stop generating'. The button reads 'Stopping…'.
5. 5. The server records the cancel and answers with a message; the page shows that message under the frame and hides the button (MediaGenerationPlaceholder.tsx:287-310).
6. 6. If the request fails, an alert-role note appears and the button comes back (300-314).
7. 7. If nothing finishes in 5 minutes the page stops watching and shows 'Resume checking'; the job continues on the server (WebChatPage.tsx:3850-3870; useMediaGeneration.ts:691-700).
8. 8. On completion the placeholder is replaced by the player (F046-05); on failure by the failure panel (F046-04).

**What the person sees and gets**

- Cancel messages from the server: 'Cancelled. This provider cannot stop a video it has started, so the result will not be delivered and you will not be charged for it.' (cancel/route.ts:57); for Runway acknowledgements: 'Runway acknowledged the task-management request...' (cancel route:59-60); for a terminal job: 'This video job is already terminal and cannot be cancelled.' (cancel route:62).
- Final status text in the chat for a cancelled job: 'Video generation was cancelled, so the result was not delivered or charged.' (video-job-reconciliation-service.ts:109-110).
- Mobile after stop: content from the server message or 'Video generation stopped.'; status label 'Video generation stopped' (chatMessageStore.ts:1682-1687; VideoGenProgress.tsx:30).

**Settings**

- None. Respect for reduced motion: the dot field paints one still frame under prefers-reduced-motion (MediaGenerationPlaceholder.tsx:118-146).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: durable job, 5 s polling, progress percentage, resume after the watch window, and a Stop button wired to POST /api/media/video/cancel (useMediaGeneration.ts:639-704; MediaGenerationPlaceholder.tsx:287-314; MessageBubble.tsx:3273-3338). Existing tests cover the placeholder, the cancel post and the failure note (see verification).
- Server status route reconciles the job on each request and returns status, progress, video_url and error (apps/web/app/api/media/video/status/route.ts:44-125). A durable workflow keeps reconciling without a client (apps/web/lib/workflows/video-generation-workflow.ts).
- Server cancel route: validates task_id, returns the terminal state for a finished job, otherwise records the request and tries the reconciler once (cancel/route.ts:87-112).
- Mobile (built, off): polling and stop (videogen.ts:145-175, 124-126; chatMessageStore.ts:1637-1695), plus library cancel (libraryClient.ts:184-187).
- Chrome: 5 s polling with 3 consecutive failure tolerance and progress text; no stop (side_panel.ts:6134-6197).

**Incomplete**

- For google and openrouter, which are the only released providers, Stop cannot stop the provider: the job is marked cancel-requested, the reconciler then fails it as 'cancelled, not delivered or charged' (video-job-reconciliation-service.ts:497-503). The provider may still render the clip. Only Runway has a provider stop (reconciliation-service.ts:440-490), and Runway is withheld (video-provider-release-policy.ts:17).
- Mobile times out its own watch at 5 minutes and shows a generic failure while the server job may still complete and charge (videogen.ts:170-175; runVideoGenerationTurn.ts:176-181); a Retry then starts a second paid job [inferred].
- The web 'progress' is a percentage pill, not a bar.

**Present but disconnected or switched off**

- Mobile progress, stop and library actions are built but unreachable while FEATURES.videoGen=false, except the library Generations section, which lists video jobs from the server whatever the flag (MediaJobsSection.tsx; libraryClient.ts:176-190) [inferred].
- Runway stop code path is dormant because Runway is not admitted.

**Not available**

- Chrome: no stop control, no cancel call (videoGenerationClient.ts exposes only start and status).
- CLI, VS Code: no video.

## 4. Required behaviour

**Established requirements**

- The user sees progress while the video is generated (S46.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.26)
- The user cancels a video in progress and the job stops (S46.28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.28)
- A generation queue view (S46.25) is declined. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:143-144)
- A cancelled or failed video is not delivered and not charged. (source: apps/web/app/api/media/video/cancel/route.ts:57; apps/web/lib/services/video-job-reconciliation-service.ts:109-110)
- A progress indicator must not fake motion for an unknown wait (determinate bar only when the provider reports a number). (source: apps/mobile/src/features/chat/components/VideoGenProgress.tsx:104-106 (code comment) [project convention])

**Acceptance criteria**

1. After sending, a placeholder with an elapsed clock appears within a second and the status poll runs about every 5 seconds.
2. When the status response includes progress, a percentage between 0 and 100 is shown and values outside the range are clamped.
3. Pressing 'Stop generating' posts the task id to /api/media/video/cancel and shows the server's message; the button text is 'Stopping…' during the request.
4. If the cancel request fails, an alert-role message is shown and the button is usable again.
5. Cancelling a finished job returns its current state and does not change it.
6. After a cancel on a google or openrouter job, no clip is delivered and no charge remains.
7. Closing the tab and reopening the chat shows the job still running and 'Resume checking' continues observation.
8. Chrome shows progress text and, after 5 minutes, the 'still being made' note.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because only Runway can be stopped at the provider and Runway is withheld, the user-visible promise 'the job stops' is false for every released provider; the promise that holds is 'not delivered, not charged'.
- [inferred] The platform may still pay the provider for a cancelled clip; who bears that cost is not recorded in the files read.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reword Stop to say the clip will be discarded, not stopped, for providers without a stop call.
- [proposed] Mobile should, after 5 minutes, show 'still being made' and offer Resume, like web, instead of a failure.
- [proposed] Add a Stop to the Chrome progress text or document that Chrome cannot stop.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MediaGenerationPlaceholder | `apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx` | Elapsed clock, percentage pill, Stop button and cancel call (200-314). |
| component | MessageBubble (resume and failure panels) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Placeholder mount (3273-3284), 'Resume checking' (3300-3338), failure panel (3340-3372). |
| hook | useMediaGeneration.watchVideo | `apps/web/lib/hooks/useMediaGeneration.ts` | 5 s poll, 5 minute window, returns completed, failed or pending (639-704). |
| screen | WebChatPage watchVideoMessage / handleResumeVideo | `apps/web/features/chat/pages/WebChatPage.tsx` | Writes status and progress to message metadata; auto-resumes (3738-3898, 4247-4262). |
| endpoint | GET /api/media/video/status | `apps/web/app/api/media/video/status/route.ts` | Owner check, reconcile, public status, provenance headers (44-125). |
| endpoint | POST /api/media/video/cancel | `apps/web/app/api/media/video/cancel/route.ts` | Records cancel and returns state and message (26-125). |
| service | video-job-reconciliation-service | `apps/web/lib/services/video-job-reconciliation-service.ts` | publicVideoJobStatus (75-107), cancel handling (440-503), Runway stop request (471). |
| service | video-generation-jobs | `apps/web/lib/server/video-generation-jobs.ts` | requestVideoGenerationCancellation (704), provider cancel attempts (723-785), claim and defer functions. |
| job | video-generation-workflow | `apps/web/lib/workflows/video-generation-workflow.ts` | Durable reconcile loop that runs without a client. |
| endpoint | POST /api/media/video/openrouter-webhook | `apps/web/app/api/media/video/openrouter-webhook/route.ts` | Provider event nudges a job to reconcile earlier. |
| screen | Mobile VideoGenProgress | `apps/mobile/src/features/chat/components/VideoGenProgress.tsx` | Status labels, thin bar, Stop button. |
| store | Mobile stopVideoGeneration | `apps/mobile/stores/chat/chatMessageStore.ts` | Cancel call and outcome handling (1637-1695). |
| service | Mobile videogen poll and cancel | `apps/mobile/src/features/video/services/videogen.ts` | 5 s poll, 5 minute timeout, cancelVideoGeneration (49-50, 124-126, 145-175). |
| screen | Mobile MediaJobsSection | `apps/mobile/src/features/library/MediaJobsSection.tsx` | Generations list polled every 5 s with Cancel (20-186). |
| service | Mobile libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | listMediaJobs, cancelMediaJob (176-190). |
| endpoint | GET /api/media/jobs | `apps/web/app/api/media/jobs/route.ts` | Lists image and video jobs with cancellable flag. |
| service | media-job-history | `apps/web/lib/server/media-job-history.ts` | Video jobs list: cancellable when in flight and not already requested (136-182). |
| screen | Chrome pollVideoTurn | `apps/extension/src/side_panel.ts` | 5 s poll with failure tolerance (6134-6197). |
| table | video_generation_jobs | `apps/web/db/neon/0392_video_cancellation_wins_settlement.sql` | Cancellation columns and settlement rule (migration file exists; contents not read). |
| test | MediaGenerationPlaceholder tests | `apps/web/features/chat/components/messages/__tests__/MediaGenerationPlaceholder.test.tsx` | Placeholder and stop behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After the start response the page binds the task id to the assistant message and starts watching. | device | WebChatPage.tsx:4066-4100; useMediaGeneration.ts:639-704 |
| Each poll calls GET /api/media/video/status; the server claims and reconciles the job against the provider and returns the public state. | our servers | status/route.ts:75-100; video-job-reconciliation-service.ts:75-107 |
| The reconciler asks the outside provider for the task state, downloads and re-hosts the clip, marks it AI-generated and settles billing. | outside service | video-job-reconciliation-service.ts (pollVideoProvider usage near 505); video-job-reconciliation-service.test.ts:243, 270 |
| A durable workflow also reconciles with no client present, and the OpenRouter webhook nudges early reconciliation. | our servers | video-generation-workflow.test.ts:127; openrouter-webhook/route.ts |
| Stop: the page posts {task_id} with a CSRF header; the server records cancel_requested, runs one reconcile and answers 200 if terminal or 202 otherwise. | device and our servers | MediaGenerationPlaceholder.tsx:292-299; cancel/route.ts:94-112 |
| For a non-Runway job the next reconcile fails the job as cancelled, not delivered, and settles it uncharged; for Runway one provider stop request is attempted (an outside call) and the state verified. | our servers | video-job-reconciliation-service.ts:440-503 |
| After 5 minutes the page stops watching and keeps the task id so the person can resume. | device | useMediaGeneration.ts:691-700; MessageBubble.tsx:3300-3338 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Status, progress, cancel_requested_at, provider cancel attempt fields | table video_generation_jobs | Server-side; projected into web_messages metadata (videoStatus, videoProgress, videoError) | Not read. |
| Message metadata videoTaskId, videoStatus, videoProgress | web_messages metadata and the browser chat store | Yes, via transcript sync (video-generation-transcript.ts:26-110) | With the chat. |
| Completion notice to the owner | video-completion-notice-service (mechanism not read) | Unknown | Unknown |

**Models and providers.** The provider is chosen at start (F046-01). Progress values come from the provider via the reconciler when it reports them; Google and OpenRouter are polled, OpenRouter also sends webhooks.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; status and cancel check job ownership and return a forbidden or not-found error otherwise (status/route.ts:62-71; cancel/route.ts:91-93). |
| Permissions | Cancel needs a CSRF token and the rate-limit bucket 'video-status' (cancel/route.ts:80-83). The status route does not require CSRF (GET). |
| Subscription | Same entitlement as starting the job (billing-catalog.ts:357). Cancelling and checking status do not re-check the plan. |
| Limits and metering | Polling is rate limited by the 'video-status' bucket. A cancelled or failed job is not charged (cancel/route.ts:57). |
| Feature flags | Mobile FEATURES.videoGen=false hides mobile progress and stop in chat. |
| Model compatibility | Stop semantics depend on the job's provider, not the model (cancel/route.ts:32-40). |
| Provider restrictions | Only Runway has a provider stop and it is not released; google and openrouter cannot stop a started clip. |
| Local mode | No video, so no progress or stop, in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Placeholder with clock and dot field; percentage absent until reported. | MediaGenerationPlaceholder.tsx:202-256 |
| Timeout of the watch (5 min) | Web: 'Your video is still being generated' with 'Resume checking'. Mobile: a failure message. Chrome: 'still being made' text. Desktop (Tauri): cancels the job. | MessageBubble.tsx:3300-3338; videogen.ts:174; side_panel.ts:6193; apps/desktop/src/api/cloudApi.ts:683-686 |
| Status check network failure | Web keeps the task resumable, shows 'Status checking paused. The durable task is still safe to resume.' Chrome fails after 3 consecutive failures. | WebChatPage.tsx:3870-3895; MessageBubble.tsx:3318-3320; side_panel.ts:6155-6162 |
| Cancel while terminal | Returns current state with message 'already terminal'. | cancel/route.ts:94 |
| Cancel request fails | Alert note and button returns; network failure message 'Could not reach the server to stop this generation.' | MediaGenerationPlaceholder.tsx:300-314 |
| Cancel after provider already finished (mobile) | Mobile re-reads status and shows the finished video or failure instead of 'stopped'. | chatMessageStore.ts:1648-1678; video-generation-cancel.test.ts:292, 324 |
| Outcome unknown | Status reports 'failed' with the public error; the job is not retryable in the transcript. | video-job-reconciliation-service.ts:75-81; video-generation-transcript.ts:26-31, 47 |
| Reload mid-job | The chat restores the message from the server projection and auto-resumes watching. | WebChatPage.tsx:4225-4245 |
| Accessibility | Label in role='status'; clock is outside the live region; progressbar has aria values; reduced motion gives a still frame. | MediaGenerationPlaceholder.tsx:204-256, 118-146 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/__tests__/MediaGenerationPlaceholder.test.tsx`: Label, elapsed clock outside the status region, percentage shown and clamped, no stop without a job, cancel post, server wording repeated, failure and network error notes.
- `apps/web/e2e/chat-media-generation-placeholder.spec.ts`: Browser spec: placeholder until the held response lands; reported percentage and working stop control (line 593).
- `apps/web/__tests__/api/media-video-cancel.test.ts`: Cancel route cases, deferred settlement still records cancel, Runway through the shared reconciler, tenant denial.
- `apps/web/__tests__/api/media-video-status.test.ts`: Status route: same-origin asset URL, cross-tenant denial, alert retry, auth, rate limit, task_id validation.
- `apps/web/lib/services/video-job-reconciliation-service.test.ts`: Reconcile, re-host and AI-marking, terminal notice, settlement, failure exactly once.
- `apps/web/lib/workflows/video-generation-workflow.test.ts`: Durable workflow attach, recovery and detached exit.
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Hook behaviour (file exists; titles not read).
- `apps/mobile/__tests__/video-generation-cancel.test.ts`: Mobile cancel, stop outcomes, late result handling.
- `apps/extension/__tests__/side-panel-media.test.ts`: Chrome video start, status and polling handlers.

**Test scenarios**

- **Percentage and clock**
  1. Start a video on web.
  2. Watch the placeholder for 30 seconds.
  - Expected: Elapsed clock ticks each second; a percentage appears when the status response has progress.
- **Stop on a released provider**
  1. Start a video on a google or openrouter model.
  2. Press 'Stop generating'.
  3. Read the message and poll status.
  - Expected: Message says the provider cannot stop it and it will not be delivered or charged; the job ends failed with the cancelled text; no charge in the ledger.
- **Stop request failure**
  1. Block the cancel route in the browser network tool.
  2. Press Stop.
  - Expected: Alert note and the button returns.
- **Leave and return**
  1. Start a video, close the tab for 6 minutes, reopen the chat.
  - Expected: Chat shows the running or finished state; 'Resume checking' works if still running.
- **Cancel finished job**
  1. POST cancel for a completed task_id.
  - Expected: 200 with 'already terminal' message and unchanged state.
- **Mobile 5 minute timeout**
  1. In a test build with the flag on, run a job that takes longer than 5 minutes.
  - Expected: Record what the screen shows and whether the server job finishes and charges (known gap).

**Where to look when it fails**

- Logs: 'Immediate video cancellation attempt deferred', 'Runway video cancellation request crossed an ambiguous provider boundary', 'Video delivery marker could not be persisted'.
- Fields: video_generation_jobs.cancel_requested_at, provider_cancel_attempted_at, provider_cancel_acknowledged_at, cancel_attempts, progress.
- Known-flaw row WEB-VIDEO-DELIVERY-RECOVERY-01 lists open coordination problems between output visibility and settlement.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/046-video-generation-studio.md](../../70-qa/test-plans/mobile/046-video-generation-studio.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Stop does not stop a clip for any released provider; the brief says the job stops.** Affects: Web, mobile, library cancel on every surface. Evidence: cancel/route.ts:56-57; video-job-reconciliation-service.ts:497-503; video-provider-release-policy.ts:17. Work needed: Either change the promise and wording, or find a provider stop call; record who bears provider cost.
- **Mobile marks a job as failed after 5 minutes while the server job continues; Retry could create a second paid job.** Affects: Mobile (when released). Evidence: videogen.ts:170-175; runVideoGenerationTurn.ts:176-181. Work needed: Adopt the web 'still being made' and resume model.
- **Chrome has no stop.** Affects: Chrome. Evidence: videoGenerationClient.ts (only start and status). Work needed: Add a stop or state the limit.
- **Open register item: output visibility, failed-cleanup replay and observed-cost recovery are not coordinated with terminal settlement.** Affects: All surfaces. Evidence: audit/registers/known-flaws.md row WEB-VIDEO-DELIVERY-RECOVERY-01. Work needed: As the row states.
- **The Tauri desktop cancels the paid job when its 5 minute poll window closes, unlike web.** Affects: Internal Tauri build. Evidence: apps/desktop/src/api/cloudApi.ts:683-686. Work needed: Align or retire the internal path.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- api:GET /api/media/video/status
- api:POST /api/media/video/cancel
- api:GET /api/media/jobs
- table:video_generation_jobs
- provider:google
- provider:openrouter
- file:apps/web/lib/services/video-job-reconciliation-service.ts
- file:apps/web/lib/workflows/video-generation-workflow.ts
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-sync-and-continuity
- F046-01
- F046-04
- F046-05

## Unknown

- Who bears provider cost for a cancelled clip on providers that cannot stop it.
- How the Runway stop path behaves live (not admitted).
- How the completion notice is delivered (video-completion-notice-service.ts not read).
- Retention of job rows and cancel records.
- Whether mobile library 'Generations' shows video jobs while the feature flag is off (the component is not flag-gated in the lines read).
