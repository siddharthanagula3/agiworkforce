---
id: "F044-01"
type: "feature"
title: "Make an image from a prompt"
aliases: ["Create image", "Image mode", "Image generation", "Text-to-image", "Image model picker", "Select image model", "agi image", "/image", "media_generate_image", "managed image generation", "durable image job"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.01", "S44.02"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "plan:premium"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-01 Make an image from a prompt

Image mode lets a signed-in person on a plan that includes image generation type a description in Web, Desktop (hosted web app), Mobile or the CLI, choose an image model, and get a picture back. It runs only on AGI Cloud. The Chrome extension composer and VS Code have no image mode.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.01](../../10-requirements/capabilities/044-image-generation-studio.md#s4401), [S44.02](../../10-requirements/capabilities/044-image-generation-studio.md#s4402).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a text prompt into one or more generated images, shown in the conversation (Web, Desktop, Mobile) or saved to a file (CLI). The person also picks which image model draws it, from models this deployment can actually run. The server stores the image in the account Library and labels it as AI-generated. (apps/web/app/api/media/image/generate/route.ts:26-113; apps/web/app/api/media/image/lib/managed-image-generation.ts:883-970)

**Why it exists.** AGI Workforce competes with Claude and ChatGPT, and an image maker inside the chat is part of that product (doc: docs/product/definition.md:44). One server route does the work for every app so that plan checks, safety checks, billing and storage are the same everywhere (apps/web/app/api/media/image/lib/managed-image-generation.ts:150-153).

**Who uses it.** People on an eligible paid plan (Premium, Max, Ultra, Team, Team Premium, Enterprise) (packages/contracts/types/src/billing-catalog.ts:351-356). Eligible Free accounts may get a limited free image offer instead (doc: docs/product/definition.md:342-349).

**Problems it solves**

- Making a picture without leaving the chat or opening another tool.
- Choosing a cheaper or better image model without a developer setting.
- A slow image provider does not lose the work: each request becomes a durable job that can be polled, cancelled or retried (apps/web/app/api/media/image/lib/managed-image-generation.ts:804-881).
- Refused prompts and failed images are not charged (apps/web/__tests__/api/media-image-generate.test.ts:1048,2014).

**Use cases**

- On Web, click Create image in the composer plus menu, type 'a red bicycle on a beach', press send, and see the image in the chat.
- On Mobile, open Add to chat, pick Create image, choose an image model, send, and wait while the app polls the job.
- In a terminal, run: agi image "a red bicycle" --model <id> and get a file in the current folder.
- Pick a different image model after a failure and send the same prompt again.

## 2. User experience

**Where to find it**

- Web and Desktop (the Electron window shows the hosted web app): composer plus menu row 'Create image' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:160,820), shown only when the host owns an image callback (apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx:2860-2870). After it is chosen an 'Image' pill appears (aria-label 'Exit image generation mode') and a model button (aria-label 'Select image model') (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6254-6266,6763).
- Mobile: Add to chat sheet row 'Create image' with hint 'Switches this chat to image generation', then an 'Image model' list (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:927-930,962-978). The Images screen also has a 'Create image' control (apps/mobile/src/features/image/ImagesScreen.tsx:488). A typed '/image <prompt>' also starts it (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:235,250). A default image model can be set in Settings > media (apps/mobile/src/features/settings/media/index.tsx:182).
- CLI: command 'agi image "<prompt>"' with --model/-m, --out, --list-models (apps/cli/src/lib.rs:1110-1172). A TUI slash form exists (apps/cli/src/cloud/image.rs:1369-1380 run_slash).
- Chrome extension: not available. VS Code extension: not applicable (brief).

**Before you start**

- Signed in to an AGI account; Web/Desktop passes an adult-eligibility gate first (apps/web/app/api/media/image/generate/route.ts:42-49); Mobile needs a Clerk sign-in (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:255).
- A plan that includes image generation, or a limited free media offer (apps/web/app/api/media/image/lib/managed-image-generation.ts:195-212; doc: docs/product/definition.md:342-349).
- Cloud mode. Mobile Local mode is refused with 'Image generation uses AGI Cloud' (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:114-117,252); CLI refuses Local and own-key sessions (apps/cli/src/cloud/image.rs:833-835).
- Online connection (Mobile: 'Network connection required' (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:137-140,256)).
- At least one image model the deployment can run; otherwise 'This deployment is not ready for image generation.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2605-2613).

