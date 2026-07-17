# AGI Runtime — Volume 13 — Local Model Runtime

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, plus the real repo paths enumerated in the Repository map below.

## Overview & stance

This volume specifies how the internal AGI Runtime layer discovers, registers, downloads, updates, and executes **on-device / local-runtime models**. It is shared code the surfaces compile in, not a user surface.

Every path here is the **Local** trust mode (`local_only`): compute stays on the user's machine, no provider key leaves the box, and rows never enter Neon delta-sync. Two shapes of "local":

- **Server-backed (Desktop / CLI / VS Code):** Ollama and LM Studio expose localhost HTTP servers; the Runtime talks to them as Local providers.
- **On-device (Mobile):** the app links native engines (ExecuTorch, `llama.rn`) and runs GGUF/PTE weights in-process. Mobile is **Local + Cloud only — no BYOK** (`apps/mobile/AGENTS.md`).

Web and Chrome run **no local inference** and hold no keys; out of scope here.

Hard rule: a Local model is never silently promoted to BYOK or Managed Cloud. Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). A daemon's models are host-dynamic and are **not** `packages/contracts/types/src/models.json` catalog entries — so the SSOT model-ID rule requires no invented IDs here; installed IDs are whatever the daemon or on-device catalog reports.

## Ollama Integration

Requirement: discover, list, pull, delete, and stream from a local Ollama daemon as a Local provider, with a graceful "not running" state.

- 🟡 Partial — `packages/ai/providers/ollama/src/index.ts`: `ProviderAdapter` id `ollama`, default base URL `http://localhost:11434`, no vendor SDK, optional bearer via `OLLAMA_API_KEY` (reverse-proxied hosts only). Config: `baseUrl`, `forceContextWindow`, `keepAliveSeconds`.
- 🟡 Partial — `packages/ai/providers/ollama/src/catalog.ts`: dynamic catalog from `/api/tags`; on an unreachable daemon it returns an empty list (never throws) so the UI renders a "configure Ollama" state. Context windows are heuristic per family; overridable via request options.
- 🟡 Partial — `apps/desktop/src-tauri/src/sys/commands/ollama.rs` + typed wrappers in `packages/client/desktop-command-client/src/ollama.ts`: `ollama_check_status`, `ollama_list_models`, `ollama_get_model_info`, `ollama_pull_model`, `ollama_delete_model`. Inference streams over `/api/chat` via `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`. **Gap:** `ollama_pull_model` only _initiates_ the pull; no progress-streaming command exists yet.

## LM Studio Integration

Requirement: treat LM Studio's local OpenAI-compatible server as a Local provider with a per-host dynamic catalog. A model shown in the picker must correspond to one currently loaded in LM Studio; unloading it must drop it from the next catalog refresh.

- ✅ Built — `packages/ai/providers/lmstudio/src/index.ts`: `ProviderAdapter` id `lmstudio`, default base URL `http://localhost:1234/v1`, optional `LMSTUDIO_API_KEY`. `catalog()` queries `/v1/models` on every call (no curated list) and returns an empty list if the server is down. Translation/streaming reuse `@agiworkforce/providers-openai`; the compat detector classifies the endpoint as `endpointClass: 'local'`, keeping it on the Local boundary rather than a cloud OpenAI path.

## llama.cpp Integration

Requirement: run GGUF weights directly in-process where no external daemon exists (Mobile).

- 🟡 Partial — `packages/platform/local-llm/src/tier3.ts`: Tier-3 universal fallback via `llama.rn` (llama.cpp React Native bindings), iOS 15+ / Android 10+. Loads a GGUF `modelPath`, sets `n_ctx` (clamped to a mobile ceiling), streams tokens, enforces a shared stop-word set. Dynamic `require('llama.rn')` keeps it tree-shakeable; a test override injects a mock. Tier selection and thermal guarding live in `packages/platform/local-llm/src/selector.ts`. **Gap:** in-process llama.cpp is mobile-only today.
- 🔭 Planned — a **standalone desktop llama.cpp server adapter** independent of Ollama/LM Studio. None exists in `packages/ai/providers/`; desktop llama.cpp is reached only indirectly through Ollama.

## Model Registry — register installed models

Requirement: a durable, host-local registry of installed models (runtime, format, size, checksum, last-used) plus the curatable on-device ship-catalog.

- ✅ Built (Mobile) — `apps/mobile/storage/installedModels.ts`: the `installed_models` table (SQLCipher-encrypted) records `runtime` (`local` | `cloud`), `format` (`gguf` | `safetensors` | `mlx` | `onnx` | `pte`), size, checksum, and `last_used_at`. Rows are validated on read; unknown runtime/format throws.
- ✅ Built (on-device catalog) — `packages/platform/local-llm/src/catalog.ts` + `packages/contracts/types/src/on-device-models.ts`: the `OnDeviceModel` shape (id, family, param count, context window, capabilities, license, `shipsInV1`, optional ExecuTorch preset / `downloadUrl` / `checksum`). These engine model IDs are referenced from that file, not re-listed here (they drift with `react-native-executorch`).
- 🟡 Partial (server-backed) — for Ollama and LM Studio the "registry" is the **live daemon**, not a stored table: `/api/tags` and `/v1/models` are the per-host source of truth. No persisted desktop registry reconciles daemon inventory with the on-device catalog.
- 🔭 Planned — a unified cross-runtime registry view and cross-surface presence of installed models (`surface_heartbeats` table does not exist).

