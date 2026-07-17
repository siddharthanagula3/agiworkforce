# AGI Desktop — Volume 10 — Image Generation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/desktop/AGENTS.md`; grounded in `apps/desktop/src-tauri/src/sys/commands/media.rs`, `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs`, `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`, `apps/desktop/src/api/media.ts`, `apps/desktop/src/stores/mediaGenerationStore.ts`, `apps/desktop/src/types/media.ts`, `apps/desktop/src/features/images/ImagesGallery.tsx`, `apps/web/app/api/media/image/generate/route.ts`, and `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies AGI Desktop's image-generation surface: prompting, editing, inpainting, outpainting, aspect ratios, history, safety, download, and export. Desktop is the full-trust surface (Local + BYOK + Managed Cloud), but image generation today follows a **Managed-Cloud-first** shape. The wired path is the Tauri command `media_generate_image`, which posts to the web route `/api/media/image/generate` with a Clerk access token (`apps/desktop/src-tauri/src/sys/commands/media.rs`); the same route resolves catalog model IDs and `imageApi` server-side (`apps/web/app/api/media/image/generate/route.ts`). Provider selection is driven by capability metadata in the catalog (`packages/contracts/types/src/models.json`, entries with `"modelType": "image"` and an `imageApi` of `gemini` / `imagen` / `stability` / `openai`); this volume references that catalog rather than re-listing engine IDs, which drift.

A direct BYOK image client exists (`ImageGenerationClient` in `image_gen.rs`, covering OpenAI GPT Image, Stability, and Google Imagen with a user key) but has **no callers** — it is not yet routed from any command or executor. When wired, BYOK image generation must obey the Local→BYOK fork contract (context selection, secret scan, payload preview, visible provider label, consent) and stay Desktop/CLI/VS Code-only. On-device (Local) image generation is not present. Model IDs are never hardcoded: the Rust path resolves `apiModelId` from the catalog via `resolve_image_model` before calling a provider.

## Prompting

Text-to-image prompting is the primary flow. A prompt (plus optional `negative_prompt`, `style`, `size`, `quality`, `provider`, `model`, `n`/`count`) is submitted through `generateImage` (`apps/desktop/src/api/media.ts`) into the `mediaGenerationStore` job queue, which tracks `running`/`completed`/`failed`, latency, and cost estimate. The chat-embedded and MediaLab flows are wired ✅ (`apps/desktop/src/stores/mediaGenerationStore.ts`, `apps/desktop/src/features/chat/MediaLab.tsx`). The dedicated Images page renders prompt input, style presets, and a masonry gallery but invokes a `generate_image` command that is **not registered** — only `media_generate_image` is in the Tauri handler (`apps/desktop/src-tauri/src/lib.rs`) — so its Generate button fails at runtime: 🟡 (`apps/desktop/src/features/images/ImagesGallery.tsx`). Requirement: unify the Images page onto `media_generate_image` and show the active provider/trust label on every generation. Prompt max length must match the server schema (4000 chars).

## Editing

Image-to-image editing (upload or select a source image, describe a change, regenerate) is **not implemented**. The catalog marks GPT Image 2 as capable of image editing (`bestFor` in `packages/contracts/types/src/models.json`), but no Desktop command, executor, or web route accepts a source image for edit: 🔭 Planned. Requirement when built: an explicit edit request must carry the source image plus prompt, route through the same trust-mode gate as generation, and never silently upload a Local file to Cloud without the transfer consent step.

## Inpainting

Mask-based inpainting (paint a region, regenerate only that region) is not present in any Desktop or web media path — no mask parameter exists in `ImageGenerationRequest` (`image_gen.rs`) or the web schema: 🔭 Planned. Requirement when built: a canvas mask editor in the Images surface, a `mask` payload field, provider capability checks (only route to engines whose catalog metadata supports inpainting), and payload preview before any Cloud/BYOK send.

## Outpainting

Outpainting (extend the canvas beyond the original frame) is likewise absent: 🔭 Planned. It depends on the same masked-edit primitives as inpainting plus a canvas-expansion UI and target aspect-ratio selection. Requirement: outpainting must reuse the inpainting mask pipeline and the aspect-ratio contract below rather than a parallel code path.

## Aspect Ratios

Aspect ratio is expressed today as a small preset size enum — `small | medium | large | wide | portrait` (`apps/desktop/src/types/media.ts`) — mapped to concrete dimensions per provider in `image_gen.rs`: OpenAI/Stability get pixel sizes, and Imagen maps `wide`→`16:9`, `portrait`→`9:16`, everything else→`1:1`. The web schema accepts a fixed size list (`1024x1024`, `1792x1024`, `1024x1792`, and provider-specific sizes). This is functional but limited: 🟡 (`apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`, `apps/web/app/api/media/image/generate/route.ts`). Requirement: expose the ratios each selected engine actually supports (from catalog metadata), reject unsupported ratios with a clear message, and never send a ratio the provider will silently coerce.

## History

