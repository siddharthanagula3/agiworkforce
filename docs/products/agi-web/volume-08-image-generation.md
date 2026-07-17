# AGI Web — Volume 08 — Image Generation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`; grounded in real repo paths: `apps/web/app/api/media/image/generate/route.ts`, `apps/web/app/api/media/route.ts`, `apps/web/lib/hooks/useMediaGeneration.ts`, `apps/web/features/chat/components/ImageGenerationCard.tsx`, `apps/web/features/chat/components/ImageLightbox.tsx`, `apps/web/lib/server/media-assets.ts`, `apps/web/lib/server/media-storage.ts`, `apps/web/db/neon/0036_media_assets.sql`, `apps/web/lib/rate-limit.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies AI image generation on **AGI Web** — the cloud-only surface. Web has **no Local mode and no BYOK** (canon); every image request is authenticated with Clerk, gated on a Managed-Cloud subscription, and executed server-side against AGI-managed provider keys. There is no env-key free chat path and no user-supplied provider key affordance — never add one. Image model IDs are resolved from the catalog (`packages/contracts/types/src/models.json`) via `getModelsForProvider`/`getRoutingSlotModel`/`getModelMetadataById`, never hardcoded. Generated assets are user-scoped rows in Neon plus durable object storage, so the same Library appears across Web/Desktop/Mobile cloud. The whole domain lives inside the Managed-Cloud trust boundary; Local/BYOK data is never fed into it.

## Prompting

The generation endpoint is `POST /api/media/image/generate` (**✅ Built** — `apps/web/app/api/media/image/generate/route.ts`). The request schema validates `prompt` (1–4000 chars), optional `negative_prompt` (≤2000), `style` (`natural|vivid|cinematic|anime|digital-art|photographic`), `quality` (`standard|hd`), `n` (1–4), an optional `size`, and an optional catalog `model` id. Provider dispatch covers `google`, `openai`, and `stability`; the default provider is chosen by which managed key is configured. Google routes on the catalog's declarative `imageApi` field (`gemini` `:generateContent` vs `imagen` `:predict`), so a new Google image model is enabled by catalog metadata, not code (**✅ Built** — `resolveGoogleImageModel`). Requirements: prompt length is enforced server-side; unknown/unavailable providers return a 400 with `provider_unavailable`; the client hook `useMediaGeneration` posts the prompt and tracks job state (**✅ Built** — `apps/web/lib/hooks/useMediaGeneration.ts`). Model IDs must continue to flow from the catalog; the route already resolves `apiModelId` server-side.

## Editing

Web offers **prompt-based re-generation editing**, not pixel inpainting. The inline `ImageGenerationCard` Edit panel lets a user (a) change aspect ratio and re-run, and (b) "Describe edits," which concatenates the instruction onto the original prompt and calls the same generate route via `onRegenerate` (**✅ Built** — `apps/web/features/chat/components/ImageGenerationCard.tsx`). True region-select / mask inpainting is explicitly deferred: the panel renders a disabled "Select region to edit — Coming soon" control (**🔭 Planned** — same file, `MousePointer2` block). Requirement: an edit must produce a new asset (new provenance row) rather than mutating the original; the current flow satisfies this because each re-generation is a fresh generate call. Planned work: server-side image-to-image / mask edit support keyed off catalog `imageApi` capability flags.

## Aspect Ratios

