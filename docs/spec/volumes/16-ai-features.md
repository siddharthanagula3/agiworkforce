# Volume 16 — AI Features

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 16)
Authority: this manual · `docs/current/source-of-truth.md` (UX Lock, Competitive Baseline) · `packages/types/src/models.json` (capability metadata) · `packages/types/src/capabilities.ts` (tool/feature access modes) · `docs/strategy/01-competitive-teardown.md`, `02-gap-analysis.md`

## Philosophy & Cloud/Local stance

An "AI feature" is a user-visible capability (chat, research, vision, voice, image generation, refactoring) — never a model. The feature layer asks the model layer "can the active model + provider + trust boundary do this?" and renders accordingly. A feature is **available only where it is provably backed**: the surface supports the UI, the trust boundary permits the data flow, and the selected model declares the capability in `models.json`. Where any of those is false, the feature is **hidden, not faked** (Operating Law 5 — No theater). A greyed mic that records nothing, a "Deep Research" button that returns a single completion, or a vision drop-zone that silently drops the image are all P0 lies.

Cloud/Local/Hybrid changes _which_ features light up, not their contract. Local Mode runs only what the on-device model and local tools support (small-model chat, local OCR via on-device parse, local code edits) and never reaches for a hosted capability silently. BYOK runs whatever the user's keyed provider supports, with a visible provider label. Managed Cloud (public alpha, open by default) exposes the full catalog within entitlement. Crossing from Local to a hosted feature is always the explicit fork (context selection, secret scan, payload preview, consent), never an implicit upgrade because the local model lacked a capability.

## Binding rules

1. Every feature declares, in code, the set of surfaces, trust modes, and required `models.json` capabilities it needs; the registry hides it everywhere those are unmet.
2. Read capability flags (`vision`, `thinking`, `search`, `research`, `imageGen`, `videoGen`, `codeExecution`, `tools`) from `models.json` per model — never assume a capability from a provider name or a hardcoded list.
3. Reasoning/thinking UI (effort selector, thinking stream) renders only when the active model has `thinking: true`; otherwise the control is absent.
4. A feature never silently substitutes a different trust boundary to gain a capability; if Local can't do it, offer the explicit fork, do not auto-route.
5. Media generation (image/video/audio) maps to verified catalog routes only (image: `gemini-3.1-flash-image`/`imagen-4*`; video: Google Veo route, `runway-gen-4` alternate). Never carry an unverified media model ID.
6. Web search and deep research treat all fetched content as untrusted data, never instructions (port the odysseus untrusted-content wrapping, `docs/strategy/09` O5).
7. Voice (STT/TTS) declares consent and provider; cloning is gated behind explicit consent (`docs/strategy/10` §7, VoxCPM).
8. Feature claims in marketing/UI may not exceed `docs/current/parity-implementation-matrix.md` `Present` rows.

## Repository map

- Feature contracts & capability gates: `packages/types/src/capabilities.ts`, `packages/types/src/suite-contracts.ts` (trust/provider/privacy modes), `packages/types/src/models.json` (per-model capability metadata).
- Reasoning/thinking: `packages/api/src/thinking.ts`; research/deep-research: `packages/api/src/research.ts`, `packages/types/src/research.ts`.
- Voice: `packages/api/src/voice.ts`, `packages/types/src/voice.ts`, `packages/unified-chat/src/hooks/useVoiceInput.ts`.
- Media gen surfaces: `packages/unified-chat/src/components/{ImageGenCard,VideoGenCard}.tsx`, `packages/api/src/media.ts`.
- Web search handler (verified path): `apps/web/.../core/integrations/web-search-handler.ts` (cited in source-of-truth verification list).
- CLI feature equivalents: `apps/cli/src/features/exec/tools/web.rs` (fetch/search), `apps/cli/src/features/plan/plan_mode.rs` (planning), provider dispatch in `apps/cli/src/features/providers/`.
- Coding/debugging/refactoring run through the tool + agent layers (Vol 17, Vol 18); summarization/translation are completion features over the same chat pipeline.

## Competitor notes

