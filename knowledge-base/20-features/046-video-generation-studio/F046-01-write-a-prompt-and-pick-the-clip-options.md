---
id: "F046-01"
type: "feature"
title: "Write a prompt and pick the clip options"
aliases: ["Create video", "Video mode", "Text-to-video", "Video generation composer", "/video (mobile command)", "Create a video (Chrome side panel)", "media_generate_video (internal Tauri desktop tool name)", "S46.01 S46.05 S46.06 S46.07 S46.08"]
area: "46 Video-generation studio"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.01", "S46.05", "S46.06", "S46.07", "S46.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "file:apps/web/app/api/media/video/generate/route.ts", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "file:packages/contracts/types/src/model-catalog.ts", "api:POST /api/media/video/generate", "api:GET /api/media/availability", "table:video_generation_jobs", "provider:google", "provider:openrouter", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-voice-and-media", "SYS-api-and-contracts", "F046-02", "F046-03", "F046-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-01 Write a prompt and pick the clip options

A signed-in person on a paid plan writes what a clip should show, picks a video model, aspect, quality and length, and sends it. The AGI Cloud server checks the choices against the model's catalog contract, reserves credits and starts a durable job at an outside video provider. Built on web (and so the public desktop); Chrome is prompt-only; mobile is switched off.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.01](../../10-requirements/capabilities/046-video-generation-studio.md#s4601), [S46.05](../../10-requirements/capabilities/046-video-generation-studio.md#s4605), [S46.06](../../10-requirements/capabilities/046-video-generation-studio.md#s4606), [S46.07](../../10-requirements/capabilities/046-video-generation-studio.md#s4607), [S46.08](../../10-requirements/capabilities/046-video-generation-studio.md#s4608).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns a text prompt (and, on web, optional input images, see F046-06) into a generated video clip. The person chooses the video model, the aspect ratio, the quality (resolution) and the length. The server only accepts a combination the chosen model declares in the catalog, and refuses anything else with a validation error rather than changing it silently.

**Why it exists.** Video is a paid media capability of the AGI Subscription (Ultra and Enterprise plans). The founder decision records that video is generated in chat and kept in the Library, with no separate video studio (doc: docs/decisions/2026-09-27-founder-decisions.md:132-133). The model-agnostic catalog means the picker is built from data, not from a fixed list of models.

**Who uses it.** Paid-plan users on web (and the Electron desktop, which shows the hosted web app), plus Chrome side-panel users in a prompt-only form. Mobile users once the v1 flag is switched on.

**Problems it solves**

- A person can make a clip from words without leaving the chat.
- Unsupported model/size/length combinations are refused before any money is reserved or any provider is called.
- The cost, plan, workspace-policy and safety checks run in one server route, so every app gets the same rules.

**Use cases**

- A marketer on web picks a model, 9:16, 720p, 6 seconds and types a product teaser prompt.
- A user on the Chrome side panel chooses Create a video from the attach menu and types a one-line scene.
- A user whose workspace blocks a model is refused with a workspace-policy error, not a silent model swap.

## 2. User experience

**Where to find it**

- Web (and public Electron desktop, which loads the hosted web app: apps/desktop/electron/main.ts:345): in the composer '+' menu choose the row labelled 'Create video' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:161, 859). It also appears when typing in the slash menu (ComposerPlusMenu.tsx:1714).
- Chrome side panel: attach menu item 'Create a video' (or 'Create a video · Upgrade' when the plan does not include it) (apps/extension/src/side_panel.ts:15085-15096; _locales/en/messages.json keys spVideoModeItem, spVideoModeUpgrade).
- Mobile: add-to-chat sheet row 'Create video' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:943), but the row is hidden because FEATURES.videoGen is false (apps/mobile/lib/v1FeatureFlags.ts:28; AddToChatSheet.tsx:337-342). Typing '/video <prompt>' is also ignored while the flag is off (resolveMobileVideoGenerationRequest.ts:97).
- Internal Tauri desktop build (not the public desktop): video mode in CloudRuntime (apps/desktop/src/runtime/CloudRuntime.ts:1088-1090). CLI and VS Code: no video generation found (only plan text in apps/cli/src/plans.rs).

**Before you start**