The composer exposes aspect ratios `auto | 1:1 | 3:4 | 9:16 | 4:3 | 16:9` (**✅ Built** — `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `ImageAspectRatio`), mirrored by the Edit panel's `ASPECT_OPTIONS`. Server-side, the route accepts a `size` enum and derives an aspect ratio per provider: Google maps to `1:1 / 16:9 / 9:16`; Stability maps to its nearest supported ratio (`16:9, 3:2, 5:4, 4:5, 2:3, 9:16`, etc.); OpenAI clamps to its valid sizes (**✅ Built** — `generateWithImagen`, `generateWithStability`, `generateWithOpenAIImage`). Gap: the UI selects aspect ratio while the route's public contract is `size` — the client currently sends `size`, so exotic ratios (`3:4`, `4:3`) collapse to the nearest provider ratio (**🟡 Partial** — `route.ts` schema accepts `size` only; a first-class `aspectRatio` request field is not yet wired end-to-end).

## History

Every successful generation is persisted to `media_assets` (**✅ Built** — `apps/web/db/neon/0036_media_assets.sql`) with provenance (`prompt`, `provider`, `model`, `source_surface`, `width/height`) and a durable `storage_url` written to object storage (Vercel Blob) via `storeMedia` (**✅ Built** — `apps/web/lib/server/media-storage.ts`, `apps/web/lib/server/media-assets.ts`). The Library API `GET /api/media?kind=image` lists the user's assets newest-first; `DELETE /api/media?id=…` soft-deletes (`deleted_at`) (**✅ Built** — `apps/web/app/api/media/route.ts`). Because rows are user-scoped, the same Library is readable from every cloud surface — this reuses the Neon delta-sync trust model (Managed-Cloud only; Local/BYOK rows never sync). Persistence is best-effort and non-fatal: a storage/DB failure returns the inline image rather than failing an already-billed generation, and reads degrade gracefully before migration (`isSchemaNotReady`). Requirement: a dedicated Library/gallery UI surfacing this API is **🔭 Planned** (the API and store exist; a full web gallery view is not yet documented as built).

## Moderation

Prompt/content moderation currently relies on **upstream provider safety filters** (OpenAI/Google/Stability), with AGI mapping their rejections to a friendly message: prompts flagged for `content policy`/`safety` return HTTP 422 with "flagged by our content safety filters" (**🟡 Partial** — `route.ts` error mapping). There is **no AGI-side pre-generation moderation module** (no blocklist, classifier, or age/NSFW gate before the provider call) (**🔭 Planned**). Requirements for production: add a pre-flight prompt classifier and an output-scan step, log moderation outcomes to an auditable store, and keep moderation inside the Managed-Cloud boundary. Until built, the spec must not claim AGI performs first-party moderation.

## Safety

Layered, server-side guards (**✅ Built** — `route.ts`): Clerk auth (`getClerkAuthUser`); CSRF enforcement (`requireCsrfToken`); fail-closed rate limiting `image-generation` = 10 req/min (**✅ Built** — `apps/web/lib/rate-limit.ts`); the managed-compute gate (`buildManagedComputeGateResponse`, the incident kill-switch, off by default per public-alpha canon); active-subscription check; and tier gating. Credits are reserved before the provider call and reconciled/refunded after, with idempotency keys, to prevent double-spend and abuse (**✅ Built** — `CreditService` usage in `route.ts`). Neon rows are user-scoped/RLS-aligned. **Reconciliation gaps (🟡, updated 2026-07-11):** the route's `allowedTiers` set including `'team'` is now correct — "Team" was reinstated as a real per-seat tier (2026-07-11, supersedes the 2026-06-30 "served by Enterprise" framing) and gating language should target the current ladder (Free / Basic $7·₹399 / Pro $20 / Max $100 & $200 / Team $30-seat / Enterprise); and top-up handling should be reconciled to the now-enabled, capped top-up policy rather than kept metering-only. These are tracked billing-catalog reconciliation items, not new work authorized here.

## Download

Users can download any generated image as PNG. The inline card provides Download in the result action bar, the Edit panel, and the Share modal; the full-screen `ImageLightbox` provides Download plus zoom (**✅ Built** — `ImageGenerationCard.tsx` `downloadImage`, `ImageLightbox.tsx` `handleDownload`). Mechanism: fetch the URL (or decode a `data:` URI) into a Blob, create an object URL, trigger an anchor click, then revoke the object URL. Requirements: downloads must work for both durable storage URLs and inline base64; filenames default to `ai-image-<timestamp>.png`; a fetch failure falls back to a native anchor download. Planned: format choice (WebP/JPEG) and EXIF/provenance metadata embedding are **🔭 Planned**.

## Repository map

- `apps/web/app/api/media/image/generate/route.ts` — generation endpoint (auth, CSRF, rate-limit, gate, credits, provider dispatch, persistence).
- `apps/web/app/api/media/route.ts` — Library list/soft-delete API.
- `apps/web/lib/hooks/useMediaGeneration.ts` — client generation hook + job store.
- `apps/web/features/chat/components/ImageGenerationCard.tsx` — inline generate/edit/share/download UI.
- `apps/web/features/chat/components/ImageLightbox.tsx` — full-screen viewer + download.
- `apps/web/lib/server/media-assets.ts` / `media-storage.ts` — provenance repo + object storage.
- `apps/web/db/neon/0036_media_assets.sql` — `media_assets` table + index.
- `packages/contracts/types/src/models.json` — catalog source for image model IDs and `imageApi` metadata.

## Competitor notes

ChatGPT (GPT Image) and Gemini couple generation tightly to one first-party model with built-in moderation; Claude does not generate images. AGI's deliberate divergence: **multi-provider by catalog** (Google/OpenAI/Stability selectable and swappable via `models.json` without code changes), per-surface trust (Web is cloud-only, **no BYOK/Local**, while Desktop/CLI/VS Code may use BYOK image keys where allowed), and cross-surface Library via Neon so a Web-generated image appears on Mobile/Desktop cloud. AGI avoids provider lock-in and keeps provenance (`provider`/`model`/`prompt`) on every asset.

## Acceptance / Definition of Done

Production-ready when generation, persistence, Library, and download all function under the Managed-Cloud trust boundary with catalog-driven models, and moderation is first-party (not provider-only).

- [ ] **Build:** generate → persist → list/download round-trips green; model IDs resolved only from `packages/contracts/types/src/models.json`; `aspectRatio` wired end-to-end or documented as `size`-mapped.
- [ ] **Trust:** no BYOK/Local affordance on Web; assets user-scoped; managed kill-switch honored; Local/BYOK rows never enter `media_assets`.
- [ ] **Security:** Clerk + CSRF + fail-closed rate limit verified; credit reserve/refund idempotent; `allowedTiers` reconciled to Free/Basic/Pro/Max/Enterprise (drop `'team'`); first-party moderation added; provider errors mapped without leaking keys.

## Anti-patterns

- Adding a BYOK key field or any Local generation path to Web (canon violation).
- Hardcoding an image model ID instead of reading `models.json` / `imageApi` metadata.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby", "Team") or inventing Pro/Max INR prices; reintroducing credit **top-ups**.
- Claiming first-party moderation, region-select inpainting, or a Library gallery UI as shipped without a real path (they are 🔭).
- Referencing Supabase, or renaming `proxy.ts` to `middleware.ts`.
- Syncing Local/BYOK-originated images, or mutating an original asset on edit instead of writing a new provenance row.
