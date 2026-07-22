# Founder Work — things the coding agent needs from you

Running ledger of items only the **founder** can provide: API keys / credentials,
external-account setup, product decisions, and documentation. The agent appends
here whenever it hits something it cannot do itself (per your instruction:
"if you need any documentation ask me; if I don't answer, note it here").

Convention: `[ ]` open · `[x]` done · **KEY** = secret/cred · **DOC** = documentation · **DECIDE** = product decision.

Last updated: 2026-07-22.

---

## Standing directives (captured 2026-07-22)

- **Open-weight-first + no single-model dependency.** Every model must have **fallbacks**; never hard-depend on one provider/model.
- **Build ONCE, reuse in ALL apps (ponytail reuse-first).** This applies to the **full capability surface** — not just web search: LLM chat/streaming, tool calling + loop, reasoning, vision, web search, speech/TTS, image gen, video gen, music, file management, MCP/connectors, and the provider fallback+idempotency layer. Build in shared packages (`packages/ai/*`, `packages/tools/*`) that web + desktop + mobile + cli + extensions reuse; do NOT reimplement per app. (Rust surfaces — desktop-local, cli — can't import TS; note where they must call the shared cloud API vs need a parallel impl.)
- **Web search:** do **NOT** route all web search through Perplexity. Prefer each provider's **own native web-search** (Anthropic/OpenAI/Google native; Qwen/Kimi/MiniMax where available); use **firecrawl / context7 / curl / web search** to fetch latest models + content. Perplexity = one generic fallback only.
- **Qwen router migration:** move off **MuleRouter** → **Alibaba Cloud Model Studio / DashScope** as PRIMARY (OpenAI-compatible, pinned dated snapshots), keep **MuleRouter as FALLBACK**. Env-driven base URL / key / model so switching needs no code rewrite; idempotency keys on fallback calls so a timeout never double-executes.

---

## KEY — API keys / credentials needed (agent cannot create these)

- [ ] **DASHSCOPE_API_KEY / real Qwen-direct key** — ⚠️ **CRITICAL FINDING:** the Qwen adapter's _code default_ is already DashScope compat (`dashscope.aliyuncs.com/compatible-mode/v1`), BUT `.env.local` currently overrides it: `QWEN_BASE_URL="https://api.mulerouter.ai"` + `QWEN_API_KEY="sk-mr-…"` (an `sk-mr-` prefix = a **MuleRouter** key, which will NOT authenticate against DashScope). To make DashScope primary: **(1)** remove/repoint `QWEN_BASE_URL` (unset → falls back to the DashScope default, or set `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`), **(2)** set `QWEN_API_KEY` (or the new `DASHSCOPE_API_KEY` alias) to a **real DashScope key**, in `.env.local` AND Vercel prod. Until then Qwen runs on MuleRouter.
- [ ] **QWEN_FALLBACK_BASE_URL + fallback key** — for the new adapter-level MuleRouter fallback (agent is building the code): set `QWEN_FALLBACK_BASE_URL="https://api.mulerouter.ai"` and keep the existing MuleRouter `sk-mr-` key available so Qwen fails over DashScope→MuleRouter on an availability error. (If the fallback should use a different key than primary, tell me — current design assumes same `QWEN_API_KEY` unless you want a separate `QWEN_FALLBACK_API_KEY`.)
- [ ] **MINIMAX_API_KEY** — MiniMax (M3 / M2.7 / speech / video / image / music). Base URL: `https://api.minimax.io/v1` (OpenAI- **and** Anthropic-compatible). Pay-as-you-go key (separate from Token-Plan Subscription Key).
- [ ] **MOONSHOT_API_KEY** — Kimi K3 (Moonshot). Base URL: `https://api.moonshot.ai/v1` (OpenAI-compatible). K3 unlocks after a ≥$1 top-up.
- [ ] **MULEROUTER_API_KEY** — keep the existing MuleRouter key as the Qwen **fallback** (do not remove).
- [ ] **FIRECRAWL / CONTEXT7** — confirm these are available to the running app for "get latest content/docs" (both are connected as MCP in the agent session; confirm production wiring / keys if the app itself should call them).
- [ ] Confirm whether **PERPLEXITY_API_KEY** stays (as the generic web-search _fallback_ only). Currently absent from `.env.local`.

## DECIDE — product decisions

- [x] Qwen: DashScope primary + MuleRouter fallback (per your 2026-07-22 recommendation). Preview (`qwen3.8-max-preview` via Qwen Cloud Token Plan) = evaluate-only, do not route production traffic yet.
- [ ] Which exact Qwen snapshots to pin for production (e.g. a dated `qwen3.7-max` snapshot vs the floating alias)? Default plan: pin the newest **documented pay-as-you-go** snapshot, expose the model id as an env var.
- [ ] Per-model **fallback chains** — confirm the intended order, e.g. Qwen: DashScope→MuleRouter; Kimi: Moonshot-direct→(MuleRouter?); MiniMax: MiniMax-direct→(MuleRouter?). Agent will propose defaults; you confirm.

## Provider-native web-search — per-provider integration notes (founder docs 2026-07-22)

For the "don't route all web search through Perplexity" work — how each provider does native web search:

- **Anthropic / OpenAI / Google** — native web search already wired (`appendWebSearchTool`).
- **Kimi (Moonshot)** — native `$web_search` **builtin_function** (`{type:"builtin_function", function:{name:"$web_search"}}`, base `https://api.moonshot.ai/v1`): model generates the search args, Kimi executes server-side, caller just echoes `arguments` back as the tool result. ⚠️ **Moonshot flags web_search as "being updated, NOT recommended near-term"** → keep Kimi on the **generic backend** for now; wire `$web_search` when stabilized. Kimi also has Formula **official tools** (`moonshot/{web-search,fetch,code_runner,excel,memory,date,quickjs,...}:latest` via `/formulas/{uri}/tools` + `/fibers`) — a future source for fetch/code-exec.
- **MiniMax** — native `web_search` + `understand_image` via **Token Plan MCP** (`uvx minimax-coding-plan-mcp`, Subscription Key) — see the MiniMax item below.
- **Qwen (DashScope)** — declares native web-search but currently unwired (falls to generic); exact request shape still needed (DOC below).
- **Generic backend** (for providers without wired native search): currently Perplexity-only, hardcoded in `apps/web/lib/web-search/web-search-tool.ts` — make pluggable + add **firecrawl** (one file). DECIDE: firecrawl vs Perplexity as the default generic backend.

## DOC — documentation received (2026-07-22, thanks)

- MiniMax: API overview (LLM M3/M2.x, T2A speech, video Hailuo-2.3, image-01, music-3.0, file mgmt, official MCP), rate limits, error codes, file upload/list/retrieve OpenAPI. Base `https://api.minimax.io`.
- Kimi K3 (Moonshot): quickstart, thinking (`reasoning_effort` low/high/max), tool calls + loop, dynamic tool loading (K3-only), streaming SSE, vision, JSON mode, partial mode, context caching. Base `https://api.moonshot.ai/v1`.
  - **VERIFIED 2026-07-21 (firecrawl)**: `kimi-k3` catalog entry is accurate — ctx 1,048,576 · input $3 / cache-hit $0.3 · output $15 · web-search fee $0 · multimodal (vision ✓). No catalog change needed.
  - **Adapter checklist (verify when touching the `moonshot` adapter):** K3 must send `reasoning_effort` at the **top level** (NOT the K2.x `thinking` object — that errors on K3); must **omit `temperature`/`top_p`/`n`** (fixed on K3); `max_completion_tokens` default 131072, up to 1048576; multi-turn/tool-loop must echo back the full assistant message incl. `reasoning_content` + `tool_calls`.
- Qwen: DashScope-vs-MuleRouter recommendation + pricing + snapshot guidance.

## DOC — still needed (agent will append as it hits gaps)

- [ ] Qwen **DashScope** OpenAI-compatible chat + **native web-search / tools** exact request shape (the agent has the routing recommendation but not the DashScope tool/web-search API surface). Will fetch via context7/firecrawl if reachable; else needs the DashScope tool-calling + web-search doc.
- [x] MiniMax **native web-search + image understanding** — RESOLVED (founder docs 2026-07-22): MiniMax exposes a first-party **`web_search`** tool AND an **`understand_image`** tool (JPEG/PNG/GIF/WebP ≤20MB) via its **Token Plan MCP** (`uvx minimax-coding-plan-mcp -y`, env `MINIMAX_API_HOST=https://api.minimax.io`). Two access modes to distinguish: **(a) pay-as-you-go `MINIMAX_API_KEY`** for the chat LLM adapter (the workflow is building this), **(b) Token Plan Subscription Key** (needs a Token Plan seat/Credits) for the MCP `web_search`/`understand_image` tools. Implications: MiniMax is a **native web-search source** (feeds the provider-native-web-search work — an alternative/addition to Perplexity + firecrawl); and MiniMax has image understanding (via the `understand_image` tool), though whether `MiniMax-M3` accepts **inline** image input in the OpenAI-compatible chat API is still unconfirmed — the workflow set `minimax-m3` `vision:false` conservatively; revisit if inline chat vision is confirmed.
- [ ] Qwen **DashScope** OpenAI-compatible **native web-search / tools** exact request shape (still needed; fetch via context7/firecrawl if reachable).

---

## Built this session (2026-07-22) — code done, only env remains

- **Qwen resilience: DashScope-primary → MuleRouter-fallback.** DONE + verified (typecheck + 9 tests).
  - `packages/ai/providers/qwen/src/index.ts` — new `fallbackEndpoints` (ordered, pre-first-byte-only retry with a `yielded` guard so a mid-stream failure never duplicates content; per-endpoint apiKey since DashScope/MuleRouter keys differ; same-host fallback dropped). Reusable primitive — lives in the shared adapter so **web + mobile + extension + vscode all get it** via `providers/factory`.
  - `apps/web/lib/services/provider-adapter-service.ts` — `DASHSCOPE_API_KEY` alias for the primary key + reads `QWEN_FALLBACK_BASE_URL` (+ optional `QWEN_FALLBACK_API_KEY`), SSRF-validated.
  - **To activate (FOUNDER, env only):** set `QWEN_API_KEY` (or `DASHSCOPE_API_KEY`) = real DashScope key; **unset/repoint** `QWEN_BASE_URL` off MuleRouter; set `QWEN_FALLBACK_BASE_URL=https://api.mulerouter.ai` + `QWEN_FALLBACK_API_KEY=<the sk-mr key>`. In `.env.local` + Vercel prod.

## Reuse map — build-once-reuse-all (from full-capability audit)

Two worlds: **4 TS surfaces** (web, mobile, extension, vscode) reuse `packages/ai/*` + `packages/tools/*` (thin surfaces also POST the web API for cloud); **2 Rust surfaces** (desktop-local, cli) can't import TS — they share only `agiworkforce-sandbox-policy` and fork the rest (`DESKTOP-CLI-HARNESS-FRAGMENTATION-01`, founder-gated).

Already SHARED-TS (reused by all 4): LLM chat/streaming (`providers/*`+`provider-runtime`+`factory`), reasoning (`provider-protocol`), vision, **web search** (`packages/ai/search`), **MCP/tools** (`packages/tools/mcp`), file-edit (`apply-patch`).

Remaining reuse work (ranked):

1. **Provider fallback for all models** — DONE for Qwen (the primitive); generalize the same `fallbackEndpoints` shape to Kimi/Moonshot + MiniMax when a 2nd endpoint exists (YAGNI until then). Smallest seam = `packages/ai/providers` + `provider-runtime`.
2. **MiniMax provider (GREENFIELD)** — phantom in the union, no adapter/harness/model. Add `packages/ai/providers/minimax/` adapter + harness + `models.curation.json` entry (MiniMax-M3, `MiniMax-M2.7`…) + Rust enum mirror. Base `https://api.minimax.io/v1` (OpenAI/Anthropic-compat).
3. **Media/speech/music adapters (GREENFIELD)** — speech (MiniMax T2A, sarvam), image (MiniMax image-01, qwen-image), video (Hailuo-2.3), music (music-3.0) are NOT shared (web `api/media/*` inlines Runway/Veo; desktop/mobile fork). Build as shared `packages/ai/providers/{minimax,sarvam,...}` adapters that the web media routes + all surfaces call.
4. **Web-search provider-native** — Qwen declares native web-search but it's unwired (falls to Perplexity). Wire native (harness `implemented` + `appendWebSearchTool` branch), and make the generic backend pluggable (one file `apps/web/lib/web-search/web-search-tool.ts`) to add **firecrawl** alongside Perplexity. **DECIDE:** primary generic backend = firecrawl or Perplexity?
5. **Tool-loop lift (bigger, defer)** — tool-loop orchestration is web-route-only; lift `apps/web/.../lib/tool-loop*.ts` into `packages/ai` so mobile/vscode can run it in-process (offline). Defer unless a thin surface needs offline tool-loop.
6. **Rust (desktop-local + cli)** — can't share TS. Either route through the gateway HTTP API (cloud path, zero dup) or accept parallel Rust reading the SAME env-driven base-url/fallback config. Crate extraction (`agiworkforce-mcp-client` via official `rmcp`, then a shared provider-client crate) = founder-gated consolidation.