**Screens and controls**

- Web composer in image mode: placeholder 'Describe the image you want' (or 'Describe or edit an image' when the model can edit) (ChatComposerNew.tsx:5883-5887), model menu titled 'Image model' (ChatComposerNew.tsx:6772-6776), send button.
- Web generating card: role=status, 'Generating image', 'Generating with <model name>', 'Waiting for the image provider · <time> elapsed' (apps/web/features/chat/components/ImageGenerationCard.tsx:221-235).
- Mobile: 'Create image' row, 'Image model' list, then the chat bubble shows progress (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:927,962-978).
- CLI: prints the saved file path(s) and a one-line summary 'AI-generated with <model> (<provider>): ...' (apps/cli/src/lib.rs:3520-3529; apps/cli/src/cloud/image.rs:236-246).

**Journey**

1. 1. Open a chat (Web/Desktop/Mobile) or a terminal (CLI).
2. 2. Turn on image mode: Web plus menu 'Create image'; Mobile Add to chat 'Create image'; or type /image on Mobile.
3. 3. Optionally open the model menu and pick an image model. Web shows paid admitted models plus any free promotional model (ChatComposerNew.tsx:1322-1335).
4. 4. Type the prompt (up to 4000 characters) (packages/contracts/cloud-contracts/src/managed-media.ts:90).
5. 5. Press send. Web clears the composer and calls onGenerateImage (ChatComposerNew.tsx:3762-3770).
6. 6. The client posts /api/media/image/generate with an Idempotency-Key. Web waits on the open connection; Mobile sends async:true and polls status every 2 seconds up to 170 seconds (apps/web/lib/hooks/useMediaGeneration.ts:500-517; apps/mobile/src/features/image/services/imagegen.ts:33-34,59-62,82-95).
7. 7. The image appears in the chat (Web, Mobile) or in a file (CLI), and is also saved in the Library.

**What the person sees and gets**

- Spinner card with the model name and elapsed seconds (Web).
- Local notices when something blocks sending, for example 'Checking image model availability…' or 'No image model is currently available in this deployment.' (ChatComposerNew.tsx:3748-3753).
- Server error text with a code, e.g. content_policy_violation, model_unavailable, plan_upgrade_required, subscription_required (managed-image-generation.ts:159-170,196-211,301-313,320-331).
- Mobile alerts such as 'Image generation is not included' and 'Sign in to generate images' (resolveMobileImageGenerationRequest.ts:127-136).
- Output: image URL (a /api/files/<id> path) plus AI-generated provenance headers and metadata (managed-image-generation.ts:949-969).

**Settings**

- Web: model choice and aspect ratio live in composer state; the exit pill resets them (ChatComposerNew.tsx:6257-6261).
- Mobile: Settings > media default image model; chat view store holds selectedMediaModel (apps/mobile/stores/chat/chatViewStore.ts:81,522).
- CLI: --save-defaults / --clear-defaults / --last remember settings in image.json (apps/cli/src/lib.rs:1161-1172; apps/cli/src/cloud/image.rs:30,734-760).
- Server: none visible to the user; model and provider are chosen from the catalog (apps/web/features/chat/lib/imageGenerationOptions.ts:27-46).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer image mode, model menu and send path call onGenerateImage and then /api/media/image/generate (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3705-3770; apps/web/lib/hooks/useMediaGeneration.ts:500).
- Desktop (Electron) shows the hosted web app, so it gets the Web feature (doc: AGENTS.md section 5; brief S44.01).
- Mobile resolves the request, blocks with clear alerts, posts async and polls (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:230-311; apps/mobile/src/features/image/services/imagegen.ts:40-95; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:210-390).
- CLI posts to the same route, saves files, and refuses Local and own-key sessions (apps/cli/src/cloud/image.rs:833-908).
- Server pipeline: gates, schema, safety floor, model and provider resolution, reservation, durable job, background drive, settle (apps/web/app/api/media/image/lib/managed-image-generation.ts:150-970).
- Status, cancel and retry routes exist for jobs (apps/web/app/api/media/image/status/route.ts:49; apps/web/app/api/media/image/cancel/route.ts:44; apps/web/app/api/media/image/retry/route.ts:60-178).
- Model list is built from catalog entries with image generation, not deprecated, and live (apps/web/features/chat/lib/imageGenerationOptions.ts:27-46), then narrowed to those the availability endpoint reports 'enabled' (ChatComposerNew.tsx:1331; apps/web/app/api/media/availability/route.ts:12-20).

