# Sub-Feature: Media Generation

> AI-powered image and video generation through a unified "Media Lab" panel, supporting multiple providers (Imagen 4, DALL-E 3, Stable Diffusion, Runway Gen4 Turbo, Google Veo 3.1) with server-side billing, credit reservation, and inline chat tool rendering.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust IPC commands | `apps/desktop/src-tauri/src/sys/commands/media.rs` |
| Rust tool executor (agentic) | `apps/desktop/src-tauri/src/core/llm/tool_executor/media_tools.rs` |
| Rust AGI executor | `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs` |
| Rust intent detection | `apps/desktop/src-tauri/src/core/intent/{types,patterns,detector,router}.rs` |
| Rust tool display names | `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs` |
| Rust command registration | `apps/desktop/src-tauri/src/lib.rs` (lines ~1197-1199) |
| TS types | `apps/desktop/src/types/media.ts` |
| TS API service | `apps/desktop/src/api/media.ts` |
| TS store | `apps/desktop/src/stores/mediaGenerationStore.ts` |
| UI: Media Lab panel | `apps/desktop/src/components/UnifiedAgenticChat/MediaLab.tsx` |
| UI: Gallery | `apps/desktop/src/components/Media/MediaGallery.tsx` |
| UI: Progress indicator | `apps/desktop/src/components/Media/MediaGenerationProgress.tsx` |
| UI: Inline tool results | `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineMediaGeneration.tsx` |
| UI: Tool renderer registry | `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts` |
| UI: Layout integration | `apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx` |
| UI: Sidebar entry | `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` |
| UI: Sidecar (gallery) | `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx` |
| Web API: Image generation | `apps/web/app/api/media/image/generate/route.ts` |
| Web API: Video generation | `apps/web/app/api/media/video/generate/route.ts` |
| Web API: Video status polling | `apps/web/app/api/media/video/status/route.ts` |
| Web: Video task ownership | `apps/web/lib/video-task-store.ts` |

## Architecture Overview

Media generation follows a **desktop-to-web proxy pattern**: the desktop app never calls provider APIs directly. Instead, all generation requests are authenticated and proxied through the Next.js web API, which handles subscription validation, credit management, and provider dispatch.

```
User prompt
  |
  v
[MediaLab UI] or [Agentic Tool Call]
  |
  v
[TS API service: api/media.ts]
  |
  v
[Tauri invoke() --> Rust media.rs]
  |  (HTTP POST with Bearer token)
  v
[Next.js Web API: /api/media/image/generate or /api/media/video/generate]
  |  (auth, subscription check, credit reservation)
  v
[Provider SDK call: OpenAI / Google / Stability / Runway]
  |
  v
[Response back through the chain]
  |
  v
[History saved to media_history.json in app data dir]
```

### Two entry points for generation

1. **Manual (MediaLab)**: User opens the MediaLab panel from the sidebar, fills in a form, and clicks "Generate images" or "Render video".
2. **Agentic (tool call)**: The LLM autonomously decides to generate media via `image_generate` or `video_generate` tools. The intent detector classifies prompts like "generate an image of..." as `IntentCategory::MediaGeneration` and routes to the appropriate tools.

## Image Generation

### Supported Providers

| Provider | Model | API Endpoint | Response Format | Cost (cents/img) |
|----------|-------|-------------|-----------------|-------------------|
| Google Imagen 4 | `imagen-4.0-generate-001` | `generativelanguage.googleapis.com/v1beta/models/{model}:predict` | Base64 | ~3 |
| OpenAI DALL-E 3 | `dall-e-3` / `dall-e-3-hd` | `api.openai.com/v1/images/generations` | URL | 4 (std) / 8 (HD) |
| Stability AI | `stable-image-core` | `api.stability.ai/v2beta/stable-image/generate/core` | Base64 (multipart) | 3 |

### Provider Selection

The web API selects a provider using this priority:
1. If the client requests a specific provider and its API key is configured, use it.
2. Otherwise, fall back: Google (if `GOOGLE_API_KEY` set) > OpenAI (if `OPENAI_API_KEY` set) > Stability (if `STABILITY_API_KEY` set).

### Frontend Provider IDs

The desktop frontend uses its own provider ID scheme that maps to web API provider names:

| Frontend `ImageProviderId` | Label | Maps to Web API provider | Model sent |
|---------------------------|-------|--------------------------|------------|
| `google_imagen` | Imagen 3.1 Pro | `google` | `imagen-3.1-pro` |
| `google_imagen_lite` | Nano Banana Pro | `google` | `imagen-3.2-flash-image` |
| `dalle` | DALL-E 3 | `openai` | `dall-e-3` |
| `stable_diffusion` | Stable Diffusion XL | `stability` | `stability-sdxl` |
| `midjourney` | Stub only (not executable) | N/A | N/A |

### Provider Normalization (Agentic Path)

When an LLM generates a tool call with a freeform provider string, `normalize_media_provider()` in `media_tools.rs` canonicalizes it:
- `"dalle"`, `"dalle3"`, `"dall-e-3"`, `"dall-e"`, `"gpt-image"`, `"gpt-image-1"`, `"gpt-image-1.5"` -> `"openai"`
- `"imagen"`, `"imagen3"`, `"imagen4"`, `"google_imagen"` -> `"google"`
- `"sdxl"`, `"stable-diffusion"`, `"stability"` -> `"stability"`

### Image Sizes

Validated on the web API side (Zod schema):
- `1024x1024` (default), `1792x1024`, `1024x1792`, `512x512`, `256x256`, `768x768`, `1536x1536`

Frontend presents simplified options: Square (1:1), Portrait (9:16), Landscape (16:9).

### Image Quality

- `standard` (default) -- fast drafts
- `hd` -- sharper detail (DALL-E doubles cost)
- `premium` -- frontend-only label mapped to `hd`

### Request Flow (Image)

1. Frontend builds `ImageGenerationPayload` with prompt, provider, size, quality, style, count (1-4).
2. `api/media.ts` invokes Tauri command `media_generate_image` with a `request` object (camelCase keys per IPC rules).
3. Rust `media_generate_image()` obtains an access token via `get_access_token()`, POSTs to `{base_url}/api/media/image/generate` with Bearer auth.
4. Web API validates: auth (Supabase JWT), subscription (Pro/Max/Enterprise required), credits (pre-check + reservation with idempotency key).
5. Web API calls the chosen provider with a 55s `AbortSignal` timeout per call. DALL-E 3 loops for `n > 1` (API only supports `n=1`).
6. On success: credits reconciled (reserve vs actual). On failure: credits refunded.
7. Response returns through the chain. Rust saves each image to `media_history.json` in the app data directory.
8. Store updates `imageJobs` array, UI renders previews with download buttons.

## Video Generation

### Supported Providers

| Provider | Model | API Endpoint | Duration | Async? |
|----------|-------|-------------|----------|--------|
| Runway Gen4 Turbo | `gen4_turbo` | `api.dev.runwayml.com/v1/text_to_video` | 2-10s | Yes (task-based) |
| Google Veo 3.1 | `veo-3.1-generate-preview` | `generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning` | 4/6/8s | Yes (long-running op) |

### Cost Estimates

- Runway: ~25 cents per task (~$0.05/s for 5s)
- Google Veo: ~30 cents per task (~$0.06/s for 5s)

### Provider Selection (Video)

Priority: requested provider if available, else Runway (if `RUNWAY_API_KEY` set), else Google (if `GOOGLE_API_KEY` set).

### Video Resolutions

- `720p` (HD, fastest)
- `1080p` (Full HD, balanced)
- `4k` (UHD, cinematic -- Veo only; Runway falls back to 1080p)

### Video Styles

Frontend offers: `product`, `cinematic`, `explainer`, `gameplay`, `vfx`.

### Async Generation and Polling

Video generation is inherently asynchronous. The flow has two phases:

**Phase 1: Task Creation**
1. Desktop sends `media_generate_video` -> Rust POSTs to `/api/media/video/generate`.
2. Web API creates a task with the provider and gets back a task ID.
   - Runway: `POST /v1/text_to_video` returns `{ id: "..." }` -> stored as `runway_{id}`.
   - Veo: `POST /models/{model}:predictLongRunning` returns `{ name: "operations/{id}" }` -> stored as `google_{id}`.
3. Task ownership is stored in an in-memory `Map<taskId, { userId, expiresAt }>` (6-hour TTL) for status endpoint authorization.