## Model Downloads

Requirement: resumable, integrity-checked, network-aware downloads that write a registry row only on verified success.

- ✅ Built (Mobile) — `apps/mobile/services/modelDownload.ts`: downloads into `models/<modelId>/`, resumes via HTTP Range on network drop, verifies SHA-256 (`@noble/hashes`) against the catalog checksum before committing, and is **Wi-Fi-only by default** (`@react-native-community/netinfo`) since weights are 1–10 GB+. Typed errors: `wifi_required`, `checksum_mismatch`, `storage_full`, `network_error`, `cancelled`, `already_installed`. Success calls `insertInstalledModel`. Storage management (list, delete, byte totals) is in `apps/mobile/app/(app)/settings/storage.tsx`.

- 🟡 Partial (Desktop / Ollama) — `ollama_pull_model` triggers a background pull but returns no progress; there is no percentage UX and no AGI-side checksum verification (Ollama owns integrity).
- Requirement (testable): a checksum mismatch deletes the partial file and surfaces `checksum_mismatch`; an interrupted download resumes rather than restarting. Any CLI local-pull command uses the `agi` binary, never `agiworkforce <cmd>`.

## Model Updates

Requirement: detect that an installed model has a newer upstream version and update it deliberately, never silently.

- 🔭 Planned — no update/version-diff path exists today. `apps/mobile/services/modelDownload.ts` and `packages/platform/local-llm/` have no `checkForUpdate` / outdated-detection; `apps/desktop/src-tauri/src/sys/commands/ollama.rs` has no update command. The only current "update" is re-pulling in Ollama or re-downloading a new catalog entry.
- 🔭 Planned target: compare installed checksum/digest against the catalog (or Ollama `digest`), show an explicit "update available" affordance, download and verify the new artifact, then atomically swap and update the registry row — retaining the old file until the new one is verified. Updates respect the same Wi-Fi-only and trust rules as first downloads and never auto-apply.

## Repository map

- `packages/ai/providers/ollama/` — Ollama Local adapter, `/api/tags` catalog, stream/translate.
- `packages/ai/providers/lmstudio/` — LM Studio OpenAI-compatible Local adapter.
- `packages/platform/local-llm/` — on-device tier selection (`selector.ts`), `llama.rn` (`tier3.ts`), ExecuTorch, `catalog.ts`, capabilities.
- `packages/contracts/types/src/on-device-models.ts` — `OnDeviceModel` type and runtime enum.
- `packages/client/desktop-command-client/src/ollama.ts` — typed wrappers for `ollama_*` Tauri commands.
- `apps/desktop/src-tauri/src/sys/commands/ollama.rs` — status/list/info/pull/delete commands.
- `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` — `OllamaProvider` inference (`/api/chat`).
- `apps/mobile/services/modelDownload.ts` — resumable, checksum-verified downloads.
- `apps/mobile/storage/installedModels.ts` — `installed_models` registry table.
- `apps/mobile/app/(app)/settings/storage.tsx` — storage management UI.

## Competitor notes

Claude has no first-party local runtime; ChatGPT desktop is cloud-only; Codex leans on hosted or gpt-oss weights. AGI's divergence: **local-first and multi-provider**. We run whatever the user already has — Ollama, LM Studio, or in-process GGUF via `llama.rn`/ExecuTorch — with dynamic host catalogs instead of a fixed vendor list, keeping local models on the Local boundary (Desktop/CLI/VS Code may additionally use BYOK; Mobile stays Local + Cloud). No markup, no forced cloud round-trip, no key required.

## Acceptance / Definition of Done

Production-ready gate: local models install with verified integrity, run on the Local boundary with no key or cloud dependency, list accurately from the live host/registry, degrade gracefully when a daemon is absent, and never leak into BYOK/Cloud or Neon sync.

- [ ] **Build:** Ollama and LM Studio catalogs render live host inventory and an actionable empty state when the daemon is down; mobile download resumes on drop and verifies SHA-256 before writing an `installed_models` row.
- [ ] **Trust:** local inference makes zero outbound calls beyond the configured localhost/on-device engine; no Local model ID, chat, or file is synced or auto-forwarded to BYOK/Cloud; any handoff is an explicit, redacted fork.
- [ ] **Security:** checksum mismatch deletes the partial file and surfaces `checksum_mismatch`; registry rows reject unknown runtime/format; downloads stay in the app sandbox; no Supabase, no invented routes/env vars.

## Anti-patterns

- Silently routing a Local (Ollama/LM Studio/on-device) chat to BYOK or Managed Cloud, or syncing local rows to Neon.
- Offering BYOK or provider keys on **Mobile** (Local + Cloud only) or on Web/Chrome.
- Hardcoding or inventing local model IDs into `packages/contracts/types/src/models.json`; local IDs are host-dynamic and belong to the daemon or `on-device-models.ts` catalog.
- Committing an `installed_models` row before checksum verification, or auto-applying updates without consent.
- Claiming a monolithic local "runtime daemon" ships today, or claiming desktop standalone llama.cpp / model-update detection as built.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or citing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups. Pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise; Local + BYOK are free access modes.