- Signed in with an AGI account.
- A plan that includes video generation: Ultra (max_15x) or Enterprise (packages/contracts/types/src/billing-catalog.ts:357; route.ts:981-1001). A separate limited free offer exists on web (doc: docs/product/definition.md:342-349) and goes through a different path that was not read.
- Capability canUseVideoGeneration granted (apps/web/app/api/media/video/generate/route.ts:1003-1013; ChatComposerNew.tsx:1058-1072).
- At least one video model admitted as 'enabled' by the media availability check (ChatComposerNew.tsx:1338-1353).
- Web only: Cloud mode. There is no own-key or Local path for video (see access_and_usage).

**Screens and controls**

- Web composer in video mode: a 'Video' chip with aria-label 'Exit video generation mode' (ChatComposerNew.tsx:6474); placeholder 'Describe the video you want' (ChatComposerNew.tsx:5888).
- Model menu: button aria-label 'Select video model', menu label 'Video model'; when empty it says 'This deployment is not ready for video generation.' (ChatComposerNew.tsx:6857, 6873, 6931).
- Aspect menu 'Video aspect ratio' (aria 'Select video aspect ratio'), Quality menu 'Video quality' (aria 'Select video quality'), Length menu 'Video length' (aria 'Select video length', shows e.g. '6s') (ChatComposerNew.tsx:6549-6700). Each is shown only when it has more than one option and the model is not a promotional (free offer) model (ChatComposerNew.tsx:6549, 6602, 6656).
- Options come from the model's catalog output sizes: getVideoAspectOptionsForModel, getVideoQualityOptionsForModel (scoped by aspect), getVideoDurationOptionsForModel (packages/contracts/types/src/model-catalog.ts:2379-2415; ChatComposerNew.tsx:1421-1443).
- Image mode and video mode are mutually exclusive (ChatComposerNew.tsx:1116-1123).
- Mobile (when enabled): sheet sections 'Video model', 'Aspect ratio', 'Quality', 'Length' (AddToChatSheet.tsx:966, 1066, 1085-1100, 1119-1130).
- Chrome: only a 'Video' chip with hint 'Describe the video to create' and a remove button 'Stop creating a video'; no pickers (side_panel.ts:10482-10510; messages.json spVideoModeChip, spVideoModeChipHint, spVideoModeLeave).

**Journey**

1. 1. Open the '+' menu and choose 'Create video'. The composer enters video mode and turns image mode off (ChatComposerNew.tsx:2659-2730, 1122).
2. 2. The composer waits for media availability; if no video model is 'enabled' it shows a notice instead of entering the mode (ChatComposerNew.tsx:2685-2692).
3. 3. Pick a model from the 'Video model' menu. The aspect, quality and length menus rebuild from that model's catalog contract; a stored choice the model does not support falls back to the first option the model offers (ChatComposerNew.tsx:1421-1443).
4. 4. Type the prompt and press send. The composer refuses an empty prompt, attached non-image files, or a model that is not 'enabled' with a notice (ChatComposerNew.tsx:3817-3862).
5. 5. The composer sends the derived model, aspect, resolution and duration to the page's video handler (ChatComposerNew.tsx:3869-3893), which adds your prompt and an assistant placeholder to the chat and starts the job (apps/web/features/chat/pages/WebChatPage.tsx:3904-4066).
6. 6. The server validates and starts the job (see execution flow). Progress, stop and the finished clip are covered by F046-03 and F046-05.

**What the person sees and gets**

- Local notices in the composer for refusals (for example 'Describe the video you want to make.').
- Server errors shown to the person: validation messages such as '<model> does not support <n>-second output.' (route.ts:455-457), '<model> does not support <res> output at <aspect>.' (route.ts:460-462), plan errors 'Video generation is available on <plans> plans. Upgrade your plan and I can create that video for you.' (route.ts:986), 'No active subscription found. Please subscribe to use video generation.' (route.ts:945).
- On success the server answers with a task id, status 'queued', provider, model and an estimated duration in seconds (route.ts:1287-1295). The chat shows the placeholder (F046-03).

**Settings**

