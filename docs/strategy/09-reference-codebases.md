# Reference Codebases — What to Steal from `claude-code` and `odysseus`

Status: Strategy analysis (not source-of-truth)
Owner: Founder + platform lead
Last updated: 2026-06-27
Method: read-only deep-dive of both reference repos vs. the AGI monorepo.
Companion docs: `02-gap-analysis.md`, `03-code-reality-and-tech-debt.md`, `07-roadmap-12-month.md`

You pointed at two reference folders as "the most similar things I wanted to build." They are the two halves of AGI, and studying them is the single most useful thing you can do right now because **they are not aspirational — they are working code you can read line by line.**

- **`claude-code`** = a copy of Claude Code's actual internal source (TypeScript + Ink). It is the **agent-runtime blueprint** — exactly how the thing AGI's CLI/runtime competes with really works inside.
- **`odysseus`** = an open-source, self-hosted, local-first, privacy-first AI workspace (`pewdiepie-archdaemon/odysseus`, MIT). It is the **product blueprint** — AGI's exact thesis ("the self-hosted version of the ChatGPT/Claude experience, local-first, privacy-first, no telemetry") already shipped broad by essentially one builder.

The strategic gift: between them, these two repos de-risk almost every hard problem in AGI. `claude-code` shows you how the agent loop _should_ work; `odysseus` shows you how the workspace breadth _can_ ship. Read them as your answer keys.

---

## 1. `claude-code` — the agent-runtime blueprint

### 1.1 How it actually works (the patterns that matter)

- **The loop is one async generator over a mutable `State`** (`query.ts::queryLoop`), yielding the _same_ event stream the UI and SDK both consume, with **typed `Continue`/`Terminal` transition reasons** rather than relying on `stop_reason` (explicitly called unreliable). The real "keep going?" signal is "did any `tool_use` block stream in."
- **Context management is a cost-ordered cascade run every turn** (`query.ts` ~365-650): tool-result byte budget → snip → microcompact (drop old tool results by id, cache-safe) → context-collapse (a commit-log projection, not an array rewrite) → **autocompact (real LLM summarization)** → hard limit. Cheap structural reduction runs first so the expensive lossy summary often never fires.
- **Autocompaction is a forked sub-agent that writes a ~17k-token structured summary**, with a 20k-token reserve and a **circuit breaker after 3 failures** (a comment cites real sessions wasting ~250K API calls/day without it). Plus _reactive_ recovery: on `prompt_too_long`/`max_output_tokens` it **withholds the error**, drains/compacts/escalates max-tokens 8k→64k, and only surfaces the error if recovery fails.
- **The `Tool` interface is a ~40-method behavioral contract** (`Tool.ts`), not a data record: `isConcurrencySafe`, `isReadOnly`, `isDestructive`, `checkPermissions`, `validateInput`, `toAutoClassifierInput`, `maxResultSizeChars` (per-tool disk-spill; `Infinity` for Read to avoid a Read→pointer→Read loop), `interruptBehavior`, render methods, `shouldDefer`/`alwaysLoad`, and `backfillObservableInput` (mutate a _clone_ for observers so the API-bound original stays byte-stable for prompt caching). `buildTool()` fills **fail-closed defaults** (unknown safety = unsafe).
- **Tools dispatch while the message streams.** `StreamingToolExecutor` adds each tool_use block as it arrives; runs of consecutive concurrency-safe tools run concurrently (bounded, default 10), everything else serially; `contextModifier`s from concurrent tools are queued and applied only after the batch.
- **Permissions are layered and fail-closed** (Zod parse → validateInput → PreToolUse hooks → `allow|deny|ask` with typed reasons → handler chain), with a **speculative bash classifier** started early to race the approval dialog. Modes: `default|plan|acceptEdits|bypassPermissions|auto`; deny always beats allow.
- **Hooks are a typed lifecycle** (~20 events) with shell _and_ prompt (LLM-evaluated) hooks, `if:` conditions in permission-rule syntax (`Bash(git *)`) so they don't spawn on non-matching calls, plus `async`/`asyncRewake` (wake the model on exit-code 2)/`once`/`timeout`. Declarable in settings, skill frontmatter, and agent frontmatter.
- **Skills = progressive disclosure**: only `name`+`description`+`whenToUse` load at startup; the body loads on invocation. Plus `paths:`-conditional activation (skill fires only when a matching file is touched) and source precedence with symlink-safe dedup. MCP-sourced skills are barred from shell injection (untrusted-remote boundary).
- **Subagents are the same `query()` loop, forked and scoped** (`tools/AgentTool/runAgent.ts`): own `agentId`, transcript sidechain, abort controller, additive per-agent MCP servers, restricted tool pool, own permission mode. Read-only agents (Explore/Plan) **drop `CLAUDE.md` and git-status** (comments quantify ~5–15 Gtok/week saved across 34M spawns). Exhaustive `finally` cleanup of every leak observed in long sessions.
- **Deferred tools + `ToolSearch`**: tools marked `shouldDefer` (all MCP + opt-in built-ins) are announced by name only; the full schema isn't sent until the model calls `ToolSearch`. Lets you expose hundreds of tools without paying their schema cost every turn — and when a deferred tool's args fail to parse, the error tells the model to load the schema and retry.