**Incomplete**

- Web and Desktop show only the first returned image (apps/web/lib/hooks/useMediaGeneration.ts:535-537), and Mobile uses images[0] (apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:329). Only the CLI saves every image.
- Executable providers are only google and openai; the contract also lists stability, which the server refuses ('adapter is not supported') (apps/web/app/api/media/image/lib/image-generation-provider.ts:402-410,413-421).
- The internal Tauri desktop command media_generate_image builds its request without an Idempotency-Key header (apps/desktop/src-tauri/src/sys/commands/media.rs:258-285), while the route requires one (managed-image-generation.ts:709-717) [inferred: it would be refused with idempotency_key_required; not run].

**Present but disconnected or switched off**

- Mobile image generation is on in v1 (apps/mobile/lib/v1FeatureFlags.ts:26) but is also gated by a per-account features.imageGen flag and the canUseImages grant (apps/mobile/src/features/image/startImageCreation.ts:155-168; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:331-336).
- The server runs a capability flag canUseImages before any work (apps/web/app/api/media/image/generate/route.ts:100-111).

**Not available**

- Chrome extension: no image mode (brief S44.01). VS Code: not applicable.
- Local mode on every app: no local image generation path was found (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:252; apps/cli/src/cloud/image.rs:833-835).
- Own-key (BYOK) image generation: refused by the CLI; no BYOK image path found in the other apps (apps/cli/src/cloud/image.rs:833-835).

## 4. Required behaviour

**Established requirements**

- User enters an image mode, types a prompt, and gets a generated image back in the conversation. (source: S44.01 (brief))
- User picks which image model generates the image, from models the deployment can run. (source: S44.02 (brief))
- A paid-plan image feature is governed by the single AGI Subscription system; image generation is a plan capability. (source: doc: docs/product/definition.md:293-349)
- Unknown availability preserves the draft and asks for retry, not Upgrade. (source: doc: docs/product/definition.md:346-347)
- Advertised media models and options must produce real decodable media, and retry reuses the original idempotency identity. (source: doc: docs/product/experience-contract.md:785)

**Acceptance criteria**