- Account setting that limits media to models that do not train on inputs: a chosen model that may train is refused with code model_may_train; with no model chosen the server picks one that does not train (route.ts:1159-1176).
- Workspace model policy and spend limit can refuse the request (route.ts:917-936, 1181-1187).
- No video-specific user setting for audio: the web client never sends generate_audio, so the server uses the model default (route.ts:1207-1208).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: video mode, model/aspect/quality/length menus, send path, and the full server route exist and are connected (ChatComposerNew.tsx:1116-6931; WebChatPage.tsx:3904-4066; route.ts:873-1314). Existing tests cover the route and the composer input path (see verification).
- Server contract checks: duration 2 to 30 whole seconds, resolution one of 480p/720p/1080p/4k, aspect one of six ratios, prompt 1 to 2000 characters, strict schema (packages/contracts/cloud-contracts/src/managed-media.ts:31-47, 193-217). Defaults: 4 seconds, 720p (managed-media.ts:196-197) and 16:9 (route.ts:1206). The web composer always sends explicit derived values, so defaults only matter to clients that send a bare prompt (Chrome, Tauri desktop).
- The server rejects a duration, size tuple or audio mode absent from the model's catalog entry before billing or provider contact (route.ts:446-481; test media-video-generate.test.ts:627).
- Chrome side panel: prompt-only video turn is wired from the attach menu to POST /api/media/video/generate with body {prompt} (apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:109-126; side_panel.ts:8779-8793, 6288-6312).
- Internal Tauri desktop: prompt and optional duration only (apps/desktop/src/api/cloudApi.ts:600-617).

**Incomplete**