### 1.2 The four depth gaps AGI must close (verified against your code)

Your Rust CLI (`apps/cli/src/agent/chat.rs`, ~1,900 lines) is genuinely competitive on **breadth** — and ahead in places (multi-model fallback chains, NDJSON event protocol, cost HUD, ratatui TUI). But four depth gaps are where Claude Code's "it just keeps working for an hour" reliability actually lives:

| #   | Gap                                                    | Evidence in AGI                                                                                                                                                           | Why it matters                                                                                                                  | Fix                                                                                                                    |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| C1  | **No `Tool` trait**                                    | `grep "trait Tool"` → nothing; tools are a `ToolDefinition` struct + `match name` dispatch (`features/exec/tools/mod.rs`)                                                 | Per-tool behavior (safety, validation, classifier form, rendering) has no home; adding a tool means editing a central match arm | Introduce a real `Tool` trait with fail-closed defaults. **Highest-leverage structural change.**                       |
| C2  | **Compaction is truncation, not summarization**        | `compaction.rs` (~1,356 lines) is entirely byte/token truncation — no model call                                                                                          | Long sessions permanently lose reasoning/decisions; this is the biggest correctness gap                                         | Add LLM-summary compaction (fork a sub-agent, reserve tokens) behind the cheap cascade; add a failure circuit breaker. |
| C3  | **The policy engine is built but unwired**             | `crates/agiworkforce-execpolicy` + `apps/cli/src/platform/policy/` exist; `grep` shows they're not referenced in the agent loop (only the coarse `SandboxPolicy` enum is) | You already built the sophisticated layer — it's just not in the loop                                                           | Wire `execpolicy`/`PolicyEngine` into `checkPermissions`; cheap, high-value, already-paid-for.                         |
| C4  | **No streaming tool execution / withhold-and-recover** | loop is turn-batched (`for iteration in 0..max`, tools after the full message); overflow emits an error                                                                   | Higher latency on multi-tool turns; dead sessions on overflow instead of transparent recovery                                   | Dispatch read-only tools mid-stream; add withhold→compact→escalate recovery.                                           |

### 1.3 Adopt list from `claude-code` (beyond the four gaps)

Backfill-on-clone for observers (never mutate the API-bound object — you bill cache tokens, so this is literally money); slim read-only subagents; `if:`-gated hooks; prompt hooks + async-rewake; per-agent MCP/tool/permission envelopes; typed loop transition reasons; per-tool disk-spill thresholds with the Read self-reference guard; cross-model fallback thinking-signature stripping (your fallback-chain feature _will_ hit the "replaying protected thinking to a fallback model 400s" hazard — handle it now).

---

## 2. `odysseus` — the product blueprint

A FastAPI + SQLite monolith with a no-bundler vanilla-JS SPA, single-user, self-hosted, defaulting to `127.0.0.1`. Architecturally the _opposite corner_ from AGI (one trusted user on a LAN vs. six surfaces with hard trust boundaries) — but it has **shipped the breadth AGI is still building**, which makes it a feature-completeness benchmark and a free QA checklist.

### 2.1 The 14 patterns to steal (concrete, with files)

