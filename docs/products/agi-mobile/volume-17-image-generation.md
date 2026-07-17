# AGI Mobile — Volume 17 — Image Generation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real surface paths this volume grounds in: `apps/mobile/src/features/image/services/imagegen.ts`, `apps/mobile/src/features/image/README.md`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/src/features/chat/components/GeneratedImage.tsx`, `apps/mobile/src/features/chat/components/ImageFullScreen.tsx`, `apps/mobile/services/contentReport.ts`, `apps/mobile/lib/contentFilter.ts`, `apps/web/app/api/media/image/generate/route.ts`, and the model catalog `packages/contracts/types/src/models.json`.

## Overview & stance

Image generation on AGI Mobile is **Managed-Cloud only**. The phone never runs a heavy diffusion model on-device: per `apps/mobile/AGENTS.md` ("Mobile should not become the heavy compute surface first"), all pixels come back from the cloud gateway. The on-device Local LLM (small, free) handles text and routing; it does **not** generate images. There is therefore **no Local image-gen mode** and — because **Mobile has no BYOK** — there is no API-key affordance anywhere in this domain. "Provider configuration" on mobile means on-device model management for the Local LLM, never image-provider keys.

Concretely, the mobile client submits a prompt to the cloud and renders the result; model selection and provider routing are owned server-side. The client deliberately **does not pin model IDs** (`imagegen.ts` header), so it can never drift from the canonical catalog in `packages/contracts/types/src/models.json`. Image-capable models in that catalog today include `imagen-4`, `imagen-4-fast`, `imagen-4-ultra`, `gpt-image-2`, `gemini-3.1-flash-image`, `ideogram-2`, and `stable-diffusion-xl` — but mobile passes at most an optional `model` override the gateway validates; it never hardcodes one. Access is gated by a real Clerk auth session plus plan tier, with `remoteChatGate` semantics failing closed when Cloud is disabled.

## Prompting

✅ Built — `apps/mobile/src/features/image/services/imagegen.ts`. `generateImage()` POSTs `{ prompt, model?, size?, quality?, style?, n? }` to `/api/media/image/generate`. The flag `FEATURES.imageGen` (`apps/mobile/lib/v1FeatureFlags.ts`, set `true` 2026-06-27) governs the entry points: the `/image` composer command and the AddToChatSheet toggle. Empty prompts are rejected client-side. Results render inline via `GeneratedImage.tsx`, which shows the image, an optional `revisedPrompt`, a load skeleton, and an error state.

Requirements: prompt entry is text-only and never auto-sends a Local chat to the cloud — invoking image gen is an explicit Cloud action. The provider/model label returned by the gateway must be visible. Free-tier users hitting the Pro+ gate must see the paywall, not a silent failure (see Moderation/gating below). Multi-provider routing (negative prompts, style/quality knobs) is server-owned; the mobile UI surfaces only the parameters the gateway accepts.

## Editing

🔭 Planned. There is **no** image-edit endpoint or client method today — `grep` for `image/edit`/`variation` returns nothing under `apps/web/app/api/media` or `apps/mobile/src/features/image`. Server-side, some providers accept a `negativePrompt` (`apps/web/app/api/media/image/generate/route.ts`), but that is generation steering, not post-hoc editing of an existing image. Mask-based edit, re-prompt-on-result, and prompt-diff editing are design intent only. When built, edits must be a fresh Cloud round-trip with the same auth + tier gate, never an on-device transform, and must preserve provenance metadata.

## Inpainting

🔭 Planned. No mask/inpaint route or UI exists in the repo. Inpainting requires a mask channel and a provider that supports it; neither the mobile client (`imagegen.ts` has no mask field) nor the cloud route accepts a mask today. Design intent: region-select on a generated or uploaded image, mask upload alongside the prompt, cloud-only execution. This must not be the first heavy local image-processing path on mobile — masking compositing also stays cloud-backed.

## Aspect ratios

🟡 Partial — `apps/mobile/src/features/image/services/imagegen.ts`. The request type accepts a fixed `size` enum: `256x256`, `512x512`, `1024x1024`, `1792x1024` (landscape), `1024x1792` (portrait). The transport supports these ratios; the gap is that the mobile picker UI does not yet expose all five as first-class controls, and the gateway clamps unsupported sizes per provider. Requirement: the aspect-ratio control must map only to sizes the selected provider supports, and must default to a square `1024x1024` when unspecified. Never invent ratios the catalog/provider cannot honor.

## History

🟡 Partial — `apps/mobile/src/features/image/services/imagegen.ts`. The client exposes `listGeneratedImages(conversationId)` (returns `[]` on failure) and `getImageStatus(id)` for progress polling. The **gap**: the web app currently ships only `apps/web/app/api/media/image/generate/route.ts` — there is no `/api/media/image/list` or `/api/media/image/status/:id` route, so history and progress polling resolve empty/unavailable until those endpoints land. In practice, generated images persist as chat attachments within the conversation thread and ride normal Managed-Cloud delta-sync (Web↔Mobile↔Desktop) for cloud chats only; Local chats keep their images local. A dedicated gallery view is 🔭 Planned.

## Download