- Chrome has no model, aspect, resolution or length controls: it relies on server defaults (4 s, 720p, 16:9 and the catalog's video slot model) (videoGenerationClient.ts:126; route.ts:381-412). Whether the default tuple is valid for the slot model in production is unknown.
- The server accepts n (1 to 4 candidates, each its own paid job) (managed-media.ts:160, 205-210; route.ts:1044, 1262-1285) but no client read sends it.
- No frame-rate, style preset, template or storyboard control exists (brief S46.09, S46.15, S46.16, S46.18-24 are outside this feature).
- The brief's code anchors are stale: for example the web picker is at ChatComposerNew.tsx:6850-6931, not 5081.

**Present but disconnected or switched off**

- Mobile: the whole flow (sheet row, pickers, send, progress) is built but switched off by FEATURES.videoGen=false in apps/mobile/lib/v1FeatureFlags.ts:28. The docs agree that mobile video UI stays paid-only/unreleased (doc: docs/product/definition.md:347-349).
- Runway: the route still contains a Runway adapter, but isVideoProviderReleaseEnabled returns true only for google and openrouter, so a Runway model is refused at route.ts:1189-1193 (apps/web/lib/server/video-provider-release-policy.ts:17).
- Catalog: three Google video entries carry a deprecation date of 2026-10-22, already past; the project register says the routing slots still name them (audit/registers/known-flaws.md row VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22; doc: docs/product/definition.md:352-357). Whether a live executable video model exists in production is unknown.

**Not available**

- CLI and VS Code extension: no video generation code (grep of apps/cli and apps/extension-vscode found only plan comparison text). The server also refuses a CLI idempotency surface (route.ts:1055).
- Local mode and own-key (BYOK) video: no code path found; the route is Managed Cloud only (route.ts:1055-1060).

## 4. Required behaviour

**Established requirements**

- A user writes a prompt in a video mode and gets a generated clip back (S46.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.01)
- The user picks which video model generates the clip (S46.05), chooses the duration (S46.06), the aspect ratio (S46.07) and the resolution, and gets that resolution (S46.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.05, S46.06, S46.07, S46.08)
- Video is generated in chat and kept in the Library; there is no separate video studio. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:132-133)
- Camera-motion, scene, dialogue and generated-audio controls (S46.10-13) are declined; generation is by prompt. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:139-141)
- Video generation is paid-plan included (Ultra, Enterprise). A separate limited offer allows eligible managed-chat accounts up to 5 video requests per user per UTC day when inventory and admission permit; mobile video UI stays paid-only. (source: doc: docs/product/definition.md:342-349; packages/contracts/types/src/billing-catalog.ts:357)
- Documentation availability stays separate from account and route availability: video depends on a provider route, not on the model alone. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. On web with an entitled account, 'Create video' opens video mode, and the aspect, quality and length menus list only values present in the chosen model's catalog output sizes.
2. Switching model to one that lacks the current aspect or quality changes the shown value to that model's first supported option, and the request sends the shown value.
3. POST /api/media/video/generate with a duration, resolution/aspect pair or audio mode the model does not declare returns a validation error and creates no job and no credit reservation.
4. A prompt of 2001 characters is refused by the schema; 2000 is accepted.
5. An account on a plan without video receives 403 with code plan_upgrade_required (or subscription_required with no subscription) and no job is created.
6. With no admitted video model, the composer does not enter video mode and shows a notice; the server returns a service-unavailable error for a request with no live configured model.
7. Turning on video mode turns off image mode, and the reverse.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A Chrome prompt-only request depends on the default 4 s, 720p, 16:9 tuple being valid for the slot model; if it is not, every Chrome video fails with a validation error.
- [inferred] Because the web client never sends generate_audio, audio-capable models always generate with audio and the cost estimate assumes audio (credit-estimates.ts:106 vs route.ts:1207-1208).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the Chrome side panel's chosen defaults, or add the same four menus, so the person knows the length and shape they get.
- [proposed] Add a guard test that the default tuple (4 s, 720p, 16:9) is valid for the model in the video_generation slot.
- [proposed] Decide whether the unused n (candidates) field stays in the contract or gets a control.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew (video mode, pickers, send) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Holds videoMode, model/aspect/resolution/duration state, the four menus (6549-6931) and the video send branch (3817-3893). |
| component | ComposerPlusMenu 'Create video' row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Entry row labelled 'Create video' (161, 832-860) with plan hint. |
| screen | WebChatPage handleGenerateVideo | `apps/web/features/chat/pages/WebChatPage.tsx` | Creates conversation and placeholder messages, saves the transcript, starts the job (3904-4066). |
| hook | useMediaGeneration (startVideo, watchVideo) | `apps/web/lib/hooks/useMediaGeneration.ts` | Builds the request body and starts the job (570-637). |
| service | media-api-service generateVideo | `apps/web/features/media/services/media-api-service.ts` | POSTs to /api/media/video/generate with an Idempotency-Key (190-215). |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | All gates, validation, cost, reservation, job creation, provider submission (873-1866). |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Shared strict request schema, enums, limits (31-47, 160-217). |
| service | Catalog video helpers | `packages/contracts/types/src/model-catalog.ts` | isExecutableVideoModel, aspect/quality/duration options, output size lookup, cost (2320-2580). |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Reports which video models are enabled and whether video storage is configured. |
| service | media-model-availability-service | `apps/web/lib/services/media-model-availability-service.ts` | Computes each video model's admission state from provider keys, storage and release policy. |
| service | video-provider-release-policy | `apps/web/lib/server/video-provider-release-policy.ts` | Admits only google and openrouter. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Durable job row (74-103) with prompt, duration, resolution, aspect, audio flag, provider, model. |
| service | video-generation-jobs | `apps/web/lib/server/video-generation-jobs.ts` | Admission, job create, provider claim and task record functions. |
| job | Video generation workflow | `apps/web/lib/workflows/start-video-generation-workflow.ts` | Durable workflow owner started before the job row (route.ts:1531-1546). |
| screen | Mobile AddToChatSheet video section | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Row 'Create video' and pickers (943, 1049-1164); hidden by flag (337-342). |
| config | Mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | videoGen: false (28). |
| service | Mobile request resolver | `apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts` | Blocks Local mode, signed-out, no plan, offline; builds the request (97-140). |
| service | Mobile video service | `apps/mobile/src/features/video/services/videogen.ts` | Consent gate, idempotency key, POST, poll, cancel (87-175). |
| service | Chrome video client | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Prompt-only POST and status read (109-144). |
| screen | Chrome side panel video turn | `apps/extension/src/side_panel.ts` | canCreateVideos, startVideoTurn, runVideoTurn (6085, 6227-6312, 8779-8793, 15085-15110). |
| service | Tauri desktop video request | `apps/desktop/src/api/cloudApi.ts` | generateCloudVideo with prompt and duration only (600-640), internal build. |
| test | Video generate route tests | `apps/web/__tests__/api/media-video-generate.test.ts` | Route behaviour tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens 'Create video', picks model and options; the composer derives the supported tuple from the bundled model catalog. | device | ChatComposerNew.tsx:1421-1443, 2659-2730 |
| Composer reads model admission from the server to decide which models are 'enabled'. | our servers | apps/web/app/api/media/availability/route.ts; ChatComposerNew.tsx:1338-1353 |
| Send: the page saves the prompt and an assistant placeholder to the chat transcript, then posts the request with an Idempotency-Key built from the placeholder id. | device and our servers | WebChatPage.tsx:3904-4066; media-api-service.ts:190-215; durableVideoGenerationTurn.ts:35-48 |
| The server runs CSRF, rate limit ('video-generation'), age gate, managed-compute kill switch, workspace policy, spend limit, subscription, plan and feature-flag checks. | our servers | route.ts:879-1013 |
| The server parses the strict schema, checks the idempotency key, replays an earlier matching job if one exists, and runs the platform prompt moderation (422 content_policy_violation on refusal). | our servers | route.ts:1022-1157 |
| The server resolves the model, applies the no-training rule, workspace model policy and provider release policy, then validates duration, size tuple and audio against the model contract. | our servers | route.ts:1159-1219, 446-481 |
| The server computes the cost from the catalog, checks the monthly video-seconds allowance and that video storage is configured, then for each candidate acquires admission, reserves credits (1 hour lease), starts a durable workflow owner and inserts the job row. | our servers | route.ts:1223-1261, 1412-1572 |
| The server submits the clip to the outside provider (Google interactions API, OpenRouter, or Runway when released) and records the provider task id. | outside service | route.ts:615-752, 1726-1760 |
| The server answers with the job id and status 'queued'. Polling, reconciliation and delivery are in F046-03 and F046-05. | our servers | route.ts:1287-1313 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Job row: prompt, model, provider, duration, resolution, aspect, audio flag, estimated cost, idempotency key, workflow id, status | table video_generation_jobs (our database) | Server-side; read by status and jobs routes; mirrored into the web chat message metadata | Retention period not read; erasure fence and admission columns exist for account erasure (0105_durable_video_generation_jobs.sql:22-36). Excluded from the job list for temporary or deleted chats (media-job-history.ts:136-160). |
| Credit reservation for the estimated cost | managed usage ledger (reserveManagedUsageRequest) | Server-side | Settled on delivery; released with 0 cost on a failure before the provider starts (route.ts:1497-1529). Full ledger retention unknown. |
| Chat messages: user prompt and assistant placeholder with video metadata | table web_messages (our database) and the browser chat store | Yes, through the web chat sync | Follows chat deletion rules; not read here. |

