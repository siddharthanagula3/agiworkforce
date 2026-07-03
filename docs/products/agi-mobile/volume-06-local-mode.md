# AGI Mobile — Volume 06 — Local Mode

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/mobile/src/features/model-picker/{service.ts,localModelRuntime.ts,installStore.ts}`, `apps/mobile/services/{modelDownload.ts,llmGate.ts,remoteChatGate.ts}`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/storage/{db.ts,migrations.ts,memory.ts,conversations.ts,installedModels.ts}`, `apps/mobile/stores/settings/localSettingsStore.ts`, `apps/mobile/src/features/projects/store.ts`, `apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts`, `packages/local-llm/src/catalog.ts`.

## Overview & stance

Local Mode is AGI Mobile's on-device trust boundary: a small LLM runs on the phone, and conversations, memory, projects, files, and settings stay on the device unless the user runs an explicit, reviewed transfer. Mobile exposes exactly two trust modes — Local (free, on-device) and Managed Cloud (public alpha, signed-in). **Mobile has no BYOK**, and this volume must never introduce one: `byokKeys` is `false` in `apps/mobile/lib/v1FeatureFlags.ts`, `remoteChatGate.ts` deliberately ignores it (`void flags.byokKeys`), and `apps/mobile/AGENTS.md` states the surface "does not expose direct provider-key entry." On mobile, "Provider Configuration" means on-device model management, not API keys.

The hard rule (founder, 2026-06-14, encoded in `localCloudSyncService.ts`): Local is always fully local, Cloud is always fully cloud, and there is **zero** automatic background crossing. Local never auto-routes off the device, and `remoteChatGate.ts` fails closed when Cloud is disabled.

## Local Architecture — independent on-device workspace

Local Mode is a self-contained workspace: an on-device model runtime, an encrypted store, and per-mode state that does not depend on network or sign-in.

- ✅ Built — Model resolution and runtime selection live in `apps/mobile/src/features/model-picker/localModelRuntime.ts` (`resolveLocalModelRef`) over the catalog in `packages/local-llm/src/catalog.ts`. The capabilities probe (`getCapabilities`) selects a system runtime (`apple-foundation-models`, `aicore`) or a downloadable ExecuTorch/`llama-rn`/`litert-lm` model.
- ✅ Built — Local LLM requests bypass the cloud LLM gate entirely; `apps/mobile/services/llmGate.ts` documents that "Local-LLM requests … should never reach this path."
- 🔭 Planned — Heavy on-device compute (PDF/PPTX/DOCX rendering, image generation) is out of scope for the local surface; per `apps/mobile/AGENTS.md`, mobile must not become the first heavy-compute surface, and image generation is cloud-backed.

## Local Conversations

- ✅ Built — Local threads persist to the SQLCipher-encrypted database via `apps/mobile/storage/conversations.ts` and `apps/mobile/storage/messages.ts` (tables defined in `apps/mobile/storage/migrations.ts`). They are addressable, searchable, and editable offline with no account.
- Requirement: a Local conversation must never carry a cloud thread id or be written to a Neon delta-sync queue. Mode is determined per conversation (`executionModeForConversation`), and Local threads stay out of `services/cloudSyncEngine.ts`.

## Local Projects

- ✅ Built — Local projects (name, description, instructions, attached source files) persist to MMKV in `apps/mobile/src/features/projects/store.ts`, explicitly "LOCAL mode only — cloud projects live in `cloudProjectStore`." Source file URIs reference on-device files only.
- Requirement: switching app mode must swap which project store is read; a Local project's instructions/sources must never be sent to the cloud project API without the explicit migration path below.

## Local Memory

- ✅ Built — On-device memory facts are stored in `memory_facts` / `memory_facts_v3` with local embeddings in `memory_vectors` (see `apps/mobile/storage/memory.ts`, `migrations.ts`); retrieval uses `searchMemoryByEmbedding` / `searchMemoryByText`. Pinning, edit, and delete are local operations.
- Requirement: Local memory facts are device-local data the user has not consented to send. They are **excluded** from the one-time cloud transfer (confirmed in `localCloudSyncService.ts`).

## Local Storage