**Phase 2: Status Polling (server-side, in Rust)**
The Rust command `media_generate_video` does **not** return after task creation. It enters a polling loop:
- Polls `GET /api/media/video/status?task_id={id}` every 3 seconds.
- Maximum 100 attempts (300s / 5 minutes total).
- The web API status endpoint calls the appropriate provider:
  - Runway: `GET /v1/tasks/{id}` with `X-Runway-Version: 2024-11-06`.
  - Veo: `GET /v1beta/operations/{id}`.
- Unified status mapping: `PENDING` -> `queued`, `RUNNING` -> `processing`, `SUCCEEDED` -> `completed`, `FAILED`/`CANCELLED` -> `failed`.
- On `completed`: extracts `video_url` (Runway: `output[0]`, Veo: `generatedSamples[0].video.uri` or base64 data URI).
- On `failed`: returns error message.
- On timeout (100 attempts exhausted): returns with `status: "processing"` (incomplete).

### Task Ownership Verification

The video status endpoint verifies that the requesting user owns the task via `getVideoTaskOwner()`. If the task was created in a different serverless instance, the check is skipped (graceful cross-instance support). This is an in-memory store -- documented as needing Redis/Supabase for horizontal scaling.

## Rust Commands (IPC)

Three Tauri commands registered in `lib.rs`:

| Command | Rust Function | Parameters | Returns |
|---------|---------------|------------|---------|
| `media_generate_image` | `media::media_generate_image` | `request: MediaImageRequest` | `MediaImageResponse` |
| `media_generate_video` | `media::media_generate_video` | `request: MediaVideoRequest` | `MediaVideoResponse` |
| `media_get_history` | `media::media_get_history` | (none) | `Vec<MediaHistoryItem>` |

### MediaImageRequest Fields

```
prompt: String
negative_prompt: Option<String>
provider: Option<String>
model: Option<String>
size: Option<String>
quality: Option<String>
style: Option<String>
n: Option<u32>           // alias: "count"
```

### MediaVideoRequest Fields

```
prompt: String
negative_prompt: Option<String>
duration_secs: Option<u32>
resolution: Option<String>
style: Option<String>
model: Option<String>
provider: Option<String>     // "runway" or "veo3" (default: "runway")
input_image_url: Option<String>  // for image-to-video (gen4_turbo)
```

**Security note**: The `plan` field was intentionally removed from `MediaVideoRequest`. Plan tier validation is performed exclusively server-side by the web API based on the authenticated user's subscription. The desktop client must not be able to self-upgrade its tier.

### Timeouts

- Image generation: 90s client timeout (web API has maxDuration=60, 55s AbortSignal per provider).
- Video task creation: 90s client timeout (web API has maxDuration=60, 30s AbortSignal).
- Video status polling: 45s per poll (web API has maxDuration=30, 20s AbortSignal per provider).

## Web API Routes

### POST `/api/media/image/generate`

- **Auth**: Bearer token (Supabase JWT), strict regex validation.
- **CSRF**: Enforced via `requireCsrfToken`.
- **Rate limit**: `image-generation` config (10 req/min, fail-closed).
- **Subscription**: Requires `active` or `trialing` status, tier must be `pro`, `max`, `enterprise`, or `team`.
- **Credits**: Pre-check -> Reserve (idempotent) -> Generate -> Reconcile (or refund on failure).
- **Validation**: Zod schema. Prompt: 1-4000 chars. n: 1-4. Sizes: 7 valid options.
- **maxDuration**: 60s (Vercel serverless).
- **Error handling**: User-friendly messages for content policy, rate limit, billing, and timeout errors.

### POST `/api/media/video/generate`

- **Auth**: Bearer token.
- **Rate limit**: `video-generation` (strict, video is expensive).
- **Subscription**: Same tier requirements as image.
- **Credits**: Pre-check -> Reserve -> Create task (or refund on failure).
- **Validation**: Zod schema. Prompt: 1-2000 chars. Duration: 2-10s. Resolution: `720p`/`1080p`/`4k`.
- **Returns**: `{ task_id, status: "queued", provider, estimated_duration_secs }`.
- **maxDuration**: 60s.

### GET `/api/media/video/status`