Generation history is device-local: `media_get_history` reads a per-user `media_history.json` in the app data dir, and both `media.rs` and `media_executor.rs` append completed items ✅. The Images gallery separately persists entries via `editingStore` ✅ (`apps/desktop/src/stores/editingStore.ts`). Two gaps make this 🟡: (1) history rows save only `img.url`, so base64-only results (Stability/Imagen) persist with an empty `src`; (2) image history is **not** part of Neon delta-sync — the sync APIs cover chat/memory/projects only, so images do not appear on other devices. Requirement: persist base64 results as durable local assets and decide, per policy, whether Managed-Cloud image assets sync (they must not leak Local/BYOK outputs into Neon).

## Safety

Server-side gating is real: the web route enforces Clerk auth, subscription checks, rate limiting, CSRF, and the managed-compute kill-switch gate (`apps/web/app/api/media/image/generate/route.ts`), and `negative_prompt` is threaded through providers. There is no explicit content-moderation filter, provenance watermark (C2PA), or age/abuse classifier in the Desktop path: 🟡 for server gating, 🔭 for explicit moderation and provenance. Requirement: prompt/output moderation and provenance metadata before any wider release; BYOK generations must show that moderation is the provider's responsibility, not AGI's.

## Download

Per-image download works client-side across the surfaces via an anchor element writing a `.png`: Images gallery, inline tool results, inline panel, and MediaLab all implement it ✅ (`apps/desktop/src/features/images/ImagesGallery.tsx`, `apps/desktop/src/features/chat/InlineToolResults/InlineMediaGeneration.tsx`, `apps/desktop/src/features/chat/InlinePanels/ImageInlinePanel.tsx`, `apps/desktop/src/features/chat/MediaLab.tsx`). Gap: download relies on the browser anchor rather than a Tauri native save dialog, so remote `url` images depend on CORS and there is no chosen-path save. Requirement: add a native save-to-disk via Tauri fs for reliability and to keep files off any cloud round-trip.

## Export

Structured export — save-to-Project/Artifact, batch export, or export with metadata sidecar — is not built beyond single-file download: 🔭 Planned. Requirement when built: export destination must respect trust mode (a Local/BYOK image never auto-exports into a Managed-Cloud project without the explicit, redacted handoff), and batch export should reuse the History store as its source of truth.

## Repository map

- `apps/desktop/src-tauri/src/sys/commands/media.rs` — `media_generate_image` / `media_generate_video` / `media_get_history`.
- `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs` — tool-driven media generation.
- `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs` — direct provider client (unwired, BYOK-capable).
- `apps/desktop/src/api/media.ts`, `apps/desktop/src/stores/mediaGenerationStore.ts`, `apps/desktop/src/stores/editingStore.ts`, `apps/desktop/src/types/media.ts`.
- `apps/desktop/src/features/images/ImagesGallery.tsx`, `apps/desktop/src/features/images/ImageStylePresets.tsx`, `apps/desktop/src/features/chat/MediaLab.tsx`, `apps/desktop/src/features/chat/InlineToolResults/InlineMediaGeneration.tsx`, `apps/desktop/src/features/chat/InlinePanels/ImageInlinePanel.tsx`, `apps/desktop/src/features/media/MediaGenerationProgress.tsx`.
- `apps/web/app/api/media/image/generate/route.ts` — Managed-Cloud generation route.
- `packages/contracts/types/src/models.json` — image model catalog (`modelType: "image"`, `imageApi`).

## Competitor notes

ChatGPT's `/images`, Claude's artifact-embedded images, and Codex's minimal image role each bind one vendor's stack. AGI diverges deliberately: a **multi-provider** catalog (Gemini/Imagen/Stability/OpenAI selected by capability metadata, no single lock-in), **BYOK where allowed** (Desktop/CLI/VS Code only, via the explicit fork — never Web/Mobile), **per-surface trust** (Managed Cloud is a distinct boundary from Local/BYOK), and a **local-first** disposition (history and downloads stay on-device; images are not Neon-synced today). Pricing follows the canon ladder — Free, Basic $8/₹399, Pro $20, Max $100 and $200, Enterprise — with usage metered, no credit top-ups, and no removed tiers.

## Acceptance / Definition of Done

Production-ready when: generation succeeds from every entry point through one command; provider/trust labels are always visible; aspect ratios reflect real engine support; history persists base64 results; safety gating and provenance are in place before wider release.

- [ ] Build: Images page routes through `media_generate_image`; no call to the unregistered `generate_image`; base64 results persist locally.
- [ ] Trust: BYOK image path (if wired) enforces the Local→BYOK fork; Managed-Cloud generations never carry Local/BYOK data silently; no image history in Neon that leaks non-Cloud outputs.
- [ ] Security: server auth/rate-limit/CSRF/kill-switch verified; prompt/output moderation and provenance metadata specified before release; native save keeps files off cloud round-trips.

## Anti-patterns

- Hardcoding image model IDs — always resolve `apiModelId`/`imageApi` from `packages/contracts/types/src/models.json` (as `resolve_image_model` does).
- Offering BYOK image generation on Web or Mobile, or auto-forking Local→BYOK without consent, secret scan, and payload preview.
- Silently uploading a Local source image to Cloud for edit/inpaint/outpaint.
- Claiming editing/inpainting/outpainting/export as shipped — they are 🔭 with no repo path.
- Syncing image outputs into Neon without a policy that excludes Local/BYOK results.
- Referencing Supabase, `middleware.ts`, or removed tiers (Plus, pro_plus, Hobby); introducing credit top-ups.