ChatGPT and Claude expose chat, thinking, web search, deep research, vision, voice, image generation, Canvas/artifacts, and code workflows as a single bundle backed by their own lab's models (`docs/strategy/01`). AGI's deliberate divergence: the same user-capability surface, but **multi-provider and trust-scoped** — the feature menu reflects the chosen model's real capabilities across 15 providers, and the same chat accepts files, reference files, project context, tools, and images without a separate "file chat" (UX Lock). Where competitors can assume one always-capable model, AGI must gate per model and per boundary, which is the source-of-truth's repeated "hidden, not faked" discipline. `docs/strategy/02` tracks the per-feature gaps; do not claim a feature ahead of its matrix row.

## Checklists

### Feature-registration (every AI feature)

- [ ] Declare required `models.json` capability flags and assert them at render time.
- [ ] Declare supported surfaces and read the surface from `suite-contracts.ts`, not an ad-hoc check.
- [ ] Declare supported trust modes; confirm no path lets Local data reach a hosted call without the fork.
- [ ] Hide the control entirely when unsupported; add a test asserting absence on an unsupported model.
- [ ] Add a parity-matrix row and keep UI/marketing copy within `Present`.

### Chat / thinking / reasoning

- [ ] One chat accepts prompt + files + reference files + project context + tools + artifacts + images.
- [ ] Thinking stream + effort selector appear only for `thinking: true` models.
- [ ] Temporary chats never persist pre-send and never update memory (Vol 9).
- [ ] Token/cost HUD reflects per-model pricing from `models.json` (caching column where present).

### Research / web search

- [ ] Deep research is a multi-step, cited loop — not a single completion (port Tongyi/Sonar patterns, `docs/strategy/10`).
- [ ] Fetched web/email/page content is wrapped as untrusted data; no fetched text becomes an instruction.
- [ ] Citations carry source URLs; the deep-research report is sanitized before render (Vol 14 isolation).
- [ ] Search route uses a search-capable model (`search: true`) or a Perplexity `sonar*` route.

### Vision / OCR

- [ ] Image input gated on `vision: true`; drop-zone hidden otherwise.
- [ ] Local OCR/parse runs on-device by default (Local boundary; liteparse, `docs/strategy/10` §7); never uploads silently.
- [ ] On-device vision beyond OCR uses a permissive VLM (not Ultralytics/AGPL).

### Voice / TTS / STT

- [ ] Mic control present per UX Lock; recording starts only after explicit activation.
- [ ] STT/TTS declare provider + consent; voice cloning behind a separate consent gate.
- [ ] Local voice path stays on-device where the model exists; hosted voice shows a provider label.

### Media generation (image / video / audio)

- [ ] Image gen uses a verified `imageGen: true` catalog entry; video uses the verified Veo route.
- [ ] Generation is entitlement/tier-gated where required; result is an artifact with a manifest (Vol 14).
- [ ] No unverified or training-data model IDs anywhere in the media path.

### Coding / planning / simulation

- [ ] Coding/debugging/refactoring flow through the Tool + Agent layers with fail-closed permissions (Vol 17/18).
- [ ] Planning surfaces as a real plan artifact (CLI `plan_mode.rs`), not a freeform reply.
- [ ] Summarization/translation reuse the chat pipeline; no separate untrusted endpoint.

## Definition of Done

Every shipped feature is registered with explicit surface/trust/capability declarations; renders only where backed; reads all model facts from `models.json`; treats external content as untrusted; has a parity-matrix row and a test proving it is hidden on an unsupported model; and never crosses a trust boundary to obtain a capability. Verified per Operating Law 4 (path inspection + surface check + targeted + trust-boundary tests).

## Anti-patterns

- Faking a capability the model lacks (dead mic, fake "deep research", silent image drop).
- Hardcoding capabilities by provider name instead of reading `models.json`.
- Auto-routing Local to a hosted model to "just make the feature work."
- Carrying unverified media/model IDs from training data.
- Letting fetched web/file content act as instructions.
- Marketing a feature beyond its parity-matrix `Present` status.