- **Auth**: Bearer token.
- **Rate limit**: `video-status` (lenient, status checks are cheap).
- **Query param**: `task_id` (required).
- **Task ID format**: `{provider}_{originalId}` -- validated with alphanumeric regex.
- **Ownership check**: `getVideoTaskOwner(taskId)` -- rejects if user mismatch (skips if task not in store).
- **Returns**: `{ status, video_url?, thumbnail_url?, progress?, error? }`.
- **maxDuration**: 30s.

## Store Schema

### `mediaGenerationStore.ts` (Zustand with devtools)

```typescript
interface MediaGenerationState {
  imageJobs: ImageJob[];       // Most recent first
  videoJobs: VideoJob[];       // Most recent first
  loadingImage: boolean;       // True while any image generation is in-flight
  loadingVideo: boolean;       // True while any video generation is in-flight
  error?: string;              // Last error message

  generateImage(payload: ImageGenerationPayload): Promise<ImageJob | null>;
  generateVideo(payload: VideoGenerationPayload): Promise<VideoJob | null>;
  clearError(): void;
  reset(): void;
}

// ImageJob: id, prompt, provider, model?, status, createdAt, costEstimate?, latencyMs?, images[], error?
// VideoJob: id, prompt, model?, status, provider, createdAt, durationSecs?, costEstimate?, latencyMs?, videoUrl?, thumbnailUrl?, error?
// GenerationStatus: 'idle' | 'running' | 'completed' | 'failed'
```

**Pattern**: Optimistic insertion -- a job with `status: 'running'` is prepended to the array immediately. On success, the job is replaced in-place with the completed result. On failure, the job is updated with the error message.

**No persistence**: The store is not persisted to localStorage. Media history is stored separately via the Rust `media_history.json` file and loaded by the `MediaGallery` component.

## Component Tree

```
AppLayout
  |-- Sidebar
  |     |-- "Media Lab" button (visible if canAccessMediaLab)
  |         |-- onClick -> handleToggleMediaLab -> setIsMediaLabOpen(true)
  |
  |-- [isMediaLabOpen] -> MediaLab (lazy-loaded, full-screen overlay z-40)
  |     |-- Image tab (form + recent renders grid)
  |     |     |-- MediaGenerationProgress (inline, while loading)
  |     |     |-- Image previews with Download buttons
  |     |-- Video tab (form + recent renders grid)
  |           |-- MediaGenerationProgress (inline, while loading)
  |           |-- Video cards with thumbnails, status badges, Download links
  |
  |-- DynamicSidecar
  |     |-- case 'media' -> MediaGallery
  |           |-- Loads history via getMediaHistory() (Tauri invoke)
  |           |-- Grid of image/video cards with processing indicators
  |           |-- Full-screen lightbox modal on click
  |
  |-- UnifiedAgenticChat (inline tool results in message stream)
        |-- InlineToolResults/index.ts
              |-- image_generate / media_generate_image -> InlineImageGeneration
              |-- video_generate / media_generate_video -> InlineVideoGeneration
              |     |-- Running: MediaGenerationProgress
              |     |-- Completed: image grid / video player with Download
              |     |-- Failed: error card
```

### MediaGenerationProgress

A shared progress indicator component used in both MediaLab and inline tool results. Features:
- Provider-specific time estimates (DALL-E 3: 10-25s, Imagen 4: 8-20s, Runway: 60-120s, Veo 3: 90-150s).
- Elapsed seconds counter (real-time).
- Progress bar capped at 95% (never reaches 100% until actual completion).
- Color-coded: amber for images, purple for videos.

## Key Patterns

### Provider Abstraction
The web API routes contain per-provider functions (`generateWithDallE`, `generateWithImagen`, `generateWithStability`, `generateWithRunway`, `generateWithGoogleVeo`) that normalize each provider's API format into a unified response shape. The desktop app is provider-agnostic.

### Credit Reservation with Idempotency
Before calling any provider, credits are reserved with a deterministic idempotency key (`generateIdempotencyKey(userId, 'reservation', requestId)`). If the provider call fails, credits are refunded with a separate idempotency key. If the actual cost differs from the estimate, a reconciliation transaction adjusts the balance.

### History Persistence
Media history is stored as a JSON file (`media_history.json`) in the Tauri app data directory, not in the Zustand store. Both the `media.rs` commands and the `media_executor.rs` AGI executor write to this file. The `MediaGallery` component loads it on mount via `media_get_history`.