1. On Web with an eligible plan, Create image then a prompt returns an image card that shows 'Generating with <model name>' while waiting.
2. A request from a Free account with no free offer returns 403 plan_upgrade_required; an account with no subscription returns 403 subscription_required.
3. A model id that is not an image model returns 400 model_unavailable, and a provider/model mismatch returns 400 provider_model_mismatch.
4. A prompt the safety floor refuses returns 422 content_policy_violation and nothing is charged.
5. On Mobile in Local mode, sending in image mode shows 'Image generation uses AGI Cloud' and sends nothing.
6. On Mobile, a request with async:true returns 202 with a job id and the app polls until the image arrives or 170 seconds pass.
7. In the CLI, agi image with a prompt writes a file and prints its path; in a Local session it refuses before any prompt leaves the machine.
8. The image is saved in the Library and is labelled as AI-generated.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that offers image mode should list the same image models for the same account, because they all read the catalog [inferred from apps/web/features/chat/lib/imageGenerationOptions.ts:27-46 and apps/mobile/src/features/chat/actions/mediaMode.ts:31-46].
- Showing only the first of several images on Web and Mobile is not an intended limit [inferred: the request accepts n up to 4 (packages/contracts/cloud-contracts/src/managed-media.ts:98)].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make Web, Desktop and Mobile render every image of a multi-image result, or send n=1 explicitly so the contract and the UI agree.
- [proposed] Give the Tauri media_generate_image command an Idempotency-Key, or remove the dead path.
- [proposed] Decide and record whether a local on-device image model should exist, given the requirement that local inference is free of subscriptions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Entry route: CORS, CSRF, rate limit, auth, age gate, managed-compute gate, org policy, spend cap, then generateManagedImage (lines 26-113). |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Subscription and plan checks, schema, safety floor, model/provider resolution, reservation, job creation, sync or async attempt, response (lines 150-970). |
| schema | ManagedMediaImageGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Request contract shared by all apps (lines 89-148). |
| service | image-generation-provider | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Provider availability, catalog model resolution, cost estimate, calls to the two executable image APIs (lines 203-421, 846-881). |
| job | image-job-executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Runs a job attempt, moderates output, saves to Library, settles billing (lines 558-860). |
| job | image-job-drive-queue / image-job-drain | `apps/web/app/api/media/image/lib/image-job-drive-queue.ts` | Background drive that finishes a durable job if the request process dies. |
| table | image_generation_jobs, image_generation_job_assets | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | Durable job rows and their output assets (lines 32, 114). |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Publishes which media models are 'enabled' on this deployment (lines 12-20). |
| endpoint | GET /api/media/image/status, POST /api/media/image/cancel, POST /api/media/image/retry | `apps/web/app/api/media/image/status/route.ts` | Job polling, cancel and retry (cancel/route.ts, retry/route.ts alongside). |
| config | IMAGE_MODELS and option helpers | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Web model list, aspect options, request option builder (lines 27-46, 164-200). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web image mode, pills, model menu, send path (lines 1322-1385, 3705-3825, 6254-6460, 6763). |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The 'Create image' row (lines 160, 820, 1711). |
| component | ImageGenerationCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Generating placeholder and finished image card (lines 213-235). |
| hook | useMediaGeneration.generateImage | `apps/web/lib/hooks/useMediaGeneration.ts` | Web client: idempotency key, request, 60 second deadline, cancel, retry, error mapping (lines 440-560). |
| service | imagegen service (Mobile) | `apps/mobile/src/features/image/services/imagegen.ts` | Posts async job, polls status every 2 s, cancels (lines 40-110). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Decides ready or blocked, with alerts (lines 230-311). |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Runs the turn, timeout 180 s, error mapping, retry memory (lines 100-390). |
| service | mediaMode (Mobile) | `apps/mobile/src/features/chat/actions/mediaMode.ts` | Lists executable image models and resolves the chosen or default model (lines 31-70). |
| screen | AddToChatSheet (Mobile) | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | 'Create image' row, 'Image model' list (lines 331-336, 927-978). |
| command | agi image | `apps/cli/src/cloud/image.rs` | CLI generate, retry, list models, save files, provenance (lines 833-908, 1232-1335). |
| command | Command::Image and handle_image_command | `apps/cli/src/lib.rs` | Flags and handler (lines 1110-1172, 3467-3545, 7767-7800). |
| command | media_generate_image (Tauri, internal) | `apps/desktop/src-tauri/src/sys/commands/media.rs` | Retained internal desktop path to the same route; checks the managed-cloud boundary (lines 110-115, 255-300). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person turns on image mode, picks a model and types a prompt. The client checks plan, capability, model availability and attachments before sending. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3705-3770; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:230-311 |
| The client posts to /api/media/image/generate with a body that follows the shared schema and an Idempotency-Key naming the app surface. | device and our servers | apps/web/lib/hooks/useMediaGeneration.ts:500-517; apps/mobile/src/features/image/services/imagegen.ts:59-62; apps/cli/src/cloud/image.rs:439-441 |
| The route checks CSRF, rate limit (10 per minute, fails closed), sign-in, adult eligibility, managed-compute gate, organization policy and the workspace spend cap. | our servers | apps/web/app/api/media/image/generate/route.ts:34-89; apps/web/lib/rate-limit.ts:384-388 |
| The server resolves the entitlement bundle, requires a subscription, checks subscription access, plan capability image_generation and the canUseImages flag. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:155-213 |
| The body is validated; the prompt goes through the always-on safety floor (a refusal is a 422 before any charge or provider call). | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:233-314 |
| The server picks the catalog model and provider (google or openai), applies the workspace model policy and the training opt-out rule, checks image count, aspect ratio and storage. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:316-526 |
| It reserves usage cost, creates a durable job row, and schedules a background drive. With async:true it returns 202 and runs the attempt after the response; otherwise it runs the attempt and waits. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:745-756,806-881,883-887 |
| The attempt calls the outside image provider, moderates the output, saves it to media storage and the Library with provenance, then settles the reservation (failure releases it). | outside service | apps/web/app/api/media/image/lib/image-job-executor.ts:558-860; apps/web/app/api/media/image/lib/image-generation-provider.ts:846-881 |
| The client shows the image from the /api/files/<id> URL. Mobile polls /api/media/image/status; the CLI downloads bytes and writes files with embedded provenance. | device | apps/mobile/src/features/image/services/imagegen.ts:82-95; apps/cli/src/cloud/image.rs:1232-1335 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt, plan, model, status and attempt counters of the job | table image_generation_jobs (Neon Postgres) | Server held; the same row is read by every app through the status route | Retention period unknown; not found in the files opened |
| Generated image bytes and Library entry | media storage plus table media_assets; the image_generation_job_assets table links them | Yes, the Library lists them for the account on every app | Library deletion rules unknown for this feature; unconfigured storage blocks generation in production (managed-image-generation.ts:506-526) |
| Usage reservation and settlement | table managed_usage_requests | Server held | Unknown |
| CLI last-image memory and saved defaults | image.json on the device (apps/cli/src/cloud/image.rs:30,723-760) | No | Kept until the user runs --clear-defaults or deletes the file |