🔭 Planned (save-to-Photos). Sharing exists (next section), but there is **no** save-to-camera-roll path for generated images: `grep` finds `expo-media-library`/`saveToLibrary` only in the permissions registry, not wired to image-gen output. Design intent: a "Save to Photos" action gated on the media-library permission (already modeled in `apps/mobile/src/features/settings/permissions/registry.ts`), writing the returned URL or `b64_json` (`getGeneratedImageUri()` already resolves both) to the device library. Until built, do not claim a download/save capability in UI copy.

## Sharing

✅ Built — `apps/mobile/src/features/chat/components/GeneratedImage.tsx` and `apps/mobile/src/features/chat/components/ImageFullScreen.tsx`. Long-press on an inline generated image triggers the OS share sheet via React Native `Share.share`, with the platform split already handled (iOS uses the `url` field; Android falls back to `message` because it ignores `url`). Haptic feedback fires on long-press. Requirement: share must surface the image URL/asset, never raw provider keys (none exist on mobile) or internal gateway tokens, and must respect the same content-report affordance below.

## Moderation — safety systems

🟡 Partial. Three real layers exist:

1. **Plan/tier gate** — `apps/web/app/api/media/image/generate/route.ts` returns HTTP 403 `plan_upgrade_required` for tiers below Pro (`required_plans: ['pro','max','enterprise']`); the mobile client maps this to `ApiPaywallError` → `PaywallBottomSheet`. Note: this server code reconciliation predates the 2026-06-30 ladder — pricing presented to the user must follow canon (Free $0; Basic $8/₹399; Pro $20; Max $100 & $200; Enterprise custom). No credit top-ups.
2. **Minor-safe prompt filter** — `apps/mobile/lib/contentFilter.ts` blocks adult/harmful prompts client-side (no network) when minor mode is active (EU AI Act Art. 5(1)(b)). The refusal copy is legally fixed.
3. **In-app content report** — `apps/mobile/services/contentReport.ts` lets users flag harmful/inaccurate AI-generated content (Google Play GenAI policy), stored locally with an optional support-email queue.

Gap: server-side image moderation (NSFW/abuse classification on output) is provider-dependent and not independently verified in-repo — treat AGI-side output moderation as 🔭 Planned and label accordingly.

## Repository map

- `apps/mobile/src/features/image/services/imagegen.ts` — cloud image-gen client (generate, status, list).
- `apps/mobile/src/features/image/{components,services,README.md}` — image-with-question UI, OCR, vision routing.
- `apps/mobile/src/features/chat/components/GeneratedImage.tsx`, `ImageFullScreen.tsx` — inline render + share.
- `apps/mobile/lib/v1FeatureFlags.ts` — `imageGen` master switch.
- `apps/mobile/lib/contentFilter.ts`, `apps/mobile/services/contentReport.ts` — minor-safe filter + flagging.
- `apps/web/app/api/media/image/generate/route.ts` — Managed-Cloud generation + tier gate (cross-surface owner).
- `packages/contracts/types/src/models.json` — canonical image model catalog (image IDs live here only).

## Competitor notes

ChatGPT mobile bundles image gen behind its own model and ties it to one provider; Claude mobile does not offer first-party image generation. AGI's deliberate divergence: **multi-provider** routing (Google Imagen, OpenAI GPT Image, Stability, Ideogram, Gemini image) chosen server-side from one catalog, so the surface is never locked to a single vendor; **per-surface trust** (image gen is Cloud-only on mobile, Local stays text-only); and **no BYOK on mobile** — unlike desktop competitors, the phone never holds image-provider keys. Heavy generation deliberately lives on the host/cloud, keeping the phone a thin, fast client.

## Acceptance / Definition of Done

Production-ready when: image gen runs only through the authenticated Managed-Cloud path; the client pins no model IDs; aspect-ratio and provider choices are catalog/provider-validated; the Pro+ paywall renders from server responses (no silent failure); the minor-safe filter and content-report paths are reachable from every image surface; and Local chats are never auto-promoted to the cloud to generate.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` green; `/image` and AddToChatSheet entry points behind `FEATURES.imageGen`.
- [ ] Trust: no BYOK/key UI anywhere in the image domain; provider/model label visible; Local→Cloud is explicit, never silent; `remoteChatGate` fails closed when Cloud is off.
- [ ] Security/safety: 403 `plan_upgrade_required` → paywall (canon tiers); minor-safe filter active in minor mode; content-report reachable; no provider keys/tokens leaked via share or logs.

## Anti-patterns

- Adding any BYOK or API-key field to mobile image gen — forbidden on this surface, forever.
- Auto-sending a Local chat to the cloud to make an image; image gen is an explicit Cloud action.
- Hardcoding a model ID in the client; read only from `packages/contracts/types/src/models.json` via the gateway.
- Claiming Editing, Inpainting, save-to-Photos, a gallery, or AGI output moderation as shipped — they are 🔭/🟡; never fake an unbuilt capability in UI copy.
- Running heavy diffusion/inpaint compositing on-device.
- Presenting removed tiers (Plus/Hobby/pro_plus) or inventing Pro/Max INR prices.
- Referencing Supabase — the stack is Clerk + Neon + Stripe.
