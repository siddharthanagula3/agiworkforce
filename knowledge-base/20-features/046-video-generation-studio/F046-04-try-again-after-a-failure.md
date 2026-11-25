---
id: "F046-04"
type: "feature"
title: "Try again after a failure"
aliases: ["Try video again", "Retry video generation", "Retry failed job (S46.29)", "handleRetryVideo", "Try again (library job action)"]
area: "46 Video-generation studio"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.29"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "api:POST /api/media/video/generate", "table:video_generation_jobs", "file:apps/web/features/chat/lib/videoRetryInputs.ts", "file:apps/web/lib/server/video-generation-transcript.ts", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "F046-01", "F046-03", "F046-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-04 Try again after a failure

When a video fails, the person can start a new generation from the same prompt. On web the button reads 'Try video again' and reuses the stored model, shape and length; reference images are reused only while the page stays open. Mobile re-sends '/video <prompt>' with the current settings. Chrome re-runs the prompt. Mobile is off in v1.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.29](../../10-requirements/capabilities/046-video-generation-studio.md#s4629).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | not stated on this page | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers a one-press new attempt after a failed clip. The retry is a brand new job through the same generate route, so plan, budget and policy checks run again.

**Why it exists.** Provider failures and refusals happen. People should not retype the prompt and options, and a failed clip must be safe to retry without double charging.

**Who uses it.** Anyone whose video failed on web, Chrome or mobile (when released).

**Problems it solves**

- Retyping long prompts.
- Losing the chosen shape and length.
- Unsafe replay of an unknown-outcome job.

**Use cases**

- A provider timeout fails the clip; press 'Try video again'.
- A first-frame clip fails; retry works if the page was not reloaded.
- After Stop on web, retry the same prompt.

## 2. User experience

**Where to find it**

- Web chat: on a failed video message, panel 'Video generation ended' with the button 'Try video again' (apps/web/features/chat/components/messages/MessageBubble.tsx:3340-3372).
- Chrome side panel: the failed turn's retry action (side_panel.ts:5924-5955, 6314-6330).
- Mobile chat (when released): button 'Retry' with accessibility label 'Retry video generation' on a failed or timed-out video card (apps/mobile/src/features/chat/components/MessageBubble.tsx:2564-2590).
- Mobile library: a 'Try again' action exists for jobs the server marks retryable, but the server marks every video job not retryable (apps/web/lib/server/media-job-history.ts:176).

**Before you start**

- The failure must be marked retryable. Web: videoRetryable is true and videoStatus is 'failed' (MessageBubble.tsx:3342-3360).
- Not currently streaming and the trial not exhausted (WebChatPage.tsx:4263-4276).

**Screens and controls**

- Failure panel text: 'This task is terminally failed. Trying again starts a new generation.' when retryable, else 'Resend the prompt to start a new generation. This older attempt cannot be replayed safely.' (MessageBubble.tsx:3353-3357).
- 'Try video again' button with a refresh icon (3358-3370).

**Journey**

1. 1. A video fails; the chat shows 'Video generation ended'.
2. 2. Press 'Try video again'.
3. 3. The page rebuilds the options (model, aspect, resolution, length) from the failed message's metadata and any retained input images (WebChatPage.tsx:4280-4311).
4. 4. If images were required and are gone (page reloaded), the message changes to say they are no longer available and retry is turned off (videoRetryInputs.ts:15-25).
5. 5. Otherwise a new user prompt and a new placeholder are added and a new job starts (WebChatPage.tsx:3904-4066).

**What the person sees and gets**

- New placeholder with the new job's progress (F046-03).
- Missing-image message: 'Video generation could not be repeated because the first-frame image from the original request are no longer available. Attach them again and resend the prompt to start a new generation.' (videoRetryInputs.ts:21-24; wording as written in code).
- If the free trial is exhausted, the upgrade dialog opens (WebChatPage.tsx:4272-4275).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: retry from the stored metadata; the server projection sets videoRetryable true only when the job status is failed (apps/web/lib/server/video-generation-transcript.ts:47), and the client also sets it true when its watch sees a failure (WebChatPage.tsx:3830-3845). A start that failed with no task id is also projected as retryable (video-generation-transcript.ts:78-92).
- The retry goes through handleGenerateVideo and so the same POST /api/media/video/generate with a new Idempotency-Key tied to the new placeholder id (media-api-service.ts:194), so entitlement, spend, policy and cost checks run again.
- Input image custody is handled explicitly: retained in a memory map and refused after reload (WebChatPage.tsx:3735, 4280-4299; videoRetryInputs.ts).
- Chrome retry: re-runs the saved prompt with a fresh start id (side_panel.ts:6314-6330).
- Mobile chat retry exists (MessageBubble.tsx:2564-2590; chat/[id].tsx:1928-1962).

**Incomplete**

- Mobile retry re-sends '/video <prompt>' through the normal send path, so it uses the composer's current model, aspect, quality and length, not the failed attempt's (chat/[id].tsx:1954-1962; resolveMobileVideoGenerationRequest.ts:97-140). That differs from 'same settings'.
- Chrome retry carries the prompt only; there are no settings to carry.
- Retry for a cancelled job is handled in the mobile handler (chat/[id].tsx:1950) but the button shows only for failed or timeout (MessageBubble.tsx:2566).

**Present but disconnected or switched off**

- Mobile retry is hidden while FEATURES.videoGen=false: canRetry returns false for video turns (MessageList.tsx:112-115; test MessageList.videoRetry.test.tsx:109, 118).
- Mobile library 'Try again' for video: the code posts any retry to /api/media/image/retry (libraryClient.ts:189-191), which would be wrong for video, but it is never reachable because retryable is false for every video job (media-job-history.ts:176). The same image-retry endpoint is wired in the web and Tauri library hosts (apps/web/features/library/components/LibraryView.tsx:253-258; apps/desktop/src/features/library/DesktopLibrary.tsx:199-202).

**Not available**

- CLI and VS Code: no video.
- Retry of a video from the library on any surface.

## 4. Required behaviour

**Established requirements**

- The user retries a failed video job with the same settings (S46.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.29)
- A retry starts a new durable job through the same route so all checks run again; an old unknown-outcome attempt must not be replayed. (source: apps/web/features/chat/components/messages/MessageBubble.tsx:3353-3357; apps/web/lib/server/video-generation-transcript.ts:47)
- An action that spends money or cannot be undone names its consequence; the retry is a new paid job. (source: doc: AGENTS.md section 9)
- Mobile: Retry is offered on a failed card; a refused prompt should not offer a retry that cannot pass. (source: audit/registers/known-flaws.md row MOBILE-IMAGE-FAILURE-CATEGORY-01)

**Acceptance criteria**

1. A failed web video shows 'Try video again' only when videoRetryable is true.
2. Pressing it starts a new job with the same model, aspect, resolution and length as the failed one and a new task id.
3. After a page reload, retry of a first-frame or reference-image video does not start and explains why.
4. A job that ended in an unknown outcome shows the 'cannot be replayed safely' text with no retry button after reload.
5. The retry request runs the plan and spend checks again (a plan downgrade makes it fail with plan_upgrade_required).
6. On mobile (flag on), Retry reuses the failed attempt's model and shape, or the screen states which settings will be used.
7. No video job appears with a 'Try again' action in any library.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The web client sets videoRetryable true for any 'failed' status it sees, but the server maps outcome_unknown to failed (video-job-reconciliation-service.ts:75-81) while the transcript marks it not retryable (video-generation-transcript.ts:47); until the transcript syncs, an unknown-outcome job may show a retry button, risking a second paid clip.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Carry the original settings in the mobile retry, or store them on the message.
- [proposed] Distinguish unknown-outcome from failed in the public status so the client never offers retry for it.
- [proposed] Remove the image-retry call for video jobs in library hosts, or add a video-aware retry.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble failure panel | `apps/web/features/chat/components/messages/MessageBubble.tsx` | 'Video generation ended' and 'Try video again' (3340-3372). |
| screen | WebChatPage handleRetryVideo | `apps/web/features/chat/pages/WebChatPage.tsx` | Rebuilds options and restarts (4263-4320); wired at 7761. |
| service | resolveVideoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Decides whether images can be reused (9-25). |
| service | Video transcript projection | `apps/web/lib/server/video-generation-transcript.ts` | Writes videoRetryable and videoError into the chat message (26-110). |
| service | durableVideoGenerationTurn | `apps/web/features/chat/lib/durableVideoGenerationTurn.ts` | Saves prompt and placeholder before starting (35-48). |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Same gates for the retry as for a first attempt. |
| service | media-api-service generateVideo | `apps/web/features/media/services/media-api-service.ts` | Idempotency key from the new placeholder id (190-194). |
| screen | Mobile MessageBubble retry | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | 'Retry video generation' button (2564-2590). |
| screen | Mobile chat screen handleRetryMessage | `apps/mobile/app/(app)/chat/[id].tsx` | Re-sends /video prompt (1928-1962). |
| component | Mobile MessageList canRetry | `apps/mobile/src/features/chat/components/MessageList.tsx` | Hides video retry when the flag is off (112-115). |
| screen | Mobile MediaJobsSection | `apps/mobile/src/features/library/MediaJobsSection.tsx` | Generic 'Try again' action (236-242). |
| service | Mobile libraryClient retryMediaJob | `apps/mobile/src/features/library/libraryClient.ts` | Posts every retry to /api/media/image/retry (189-191). |
| service | media-job-history | `apps/web/lib/server/media-job-history.ts` | retryable false for video (176). |
| screen | Chrome retryVideoTurn | `apps/extension/src/side_panel.ts` | Re-runs the prompt (6314-6330); wired at 5955. |
| test | videoRetryInputs test | `apps/web/features/chat/lib/videoRetryInputs.test.ts` | Image custody rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The job fails; the reconciler stores a public error and the transcript projection sets videoStatus failed and videoRetryable. | our servers | video-generation-transcript.ts:26-60 |
| Person presses 'Try video again'; the page reads the failed message's metadata (model, aspect, resolution, length, input kind). | device | WebChatPage.tsx:4263-4311 |
| If input images were used, the page looks them up in an in-memory map; missing means refuse. | device | WebChatPage.tsx:3735, 4280-4299; videoRetryInputs.ts:9-25 |
| A new job is started through POST /api/media/video/generate with a new Idempotency-Key. | our servers | WebChatPage.tsx:4300-4315; media-api-service.ts:190-215 |
| The provider is called as in F046-01. | outside service | route.ts:1726-1751 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Failed message metadata: videoModel, videoAspect, videoResolution, videoDurationSecs, videoInputKind, videoRetryable | web_messages metadata and browser chat store | Yes | With the chat. |
| Input image bytes for retry | In-memory map in the page (videoInputImagesRef) | No | Lost on reload; deleted when retry starts or the video completes (WebChatPage.tsx:3806, 4299). |
| Prompt | video_generation_jobs.prompt and the preceding user message | Yes | Not read. |

**Models and providers.** Retry reuses the stored model id (videoModel) so the same model is requested; if that model is no longer live, the server refuses with a validation error (route.ts:364-366).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; same as F046-01. |
| Permissions | All generate-route gates run again. |
| Subscription | Ultra or Enterprise (billing-catalog.ts:357). A new reservation is made for the new job. |
| Limits and metering | A retry counts again against the monthly video-seconds allowance and credits (route.ts:1238-1256); failed attempts are excluded from the allowance count (tier-unit-quota-service.ts:165-172, status <> 'failed'). |
| Feature flags | Mobile retry gated by FEATURES.videoGen (MessageList.tsx:113). |
| Model compatibility | Retry fails with a validation error if the stored model or tuple is no longer valid. |
| Provider restrictions | As F046-01. |
| Local mode | No video in Local mode; mobile retry would be blocked by requires_cloud (resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Retryable failure | Button visible; press starts a new job. | MessageBubble.tsx:3358 |
| Not retryable (older attempt or unknown outcome) | Panel text says to resend the prompt; no button. | MessageBubble.tsx:3353-3357 |
| Input images gone after reload | Message updated, retry disabled. | WebChatPage.tsx:4284-4298 |
| Streaming or trial exhausted | Retry ignored, or the upgrade dialog opens. | WebChatPage.tsx:4265, 4272-4275 |
| Authority changed (signed out or account switch) | Retry does nothing if the original request authority is no longer current. | WebChatPage.tsx:4280-4281 |
| Start not confirmed | A placeholder with no task id shows 'Video start was not confirmed' and advises reloading once. | MessageBubble.tsx:3374-3390 |
| Mobile cancelled card | Handler accepts cancelled, but the button is not shown for cancelled. | chat/[id].tsx:1946-1951; MessageBubble.tsx:2566 |
| Accessibility | Web button is a labelled text button; mobile uses an accessibilityLabel 'Retry video generation'. | MessageBubble.tsx:3358-3369; mobile MessageBubble.tsx:2569-2571 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/videoRetryInputs.test.ts`: Retry input custody: names the conditioning, refuses after reload, refuses on kind mismatch, replays matching images, prompt-only retry stays prompt-only.
- `apps/web/lib/server/video-generation-transcript.test.ts`: Transcript projection (file exists; titles not read).
- `apps/web/features/chat/lib/durableVideoGenerationTurn.test.ts`: Transcript saved before the start.
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Video placeholder and player states (line 568); retry panel coverage not confirmed.
- `apps/mobile/src/features/chat/components/__tests__/MessageList.videoRetry.test.tsx`: No retry on a video turn when the flag is off; retry kept when on.
- `apps/mobile/__tests__/video-generation-failure-sentence.test.ts`: Failure sentence on a failed video turn (title not read).

**Test scenarios**

- **Retry keeps settings**
  1. On web, send a video with a non-default model, aspect and length.
  2. Cause a failure (provider error or Stop).
  3. Press 'Try video again'.
  - Expected: New job with the same model, aspect, resolution and length.
- **Retry after reload with an image**
  1. Send a first-frame video; make it fail.
  2. Reload the page.
  3. Open the chat and press retry if shown.
  - Expected: Retry refuses with the 'no longer available' message and no new job.
- **Unknown outcome not replayed**
  1. Force an outcome_unknown job in a test database.
  2. Reload the chat.
  - Expected: Text 'cannot be replayed safely', no button.
- **Plan downgrade**
  1. Fail a video, change the account to a plan without video, press retry.
  - Expected: 403 plan_upgrade_required shown.
- **Mobile settings on retry**
  1. Flag on in a test build; fail a 9:16 video; change the sheet to 16:9; press Retry.
  - Expected: Record which aspect is used (code reads the current store).
- **Library Try again**
  1. Open the mobile library Generations list with a failed video job.
  - Expected: No 'Try again' button for the video job.

**Where to look when it fails**

- Message metadata keys videoRetryable, videoError, videoInputKind in web_messages.
- Error code idempotency_conflict if the same key is reused with a changed body.
- Logs from the generate route as in F046-01.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/046-video-generation-studio.md](../../70-qa/test-plans/mobile/046-video-generation-studio.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Mobile retry does not reuse the failed attempt's model and options; it re-sends '/video <prompt>' with the current settings.** Affects: Mobile (when released). Evidence: apps/mobile/app/(app)/chat/[id].tsx:1954-1962. Work needed: Persist options on the message or restate which settings apply.
- **Web client may offer retry for an unknown-outcome job until the transcript syncs.** Affects: Web. Evidence: WebChatPage.tsx:3830-3845; video-job-reconciliation-service.ts:75-81; video-generation-transcript.ts:47. Work needed: Expose outcome_unknown (or a retryable flag) in the public status.
- **Retry of image-conditioned videos is lost on reload.** Affects: Web. Evidence: WebChatPage.tsx:3735; videoRetryInputs.ts:21-24. Work needed: Accept, or store the images through a durable asset reference.
- **Library hosts send video retries to the image retry endpoint; only a server flag prevents the wrong call.** Affects: Mobile, web library, Tauri library. Evidence: libraryClient.ts:189-191; web LibraryView.tsx:253-258; DesktopLibrary.tsx:199-202; media-job-history.ts:176. Work needed: Make the hosts video-aware or hide retry for video jobs in code.
- **Mobile Retry is offered even for refused prompts that cannot pass.** Affects: Mobile. Evidence: audit/registers/known-flaws.md row MOBILE-IMAGE-FAILURE-CATEGORY-01. Work needed: Add a failure category to the job status.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- api:POST /api/media/video/generate
- table:video_generation_jobs
- file:apps/web/features/chat/lib/videoRetryInputs.ts
- file:apps/web/lib/server/video-generation-transcript.ts
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- F046-01
- F046-03
- F046-06

## Unknown

- Whether a component test covers the 'Try video again' button itself (MessageBubble.test.tsx video retry cases not confirmed).
- Whether the server ever returns retryable true for video in /api/media/jobs in any build (code says false).
- How the Chrome retry looks in the UI (label not read).
- Whether retry of a cancelled web job is intended; it is allowed because a cancel ends the job as failed.
