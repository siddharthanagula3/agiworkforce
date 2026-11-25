---
id: "F044-07"
type: "feature"
title: "Progress, cancel and retry"
aliases: ["Progress, cancel and retry", "Stop generating", "Try again", "Retry image", "Generations list", "Image job queue", "image_generation_jobs", "/image retry", "agi image --retry"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.16", "S44.17", "S44.18", "S44.19"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-observability-and-operations", "F044-09", "F044-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-07 Progress, cancel and retry

While an image is being made, the person sees a waiting state, can stop the request, and can try a failed request again. Each request is a saved job on our servers with up to three attempts. A Library list called Generations shows queued and running jobs. Partial preview images are not offered.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.16](../../10-requirements/capabilities/044-image-generation-studio.md#s4416), [S44.17](../../10-requirements/capabilities/044-image-generation-studio.md#s4417), [S44.18](../../10-requirements/capabilities/044-image-generation-studio.md#s4418), [S44.19](../../10-requirements/capabilities/044-image-generation-studio.md#s4419).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows that an image is in progress, lets the person stop it, and lets the person retry a failed or stopped image. Behind the screen, every Cloud image request becomes a durable job row with a reservation of the person's usage. The job survives a closed tab or a dead request. (apps/web/app/api/media/image/lib/managed-image-generation.ts:850; apps/web/lib/server/image-generation-jobs.ts:84)

**Why it exists.** Image providers are slow and fail often. Without a saved job, a closed tab or a timeout would leave the person charged for nothing or unsure whether the image is coming. The product contract says cancellation, provider failure, storage failure and late callbacks must settle the transcript and usage consistently, and that refresh resumes the existing job instead of submitting another. (doc: docs/product/experience-contract.md, row W12)

**Who uses it.** Any signed-in person on a plan that includes image generation, on Web (and the Desktop app, which shows the hosted web app), Mobile and CLI. [inferred from plan gate at apps/web/app/api/media/image/lib/managed-image-generation.ts:196]

**Problems it solves**

- A slow or hung provider call can be stopped instead of waited out.
- A failed image can be retried without paying twice, because a retry reuses the first reservation. (apps/web/app/api/media/image/retry/route.ts:34)
- A request whose submitting process died still finishes through a queued background drive. (apps/web/app/api/media/image/lib/image-job-drive-queue.ts:28)
- A person who left the chat can still see, cancel or retry generations from the Library. (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:15)

**Use cases**

- On Web the person types an image prompt, sees 'Generating image' with elapsed time, presses the composer stop button, and sees 'You stopped this image.'
- On Mobile an image fails with a provider error; the person taps Retry on the failed card and a new attempt starts.
- In the CLI, `agi image --retry` re-runs the last failed image on the same job, and Ctrl-C stops one in flight.
- On Web, the person opens Library, sees a job under 'Generations' marked Queued after a busy-provider failure, and presses Cancel.

## 2. User experience

**Where to find it**

- Web chat (and Desktop, which loads the hosted web app): the generating card in the transcript; the composer send button turns into a stop button while an image turn is active. (apps/web/features/chat/pages/WebChatPage.tsx:4328-4339; apps/desktop/electron/main.ts:1065-1067)
- Web/Desktop/Mobile Library: a 'Generations' section above the grid, shown only while there are jobs that are not done. (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:15; apps/mobile/src/features/library/index.tsx:1008)
- Mobile chat: the image progress card with 'Stop generating' and, on failure, 'Retry'. (apps/mobile/src/features/chat/components/ImageGenProgress.tsx:244-291)
- CLI: `agi image <prompt>`, `agi image --retry`, and `/image` in the terminal chat. (apps/cli/src/lib.rs:1110; apps/cli/src/tui/tui_app.rs:5576)

**Before you start**

- Signed in to an AGI account with an active subscription on a plan that includes image generation. (apps/web/app/api/media/image/lib/managed-image-generation.ts:143-205)
- An adult account (age gate runs first on generate). (apps/web/app/api/media/image/generate/route.ts:41-47)
- CLI: Managed privacy mode only; Local and own-key sessions are refused. (apps/cli/src/cloud/client.rs:361-371)

**Screens and controls**

- Web generating card: spinner, 'Generating image', 'Generating with <model name>', 'Waiting for the image provider' and an elapsed clock. It has no stop button of its own. (apps/web/features/chat/components/ImageGenerationCard.tsx:184-240)
- Web stopped or failed card: 'Image generation stopped before a result was received.' with a 'Try again' button, or 'Try again in Ns' while a Retry-After wait runs. (apps/web/features/chat/components/ImageGenerationCard.tsx:1250-1277)
- Web composer: the send button switches to stop mode while an image turn is active; Escape also stops. (apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx:1982-1995 [test shows the stop mode]; apps/web/features/chat/pages/WebChatPage.tsx:7674-7678)
- Library 'Generations' rows: prompt, kind, model, time, status text (Queued, Generating, Failed, Cancelled), 'Open chat', 'Try again', 'Cancel'. (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:20-30,140-185)
- Mobile: 'Stop generating' (accessibility label 'Stop generating this image'), 'Retry' or 'Retry in <time>'. (apps/mobile/src/features/chat/components/ImageGenProgress.tsx:244-291)

**Journey**

1. 1. The person sends an image prompt (image mode, or a natural-language request on Web).
2. 2. The app sends one request with an Idempotency-Key naming the surface and operation. (apps/web/lib/hooks/useMediaGeneration.ts:500-505)
3. 3. The server checks plan, policy and spend, reserves usage, saves the job row and queues a background drive. (apps/web/app/api/media/image/lib/managed-image-generation.ts:196,755,850)
4. 4. The card shows the waiting state. Web holds one request open; Mobile asks for an async job and polls its status every 2 seconds for up to 170 seconds. (apps/mobile/src/features/image/services/imagegen.ts:36-37,71,81-103)
5. 5. To stop: Web presses the composer stop button, Mobile taps 'Stop generating', CLI presses Ctrl-C (one-shot) or Esc (terminal chat).
6. 6. To retry: Web 'Try again' on the stopped card, Mobile 'Retry' on the failed card, CLI `agi image --retry` or `/image retry`, or 'Try again' in Library Generations.
7. 7. On success the image replaces the card; on failure the card shows the failure sentence.

**What the person sees and gets**

- Web stop text: 'You stopped this image.' (apps/web/lib/hooks/useMediaGeneration.ts:140)
- Mobile stop text: 'Image generation stopped.' (apps/mobile/stores/chat/chatMessageStore.ts, symbol stopImageGeneration)
- CLI stop text depends on the server reply, for example 'Stopped waiting. The model had already started drawing, so the image will still finish and appear in your account's library.' (apps/cli/src/cloud/image.rs:1143)
- Failures name the reason and, when allowed, the wait time; CLI appends 'Run `agi image --retry` to try it again.' for retryable failures. (apps/cli/src/lib.rs:3534-3541)

**Settings**

- No user setting controls cancel or retry. Attempts per job are fixed at 3 in code. (apps/web/lib/server/image-generation-jobs.ts:84)
- CLI remembers the last image and saved defaults in a local file named image.json. (apps/cli/src/cloud/image.rs:34,367-395)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Durable job per request with idempotent reservation, up to 3 attempts, 180 s claim and 3600 s lease. (apps/web/lib/server/image-generation-jobs.ts:84-86)
- Retryable provider failures are deferred with backoff and keep the reservation, so the next attempt costs nothing extra; non-retryable or last-attempt failures settle and release it. (apps/web/app/api/media/image/lib/image-job-executor.ts:165-195)
- Background drive finishes jobs whose request died; a status poll also re-drives and reconciles cancelled or exhausted jobs. (apps/web/app/api/media/image/lib/image-job-drain.ts:22-70; apps/web/app/api/media/image/status/route.ts:70-92)
- Cancel endpoint accepts job_id or idempotency_key and is scoped to the owner. (apps/web/app/api/media/image/cancel/route.ts:38-44,84)
- Retry endpoint requeues only a failed, retryable, non-cancelled job with attempts left; otherwise 409 'image_job_not_retryable'. (apps/web/app/api/media/image/retry/route.ts:94-105; apps/web/lib/server/image-generation-jobs.ts:506-530)
- Web stop aborts the request and posts cancel, retrying the cancel up to 5 times one second apart because the job may not exist yet. (apps/web/lib/hooks/useMediaGeneration.ts:143-173)
- Web resumes a stored job on 'Try again' only when prompt, ratio and model match and it is not an edit. (apps/web/features/chat/pages/WebChatPage.tsx:3430-3437)
- Mobile stop remembers the stop locally first, then posts cancel and shows the image if the server had already finished. (apps/mobile/src/features/image/services/imagegen.ts:105-115; apps/mobile/stores/chat/chatMessageStore.ts symbol stopImageGeneration)
- CLI stop, retry and redelivery of files that were generated but not saved. (apps/cli/src/cloud/image.rs:910-1010,1112-1200)
- Library 'Generations' list on Web, Mobile and the internal Tauri desktop build, refreshed every 5 seconds while a job is in flight. (apps/web/app/api/media/jobs/route.ts:15-24; packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:14,82-90; apps/mobile/src/features/library/MediaJobsSection.tsx:18; apps/desktop/src/features/library/DesktopLibrary.tsx:186)

**Incomplete**

- Cancel during a live provider call does not stop billing: the server answers 202, records the intent, and the attempt that holds the claim goes on to finish; the executor has no cancel check after the provider call and the completion update does not test for cancellation, so the image is delivered and charged. The comment in closeCancelledImageGenerationJob says the executor closes the job itself, which the code does not do. (apps/web/app/api/media/image/cancel/route.ts:84-110; apps/web/app/api/media/image/lib/image-job-executor.ts:210-213; apps/web/lib/server/image-generation-jobs.ts:450-480,545-552)
- Mobile chat Retry does not call the retry endpoint. It re-runs an in-memory copy of an edit request (only the last 3 are kept) or re-sends the original text as a new generation; an image with a reference photo cannot be replayed. (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:146-175; apps/mobile/app/(app)/chat/[id].tsx:1965-1980)
- Library 'Try again' appears only for jobs of type generate, not edits. (apps/web/lib/server/media-job-history.ts:27,124-127)
- An edit job started from uploaded bytes is not drivable in the background, so only the sender can retry it. (apps/web/app/api/media/image/lib/image-job-drive-queue.ts:14-22)
- The queue list is a history of up to 50 jobs, not a place to queue several prompts ahead. (packages/contracts/cloud-contracts/src/library.ts:143) [inferred for the 'queue several' part: no queue-submit control found]

**Present but disconnected or switched off**

- Desktop Tauri build (apps/desktop/src) has the Generations list but the public Desktop is Electron, which loads the hosted web app instead. (apps/desktop/electron/main.ts:1065-1067; doc: AGENTS.md section 5)

**Not available**

- Partial or in-progress preview images: the job snapshot has no preview field and image jobs report progress null; mobile only sets progress to 100 on completion. (apps/web/lib/server/media-job-history.ts:129; apps/mobile/stores/chat/chatMessageStore.ts:1303)
- Chrome extension: no stop, retry or queue control for images found. (apps/extension/src/side_panel.ts searched for media/image calls: none)
- VS Code extension: not applicable.
- Local mode and own-key mode: image jobs run only through the managed Cloud route. (apps/web/app/api/media/image/generate/route.ts:60-75; apps/cli/src/cloud/client.rs:361-371)

## 4. Required behaviour

**Established requirements**

- Every request creates a durable job and the server schedules a drive for it; users see no queue view (brief says missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S44.16)
- User stops an image generation in progress and the job is cancelled (not billed further). (source: S44.18)
- After a failed or stopped generation the user retries it in place with the same prompt. (source: S44.19)
- While generating, partial or preview images appear before the final one where the model supports it. (source: S44.17)
- Cancellation, provider failure, storage failure and late callbacks settle the transcript and usage consistently; retry uses the original idempotency identity; refresh resumes the existing job. (source: doc: docs/product/experience-contract.md row W12)

**Acceptance criteria**

1. Pressing stop on Web before the provider call starts ends the turn with 'You stopped this image.' and the job closes as canceled with the reservation released.
2. Pressing stop while a provider call is in flight leaves no unexplained charge: either the job is canceled and released, or the person is told it will still finish (Mobile and CLI do say so).
3. After a retryable failure, 'Try again' (or --retry) reuses the same job and does not create a second reservation; after 3 attempts the server answers 409 image_job_not_retryable.
4. Closing the browser mid-generation still ends with the job completed, failed or canceled within the lease, with no stuck 'processing' row.
5. Library Generations shows a queued/running job within 5 seconds and offers Cancel; a failed generate job offers Try again.
6. A different account cannot cancel, retry or poll the job (403).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A cancelled job that already produced images should be reported as delivered and charged, not as 'not billed further'. [inferred from executor and complete query]
- Partial previews depend on a provider streaming API the route does not use; supporting them needs new contract fields. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the executor check cancel_requested_at after the provider call and release instead of completing, or change the product promise to say an in-flight image still finishes and is charged.
- [proposed] Make mobile chat Retry call the job retry endpoint so it reuses the reservation like Web and CLI.
- [proposed] Show the Generations list in the chat surface, not only the Library.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Entry: age gate, plan gate, policy and spend gates, then hands to the managed image flow. |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Validates, moderates the prompt, reserves usage, creates the job row, queues the drive, runs or detaches the first attempt. |
| service | runImageGenerationJobAttempt | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Claims an attempt, calls the provider, screens, marks, stores, settles and completes or fails the job. |
| endpoint | POST /api/media/image/cancel | `apps/web/app/api/media/image/cancel/route.ts` | Records a cancel request and closes the job if no attempt holds a claim. |
| endpoint | POST /api/media/image/retry | `apps/web/app/api/media/image/retry/route.ts` | Requeues a retryable failed job and runs another attempt on the same reservation. |
| endpoint | GET /api/media/image/status | `apps/web/app/api/media/image/status/route.ts` | Returns a job snapshot, reconciles stuck cancels, re-drives due attempts after the response. |
| endpoint | GET /api/media/jobs | `apps/web/app/api/media/jobs/route.ts` | Lists the last 50 image and video jobs for the Generations list. |
| service | listMediaJobHistory | `apps/web/lib/server/media-job-history.ts` | Maps job rows to Queued, Generating, Failed, Done, Cancelled with retryable and cancellable flags. |
| store | image-generation-jobs | `apps/web/lib/server/image-generation-jobs.ts` | SQL for create, claim, defer, fail, complete, requeue, cancel and close of image jobs. |
| table | image_generation_jobs | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | The durable job row with attempts, claim, cancel_requested_at and billing outcome. |
| job | media-generation.image-attempt drive | `apps/web/app/api/media/image/lib/image-job-drive-queue.ts` | Queues the next attempt in the background; handler in image-job-drain.ts registered in apps/web/lib/jobs/job-handlers.ts:363. |
| hook | useMediaGeneration / cancelImageGenerations | `apps/web/lib/hooks/useMediaGeneration.ts` | Web client: sends generate, stop and resume-and-retry. |
| component | ImageGenerationCard (GeneratingCard, stopped card) | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Waiting state, elapsed clock, 'Try again' with Retry-After countdown. |
| screen | WebChatPage stop and retry wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | handleStopGeneration, resumeJobId logic, applyImageError. |
| component | MediaJobsSection (Generations) | `packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx` | Shared list with Cancel and Try again, polled every 5 seconds. |
| service | imagegen.ts (mobile) | `apps/mobile/src/features/image/services/imagegen.ts` | Mobile async submit, 2-second polling, cancel. |
| component | ImageGenProgress | `apps/mobile/src/features/chat/components/ImageGenProgress.tsx` | Mobile progress card with Stop generating and Retry. |
| store | chatMessageStore.stopImageGeneration | `apps/mobile/stores/chat/chatMessageStore.ts` | Mobile stop action and result handling. |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Mobile turn runner with 180 s timeout and in-memory edit-retry memory. |
| component | Mobile MediaJobsSection | `apps/mobile/src/features/library/MediaJobsSection.tsx` | Mobile Generations list. |
| service | cloud/image.rs (generate, retry, stopped, cancel) | `apps/cli/src/cloud/image.rs` | CLI generation with stop and retry and a local last-image memory. |
| command | agi image | `apps/cli/src/lib.rs` | One-shot command with --retry, --again, --last; Ctrl-C handler image_interrupt. |
| command | /image | `apps/cli/src/tui/tui_app.rs` | Terminal chat slash command; Esc stops. |
| component | DesktopLibrary (internal Tauri build) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Passes mediaJobs transport to the shared Library view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends an image prompt; the client builds an Idempotency-Key that names the surface and operation. | device | apps/web/lib/hooks/useMediaGeneration.ts:500-505; apps/mobile/src/features/image/services/imagegen.ts:68-72 |
| Server checks CSRF, rate limit, auth, age gate, plan capability, organisation policy and spend limit. | our servers | apps/web/app/api/media/image/generate/route.ts:25-93; apps/web/app/api/media/image/lib/managed-image-generation.ts:196 |
| Server moderates the prompt, reserves managed usage for one hour, inserts the job row and queues a drive 180 seconds later. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:279-305,745-757,850-855 |
| First attempt claims the job and calls the image provider (Web waits inline; Mobile and CLI-async use a detached attempt and poll status). | outside service | apps/web/app/api/media/image/lib/image-job-executor.ts:576-690; apps/web/app/api/media/image/lib/managed-image-generation.ts:856-872 |
| Stop: client aborts or stops waiting and posts cancel; server sets cancel_requested_at and, if no live claim, releases the reservation and closes the job as canceled. | our servers | apps/web/app/api/media/image/cancel/route.ts:84-122; apps/web/app/api/media/image/lib/image-job-executor.ts:220-236 |
| Retry: server requeues a failed retryable job and runs a new attempt on the same reservation; status poll or drive handles abandoned attempts. | our servers | apps/web/app/api/media/image/retry/route.ts:134-170; apps/web/app/api/media/image/status/route.ts:70-92 |
| Client shows the image, the failure sentence or the stopped state and (CLI) writes the last-image memory file. | device | apps/web/features/chat/components/ImageGenerationCard.tsx:1250-1277; apps/cli/src/cloud/image.rs:723-733 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Image job (prompt, plan, status, attempts, cancel time, billing outcome, public error) | table image_generation_jobs (our database) | Visible to the owner on every app through GET /api/media/jobs and /status. | Row cascades with the usage reservation; account erasure has no explicit step for it. (apps/web/db/neon/0226_durable_image_generation_jobs.sql:84-93 comment) |
| Usage reservation and settlement | managed_usage_requests (our database) | Counted in the shared usage ledger. | Released on cancel, exhaustion or non-retryable failure; settled on delivery. (apps/web/app/api/media/image/lib/image-job-executor.ts:137-163) |
| Last image, outcome, job id, saved defaults (CLI) | image.json in the CLI config folder | No. | Overwritten by each image; cleared by --clear-defaults for defaults only. (apps/cli/src/cloud/image.rs:367-395,752-760) |
| Stopped-operation ids (Mobile) | memory only, 64 entries | No. | Lost when the app closes. (apps/mobile/src/features/image/services/imageGenerationStops.ts:1-14) |

**Models and providers.** The job names a provider and a catalog model. The job table only admits two providers, openai and google, and the executor refuses a model that is no longer executable. (apps/web/db/neon/0226_durable_image_generation_jobs.sql:41-42; apps/web/app/api/media/image/lib/image-job-executor.ts:590-606) A provider quota, spend-cap or overload failure marks the provider degraded and tells the person to choose another image model. (apps/web/app/api/media/image/lib/image-job-executor.ts:620-640)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on every route; the job must belong to the caller or the route answers 403. (apps/web/app/api/media/image/cancel/route.ts:63-80) |
| Permissions | Adult-eligibility gate, organisation model policy and workspace spend limit apply to generate. Cancel, retry and status check only ownership. (apps/web/app/api/media/image/generate/route.ts:41-93) |
| Subscription | Generate needs an active subscription and a plan whose capability list contains image_generation: pro, max, max_15x, team, team_premium, enterprise. Free is not in the list. (packages/contracts/types/src/billing-catalog.ts:341,356; apps/web/app/api/media/image/lib/managed-image-generation.ts:143-205) A document says limited free media offers exist (10 images per day) when live inventory allows (doc: docs/product/definition.md:341-348); no code path from the generate route to that offer was found (unknown). |
| Limits and metering | Reservation held for up to 3600 seconds; max 3 attempts; one claim lasts 180 seconds; rate-limit bucket 'image-generation' on generate, cancel, retry and status. (apps/web/lib/server/image-generation-jobs.ts:84-86; apps/web/app/api/media/image/cancel/route.ts:50-51) |
| Feature flags | Mobile requires FEATURES.imageGen (true). Web gates on the canUseImages capability flag. (apps/mobile/lib/v1FeatureFlags.ts:26; apps/web/app/api/media/image/generate/route.ts:100-111) |
| Model compatibility | Only catalog models that are executable image models run; edits need a model whose admission says supports_edit. (apps/web/app/api/media/image/lib/image-job-executor.ts:590; apps/web/features/chat/components/ImageGenerationCard.tsx:405-406) |
| Provider restrictions | Only openai and google jobs can be created. (apps/web/db/neon/0226_durable_image_generation_jobs.sql:41-42) |
| Local mode | Not available. Image jobs exist only on our servers; the CLI refuses Local and own-key sessions with a message naming the mode. (apps/cli/src/cloud/client.rs:361-371; apps/cli/src/cloud/image.rs:1754 test name 'a_local_session_refuses_to_generate_and_names_the_mode'). Mobile images require a Cloud account. (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:226-232) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows 'Generating image' with an elapsed clock kept out of the live region; Mobile shows a progress card with elapsed time and no percentage. | apps/web/features/chat/components/ImageGenerationCard.tsx:184-240; apps/mobile/__tests__/ImageGenProgress.test.tsx (test 'shows an honest indeterminate state when the server exposes no progress feed') |
| Stopped before a request is created | Cancel answers 404 'has not started yet'; Web retries the cancel up to 5 times; Mobile treats it as a stop with nothing to cancel. | apps/web/app/api/media/image/cancel/route.ts:73-75; apps/web/lib/hooks/useMediaGeneration.ts:157-173; apps/mobile/src/features/image/services/imagegen.ts:105-115 |
| Stopped during a live provider call | Server answers 202; the image still finishes and is delivered. CLI and Mobile say so; Web shows only 'You stopped this image.' | apps/web/app/api/media/image/cancel/route.ts:97-110; apps/cli/src/cloud/image.rs:1141-1146 |
| Provider error with a wait | Card shows 'Try again in Ns' and the button is disabled until the time passes (bounded to 5 minutes). | apps/web/features/chat/components/ImageGenerationCard.tsx:1186-1215 |
| Retry not allowed | 409 'This image has used every retry...' or 'cannot be retried in its current state'. | apps/web/app/api/media/image/retry/route.ts:94-105 |
| Request died or tab closed | Queued drive or next status poll re-runs the attempt; exhausted abandoned jobs are closed and released. | apps/web/app/api/media/image/lib/image-job-drain.ts:22-70 |
| Timeout | Web aborts at the function limit with 'The image did not finish in time'; Mobile fails at 180 s and says 'Retry to run it again'; Mobile polling stops at 170 s and says the image will appear in the Library when ready. | apps/web/lib/hooks/useMediaGeneration.ts:136-139; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:110-114; apps/mobile/src/features/image/services/imagegen.ts:87-89 |
| Offline or cancel unreachable | Mobile says it stopped on this device but could not reach AGI Cloud so the job may still finish; CLI says the stop did not reach the account. | apps/mobile/stores/chat/chatMessageStore.ts symbol stopImageGeneration (catch branch); apps/cli/src/cloud/image.rs:1148-1157 |
| Account switch | Mobile cancels the turn if the Cloud account changes during generation. | apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:221-235,287 |
| Accessibility | Web waiting card is role=status with aria-live polite; Mobile card has role progressbar and labelled Stop control. | apps/web/features/chat/components/ImageGenerationCard.tsx:221-224; apps/mobile/src/features/chat/components/ImageGenProgress.tsx:123-124,244 |
| Chrome extension | not handled in the code (no image stop or retry found) | apps/extension/src/side_panel.ts searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-image-cancel.test.ts`: Cancel releases and closes an idle job, records intent only while a claim is live, refunds nothing for a delivered job, refuses another owner.
- `apps/web/__tests__/api/media-image-retry.test.ts`: Retry runs on the held reservation, refuses exhausted or terminal jobs and other owners, passes resupplied edit bytes, reports a second failure.
- `apps/web/__tests__/api/media-image-status.test.ts`: Status snapshot route (test titles not read).
- `apps/web/__tests__/api/media-image-drain.test.ts`: Background drive of image jobs (test titles not read).
- `apps/web/lib/server/media-job-history.test.ts`: Queued, running, failed and cancelling job mapping and cancellable flag.
- `apps/web/app/api/media/jobs/__tests__/route.test.ts`: Jobs list route (titles not read).
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Web generation hook, cancel and resume (titles not read).
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Provider-wait state, Retry-After countdown on 'Try again', stopped card.
- `apps/mobile/__tests__/image-generation-stop.test.ts`: Stop is remembered first, cancel of an admitted job, follow stops, server-finished image shown, unreachable server message.
- `apps/mobile/__tests__/ImageGenProgress.test.tsx`: Retry shown only when given, indeterminate progress, failure text.
- `apps/mobile/__tests__/MediaJobsSectionCompletion.test.tsx`: Mobile Generations section (titles not read).
- `apps/cli/src/cloud/image.rs`: Rust unit tests in the file, including a local session refusing to generate and redelivery saving only missing files (lines 1754,1905).

**Test scenarios**

- **Stop before the provider starts (Web)**
  1. Sign in on a plan with image generation.
  2. Send an image prompt and press the composer stop button within a second.
  3. Open Library and look at Generations.
  - Expected: Transcript shows 'You stopped this image.'; no image appears; the job is Cancelled and Usage shows no charge. Record what actually happens, because the in-flight case differs.
- **Stop during the provider call**
  1. Send a prompt to a slow model.
  2. Press stop after 5 seconds.
  3. Wait 2 minutes and open Library.
  - Expected: Server answered 202; the image may appear in Library and be charged. Confirm the wording shown matches this.
- **Retry a retryable failure**
  1. Use a test provider that returns a busy error.
  2. Press 'Try again' when it enables.
  3. Check the job attempts in the status response.
  - Expected: Same job_id, attempts goes up, no second reservation; after 3 attempts retry returns 409 image_job_not_retryable.
- **Close the tab mid-generation**
  1. Send a prompt, close the tab.
  2. Reopen Library after the claim time (3 minutes).
  3. Look at Generations and the image grid.
  - Expected: Job reaches Done or Failed through the drive; no row stuck as Generating.
- **Mobile retry of an image with a reference photo**
  1. Send an edit with a reference photo, force a failure.
  2. Tap Retry.
  - Expected: If the in-memory copy is gone the app says the reference is unavailable instead of sending a new text-only generation.
- **CLI stop and retry**
  1. Run agi image 'a red bicycle'.
  2. Press Ctrl-C.
  3. Run agi image --last then agi image --retry.
  - Expected: Prints the stop message from the server answer; --last shows outcome 'stopped'; --retry runs a fresh generation or a job retry as the memory allows.

**Where to look when it fails**

- Server log lines 'Image generation attempt failed', 'Durable image job delivered', 'Image job drive could not be queued', event image_refund_settlement_unrecorded. (apps/web/app/api/media/image/lib/image-job-executor.ts:661; apps/web/app/api/media/image/lib/image-job-drive-queue.ts:50)
- Table image_generation_jobs columns status, attempts, cancel_requested_at, claim_expires_at, billing_outcome, public_error.
- Response code image_job_not_retryable, image_job_unavailable, billing_unavailable.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **Cancel of an in-flight attempt completes and charges the image, while the brief says cancelled means not billed further.** Affects: Web, Mobile, CLI, Desktop users who stop late. Evidence: apps/web/app/api/media/image/lib/image-job-executor.ts:210-213 and 576-860 (no cancel check); apps/web/lib/server/image-generation-jobs.ts:450-480. Work needed: Decide the rule, then either release on cancel after the provider call or change the copy; add a test for the live-claim cancel.
- **Web stop message never tells the person the image may still finish.** Affects: Web and Desktop. Evidence: apps/web/lib/hooks/useMediaGeneration.ts:140. Work needed: Use the cancel snapshot status (202) to show the CLI/Mobile style note.
- **Mobile chat Retry creates a new generation instead of retrying the job.** Affects: Mobile. Evidence: apps/mobile/app/(app)/chat/[id].tsx:1965-1980. Work needed: Call the retry endpoint with the stored job id; keep the edit fallback.
- **No partial previews anywhere.** Affects: All apps. Evidence: apps/web/lib/server/media-job-history.ts:129. Work needed: Needs provider streaming support and a preview field in the job snapshot contract; do not promise it until a model supports it.
- **No queue-ahead of several prompts, and the Generations list is Library-only.** Affects: Web, Mobile, Desktop. Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:974. Work needed: Product decision; the brief marks S44.16 not applicable.
- **Chrome extension has no stop or retry for images.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts. Work needed: Confirm whether the extension can start images at all (migration 0366 says it can) and add the controls.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-observability-and-operations
- F044-09
- F044-12

## Unknown

- Whether Free accounts can start image generation through the limited free media offer: docs say yes (docs/product/definition.md:341-348) but the generate route gates on paid tiers.
- Whether the Chrome extension can start an image turn; migration 0366 says it does, the extension code searched shows no controls.
- Name of the background job queue table behind enqueueJob.
- Whether the LibraryView test files cover the Generations section.
- Whether Desktop Electron adds any image-specific behaviour beyond the hosted web app.