**Models and providers.** The model list comes from the generated catalog entries with image generation (apps/web/features/chat/lib/imageGenerationOptions.ts:27-46). Only provider google and provider openai are executable; each catalog entry names an image API (gemini, imagen or openai) that decides ratios, count and edit support (apps/web/app/api/media/image/lib/image-generation-provider.ts:203-229,329-342). Server-held provider keys are used; no user key is used (image-generation-provider.ts:387-421).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account required on every app; Web and Desktop add an adult-eligibility gate (apps/web/app/api/media/image/generate/route.ts:42-49). |
| Permissions | Organization policy, workspace model policy and workspace spend cap can refuse the request (route.ts:70-99; managed-image-generation.ts:395-401). A training opt-out can refuse models that may train on inputs (managed-image-generation.ts:419-439). |
| Subscription | Needs an active subscription and a plan with capability image_generation: Premium, Max, Ultra, Team, Team Premium, Enterprise (packages/contracts/types/src/billing-catalog.ts:351-356). No subscription gives 403 subscription_required; Free or Basic gives 403 plan_upgrade_required (managed-image-generation.ts:159-170,196-211; apps/web/__tests__/api/media-image-generate.test.ts:756,786). Eligible Free accounts may use a limited free offer of up to 10 images per UTC day (doc: docs/product/definition.md:342-347). |
| Limits and metering | Rate limit 10 per minute per user, fail closed (apps/web/lib/rate-limit.ts:384-388). Cost is estimated and reserved before the job and settled after (managed-image-generation.ts:703-756). Monthly image quota is null on every plan (packages/contracts/types/src/model-catalog.ts:1292,1338,1389). Prompt max 4000 characters; a job has 3 attempts (apps/web/lib/server/image-generation-jobs.ts:84). |
| Feature flags | Server capability canUseImages (route.ts:100-111). Mobile FEATURES.imageGen (apps/mobile/lib/v1FeatureFlags.ts:26), per-account features.imageGen, and granted capability canUseImages (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:331-336). |
| Model compatibility | A model must be an image model with image generation and a named image API, live and not deprecated (apps/web/features/chat/lib/imageGenerationOptions.ts:27-46). The Gemini-API entry needs a catalog output MIME type or the server returns 503 image_model_contract_unavailable (managed-image-generation.ts:463-481). |
| Provider restrictions | Only google and openai can run; stability is refused (image-generation-provider.ts:402-421; managed-image-generation.ts:791-802). If neither server key is set the route returns 500 no_providers (managed-image-generation.ts:374-387). |
| Local mode | Not available. Mobile blocks with requires_cloud (resolveMobileImageGenerationRequest.ts:252); CLI refuses Local and own-key sessions before any prompt leaves the machine (apps/cli/src/cloud/image.rs:833-835); the Tauri command fails closed without a managed-cloud boundary (apps/desktop/src-tauri/src/sys/commands/media.rs:110-115). No on-device image model was found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows a status card with the model name and elapsed time, with the clock kept out of the live region and motion reduced when asked. | apps/web/features/chat/components/ImageGenerationCard.tsx:221-235; apps/web/features/chat/components/ImageGenerationCard.test.tsx:44,60 |
| Model list not ready or empty | Web says 'Checking image model availability…', 'No image model is currently available in this deployment.' or 'This deployment is not ready for image generation.' | ChatComposerNew.tsx:2605-2613,3748-3753 |
| Timeout (Web) | The client aborts after 60 seconds and shows 'The image did not finish in time. Try again or pick another image model.' | apps/web/lib/hooks/useMediaGeneration.ts:136-139,479; apps/web/lib/deadline-policy.ts:61 |
| Timeout (Mobile) | The poll stops at 170 seconds with 'The image is still being made. It will appear in your Library when ready.'; the turn times out at 180 seconds with a retry hint. | apps/mobile/src/features/image/services/imagegen.ts:34,76-79; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:110-115 |
| Cancel | Web shows 'You stopped this image.'; the cancel route records intent and returns 202 if an attempt is mid-call; Mobile and CLI also cancel. | apps/web/lib/hooks/useMediaGeneration.ts:141-144; apps/web/app/api/media/image/cancel/route.ts:95-115; apps/cli/src/cloud/image.rs:1112-1200 |
| Retry | A failed job can be retried on the same reservation (3 attempts); a job that cannot be retried returns 409 image_job_not_retryable. | apps/web/lib/server/image-generation-jobs.ts:84; apps/web/app/api/media/image/retry/route.ts:94-103 |
| Rate limited by provider | Server returns 429 with Retry-After; Web caps the countdown at 5 minutes; Mobile shows the retry time. | managed-image-generation.ts:902-931; useMediaGeneration.ts:135; runImageGenerationTurn.ts:372-380 |
| Offline | Mobile blocks with 'Network connection required'. Web offline handling: not handled in the code I opened. | resolveMobileImageGenerationRequest.ts:137-140,256 |
| Storage not configured | In production the server returns 503 media_storage_unavailable before any charge. | managed-image-generation.ts:506-526 |
| Image not saved | If the image cannot be saved to the Library the user is not charged and gets a retry message; Mobile warns the image is session-only. | image-job-executor.ts:783-799; runImageGenerationTurn.ts:336-343 |
| Account switch mid-turn | Mobile cancels the turn if the account changed. | runImageGenerationTurn.ts:222-232,317-318 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-image-generate.test.ts`: Auth, CSRF, rate limit, subscription and plan gates (free refused, pro/max allowed), body validation, aspect ratio, count, idempotency, reservation and refund, job handle for async, provider choice, safety refusals, training opt-out.
- `apps/web/__tests__/api/media-image-status.test.ts`: Job status route.
- `apps/web/__tests__/api/media-image-cancel.test.ts`: Cancel route.
- `apps/web/__tests__/api/media-image-retry.test.ts`: Retry route.
- `apps/web/__tests__/api/media-image-drain.test.ts`: Background drain of durable jobs.
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Create image row, model and aspect honesty, free promotional route, catalog filtering (lines 2859-3100).
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Generating state, model name on card, retry countdown.
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Web generate hook (contents not opened beyond the name).
- `apps/mobile/__tests__/image-generation-admission.test.ts`: Mobile ready/blocked decisions, plan gate, empty prompt, edit routing.
- `apps/mobile/__tests__/imagegen-idempotency.test.ts`: Idempotency key, durable job submit, polling to completion, refused-job sentence.
- `apps/mobile/__tests__/media-mode.test.ts`: Executable image model list and slot resolution.
- `apps/mobile/__tests__/AddToChat.test.tsx`: Image row shown in Cloud mode only and hidden below the plan or when capability denied (lines 793-809).
- `apps/cli/src/cloud/image.rs`: Inline tests: idempotency key, request fields, model choice, output paths, Local session refused, byok refused (lines 1552-1993).
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: Browser flow for image edit and attachment refusal (contents not opened).

**Test scenarios**

- **Happy path on Web**
  1. Sign in with a Premium account.
  2. Open a chat, click the plus menu, choose Create image.
  3. Pick an image model, type 'a lighthouse at dusk', send.
  - Expected: A card says 'Generating with <model>', then the image appears and is listed in the Library.
- **Free account**
  1. Sign in with a Free account that has no free offer.
  2. POST /api/media/image/generate with a valid body and Idempotency-Key.
  - Expected: 403 with code plan_upgrade_required and the required plans list; no usage reserved.
- **Refused prompt**
  1. Send a prompt the safety floor blocks.
  - Expected: 422 content_policy_violation; no job and no charge.
- **Mobile Local mode**
  1. Switch the Mobile chat to Local.
  2. Choose Create image and send a prompt.
  - Expected: Alert 'Image generation uses AGI Cloud'; no network request.
- **CLI Local session**
  1. Run agi image "x" while privacy mode is Local.
  - Expected: Error starting with 'Local:' and no request sent.
- **Slow provider on Mobile**
  1. Send a prompt with a provider delayed over 170 seconds.
  - Expected: Message that the image will appear in the Library when ready; the job later completes.

**Where to look when it fails**

- Response header named by MEDIA_DIAGNOSTIC_HEADER carries the trace id (route.ts:118).
- Log lines 'Durable image job queued', 'Durable image job could not be persisted', 'Image edit source could not be resolved', 'Generated image persistence failed; the reservation is not settled against this attempt' (managed-image-generation.ts:833,869,565; image-job-executor.ts:783).
- Event image_refund_settlement_unrecorded (image-job-executor.ts:158).
- Tables image_generation_jobs, image_generation_job_assets, media_assets, managed_usage_requests.
- Error codes: subscription_required, plan_upgrade_required, content_policy_violation, model_unavailable, provider_model_mismatch, provider_unavailable, no_providers, media_storage_unavailable, image_model_contract_unavailable, invalid_media_idempotency_key.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **Only the first image of a multi-image result is shown on Web, Desktop and Mobile.** Affects: Web, Desktop, Mobile. Evidence: apps/web/lib/hooks/useMediaGeneration.ts:535-537; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:329. Work needed: Render all returned images or document that clients always request one.
- **No local on-device image generation, though local inference is required to be free of subscriptions.** Affects: Mobile, Desktop, CLI. Evidence: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:252; apps/cli/src/cloud/image.rs:833-835. Work needed: Decide whether a local image model is in scope; if so build the path and entitlement rules.
- **No own-key (BYOK) image path.** Affects: CLI and all apps. Evidence: apps/cli/src/cloud/image.rs:833-835; managed-image-generation.ts:791-802. Work needed: Decide the own-key image design and its explicit consent.
- **Chrome extension has no image mode.** Affects: Chrome extension. Evidence: brief S44.01; docs/product/surface-feature-matrix.md:309. Work needed: Add image mode or record it as out of scope.
- **Tauri media_generate_image lacks an Idempotency-Key header.** Affects: Internal Tauri desktop build. Evidence: apps/desktop/src-tauri/src/sys/commands/media.rs:258-285 vs managed-image-generation.ts:709-717. Work needed: Add the header or retire the command; then run it to confirm.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- plan:premium

## Unknown

- How long job rows, Library images and usage rows are kept.
- Whether the Chrome extension shows image cards when the chat model calls the image tool (the tool code lists a chrome surface: apps/web/app/api/media/image/lib/image-chat-tools.ts:50-55).
- Whether the Tauri command has been run against the live route.
- Whether web and desktop show an offline message; none found.
- No test or run results are recorded in files; none are claimed.
