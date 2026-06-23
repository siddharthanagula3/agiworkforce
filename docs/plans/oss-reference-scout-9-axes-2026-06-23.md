# OSS Reference Scout — 9 Architecture Axes (Merged + Live-Verified)

_Generated 2026-06-23. Stack target: Rust CLI + TS web/extensions + Expo mobile + Tauri desktop; Neon Postgres + Clerk; raw-HTTP provider calls; SSOT models JSON._

> **Provenance & method.** This merges three inputs: (a) a deep-research harness run (search/fetch succeeded; its verify stage was 100% rate-limited, so disregard its "all refuted" verdict), and (b) two narrative "Tri-State Trust" reports that surfaced additional repos. **Every star count / license / version below was re-checked by me directly against the GitHub & crates.io APIs on 2026-06-23.** The narrative reports' own metrics were systematically unreliable (e.g. Portkey listed as "★104+" is actually ★12.2k; LibreChat "★9+" is ★39.7k) — trust their _architecture analysis_, not their numbers. Specific in-code claims (exact filenames, "143 providers", bug-issue details) come from those reports' citations and are flagged **[unverified-code]** where I did not open the file myself.

---

## 1. Executive summary

- **Well-covered by OSS (borrow heavily):** Axis 1 (routing), Axis 3 (local models — now incl. **mobile** via llama.rn), Axis 5 (sync), Axis 8 (agent/MCP). Mature, permissive references exist.
- **Partially covered (port patterns, not whole code):** Axis 4 (BYOK), Axis 6 (shared UI/monorepo), Axis 7 (per-surface refs).
- **Build-from-scratch cost centers (both narrative reports + the harness independently converge here):**
  - **Axis 2** — managed AI _subscription_ + entitlement + fair-use/abuse ledger. Metering (OpenMeter) and gateways (Portkey/LiteLLM/Bifrost) exist, but **nothing fuses token-metering → entitlement check → real-time request severing → Stripe.** Highest build cost.
  - **Axis 9** — Local→Cloud trust-partition enforcement. Scanners (LLM-Guard) exist but are Python-bound and only do content scanning; **no OSS enforces a hard trust boundary.** Your differentiator.
- **Recurring caveat:** the best routing references (Portkey, LibreChat, Continue) are **server-side middlewares**; your zero-markup BYOK mode needs them **unbundled into a client-side raw-HTTP layer** — a real rewrite, not a drop-in.

---

## 2. Per-axis tables — all metrics live-verified 2026-06-23

### Axis 1 — Multi-provider LLM routing/abstraction