### Agentic Tool Integration
Media generation tools are registered in two systems:
1. **ToolExecutor** (`media_tools.rs`): Called during agentic chat tool execution. Delegates to the same `media_generate_image`/`media_generate_video` Tauri commands.
2. **MediaExecutor** (`media_executor.rs`): AGI-level executor implementing the `ToolExecutor` trait for the orchestration layer. Handles `image_generate`, `video_generate`, `media_generate_image`, `media_generate_video` tool names.

### Intent Detection
The intent system classifies user prompts containing keywords like "generate image", "create video", "draw", "render", "dalle", "midjourney" as `IntentCategory::MediaGeneration` with `Complexity::Moderate` and routes them to `image_generate` / `video_generate` tools.

### Tool Event Display Names
In `tool_events.rs`, image generation tools are displayed as `ImageGen(prompt)` in the tool timeline, following the Claude Code-style label pattern.

### Inline Rendering
The `InlineToolResults` registry maps 8 tool name variants to two components:
- `InlineImageGeneration`: Shows a grid of generated images with hover-to-download.
- `InlineVideoGeneration`: Shows an HTML5 video player with metadata footer.
Both handle `running`, `failed`, and `completed` states, and tolerate both camelCase and snake_case field names in the result data (defensive normalization).

### Access Control
Media Lab access is gated at three levels:
1. **Frontend**: `canAccessMediaLab` computed from `useBillingStore` -- requires plan name containing "pro", "max", or "enterprise". Sidebar button hidden otherwise.
2. **Rust**: No local gating (delegates to web API).
3. **Web API**: Validates subscription status (`active`/`trialing`) and plan tier (`pro`/`max`/`enterprise`/`team`). Returns 403 with actionable error messages.

## Known Issues / Tech Debt

1. **Video task store is in-memory**: `video-task-store.ts` uses a module-level `Map` that only lives for the serverless function lifetime. In a multi-instance deployment, ownership checks will fail silently (tasks pass through ungated). Needs Redis or Supabase persistence.

2. **Frontend provider IDs mismatch web API**: The frontend defines `ImageProviderId` values like `google_imagen`, `google_imagen_lite`, `dalle`, `stable_diffusion` with model strings like `imagen-3.1-pro`, `imagen-3.2-flash-image`. The web API uses `imagen-4.0-generate-001` as the actual model. The frontend model values are sent but may be ignored server-side in favor of the provider's latest model.

3. **Midjourney provider remains unavailable**: `ImageProviderId` still includes `'midjourney'`, but the backend path returns a “not yet available” error. The desktop image router now excludes unavailable providers from automatic selection until a real execution path exists.

4. **Video `plan` field still sent from frontend**: `MediaLab.tsx` includes `plan` in the `generateVideo` payload, and `api/media.ts` passes it to the Rust command. The Rust struct `MediaVideoRequest` removed the `plan` field (commented as a security fix), so the value is silently ignored. The frontend should stop sending it.

5. **Video polling blocks the Rust command**: `media_generate_video` polls for up to 5 minutes (100 attempts x 3s). This holds the Tauri command future open for the entire duration. If the desktop app is closed or the connection drops, the poll loop continues until the tokio runtime shuts down, but the result is lost.

6. **No Tauri event streaming for video progress**: Unlike the agentic tool system which emits `tool:event` progress updates, the video polling loop in `media.rs` does not emit progress events back to the frontend. The UI relies on the `loadingVideo` boolean and the `MediaGenerationProgress` estimated timer.

7. **History file is not size-bounded**: `media_history.json` grows indefinitely. No pruning, rotation, or maximum entry count is enforced.

8. **Duplicate history writes**: Both `media.rs` (IPC commands) and `media_executor.rs` (AGI executor) write to `media_history.json`. If an agentic tool call goes through the ToolExecutor path (which calls `media_generate_image` internally), the history is written twice -- once in the command and once in the executor's `save_image_to_history`.

9. **MediaGallery does not render actual images/videos**: The gallery card's preview area is a gradient placeholder (`bg-linear-to-br from-indigo-900/60 via-fuchsia-700/40 to-slate-900`). The `src` field from history is available but not used to render `<img>` or `<video>` elements in the grid.

10. **No client-side video status polling**: If the Rust-side poll loop times out (returns `status: "processing"`), the frontend has no mechanism to resume polling. The video job stays in `running` status permanently in the store.