| #   | Pattern                                                                                                                                                            | Why AGI wants it                                                                                                           | File                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| O1  | **Hostname-based provider auto-detection** from one endpoint URL (exact-host match, not substring, to defeat `anthropic.com.evil`)                                 | One "OpenAI-compatible" path absorbs dozens of providers; special-case only the few that need it                           | `src/llm_core.py:_detect_provider()` 408-435 |
| O2  | **RAG-based tool selection** (embed tool descriptions, retrieve top-K + keyword force-includes)                                                                    | Your on-device/mobile + small BYOK models choke on a full tool catalog — this is the best single idea for AGI's local path | `src/tool_index.py`                          |
| O3  | **Dual-channel tool parsing** (native function-calling AND fenced/XML/DSML text, 5 formats)                                                                        | The difference between "works with GPT only" and "works with any local model"                                              | `src/tool_parsing.py:430`                    |
| O4  | **Hardware-aware model recommender + one-click serve ("Cookbook")** via llmfit                                                                                     | Local mode lives or dies on "which model fits my machine?"; scan VRAM/RAM → fit/speed/quality score → serve                | `services/hwfit/fit.py:299-471`              |
| O5  | **Untrusted-content wrapping for ALL external data** (web/email/memory/skills/pages go in as guarded _data_, never instructions)                                   | Operationalizes AGI's privacy/safety differentiator; make it a hard contract like the trust boundaries                     | `src/prompt_security.py`                     |
| O6  | **Dual-lane embedding collections** (survive embedding-model swaps; Chroma fixes dim on first insert)                                                              | Prevents silent memory corruption when you change embedders                                                                | `src/embedding_lanes.py`                     |
| O7  | **Four-tool document-edit contract**: create / edit (find-replace) / suggest (accept-reject bubbles) / update (full rewrite)                                       | A clean, model-friendly contract that maps directly to AGI's artifacts requirement                                         | `src/tool_schemas.py:179-251`                |
| O8  | **Self-evolving skills** (SKILL.md auto-extraction + teacher→student escalation + LLM-judged auto-publish)                                                         | Turns agent runs into reusable procedures; lets a strong model upskill a weak local one                                    | `services/memory/skill_extractor.py`         |
| O9  | **Automatic memory extraction + periodic consolidation** (hybrid BM25+vector recall, dedup, conservative caps)                                                     | Your memory P0 (generated-from-history, view/manage) needs exactly this pipeline                                           | `services/memory/memory_extractor.py`        |
| O10 | **Plan mode as fail-safe denylist** (allow = all tools minus a static read-only allowlist, so new tools default blocked)                                           | A safer read-only investigation mode than an allowlist that forgets new tools                                              | `src/tool_security.py:64-118`                |
| O11 | **Context compactor with tool-message invariant repair** (`_sanitize_tool_messages` fixes orphaned `role:"tool"` msgs that trimming creates — an OpenAI 400 trap)  | You route across 15 providers; this exact 400 will bite you                                                                | `src/context_compactor.py`                   |
| O12 | **`_is_trusted_loopback`** — loopback trust that refuses when proxy/forwarding headers are present (cloudflared/Tailscale connect FROM 127.0.0.1)                  | Your Local trust boundary has the identical hazard; this is a reference fix                                                | `app.py:237-251`                             |
| O13 | **Email AI-triage as cached, gated background passes** (summary/reply-draft/tag/spam/calendar/urgency; drafts cached, _not sent_; email body treated as untrusted) | A concrete agent-native-inbox blueprint, done safely                                                                       | `routes/email_pollers.py`                    |
| O14 | **Served-model lifecycle state machine** (auto-register served model as endpoint, scheduled auto-stop, prune on stop so the picker has no ghosts)                  | Lifecycle hygiene for AGI's local-model serving                                                                            | `src/cookbook_serve_lifecycle.py`            |

Plus two worth a look: blind A/B **Compare** (server withholds model identity until you vote) and **deep-research → sanitized self-contained HTML report** (`src/visual_report.py`, sanitized via `nh3`).

### 2.2 OSS to leverage instead of building from scratch

From Odysseus's `ACKNOWLEDGMENTS.md`, verified in its code — evaluate each before writing your own:

- **llmfit** (MIT) — the hardware-fit engine behind Cookbook. _Highest-leverage adopt for AGI's local mode._
- **Tongyi DeepResearch** (Apache-2.0) — the multi-step research loop; adapt for AGI's deep-research parity.
- **ChromaDB** (Apache-2.0) + **fastembed/ONNX** (Apache-2.0) — zero-config local vector store + embedder; fastembed runs ONNX locally with no GPU, ideal for **on-device** memory/RAG.
- **opencode** (MIT) — agent-loop/tool patterns (Odysseus adapted rather than embedded it).
- **MCP Python SDK** with full OAuth (RFC 9728 + DCR + PKCE) — reference for OAuth-gated MCP.
- **markitdown** (MIT), **pypdf** (BSD), **faster-whisper** (STT), **Kokoro-82M** (TTS), **caldav/icalendar/defusedxml** — for docs, voice, and calendar without reinventing.