- ✅ Built — All structured local data lives in a SQLCipher database (`apps/mobile/storage/db.ts`) whose 256-bit key is generated with `expo-crypto` and held in `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Tables include conversations, messages, memory, installed models, custom instructions, settings, telemetry queue, and doc chunks.
- ✅ Built — Model files download to the app documents directory under `models/<id>/`; downloads are HTTPS-only and SHA-256 verified (`apps/mobile/services/modelDownload.ts`), and a usage estimate is exposed via `getModelStorageBytes`.
- Requirement: no plaintext user content outside the encrypted DB; model binaries are integrity-checked before being recorded in `installed_models`.

## Provider Configuration — ON-DEVICE model management (NOT BYOK)

This screen manages which on-device models are installed and active. It is **not** an API-key screen and must never become one.

- ✅ Built — The local catalog (`packages/local-llm/src/catalog.ts`) ships real on-device model ids such as `qwen3-4b-instruct-2507` (default, "AGI Standard"), `llama-3.2-1b-instruct-spinquant` ("AGI Lite"), `qwen2.5-vl-3b-instruct`, plus system runtimes `apple-foundation-models` and `gemini-nano-aicore`. The picker (`apps/mobile/src/features/model-picker/service.ts`) shows On-device vs AGI Cloud rows and never fetches `/api/models`. Model ids come only from the catalog/`packages/types/src/models.json` — never hardcode or invent one.
- ✅ Built — Install/download lifecycle (resumable, Wi-Fi-aware, cancellable) is handled by `services/modelDownload.ts` + `src/features/model-picker/installStore.ts`; records land in `apps/mobile/storage/installedModels.ts`.
- 🟡 Partial — Per-model environment gating exists as a stub: `service.ts` `environmentAvailability()` returns `{ configured: false }` (Phase A); the real local-runtime readiness probe is Phase B and not yet wired.

## Synchronization Rules — local/cloud separation

- ✅ Built — Local Mode never auto-syncs and never auto-sends. `apps/mobile/services/remoteChatGate.ts` returns a disabled reason when `cloudChat` is off and **fails closed** (`RemoteChatDisabledError`); the message reaffirms "Local Mode stays on this device."
- ✅ Built — Cloud chat data sync (Neon delta-sync, Web↔Mobile↔Desktop) applies only to Managed-Cloud threads; `crossDeviceSync` is currently `false` in `v1FeatureFlags.ts`. Settings are per-mode and the Local settings store (`stores/settings/localSettingsStore.ts`) is documented as "Never synced to the cloud."
- Requirement: no code path may promote a Local thread/memory/project to a cloud queue implicitly. Settings sync, when it ships, is allowlist-gated and lands last.

## Migration — explicit reviewed switch between modes

- ✅ Built — The single authorized Local→Cloud crossing is `apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts`, invoked only from the Data Controls screen (`data-controls/index.tsx`) after explicit consent. It is one-time, additive, non-destructive (local copies remain), and bounded (≤50 conversations, ≤100 messages each). It copies conversation titles + message text only; **attachments and on-device memory facts are stripped** (`sanitiseMessageForCloud`).
- 🔭 Planned — Cloud→Local import and a full reviewed export bundle (`localDataSnapshot.ts` is the current local-only snapshot primitive) are design intent, not a shipped two-way migration.
- Requirement: every crossing must show a payload preview and require consent; there is no silent or background variant.

## Repository map

- `apps/mobile/src/features/model-picker/` — local + gated-cloud catalog, runtime resolution, install store, tier guard.
- `apps/mobile/services/{modelDownload.ts,llmGate.ts,remoteChatGate.ts}` — model download, cloud LLM gate, fail-closed remote gate.
- `apps/mobile/storage/{db.ts,migrations.ts,conversations.ts,messages.ts,memory.ts,installedModels.ts}` — SQLCipher local store.
- `apps/mobile/stores/{projects,memory,settings}/` and `apps/mobile/src/features/projects/store.ts` — per-mode local/cloud state.
- `apps/mobile/src/features/settings/data-controls/` — the explicit Local→Cloud transfer.
- `apps/mobile/lib/v1FeatureFlags.ts` — single source of truth for which modes/features are live.
- `packages/local-llm/` — shared on-device model catalog, capabilities, selector.

## Competitor notes

ChatGPT and Claude mobile apps are cloud-only: no on-device model, no offline conversation store, and provider keys never exposed to the user. AGI Mobile diverges deliberately — it ships a real small on-device LLM (free Local Mode) with an encrypted local store, so chat works with no account and no network. Unlike Desktop/CLI/VS Code, mobile keeps the **no-BYOK** rule: power users who want their own keys use a desktop surface. Per-surface trust (Local + Managed Cloud only, with a real auth gate for Cloud) is the divergence, not multi-key entry on the phone.

## Acceptance / Definition of Done

Local Mode is production-ready when an account-less, offline device can install a catalog model, chat, build memory and a project, and never emit a network request — and when the only Local→Cloud path is the consented, previewed transfer.

- [ ] Build: a fresh install with no sign-in resolves a default on-device model, completes a download (resume + SHA-256 verified), and chats offline.
- [ ] Trust: with `cloudChat` off, `remoteChatGate` fails closed; no Local thread/memory/project reaches any sync queue; `localSettingsStore` stays unsynced.
- [ ] Security: SQLCipher key is generated locally and stored device-only; migration strips attachments + memory facts and runs only after explicit consent.

## Anti-patterns

- Adding any BYOK / API-key affordance to mobile, or wiring `byokKeys` into a live path.
- Auto-sending or background-syncing Local chats, memory, projects, or files to Cloud.
- Letting `remoteChatGate` "fail open" when Cloud is disabled.
- Faking unsupported capability (heavy on-device PDF/PPTX/DOCX/image-gen) instead of marking 🔭 and delegating to Desktop/cloud.
- Hardcoding or inventing model ids instead of reading the catalog / `packages/types/src/models.json`.
- Inventing INR prices or non-canon tiers (Plus/Hobby/pro_plus), or referencing Supabase (stack is Clerk + Neon + Stripe).