| Repo                                                              | Lang   | License                                         | Live (★ / last push)     | What to reuse                                                                                                                                  | Value    | Caveats                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------ | ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Portkey-AI/gateway](https://github.com/Portkey-AI/gateway)       | TS     | MIT                                             | **★12,161 / 2026-05-25** | `src/providers/*`, stream error-normalization (e.g. Anthropic `overloaded_error`→529→backoff), auth-header selection (API key vs OAuth bearer) | **High** | Hono server middleware — **must unbundle to a client raw-HTTP layer for BYOK**; sanitize the URL-construction (SSRF issues reported in Azure/Vertex paths) **[unverified-code]** |
| [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) | TS     | MIT                                             | **★39,656 / 2026-06-23** | Custom-endpoint config payload model (OpenRouter/Ollama)                                                                                       | **Low**  | Tightly coupled to MongoDB + monolithic UI; routing engine hard to extract                                                                                                       |
| [continuedev/continue](https://github.com/continuedev/continue)   | TS     | Apache-2.0                                      | **★34,279 / 2026-06-23** | `core/llm/llms/*`, context-provider plugin abstraction                                                                                         | **Med**  | Heavy Node dynamic imports — awkward in browser/Tauri webview                                                                                                                    |
| [maximhq/bifrost](https://github.com/maximhq/bifrost)             | Go     | Apache-2.0                                      | **★5,968 / 2026-06-23**  | Gateway adapter/fallback/unified-schema design                                                                                                 | **High** | Go — study design, don't link                                                                                                                                                    |
| [graniet/llm](https://github.com/graniet/llm) (RLLM)              | Rust   | MIT                                             | **★357 / 2026-06-06**    | Idiomatic Rust "one trait → many backends" w/ streaming+tool+retry                                                                             | **High** | Young; pattern donor for the Rust CLI                                                                                                                                            |
| [BerriAI/litellm](https://github.com/BerriAI/litellm)             | Python | **Other** (MIT core + commercial `/enterprise`) | **★51,180 / 2026-06-23** | Provider param-mapping + error→exception tables (MIT core only)                                                                                | **High** | **`/enterprise` is NOT MIT**; Python                                                                                                                                             |
| Vercel AI SDK (`streamText`)                                      | TS     | Apache-2.0                                      | (docs)                   | `model:` provider-prefix abstraction; `fullStream`/`TextStreamPart` typed events                                                               | **High** | TS surfaces                                                                                                                                                                      |

### Axis 2 — Managed multi-model subscription backend — **SCARCE**

| Repo                                                               | Lang      | License      | Live (★ / last push)     | What to reuse                                                                       | Value    | Caveats                                                                                                                                             |
| ------------------------------------------------------------------ | --------- | ------------ | ------------------------ | ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [openmeterio/openmeter](https://github.com/openmeterio/openmeter)  | Go        | Apache-2.0   | **★2,069 / 2026-06-22**  | CloudEvents ingestion, SUM/COUNT/AVG aggregation, Stripe billing sync, entitlements | **High** | No LLM-token awareness; batching/buffering adds ~1s latency at 10–20 RPS/node **[unverified-code]**; you build the token→subject bridge + hard caps |
| [getlago/lago](https://github.com/getlago/lago)                    | Ruby/Rust | **AGPL-3.0** | **★10,078 / 2026-06-19** | Usage-billing + ledger data model                                                   | **Med**  | **AGPL** — run as separate service over API, never embed                                                                                            |
| _(abuse/fraud/fair-use caps + entitlement-gated request severing)_ | —         | —            | —                        | **No OSS reference**                                                                | **—**    | **Build-from-scratch. §4 Gap 1.**                                                                                                                   |

### Axis 3 — Local-model integration

| Repo                                                                | Lang    | License                                    | Live (★ / last push)     | What to reuse                                                                   | Value                  | Caveats                                                                                                                                                             |
| ------------------------------------------------------------------- | ------- | ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mybigday/llama.rn](https://github.com/mybigday/llama.rn)           | C++/TS  | MIT                                        | **★981 / 2026-06-13**    | RN binding of llama.cpp: prebuilt iOS `.xcframework` + Android JNI, JSI bridge  | **High (Mobile)**      | **Fills the mobile gap.** Implement dynamic `n_ctx` RAM-sizing (read total RAM, ~55% usable − weights, ~500 B/token KV) to avoid OS OOM-kills **[unverified-code]** |
| [pepperoni21/ollama-rs](https://github.com/pepperoni21/ollama-rs)   | Rust    | MIT                                        | **★1,038 / 2026-06-22**  | Ollama client: list/pull/create/copy/delete, capability detection               | **High (CLI/Desktop)** | Ollama-only                                                                                                                                                         |
| [janhq/jan](https://github.com/janhq/jan)                           | TS+Rust | **Other** (Apache-family — verify LICENSE) | **★43,139 / 2026-06-23** | GGUF download from HF, llama.cpp runner, unified local+remote provider registry | **High (Desktop)**     | Confirm license before lifting code; download lifecycle is brittle (model not auto-selected; extension-dir hang) **[unverified-code]**                              |
| [Pavelevich/llm-checker](https://github.com/Pavelevich/llm-checker) | TS      | **NOASSERTION**                            | **★2,704 / 2026-06-22**  | Hardware-detection heuristics, model-capability registry                        | **Med**                | Unclassified license — verify; CLI-focused                                                                                                                          |
| [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio) | TS      | **AGPL-3.0**                               | **★47,682 / 2026-06-23** | Ollama + LM Studio UX patterns                                                  | **Low**                | **AGPL** — read only                                                                                                                                                |

### Axis 4 — BYOK key management

| Repo                                                                                               | Lang    | License        | Live (★ / last push or version)            | What to reuse                                                        | Value              | Caveats                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------- | -------------- | ------------------------------------------ | -------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tauri-plugin-stronghold** ([plugins-workspace](https://github.com/tauri-apps/plugins-workspace)) | Rust/TS | MIT/Apache-2.0 | **crate v2.3.1 STABLE** (workspace ★1,761) | Argon2id-derived encryption, IOTA Stronghold encrypted-at-rest vault | **High (Desktop)** | ⚠️ **Report's "alpha 2.0.0-alpha.6" is WRONG — it shipped stable 2.3.1.** Needs a user password to derive the key; watch historical Linux high-CPU issue |
| [n4ze3m/page-assist](https://github.com/n4ze3m/page-assist)                                        | TS      | MIT            | **★8,013 / 2026-06-22**                    | MV3 `chrome.storage` persistence + service-worker fetch              | **Med (Ext)**      | MV3 storage is sandboxed, **not** cryptographically sealed vs local extraction; call from the **service worker**, never inject keys into DOM             |
| [ChatGPTNextWeb/NextChat](https://github.com/ChatGPTNextWeb/NextChat)                              | TS      | MIT            | **★88,289 / 2026-05-15**                   | BYOK toggles to hide/disallow user keys; direct-to-provider calls    | **Med**            | Web-centric                                                                                                                                              |

> No single ref spans Tauri+Expo+MV3 secure storage. Compose: **stronghold/keyring** (desktop/CLI) + **Expo SecureStore** (mobile) + **`chrome.storage`** (extension).

### Axis 5 — Cross-surface sync engine

| Repo                                                                   | Lang      | License          | Live (★ / last push)                       | What to reuse                                                                        | Value              | Caveats                                                                                                     |
| ---------------------------------------------------------------------- | --------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| [powersync-service](https://github.com/powersync-ja/powersync-service) | TS/Rust   | **FSL-1.1-ALv2** | **★356 / 2026-06-22**                      | Neon Postgres WAL logical replication → Buckets/Sync-Streams → diff stream           | **High (Backend)** | **FSL** — source-available, no DBaaS-competitor repackaging for 2 yrs, then Apache. Fine for internal state |
| [powersync-js](https://github.com/powersync-ja/powersync-js)           | TS        | Apache-2.0       | active                                     | `packages/react-native`, `packages/web` (OPFS multi-tab SQLite), client sync streams | **High (Client)**  | Tauri uses the JS SDK today (Rust-native in progress); limited SSR                                          |
| [electric-sql/electric](https://github.com/electric-sql/electric)      | Elixir/TS | Apache-2.0       | **★10,240 / 2026-06-22**                   | Shape-based partial-replication **read path**                                        | **Med**            | Read-path only — you own write/conflict                                                                     |
| [vlcn-io/cr-sqlite](https://github.com/vlcn-io/cr-sqlite)              | Rust/C    | MIT              | **★3,734 / push 2024-10-25 (STALE ~20mo)** | CRDT merge (`crsql_as_crr`, `crsql_changes`)                                         | **Med**            | **Maintenance stalled** — concept donor, not a live dep                                                     |

### Axis 6 — Shared UI / monorepo

| Repo                                                                  | Lang | License               | Live (★ / last push)  | What to reuse                                                                     | Value   | Caveats                                                                                                                                                   |
| --------------------------------------------------------------------- | ---- | --------------------- | --------------------- | --------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [metaideas/init](https://github.com/metaideas/init)                   | TS   | **NONE (no license)** | **★14 / 2026-03-20**  | Turborepo layout linking Next.js+Expo+Tauri+WXT(MV3)                              | **Med** | ⚠️ **Report says MIT — FALSE. No LICENSE = all-rights-reserved; you cannot legally fork it.** Study structure only. Bleeding-edge deps (React 19/Expo 55) |
| [EvanBacon/chat-template](https://github.com/EvanBacon/chat-template) | TS   | **NONE (no license)** | **★284 / 2026-06-19** | `expo-glass-effect` styling, `@legendapp/list` virtualized chat, adaptive layouts | **Med** | ⚠️ **Report says MIT — FALSE. No license.** Study, don't lift. Expo-Router-coupled                                                                        |

> This axis is mostly **architecture, not a dependency** — aligns with your existing shared-`packages/` mandate.

### Axis 7 — Per-surface references

| Repo                                                                                                                                                           | Surface                    | License           | Live (★ / last push)     | What to reuse                                                                  | Value    | Caveats                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------- | ------------------------ | ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [microsoft/vscode-extension-samples](https://github.com/microsoft/vscode-extension-samples) (`chat-sample`)                                                    | **VS Code**                | MIT               | **★10,098 / 2026-06-02** | Canonical `@participant` chat API + `chat-extension-utils`                     | **High** | Official MIT — lift directly                                                                                                                    |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) (`react-native` pkg)                                                                              | **Mobile**                 | MIT               | **★10,745 / 2026-06-23** | `useChatRuntime`, drawer thread mgmt, keyboard handling                        | **High** | Generative-UI leans server-side — adapt for local                                                                                               |
| [mybigday/llama.rn](https://github.com/mybigday/llama.rn) + [janhq/jan](https://github.com/janhq/jan) / [NextChat](https://github.com/ChatGPTNextWeb/NextChat) | **Mobile / Tauri desktop** | MIT / Other / MIT | active                   | On-device inference (mobile); Tauri AI-app shells                              | **High** | see Axis 3/4                                                                                                                                    |
| [fortunto2/rust-code](https://github.com/fortunto2/rust-code)                                                                                                  | **CLI**                    | MIT               | **★26 / 2026-05-16**     | Ratatui+crossterm TUI, tokio async agent loop, nucleo fuzzy search, tmux tasks | **Med**  | Tiny project — pattern donor; you already have codex/opencode on hand                                                                           |
| [ratatui/awesome-ratatui](https://github.com/ratatui/awesome-ratatui)                                                                                          | **CLI**                    | (list)            | active                   | Index of Ratatui agent/TUI apps                                                | **Med**  | It's an index                                                                                                                                   |
| ~~team-forge-ai/openchat~~                                                                                                                                     | Desktop                    | —                 | **404 — NOT FOUND**      | —                                                                              | **—**    | ⚠️ Report's Tauri+MCP analog **returns 404**; treat all its specific claims (SQLite IPC, `<think>` extraction, MLC binding) as **unverifiable** |

### Axis 8 — Agent loop + tool orchestration + MCP

| Repo                                                      | Lang | License    | Live (★ / last push)      | What to reuse                                                      | Value    | Caveats                                                                                                                                                                        |
| --------------------------------------------------------- | ---- | ---------- | ------------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [cline/cline](https://github.com/cline/cline)             | TS   | Apache-2.0 | **★63,689 / 2026-06-23**  | `src/services/mcp/McpHub.ts`, Focus-Chain compaction, tool sandbox | **High** | Reported bugs to patch on port: MCP defaults to legacy SSE if `type` omitted; hardcoded 5s `tools/list` timeout; OAuth state-clear on mid-session expiry **[unverified-code]** |
| [openai/codex](https://github.com/openai/codex)           | Rust | Apache-2.0 | **★92,842 / 2026-06-23**  | (on-hand) Rust agent loop, sandbox, MCP                            | **High** | already on-hand                                                                                                                                                                |
| Vercel AI SDK                                             | TS   | Apache-2.0 | active                    | `stopWhen`/`prepareStep`/`steps` multi-step loop                   | **High** | TS surfaces                                                                                                                                                                    |
| [gemini-cli](https://github.com/google-gemini/gemini-cli) | TS   | Apache-2.0 | **★105,501 / 2026-06-23** | (on-hand) tool orchestration/MCP                                   | **High** | already on-hand                                                                                                                                                                |

### Axis 9 — Trust-boundary / privacy enforcement — **SCARCE**

| Repo                                                          | Lang   | License | Live (★ / last push)         | What to reuse                                                                                | Value                       | Caveats                                                                                                                                        |
| ------------------------------------------------------------- | ------ | ------- | ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [protectai/llm-guard](https://github.com/protectai/llm-guard) | Python | MIT     | **★3,097 / push 2025-12-15** | 15 input / 20 output scanners; PII anonymize→deanonymize vault pattern; heuristic regex sets | **Low direct / High logic** | **Python** — needs a sidecar (anti-pattern on desktop/mobile); ~3.3% false-positive rate reported. **Port the deterministic rules to Rust/TS** |
| _(Local→Cloud data-leak partition enforcement)_               | —      | —       | —                            | **No OSS reference**                                                                         | **—**                       | **Build-from-scratch. §4 Gap 2.** You already have `guardedFetch` + fail-closed egress in-repo                                                 |

---

## 3. Top 10 — study these first (merged, ranked)

1. **powersync-service / powersync-js** — bucket partitioning + Neon WAL replication → offline-first cross-surface sync. _(FSL backend / Apache client)_
2. **Portkey-AI/gateway** — unbundle routing + stream error-normalization into a client raw-HTTP BYOK layer. _(MIT, ★12.2k)_
3. **cline/cline** — `McpHub.ts` MCP sandbox + Focus-Chain compaction (patch the SSE/timeout/OAuth bugs). _(Apache-2.0)_
4. **mybigday/llama.rn** — mobile GGUF on-device + dynamic `n_ctx` RAM-sizing. _(MIT)_
5. **openmeterio/openmeter** — CloudEvents → meters → Stripe ledger for Axis 2. _(Apache-2.0)_
6. **tauri-plugin-stronghold (stable 2.3.1)** — Argon2id encrypted-at-rest BYOK vault on desktop. _(MIT/Apache)_
7. **microsoft/vscode-extension-samples `chat-sample`** — lift the `@participant` API directly. _(MIT)_
8. **pepperoni21/ollama-rs** — drop-in Rust local-model lifecycle for CLI/desktop. _(MIT)_
9. **assistant-ui (react-native)** — mobile chat runtime/threads/keyboard. _(MIT)_
10. **protectai/llm-guard** — mine PII/heuristic rules to seed a native Rust/TS Axis-9 layer (don't run the Python). _(MIT)_

> **Study-only (cannot fork — no license):** metaideas/init, EvanBacon/chat-template. **Read-only (AGPL):** Cherry Studio, Lago.

---

## 4. Gap list — real cost centers

- **Gap 1 — Integrated entitlement + abuse ledger (Axis 2):** no OSS fuses an LLM gateway (Portkey) with metering (OpenMeter) + Stripe to **validate token spend against entitlements and sever abusive requests pre-upstream in real time.** Bespoke low-latency middleware.
- **Gap 2 — Edge trust-boundary enforcement (Axis 9):** zero-leakage tooling is Python-only and scan-only; **no OSS enforces a Local/BYOK/Cloud partition.** Build native, deterministic-rule-first.
- **Gap 3 — Client-side raw-HTTP provider abstraction (Axis 1, BYOK):** every strong router (Portkey/LibreChat/Continue) is server-side. Running one as a browser/Tauri **client** fetch layer without CORS issues or dependency bloat is a fundamental rewrite.
- **Cross-surface secure-keystore abstraction (Axis 4):** no ref spans all three storage models — compose per surface.
- **Chrome MV3 AI extension:** no standout novel reference — rely on your own + page-assist's storage pattern.

---

## 5. Closest full-product analogs (≥3 axes)

- **janhq/jan** — Axis 1+3+4+7 (Tauri, local C++ inference, BYOK, REST). **Diverges:** monolithic, no mobile, no managed-cloud tier, no cross-surface sync, brittle download lifecycle.
- **metaideas/init** — Axis 6+7 structural (Next.js+Tauri+Expo+MV3 monorepo). **Diverges:** zero AI/LLM/inference; **and no license, so not forkable.**
- **NextChat** — Axis 1+4+7. **Diverges:** no local models, no metering/subscription, no sync.
- **LiteLLM** — Axis 1 + Axis-2-adjacent (proxy budgets/keys). **Diverges:** Python (off-stack), budgets live in the **commercial** tier, no client surfaces.

> **None** combines trust-partition (9) + managed subscription (2) + multi-surface sync (5). That triad is your unique build.

---

## 6. Suggested borrow plan (ordered)

1. **Monorepo:** model the workspace on **metaideas/init**'s Turborepo layout — but **re-implement** it (no-license), don't fork. (`apps/{web,mobile,desktop,cli}` + `packages/shared-ui`.)
2. **Sync:** Neon + **powersync-service** (WAL→buckets) + **powersync-js** across web/desktop/mobile (OPFS + native SQLite).
3. **UI:** re-implement chat layouts/virtualized lists/glass styling from **chat-template** + **assistant-ui** into `packages/shared-ui` (chat-template no-license → reference only).
4. **Routing:** port **Portkey** `src/providers/*` + stream normalization (and **LiteLLM** MIT param tables) into a **client-side raw-HTTP TS lib** for BYOK; keep a Portkey/Bifrost-style gateway for managed cloud.
5. **Local inference:** **llama.rn** on Expo (dynamic `n_ctx`); **ollama-rs** + llama.cpp bindings on Rust desktop/CLI.
6. **Agent/MCP:** port **cline** `McpHub.ts` + Focus-Chain into a shared TS package; explicitly fix SSE-default/5s-timeout/OAuth-state bugs; align tool-call events with the Rust side.
7. **BYOK storage:** **stronghold 2.3.1** (desktop) + Expo SecureStore (mobile) + service-worker `chrome.storage` (ext, per page-assist).
8. **Billing/entitlements:** **OpenMeter** ledger + Stripe; **build** the token→entitlement→sever middleware (Gap 1).
9. **Privacy:** port **llm-guard** deterministic rules to native Rust/TS at the Local→BYOK fork gate; keep partition enforcement bespoke (Gap 2).

---

## 7. Confidence + verification notes

- **Live-verified by me (GitHub/crates.io API, 2026-06-23):** every ★, license SPDX, last-push, and stronghold's stable version in §2. High confidence.
- **Corrections forced on the narrative reports:**
  - **tauri-plugin-stronghold is stable 2.3.1**, not "alpha 2.0.0-alpha.6."
  - **metaideas/init** and **EvanBacon/chat-template** have **NO license** (reports claimed MIT) → study-only, not forkable.
  - **team-forge-ai/openchat 404s** → all claims about it unverifiable.
  - **NextChat = MIT**, **cr-sqlite is stale** (2024-10-25).
  - Narrative star counts were off by 10–4000× — re-verify any metric before relying on it.
- **Licenses GitHub flags "Other" (NOT auto-classified — read LICENSE before copying code):** `janhq/jan`, `BerriAI/litellm` (MIT core + commercial `/enterprise`), `powersync-service` (FSL), `Pavelevich/llm-checker` (NOASSERTION).
- **[unverified-code] claims** (rest on the reports' cited issues/files, not my own file reads): Portkey's `RealTimeLLMEventParser`/SSRF specifics; OpenMeter's ~1s batching latency; llama.rn's exact RAM formula; Jan's download-lifecycle bugs; cline's SSE-default/5s-timeout/OAuth-state issues. Sources are primary GitHub issues/repos — confirm before committing engineering time.
- **The harness's adversarial-verify stage did not run** (100% HTTP 429). Its "0 confirmed / 25 killed" is a process failure, not a finding — disregarded.
- **Axes 2 & 9 "no OSS reference"** is absence-of-evidence across both reports + 5 harness angles — strong signal, not proof, but consistent across all three sources.