**License caution (you ship a commercial product):** Odysseus keeps its MIT core clean by making **PyMuPDF (AGPL-3.0)** an optional, lazy-imported dependency, and by _interoperating with_ SearXNG (AGPL) over the network rather than bundling it. Adopt the same discipline — keep AGPL out of the distributed binary, interoperate over network only, or buy commercial licenses. Add a license-scan gate to CI.

---

## 3. The honest scorecard — AGI vs. each reference

| Dimension                                               | vs. `claude-code`                                                                 | vs. `odysseus`                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent-loop depth                                        | **Behind** on 4 items (C1–C4); ahead on fallback chains, event protocol, cost HUD | Ahead (Odysseus's loop is solid but simpler)                             |
| Tool system                                             | Behind (no Tool trait)                                                            | Mixed — adopt their RAG selection + dual-channel parsing                 |
| Context/compaction                                      | Behind (truncation vs. LLM summary)                                               | Adopt their tool-message repair                                          |
| Surfaces                                                | n/a (CLI only there)                                                              | **Far ahead** — 6 surfaces vs. 1 web/PWA                                 |
| Native + on-device                                      | **Ahead** (Rust/Tauri, real on-device mobile LLM)                                 | **Ahead** (Odysseus serves models server-side; phone is a thin browser)  |
| Trust boundaries                                        | n/a                                                                               | **Far ahead** — 3 enforced-in-code boundaries vs. 1 "trusted admin" zone |
| BYOK / managed / billing                                | n/a                                                                               | **Ahead** — Odysseus has no business model                               |
| Shipped breadth (email/calendar/research/compare/image) | n/a                                                                               | **Behind** — Odysseus ships it today                                     |
| Local-model "make it actually work" engineering         | n/a                                                                               | **Behind** — steal their battle scars (O1, O3, O11)                      |

**The asymmetry in one line:** AGI is architecturally superior and aimed at a real market; both references are functionally further along in their lane. AGI is building the harder, more valuable thing — and these repos prove the hard parts are achievable, while handing you the implementation patterns for free.

---

## 4. What this changes in the plan

These map cleanly onto `07-roadmap-12-month.md`. Concrete additions:

**Runtime (NEXT, from `claude-code`):** land C1 (Tool trait) and C3 (wire the existing policy engine) first — both are structural, high-leverage, and C3 is already-paid-for. Then C2 (LLM compaction) and C4 (streaming + recovery) for long-session reliability. These four are the difference between a demo agent and one that survives hour-long sessions.

**Local path (NEXT, from `odysseus`):** adopt O2 (RAG tool selection) + O3 (dual-channel parsing) + O11 (tool-message repair) — these make multi-provider + local + small-model actually work, which is literally your differentiator. Evaluate llmfit for a Cookbook-style "what fits my machine" flow (O4) — a strong consumer hook for Local Mode.

**Privacy contract (NOW, from both):** make O5 (untrusted-content wrapping) and O12 (loopback-trust-with-proxy-guard) hard, tested contracts — they operationalize the trust boundary that _is_ your product, and pair directly with the egress contract tests in `03`.

**Memory/skills (LATER, from `odysseus`):** O8 + O9 are a complete, conservative implementation of your memory/skills P0 — adapt rather than design from scratch.

**Threat model (NOW):** write a threat model as concrete and honest as Odysseus's `THREAT_MODEL.md` (roles × capabilities table, the exact enforcing files, an open "Known Gaps" list). Yours is harder (3 boundaries × 6 surfaces × managed cloud), which is exactly why writing it down is worth more.

**Don't over-learn the wrong lesson:** Odysseus proves one builder + AI can ship enormous breadth — but it ships as a single self-hosted app for a trusted user. Your value is the breadth _plus_ the surfaces _plus_ enforced trust _plus_ a trustworthy managed option. Steal Odysseus's breadth and battle scars; do not let its single-trust-zone simplicity tempt you to relax the boundaries that are your only durable moat.