**Models and providers.** The model comes from the generated model catalog (type 'video', videoGen capability, live, executable: model-catalog.ts:2320-2334). With no model named, the server uses the catalog's video_generation routing slot (route.ts:381-413). Providers: Google (interactions API), OpenRouter, Runway (withheld). Provider keys are server environment variables (route.ts:336-342); values are not recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required (getClerkAuthUser, route.ts:889). Adult-eligibility gate 'media-video' (route.ts:890-896). Chrome sends a bearer token from the managed cloud account (videoGenerationClient.ts:96-107). |
| Permissions | CSRF token, rate limit bucket 'video-generation', workspace policy gate, workspace spend limit and workspace model policy are checked (route.ts:879-936, 1181-1187). Workspace client allow-list does not apply because video resolves to an api or unknown surface (audit/registers/known-flaws.md row WEB-SURFACE-ALLOWLIST-UNKNOWN-01). |
| Subscription | Active subscription plus plan in the video_generation list: Ultra (max_15x) and Enterprise only (billing-catalog.ts:357; route.ts:941-1001). Free users: a separate limited offer (up to 5 video requests per UTC day) exists on web (doc: docs/product/definition.md:342-349); its code path (ChatComposerNew.tsx:3686-3706, 3838-3840 sends it through chat with a model override) was not read in depth. |
| Limits and metering | Monthly video-seconds allowance per plan (tier-unit-quota-service.ts:57, 96-103, 165-168) checked for duration times candidates (route.ts:1238-1256). Credits reserved from the catalog cost (route.ts:485-521, 1442-1453). One admission slot per user at a time, else 409 video_generation_admission_busy (route.ts:1412-1432). |
| Feature flags | Capability canUseVideoGeneration (route.ts:1003-1013); managed-compute kill switch (apps/web/lib/managed-compute-gate.ts:73-85); mobile FEATURES.videoGen=false (apps/mobile/lib/v1FeatureFlags.ts:28). |
| Model compatibility | Only catalog models of type video with the videoGen capability that are live and carry a duration list or per-second price (model-catalog.ts:2320-2334). Duration, resolution, aspect and audio must match the model's output sizes (route.ts:446-481). Models that cannot keep inputs out of training are refused when the account opts out (route.ts:1159-1176). |
| Provider restrictions | google and openrouter are released; runway is withheld until a charged-moderation outcome exists (video-provider-release-policy.ts:5-17). Runway prompts are capped at 1,000 characters (route.ts:533, 1209-1211). Google video requires audio (route.ts:472-474). |
| Local mode | No video in Local mode. Mobile blocks it with 'Video generation uses AGI Cloud' and the text 'Local Mode runs entirely on-device.' (resolveMobileVideoGenerationRequest.ts:65-68, 107). No Local or own-key video path was found on web, Chrome or desktop; the route is Managed Cloud only (route.ts:1055-1060). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading availability | Composer shows 'Checking video models…' and refuses to enter video mode until ready. | ChatComposerNew.tsx:2678-2692, 6865 |
| No video model enabled | Notice 'This deployment is not ready for video generation.'; server returns service-unavailable 'No executable video model is configured' or 'No live <provider> video model is configured'. | ChatComposerNew.tsx:2688, 6931; route.ts:389, 410 |
| Attached files in video mode | Non-image files or a model without image input are refused with a notice (see F046-06). | ChatComposerNew.tsx:3821-3833 |
| Empty prompt | Composer notice 'Describe the video you want to make.' when files are attached; otherwise nothing is sent. | ChatComposerNew.tsx:3834-3836 |
| Unsupported combination | HTTP validation error naming the model and the unsupported value. | route.ts:454-475 |
| Safety refusal | 422 content_policy_violation before any reservation. | route.ts:1137-1157 |
| Retry of the same request (network) | Same Idempotency-Key and same body returns the existing job; same key with a different body returns 409 idempotency_conflict. | route.ts:237-257, 1116-1122 |
| Offline or server error | The page converts the error to a message and marks the placeholder failed; a start that failed before a task id exists is projected to the transcript as failed and retryable. | WebChatPage.tsx:4117-4197; video-generation-transcript.ts:78-110 |
| Accessibility | Menus have aria-labels, controls are buttons with keyboard menus (AnchoredComposerMenu); exact keyboard behaviour in a browser is not verified here. | ChatComposerNew.tsx:6561, 6614, 6668, 6857 |
| Mobile in v1 | Not shown. Sending '/video text' goes to ordinary chat because the resolver returns not_requested. | resolveMobileVideoGenerationRequest.ts:97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate.test.ts`: Route: catalog tuple submission and reserved cost, rejection of an absent tuple before billing, auth 401s, moderation block, adult eligibility, transcript ownership, rate limiting.
- `apps/web/__tests__/api/media-video-paywall-contract.test.ts`: Plan and paywall error contract of the route (file exists; titles not read).
- `apps/web/__tests__/video-model-selectability.test.ts`: Picker offers only models the route will accept; non-live and preview models are excluded.
- `packages/contracts/types/src/__tests__/video-generation-catalog.test.ts`: Catalog-driven video: executable models, duration envelope, per-tuple pricing, rejection of absent tuples/durations/audio.
- `packages/contracts/types/src/__tests__/video-resolution-pricing.test.ts`: Every offered resolution has a price; flat rate not above per-resolution rates.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Shared media contracts (file exists; titles not read).
- `apps/web/lib/services/media-model-availability-service.test.ts`: Model admission states (file exists; titles not read).
- `apps/mobile/__tests__/video-generation-admission.test.ts`: Mobile admission: plan, Local block, signed-out, offline, empty prompt, /video command.
- `apps/mobile/__tests__/media-mode.test.ts`: Mobile media mode (file exists; titles not read).
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile starts the video with the duration chosen in the composer.
- `apps/extension/__tests__/side-panel-media.test.ts`: Chrome video start/status client and side-panel handlers.

**Test scenarios**

- **Model change rebuilds options**
  1. Sign in on web with an Ultra account.
  2. Open '+' then 'Create video'.
  3. Pick model A, note the aspect, quality and length menus.
  4. Pick model B with different output sizes.
  - Expected: Each menu lists only B's values; a value A allowed but B does not is replaced by B's first option; the sent request carries the shown values.
- **Unsupported tuple rejected**
  1. Send a request by script with a duration the model does not list (using a valid Idempotency-Key for web video).
  2. Inspect the response and the video_generation_jobs table.
  - Expected: Validation error naming the model and duration; no job row and no credit reservation.
- **Plan without video**
  1. Sign in with a plan that is not Ultra or Enterprise.
  2. Send a video request.
  - Expected: 403 plan_upgrade_required; the composer hides or gates the Create video row.
- **Prompt length**
  1. Send prompts of 2000 and 2001 characters.
  - Expected: 2000 accepted; 2001 refused by the schema.
- **Chrome prompt-only**
  1. Open the Chrome side panel signed in on Ultra.
  2. Attach menu, 'Create a video', type a prompt, send.
  - Expected: A task starts with server defaults, or a clear error if the default tuple is not valid for the slot model; record which.
- **Mobile flag off**
  1. Open the add-to-chat sheet on mobile.
  2. Type '/video a cat' and send.
  - Expected: No 'Create video' row; the text is sent as normal chat.

**Where to look when it fails**

- Server log lines: 'Video generation task created' (route.ts:1305), 'Starting video generation task' (1699), 'Video generation task durably queued' (1861), 'Video task creation failed' (1850).
- Response header MEDIA_DIAGNOSTIC_HEADER carries the trace id (route.ts:1872).
- Error codes: subscription_required, plan_upgrade_required, content_policy_violation, model_may_train, no_training_model_available, idempotency_conflict, video_generation_admission_busy, video_resolution_unpriced, video_seconds_monthly_limit_reached.
- Tables: video_generation_jobs, web_messages (metadata.videoStatus).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/046-video-generation-studio.md](../../70-qa/test-plans/desktop/046-video-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/046-video-generation-studio.md](../../70-qa/test-plans/mobile/046-video-generation-studio.md)
- No hands-on plan yet for Chrome: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Mobile video is built but switched off, so the S46.01/05/06/07/08 'mobile done' status in the brief is not user-reachable.** Affects: Mobile users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:28; AddToChatSheet.tsx:337-342; MessageList.tsx:112-115. Work needed: Owner decision to release; flip the flag; run a live phone check with the real provider; keep the paid-only rule.
- **Chrome has a prompt-only video flow but the brief and the surface matrix mark it missing/absent, and it has no model, shape, length or resolution control.** Affects: Chrome users; anyone reading the brief or matrix. Evidence: side_panel.ts:8779-8793; videoGenerationClient.ts:126; doc: docs/product/surface-feature-matrix.md:319. Work needed: Correct the brief and matrix source data; decide whether Chrome gets the pickers.
- **The catalog's video slots still name models Google shut down on 2026-10-22; a live executable model in production is unverified.** Affects: All surfaces. Evidence: audit/registers/known-flaws.md row VIDEO-VEO-SLOTS-SHUTDOWN-2026-10-22; doc: docs/product/definition.md:352-357. Work needed: Move the slots through the model-families tool after the owner-approved probe and eval; run a live generation.
- **The route accepts n (up to 4 candidates) but no client sends it and the estimate ignores it.** Affects: Web, mobile. Evidence: managed-media.ts:160, 205-210; media-api-service.ts:41-52. Work needed: Either add a control and multiply the estimate, or remove the field.
- **The brief's code anchors for S46.05-08 are out of date.** Affects: Engineers and testers. Evidence: Brief cites ChatComposerNew.tsx:5081 etc; the menus are at 6549-6931. Work needed: Regenerate the brief anchors.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- file:apps/web/app/api/media/video/generate/route.ts
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- file:packages/contracts/types/src/model-catalog.ts
- api:POST /api/media/video/generate
- api:GET /api/media/availability
- table:video_generation_jobs
- provider:google
- provider:openrouter
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-voice-and-media
- SYS-api-and-contracts
- F046-02
- F046-03
- F046-06

## Unknown

- Whether any video model is live and executable in production today (catalog dates show three Google rows past deprecation; provider keys are not readable from the repo).
- Which models the media availability check reports as enabled for Runway given the release policy (the service imports the policy; the exact result was not traced).
- Whether the Chrome default tuple (4 s, 720p, 16:9) is valid for the slot model.
- The limited free video offer path (usePromotionalMediaModels, /api/models/free-quota/media-offer): not read.
- Whether an own-key (BYOK) video route exists elsewhere: none found in the files read.
- provider:runway has no folder under packages/ai/providers; it is used only inside the video route.
