# Local LLM Integration: Ollama / llama.cpp / MLX / LM Studio

Research report for AGI Workforce — six-surface AI suite, v1 = Local + BYOK only.

- **Author:** Research analyst (subagent)
- **Date compiled:** 2026-05-29
- **Scope:** Local LLM runtimes and their APIs as of May 2026 — Ollama, llama.cpp (+ `llama-cpp-2` Rust bindings), MLX / mlx-lm (Apple Silicon), LM Studio. Recommended small local chat models, context limits, GGUF/quantization, embeddings, integration patterns, pitfalls.
- **Trust note:** Version numbers, dates, and endpoint surfaces below are taken from official GitHub release pages, official docs, and crate registries where possible. Several 2026 model names and a handful of release-note bullets surfaced **only** through SEO aggregator sites and are flagged inline as **UNVERIFIED** — do not hardcode them. Per repo lock `rule-models-json-canonical.md`, model IDs must come from `packages/types/src/models.json`, never from this report.

---

## 1. Summary

Local LLM serving in May 2026 has consolidated around a small set of runtimes that all converge on the **OpenAI Chat Completions wire format** as the lingua franca. The practical landscape:

- **Ollama** — the default "it just works" local runtime. Native REST API at `:11434` (`/api/chat`, `/api/generate`, `/api/embed`) plus an OpenAI-compatible `/v1` layer. Ships structured outputs (JSON schema in `format`), tool calling, and embeddings. In 2026 Ollama added an **MLX acceleration path on Apple Silicon** (preview announced 2026-03-30) alongside its GGML/llama.cpp engine.
- **llama.cpp** — the C/C++ engine underneath much of the ecosystem. `llama-server` exposes both native endpoints (`/completion`, `/embedding`, `/reranking`, `/infill`, `/slots`) and OpenAI- **and** Anthropic-compatible endpoints (`/v1/chat/completions`, `/v1/messages`, `/v1/responses`). Released as rolling `b####` builds (b9400-range on 2026-05-29). Supports GGUF, grammar/JSON-schema constrained decoding, multimodal (experimental), speculative decoding, and parallel slots.
- **`llama-cpp-2`** (utilityai Rust crate) — the canonical safe-ish Rust binding for embedding llama.cpp **in-process**, relevant for the AGI **CLI (Rust)** and **Tauri desktop** surfaces. Latest **0.1.146** (2026-04-30). Builds bindings with `bindgen` (needs `clang`); exposes JSON-schema→grammar conversion and tool-calling grammar.
- **MLX / mlx-lm** — Apple's array framework + LLM toolkit, the fastest path on Apple Silicon. `mlx-lm` latest **0.31.3** (2026-04-22); ships `mlx_lm.server` with an OpenAI-compatible `/v1/chat/completions` (default `127.0.0.1:8080`), but the server is explicitly **not production-hardened**. Swift bindings via `mlx-swift` for native iOS/macOS on-device inference.
- **LM Studio** — GUI-first desktop app with an OpenAI-compatible server on `:1234` (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`, plus a `/v1/responses` Codex endpoint and a richer native "REST API v0"). Ships an `lms` CLI and a headless daemon for server/CI use.

**The current bar:** any serious local-first product must speak the OpenAI `/v1/chat/completions` shape, support streaming SSE, JSON-schema structured output, tool/function calling, an embeddings endpoint, and on Apple Silicon should prefer MLX where latency matters. Ollama is the de-facto baseline integration target because it owns the install base.

**Confidence:** Medium-high on runtime versions/endpoints (primary sources). Low on specific 2026 model names and a few aggregator-only release bullets (flagged).

---

## 2. Current bar (what best practice requires as of 2026-05-29)

For a local-first multi-provider app like AGI Workforce, matching the market means:

1. **OpenAI-compatible client path.** Every major runtime (Ollama `/v1`, llama-server `/v1`, mlx_lm.server `/v1`, LM Studio `/v1`) exposes `POST /v1/chat/completions`. A single OpenAI-style client with a configurable `base_url` + dummy/no API key reaches all of them. This is the lowest-friction integration and what users expect. (Ollama OpenAI compat: https://docs.ollama.com/api/openai-compatibility)
2. **Native API where it adds value.** Ollama's native `/api/chat` + `/api/embed` give model management (`/api/pull`, `/api/tags`, `/api/ps`, `keep_alive`) that the `/v1` layer does not. llama-server's `/slots`, `/props`, `/health`, `/metrics` give operational control.
3. **Streaming.** SSE token streaming is table stakes across all runtimes.
4. **Structured output.** JSON-schema-constrained generation: Ollama `format` field; llama.cpp `json_schema` / `grammar` (GBNF); LM Studio structured output. Best practice is to pass a JSON schema, not just "json mode."
5. **Tool / function calling.** Ollama `tools` param; llama.cpp via `--jinja`; LM Studio function calling. Required for agentic surfaces.
6. **Embeddings.** Local embeddings endpoint for RAG/local search (`/api/embed`, `/v1/embeddings`, llama-server `/embedding`).
7. **Apple Silicon MLX path.** On Mac, MLX is now the latency leader; even Ollama added an MLX path in 2026. A Mac-targeting product (AGI desktop on macOS, mobile via on-device) should plan for MLX, not just Metal-backed GGUF.
8. **GGUF + quantization awareness.** GGUF is the portable model container; Q4_K_M / Q5_K_M / Q8_0 are the common quant tradeoffs, with sub-4-bit (and 1.58-bit) available for tight memory.
9. **Trust-boundary hygiene.** None of these local servers authenticate on localhost by default. Binding to `0.0.0.0` (LAN) or exposing the port is a real exfiltration/abuse risk — must stay behind explicit user consent and the repo's Local trust boundary.

---

## 3. Version-specific facts (exact versions + dates)

### 3.1 Ollama

| Fact | Value | Source / date |
|---|---|---|
| Latest stable | **v0.24.0**, released **2026-05-14** | GitHub Releases API `repos/ollama/ollama/releases/latest` (raw JSON, verified 2026-05-29): https://github.com/ollama/ollama/releases/latest |
| Latest prerelease | **v0.30.0-rc31**, **2026-05-13** (`prerelease=true`) — a real release candidate, ahead of the v0.2x stable line | GitHub Releases API `repos/ollama/ollama/releases?per_page=8` (raw JSON, verified 2026-05-29) |
| v0.24.0 headline note | "Reworked the MLX sampler for improved generation quality on Apple Silicon" | Same release page |
| MLX preview announcement | **2026-03-30**: "we're previewing the fastest way to run Ollama on Apple silicon, powered by MLX, Apple's machine learning framework." | Ollama blog: https://ollama.com/blog (post dated 2026-03-30) |
| Default API host/port | `http://localhost:11434` | Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md |
| Native endpoints | `POST /api/generate`, `POST /api/chat`, `POST /api/embed`, `POST /api/embeddings` (legacy), `GET /api/tags`, `POST /api/show`, `POST /api/pull`, `GET /api/ps`, `POST /api/create` | Same |
| OpenAI-compatible endpoint | `http://localhost:11434/v1` with `POST /v1/chat/completions`; no real API key needed | https://docs.ollama.com/api/openai-compatibility |
| Structured output | `format` parameter accepts `"json"` (any valid JSON) **or** a full JSON schema (predictable structure) | https://docs.ollama.com/capabilities/structured-outputs |
| Tool calling | `tools` parameter on `/api/chat` | api.md (above) |
| keep_alive | Model stays loaded `5m` by default after a request; configurable per request | api.md (above) |

> **UNVERIFIED / likely SEO contamination:** Multiple aggregator pages attribute to recent Ollama releases a bundled "Codex App," "Claude Desktop integration," `ollama launch claude-desktop`, an `ollama launch opencode`, and an "OpenJarvis/OpenClaw" assistant. These bullets appear **only** on third-party sites (localaimaster, fazm.ai, releasebot, ollaman) and could not be confirmed on the official GitHub releases page or blog. **Treat as unconfirmed.**
>
> **CORRECTED via raw GitHub Releases API (2026-05-29):** A `v0.30.0` *does* exist, but as **`v0.30.0-rc31` (prerelease, 2026-05-13)** — a release candidate ahead of the v0.2x stable line, **not** a shipped stable that "replaced GGML." The aggregators garbled the version (dropped the `-rc31`/prerelease status) and bolted hallucinated feature bullets onto it. The verifiable engine fact is: Ollama historically used GGML/llama.cpp and **added an MLX acceleration path on Apple Silicon in 2026** (official preview 2026-03-30). The official latest-stable (v0.24.0) note only mentions the MLX sampler rework.

### 3.2 llama.cpp

| Fact | Value | Source / date |
|---|---|---|
| Release scheme | Rolling **build numbers** `b####` (no semver). On **2026-05-29** the tip was in the **b9400–b9414** range | GitHub releases (fetched 2026-05-29): https://github.com/ggml-org/llama.cpp/releases |
| Recent build examples | b9414 (2026-05-29) DeepSeek-OCR 2 / multi-tile vision; b9411 DeepSeek V3.2 + sparse attention; b9410 f16 mask for Flash Attention (VRAM saving) | Same |
| Stars / status | >109,000 GitHub stars, actively maintained | https://en.wikipedia.org/wiki/Llama.cpp (May 2026) |
| `llama-server` native endpoints | `/health`, `/completion`, `/tokenize`, `/detokenize`, `/embedding`, `/reranking`, `/props`, `/slots`, `/metrics`, `/apply-template`, `/infill` | server README: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md |
| OpenAI/Anthropic-compatible endpoints | `/v1/models`, `/v1/completions`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/responses`, and **`/v1/messages` (Anthropic-compatible)** | Same |
| Default server port | **8080** (`--port`) | Same |
| Structured output | `json_schema` parameter + `grammar` (GBNF) grammar-based sampling | Same |
| Tool calling | OpenAI-style function calling via the `--jinja` flag | Same |
| Speculative decoding | Draft-model and n-gram speculative modes | Same |
| Parallel requests | `-np / --parallel N` server slots (default auto) | Same |
| Multimodal | Experimental, available on chat/completions/embeddings endpoints | Same + https://huggingface.co/docs/hub/en/gguf-llamacpp |

### 3.3 `llama-cpp-2` (Rust bindings, utilityai)

| Fact | Value | Source / date |
|---|---|---|
| Latest version | **0.1.146**, published **2026-04-30** (verified via raw crates.io API `max_stable_version`) | crates.io API: https://crates.io/crates/llama-cpp-2 ; docs.rs: https://docs.rs/crate/llama-cpp-2/latest |
| Sys crate | `llama-cpp-sys-2 ^0.1.146` (FFI layer) | docs.rs (above) |
| Build requirement | Generates bindings via **bindgen → requires `clang`** | GitHub: https://github.com/utilityai/llama-cpp-rs |
| Features | OpenAI-compatible **tool-calling grammar** generation; **`json_schema_to_grammar`** (JSON schema → GBNF); optional `llguidance`/`toktrie` constrained-decoding | docs.rs (above) |
| Safety | Authors explicitly state the crate is **"not safe"** — undefined behavior possible; avoid where UB is unacceptable | docs.rs / repo README (above) |
| Doc coverage | ~99% documented | docs.rs (above) |

> Note: the crate uses `bindgen` and tracks llama.cpp closely but the page does **not** pin which exact llama.cpp `b####` build a given `0.1.x` maps to — verify the vendored submodule SHA at integration time.

### 3.4 MLX / mlx-lm (Apple Silicon)

| Fact | Value | Source / date |
|---|---|---|
| `mlx-lm` latest | **v0.31.3**, released **2026-04-22** | GitHub: https://github.com/ml-explore/mlx-lm |
| What it is | Python package to run + fine-tune LLMs on Apple Silicon with MLX; HF Hub integration; quantization; LoRA/full fine-tune; distributed inference; prompt caching + rotating KV cache | Same |
| OpenAI-compatible server | `mlx_lm.server` exposes `/v1/chat/completions` and `/v1/models`; default **127.0.0.1:8080** | https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md |
| Production warning | "The MLX LM server is not recommended for production as it only implements basic security checks." | SERVER.md (above) |
| Swift bindings | `mlx-swift` builds on the same core; for native on-device iOS/macOS inference | https://github.com/ml-explore/mlx-swift ; Apple WWDC25 session 298: https://developer.apple.com/videos/play/wwdc2025/298/ |
| Hardware perf (Apple) | Per Apple ML Research summary (not directly fetched): **M5 prompt processing ~3.5–4x faster than M4**; M5 time-to-first-token <10s for a dense 14B model — confirm exact figures on the source page before quoting | Apple ML Research: https://machinelearning.apple.com/research/exploring-llms-mlx-m5 |
| Quantization | 4-bit quant common (e.g. `mlx-community/...-4bit`); quantize + upload supported | mlx-lm GitHub (above) |
| Third-party OpenAI servers | `mlx-openai-server` (FastAPI, vision+text) e.g. PyPI 1.0.14 if a hardened server is needed | https://github.com/cubist38/mlx-openai-server |

### 3.5 LM Studio

| Fact | Value | Source / date |
|---|---|---|
| What it is | Free desktop app (Windows/macOS/Linux): GUI chat, HF model browser, OpenAI-compatible local server, RAG/document chat, `lms` CLI, headless daemon | https://lmstudio.ai/ ; https://lmstudio.ai/docs/developer/core/server |
| Default server port | **1234**; base URL `http://localhost:1234/v1` | https://lmstudio.ai/docs/developer/openai-compat |
| OpenAI-compatible endpoints | `POST /v1/chat/completions`, `POST /v1/completions`, `POST /v1/embeddings`, `GET /v1/models`, plus `POST /v1/responses` (Codex support) | Same |
| Native API | Richer **"REST API v0"** with extra stats / model metadata | Same |
| Structured output / tools | JSON-schema structured output **and** tool/function calling supported | Same |
| Auth | No API key on localhost; for LAN bind `0.0.0.0` and optionally set a static key | https://lmstudio.ai/docs/developer/core/server |
| Headless | Core packaged as a daemon for server/cloud/CI use, independent of the GUI | Same |

### 3.6 GGUF & quantization (current facts)

- GGUF is the portable single-file model container used by llama.cpp / Ollama / LM Studio. It supports **2-bit through 8-bit integer quant types**, plus `float32`/`float16`/`bfloat16`, and **1.58-bit** quantization. (https://huggingface.co/docs/hub/en/gguf-llamacpp, May 2026)
- Hugging Face Inference Endpoints support GGUF out of the box, and HF Hub hosts GGUF directly consumable by llama.cpp / Ollama. (Same)
- Common practical quants: **Q4_K_M** (best size/quality default), **Q5_K_M** (higher quality, more RAM), **Q8_0** (near-lossless, large), and sub-4-bit (Q2/Q3/IQ-series, 1.58-bit) for very tight memory. (Widely documented; e.g. https://www.glukhov.org/llm-hosting/llama-cpp/)

---

## 4. Recommended small local chat models (2026) — VERIFY BEFORE USE

> **Strong caveat:** Specific model names below come largely from **SEO aggregator round-ups**, which in 2026 mix real and apparently-fabricated model names (e.g., "Gemma 4 26B A4B", "Qwen 3.6", "SmolLM3-3B"). Do **not** hardcode any of these. Per `rule-models-json-canonical.md`, resolve the actual available IDs from `packages/types/src/models.json` and from the live `ollama list` / HF Hub at integration time. Treat this section as directional only.

Directional consensus from 2026 round-ups (https://localaimaster.com/blog/small-language-models-guide-2026, https://www.bentoml.com/blog/the-best-open-source-small-language-models, https://huggingface.co/blog/daya-shankar/open-source-llms):

- **3B–4B class (8GB RAM, mobile/edge):** Gemma 3 4B and the Llama 3.2 / Qwen 3 small variants are the repeatedly-cited "fits in ~4–5GB RAM" picks. Good for summarization, drafting, Q&A on-device.
- **7B–8B class (16GB, desktop/CLI default):** Qwen 3 7B/8B and Llama 3.x 8B are the cited all-rounders; Mistral 7B for speed over quality (~4GB on disk).
- **Reasoning/quality bumps:** Phi-family small models cited as benchmark-strong for their size.
- **MoE small-active models:** 2026 round-ups push small MoE models that activate a fraction of params for better quality-per-active-param (names unverified).

**Context limits:** Most current small open models advertise 32K–128K token context windows; effective usable context depends on the GGUF/quant and the runtime's KV-cache memory budget (and on Apple Silicon, unified-memory pressure). Verify per-model from the model card, not from round-ups.

**Embeddings (local RAG):** All four runtimes serve embeddings (Ollama `/api/embed`, llama-server `/embedding`, LM Studio `/v1/embeddings`, mlx-lm). Common local embedding model families are `nomic-embed`, `bge`, and `mxbai-embed` (verify availability/IDs live).

---

## 5. Known pitfalls & gotchas

1. **Aggregator hallucination of model + feature names.** The single biggest research hazard in 2026: SEO sites confidently invent model names (Gemma 4, Qwen 3.6) and product features (Ollama "Codex App," "Claude Desktop integration"). **Always confirm against official GitHub/docs and the live runtime.** This directly reinforces the repo's "never hardcode model IDs" lock.
2. **No localhost auth by default.** Ollama (`:11434`), llama-server (`:8080`), mlx_lm.server (`:8080`), LM Studio (`:1234`) all serve unauthenticated on localhost. Binding to `0.0.0.0` exposes the model to the LAN. This is a Local-trust-boundary violation risk — never auto-bind externally; require explicit consent and a visible label.
3. **mlx_lm.server is not production-hardened** ("only basic security checks" per official SERVER.md). For a shipped product, use `mlx-swift` (in-process) or a hardened FastAPI wrapper, not the bundled dev server, for any exposed surface.
4. **`llama-cpp-2` is `unsafe` and needs `clang`.** The crate authors explicitly warn it is "not safe." Building requires `clang` for `bindgen`; this affects CI and cross-compilation for the Rust CLI and Tauri sidecar. Version pinning matters — the Rust crate version does not transparently encode the llama.cpp `b####` it vendors.
5. **GGML→MLX engine split on Mac.** Ollama now has two acceleration paths on Apple Silicon (Metal/GGUF vs MLX). Output quality and sampler behavior can differ between engines (hence the v0.24.0 "reworked MLX sampler" fix). Don't assume identical output across engines/quants.
6. **OpenAI `/v1` compatibility is partial.** Ollama's `/v1` layer is "partial compatibility"; not every OpenAI param is honored, and some features (model management, `keep_alive`) live only on the native `/api/*` routes. Plan for a native-API fallback, not pure `/v1`.
7. **Tool calling has runtime-specific switches.** llama.cpp requires `--jinja` for OpenAI-style function calling; behavior and reliability of tool-call JSON vary by model + template. Constrained decoding (grammar/json_schema) is more reliable than prompting for JSON.
8. **GGUF quant tradeoffs are non-obvious.** Lower quant (Q2/Q3) saves RAM but degrades quality and tool-call reliability disproportionately; Q4_K_M is the usual floor for agentic use. Validate the specific quant, not just the model.
9. **Port collisions.** llama-server and mlx_lm.server both default to **8080**; Ollama `11434`; LM Studio `1234`. A multi-runtime host (AGI desktop launching local backends) must manage/override ports.
10. **Multimodal is experimental** in llama.cpp; vision support and stability vary build-to-build (`b####`). Don't depend on it for a release without pinning a build and testing.
11. **Rolling `b####` releases (llama.cpp) have no stability guarantees.** There's no LTS; behavior can change between builds. Pin a specific build for reproducibility.
12. **Streaming format differences.** Native Ollama streams newline-delimited JSON objects; OpenAI `/v1` streams SSE `data:` chunks. A client must handle both shapes depending on which endpoint it hits.

---

## 6. Implications & gaps for AGI Workforce

AGI is v1 Local + BYOK, six surfaces (Web Next16/React19, Desktop Tauri2, Mobile Expo55/RN, CLI Rust, Chrome MV3, VS Code), multi-provider routing, local-first privacy. Mapping the above:

### What AGI must match (the bar)
- **Ollama is the must-support baseline.** It owns the local install base. AGI should detect a running Ollama at `:11434`, enumerate models via `/api/tags`, and route local chat through `/api/chat` (native, for `keep_alive`/model mgmt) or `/v1/chat/completions` (for OpenAI-client reuse). Embeddings via `/api/embed`.
- **OpenAI-compatible adapter is the cheapest universal path.** One OpenAI-style client with configurable `base_url` reaches Ollama, llama-server, mlx_lm.server, and LM Studio. This fits a "local provider = base URL + model list" abstraction in the multi-provider router.
- **Structured output + tool calling** must be wired the runtime-specific way (Ollama `format`/`tools`, llama.cpp `json_schema`/`--jinja`, LM Studio structured output). Prefer schema/grammar-constrained decoding over prompt-only JSON for agentic reliability.

### Surface-specific notes
- **CLI (Rust):** Two viable local strategies — (a) talk HTTP to a user's Ollama/llama-server (simplest, no native build), or (b) embed llama.cpp **in-process via `llama-cpp-2` 0.1.146**. Option (b) gives zero-dependency local inference but adds a `clang`/`bindgen` build requirement and an `unsafe` surface, and needs careful version pinning of the vendored llama.cpp. Recommend HTTP-to-Ollama as the default, `llama-cpp-2` as an optional embedded backend behind a feature flag.
- **Desktop (Tauri 2):** Same choice as CLI. A Tauri sidecar running `llama-server` or `ollama serve`, or an embedded `llama-cpp-2` Rust core, are both standard patterns. On **macOS specifically, the MLX path is the latency leader** — consider an MLX backend (via `mlx-swift` or a hardened MLX server) for Apple Silicon users rather than only Metal/GGUF.
- **Mobile (Expo/RN):** On-device inference on iOS realistically means **MLX via `mlx-swift`** (native module) or a llama.cpp RN binding — not the Python `mlx-lm`/dev servers. This is the highest-effort surface; small quantized 3B–4B GGUF/MLX models are the realistic ceiling on phone RAM.
- **Web / Chrome MV3 / VS Code:** These can only reach a **local HTTP server** (Ollama `:11434`, LM Studio `:1234`, etc.) since they cannot embed native inference. CORS and localhost-permission handling matter (Ollama supports configuring allowed origins; MV3 needs host permissions). The OpenAI-compat `/v1` path is ideal here.

### Gaps / open questions to resolve in-repo
1. **Model ID resolution.** This report must NOT seed `models.json`. Confirm which local model IDs AGI actually exposes from `packages/types/src/models.json` + live `ollama list` / HF, and whether the catalog already has local-model entries. (Repo lock: `rule-models-json-canonical.md`.)
2. **Local trust boundary enforcement.** Verify AGI never auto-binds a local server to `0.0.0.0` and never silently routes Local → BYOK/cloud (per CLAUDE.md locks). The unauthenticated-localhost reality of all four runtimes makes this a security-critical check.
3. **Embedded vs HTTP decision per surface.** Decide and document whether CLI/Desktop ship `llama-cpp-2` embedded (build-cost, `clang`, `unsafe`) or rely on user-installed Ollama (simpler, but a dependency on external software).
4. **MLX adoption for Apple Silicon.** Decide whether AGI takes the MLX path on Mac/iOS (latency win, Apple-only) vs staying GGUF/Metal for cross-platform parity. Ollama itself went dual-engine in 2026 — AGI should at least track MLX.
5. **Build pinning.** If using llama.cpp directly, pin a `b####` build (no LTS) and pin the `llama-cpp-2`/`llama-cpp-sys-2` versions; record the vendored llama.cpp SHA.

---

## 7. Sources

Each: title — url — date (publication or fetch).

- Ollama Releases (latest = v0.24.0) — https://github.com/ollama/ollama/releases/latest — release dated 2026-05-14; fetched 2026-05-29
- Ollama Releases index — https://github.com/ollama/ollama/releases — fetched 2026-05-29
- Ollama Blog (MLX on Apple Silicon preview, 2026-03-30) — https://ollama.com/blog — fetched 2026-05-29
- Ollama API reference (api.md) — https://github.com/ollama/ollama/blob/main/docs/api.md — fetched 2026-05-29
- Ollama OpenAI compatibility — https://docs.ollama.com/api/openai-compatibility — fetched 2026-05-29
- Ollama Structured Outputs — https://docs.ollama.com/capabilities/structured-outputs — fetched 2026-05-29
- llama.cpp Releases (b9400-range, 2026-05-29) — https://github.com/ggml-org/llama.cpp/releases — fetched 2026-05-29
- llama.cpp server README (endpoints, json_schema, grammar, --jinja, slots) — https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md — fetched 2026-05-29
- llama.cpp (Wikipedia, >109k stars, May 2026) — https://en.wikipedia.org/wiki/Llama.cpp — fetched 2026-05-29
- GGUF usage with llama.cpp (quant types, 1.58-bit) — https://huggingface.co/docs/hub/en/gguf-llamacpp — fetched 2026-05-29
- llama-cpp-2 crate (0.1.146, 2026-04-30) — https://docs.rs/crate/llama-cpp-2/latest — fetched 2026-05-29
- llama-cpp-2 on crates.io — https://crates.io/crates/llama-cpp-2 — fetched 2026-05-29
- utilityai/llama-cpp-rs (bindgen/clang, unsafe) — https://github.com/utilityai/llama-cpp-rs — fetched 2026-05-29
- mlx-lm GitHub (v0.31.3, 2026-04-22) — https://github.com/ml-explore/mlx-lm — fetched 2026-05-29
- mlx-lm SERVER.md (mlx_lm.server, /v1/chat/completions, :8080, not for production) — https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md — fetched 2026-05-29
- Apple ML Research — Exploring LLMs with MLX and M5 GPU (M5 vs M4 perf) — https://machinelearning.apple.com/research/exploring-llms-mlx-m5 — 2026
- Apple WWDC25 session 298 — LLMs on Apple Silicon with MLX — https://developer.apple.com/videos/play/wwdc2025/298/ — 2025
- mlx-openai-server (hardened FastAPI MLX server option) — https://github.com/cubist38/mlx-openai-server — fetched 2026-05-29
- LM Studio — homepage — https://lmstudio.ai/ — fetched 2026-05-29
- LM Studio — local server docs — https://lmstudio.ai/docs/developer/core/server — fetched 2026-05-29
- LM Studio — OpenAI compatibility endpoints (:1234, /v1/*, /v1/responses) — https://lmstudio.ai/docs/developer/openai-compat — fetched 2026-05-29
- llama.cpp server quickstart (quant tradeoffs) — https://www.glukhov.org/llm-hosting/llama-cpp/ — 2026
- Small Language Models guide 2026 (DIRECTIONAL/UNVERIFIED model names) — https://localaimaster.com/blog/small-language-models-guide-2026 — 2026
- Best open-source SLMs 2026 (DIRECTIONAL/UNVERIFIED) — https://www.bentoml.com/blog/the-best-open-source-small-language-models — 2026
- Open-source LLMs 2026 (DIRECTIONAL/UNVERIFIED) — https://huggingface.co/blog/daya-shankar/open-source-llms — 2026
- Ollama goes MLX (independent corroboration of MLX shift) — https://gingter.org/2026/04/23/ollama-goes-mlx/ — 2026-04-23

---

### Confidence statement

- **High:** Runtime endpoint surfaces and default ports (Ollama, llama.cpp, mlx-lm, LM Studio) — all from official docs/READMEs.
- **High:** All five version numbers — Ollama stable **v0.24.0** (2026-05-14) + prerelease **v0.30.0-rc31** (2026-05-13); llama.cpp **b9414** (2026-05-29); `llama-cpp-2`/`llama-cpp-sys-2` **0.1.146** (2026-04-30); `mlx-lm` **v0.31.3** (2026-04-22) — **re-verified via raw GitHub Releases API and crates.io API (no model summarizer in the loop)**, after the initial WebFetch summaries were found to contain hallucinated feature bullets.
- **Medium:** Ollama MLX engine direction — official preview confirmed (2026-03-30) + sampler note in v0.24.0; v0.30.0-rc31 is a real prerelease (verified), but the aggregator claim that it "removes GGML for direct llama.cpp" is **unverified** and flagged.
- **Medium/Low:** Apple M5-vs-M4 perf figures — from a WebSearch summary of the Apple ML Research page, not a direct fetch; attributed, not stated flat.
- **Low:** Specific 2026 small-model names and benchmark rankings — aggregator-sourced, contaminated with likely-fabricated names; explicitly flagged, not for hardcoding.
