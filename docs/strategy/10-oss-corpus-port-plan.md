# OSS Corpus Port Plan — What to Adopt Across ~50 Reference Repos

Status: Strategy analysis (not source-of-truth)
Owner: Founder + platform lead
Last updated: 2026-06-28
Method: deep-dive of the reference corpus in `/Users/siddhartha/Desktop/opensource_reference/`, building on the existing 9-axis scout.
Companion docs: none (companion set retired 2026-07-26)
Source corpus: the founder's own `opensource_reference/README.md` (9-axis library) + `FINDINGS.md` (6-scout read) + ~40 additional repos.

You have assembled one of the best reference libraries a founder in this space could have: a structured "9 axes × 6 surfaces" scout (already analyzed in your `FINDINGS.md`) plus a deep bench of coding agents, memory/skills/security tools, and multimodal infra. This doc does not redo your 9-axis findings — it **integrates them and extends them** with the new cohort, then turns the whole corpus into one prioritized, license-aware port plan.

**The single most important discovery:** your `crates/agiworkforce-execpolicy` is a structural fork of OpenAI Codex's `execpolicy` crate (identical files: `policy.rs`, `decision.rs`, `parser.rs`, `rule.rs`, `amend.rs`). That means **codex-rs (Apache-2.0, Rust) is a near-drop-in donor for all four runtime gaps** identified in `09`. You are not building the hard parts from scratch — you are wiring in code from a sibling architecture.

---

## 1. Builds on your existing 9-axis scout (don't redo it)

Your `FINDINGS.md` already produced a sound, file-cited port roadmap for the nine axes. Summary of what it concluded, which still stands:

- **Routing (axis 1):** port RLLM's `ChatProvider` trait + UTF-8-safe SSE parser + typed retryable errors + backoff; Portkey auth-shape (Anthropic uses `X-API-Key`, not Bearer); Bifrost SSRF guard for BYOK base URLs.
- **Local (axis 3):** ollama-rs registry/coordinator (CLI/desktop), jan download+provider-config (Tauri), llama.rn JSI (mobile); derive your own RAM-sizing (the upstream "formula" doesn't exist).
- **Sync (axis 5):** PowerSync (mutable) + Electric Shapes (read-only), server-side LWW, no CRDT; enforce the trust matrix (CLI/VSCode local, BYOK local-only).
- **BYOK + privacy (axis 4/9):** stronghold (desktop) / keyring (CLI) / expo-secure-store (mobile); port llm-guard's secret-scan _rules_ to native Rust/TS, fail-closed at the Local→Cloud fork.
- **UI/surface/billing (axis 6/7/2):** assistant-ui → `@agiworkforce/chat-sdk`; vscode chat-sample → `@agi` participant; OpenMeter as a metering service.
- **Build-from-scratch (no good OSS):** (1) entitlement→request-severing billing fusion, (2) the trust-partition _enforcement_ itself, (3) client-side BYOK raw-HTTP layer.

This new analysis **adds a much stronger answer for the agent runtime, IDE surfaces, memory, skill-security, agent UI, and multimodal infra** — areas the axis scout only lightly covered (it had cline for agent, llm-guard for privacy).

---

## 2. The runtime (C1–C4): codex-rs is your donor

The four depth gaps from `09` (no Tool trait; truncation-not-summarization; unwired policy engine; no streaming/recovery) all have direct Rust references in `codex-rs`, which shares your execpolicy lineage.

| Gap                               | Port from                                  | Source files                                                                                                                                                                                                                                      | Action                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 — real Tool trait**          | codex-rs (Apache-2.0)                      | `tools/src/tool_executor.rs` (`ToolExecutor<Invocation>`: `tool_name`/`spec`/`exposure`/`supports_parallel_tool_calls`/`handle`), `core/src/tools/registry.rs` (`CoreToolRuntime` extension)                                                      | Introduce a real `Tool` trait; `ToolExposure` enum gives deferred-tool/ToolSearch a first-class home.                                                                                 |
| **C2 — LLM compaction**           | codex-rs (mechanism) + gemini-cli (prompt) | codex `core/src/compact.rs` + `prompts/templates/compact/prompt.md`; gemini-cli `context/chatCompressionService.ts` (`<state_snapshot>` schema + self-correction probe + inflation guard)                                                         | Replace mechanical `compaction.rs` with summary-replaces-history; steal gemini's resume-grade summary prompt. goose's two-tier (`context_mgmt/`) if you want per-tool-pair shrinking. |
| **C3 — wire policy engine**       | codex-rs (your fork's sibling)             | `core/src/exec_policy.rs` (`ExecPolicyManager` → `Policy::check_multiple_with_options`), `core/src/tools/orchestrator.rs` (approval→sandbox→attempt→escalated retry), `core/src/tools/sandboxing.rs` (`Approvable`/`Sandboxable`/`ApprovalStore`) | Nearly copy-paste: this is the missing wire between your `agiworkforce-execpolicy` and the loop. Highest ROI item in the whole corpus.                                                |
| **C4 — streaming exec + recover** | codex-rs                                   | `core/src/session/turn.rs` (`FuturesOrdered` filled during stream), `tools/parallel.rs`; recovery: `compact.rs:266` `remove_first_item()` on `ContextWindowExceeded`                                                                              | Dispatch read-only tools mid-stream; trim-oldest-and-retry on overflow instead of erroring.                                                                                           |

Plus three cheap, high-value cross-language lifts: **aider's repo-map** (`aider/repomap.py` — tree-sitter ranked-tags + PageRank + token-budget binary search; the best context-relevance idea in the corpus, trivially portable to Rust's tree-sitter), **opencode's doom-loop guard** (identical tool-call ×3 → force human), and **gemini-cli's OS sandbox profiles** (`sandbox/baseProfile.ts` — clearest Seatbelt/bwrap profile spec). Note: goose/crush/opencode/qwen ship **no OS sandbox** — codex and gemini-cli are your only real sandbox references, and a true local sandbox is a differentiator.

OS-sandbox backends to study for `apps/cli/src/platform/policy/` (and the Windows stub): codex `sandboxing/src/{seatbelt,landlock,bwrap}.rs`. On desktop macOS, Apple's `container` (§7) gives VM-level isolation beyond Seatbelt.

---

## 3. IDE & shared-runtime surfaces: continue + OpenHands

**For the AGI VS Code extension, `continue` (Apache-2.0) is the donor** — the most mature OSS IDE agent, code-safe to adapt with attribution:

- **IDE-host abstraction first** — `continue/core/protocol/ide.ts` (one typed RPC contract, ~40 methods) + per-editor `IDE` implementation. This is how you get VS Code + Desktop + future JetBrains from one runtime.
- **Autocomplete subsystem wholesale** — `core/autocomplete/` (debounce → timeout-raced snippet gather → per-model FIM template → prefix-LRU cache → stream filters). Don't rebuild; these are the hard-won parts.
- **Next-edit prediction** — `core/nextEdit/` (the "tab to next edit" differentiator).
- **Lazy apply + streaming diff** — `core/edit/lazy/streamLazyApply.ts`, `core/diff/streamDiff.ts` (model emits sketch with `UNCHANGED_CODE` markers; 2nd pass fills; live gutter decorations).
- **Context-provider plugin interface** — `core/context/` (2-method plugin: `getContextItems` + `loadSubmenuItems`) for @-mentions (@file, @repo-map, @problems) without a monolith.

**For the shared runtime**, the standouts: **OpenHands** event-sourced Action/Observation loop (MIT core — _avoid the `enterprise/` dir_, it's PolyForm) gives replay/resume/multi-surface-sync from one state machine; **swe-agent** config-as-agent-definition (YAML, MIT) lets you ship per-surface agent behavior without code changes; **agentscope** MessageBus (Apache-2.0) upgrades your `supervisor` subagent with queue+replay-log+broadcast; **codebuff** sealed-subagent spawn pool (Apache-2.0) formalizes cost-routed parallel subagents with no context bleed.

---

## 4. Memory P0: steal supermemory's schema, build your own engine

The decisive finding: supermemory's **retrieval engine is closed-source**; only its **data-model contract** is in-repo (MIT). The two "code memory" repos (codegraph, codebase-memory-mcp) are structural/lexical (tree-sitter graph + FTS5), not semantic. So the recommended Memory-P0 design:

- **Two-layer store** (lift the schema from supermemory `packages/validation/schemas.ts`): a RAG layer (`document` + `chunk` with embeddings, incl. matryoshka/truncatable embeddings) and a fact layer (`memoryEntry` linked to sources via a join carrying `relevanceScore` — this is what powers "here's the fact and where it came from").
- **Extraction pipeline** with an observable status enum (`queued→extracting→chunking→embedding→indexing→done`), run async; conversation write-back distills facts for your "generated-from-history" P0. Add an optional org-level LLM pre-filter to exclude PII categories (privacy-relevant).
- **Hybrid retrieval**: vector for prose + codegraph's **FTS5 + field-qualified query parser** (`kind:function name:auth path:src/api`) for code, walking the relation graph (parents/children), not just top-k.
- **Isolation = your trust boundary**: supermemory's `containerTag` tenancy maps directly onto Local/BYOK/Managed — namespace memory so a Local memory can never surface in a BYOK/Managed query. Add TTL forgetting (`forgetAfter`/`isForgotten`).
- **Build-your-own caveat:** the chunker, extractor, embedder, ranker are not in the repo — design hints, not specs. For on-device embeddings, use `fastembed`/ONNX (from the odysseus analysis in `09`).

---

## 5. The trust differentiator you can market: SkillSpector

This is the highest-strategic-value find in the entire corpus. **SkillSpector (NVIDIA, Apache-2.0) is a pre-install security scanner for agent skills/plugins/MCP** — exactly the vetting layer a privacy-first marketplace needs, and something **no competitor markets**.

It runs ~21 analyzers (regex + Python AST + YARA + live OSV CVE lookup + optional LLM) across ~70 rules / 18 categories, producing a 0–100 risk score → `SAFE`/`CAUTION`/`DO_NOT_INSTALL` with SARIF output. It detects: prompt injection (incl. hidden HTML-comment / zero-width / RTL-override / base64 instructions), data exfiltration (env-var harvesting, `.ssh`/`.aws` reads), dangerous execution (AST chains, reflective `getattr(os,"system")` sinks), credential access, obfuscation, **declared-vs-actual permission diff** (does more than it claims), agent-snooping (reading peer skills' configs/tokens), supply-chain (typosquatting, unpinned deps), MCP tool-poisoning (homoglyph deception), and **rug-pull** (permissions added after approval).

**Recommended AGI marketplace pipeline:**

1. **Adopt SkillSpector wholesale** as the pre-install gate (Apache-2.0, attribution).
2. **Submit-time lint** with pm-skills' `validate_plugins.py` (manifest/frontmatter/author correctness) + a full SkillSpector scan → block `DO_NOT_INSTALL`.
3. **Install-time re-scan** with the rug-pull diff against the last-approved manifest.
4. **Enforce declared-vs-actual permissions (LP1–LP4)** as a hard gate — and reuse it as the per-tool consent UI your Skills/Plugins P0 already needs.
5. **Show users the findings** (category/severity/remediation) before install — a visible, ownable, privacy-aligned trust signal.
6. Wire the scanner's model IDs to your `models.json` (it hardcodes example IDs — your CLAUDE.md forbids that).

Skill _packaging_ conventions to standardize on: `agent-skills` (`SKILL.md` frontmatter + `.claude-plugin/marketplace.json`), `last30days-skill` (`allowed-tools:` per-skill + `.skillignore` so secrets never ship), `compound-engineering-plugin` (one manifest → per-target converter, if you want cross-tool plugin export).

---

## 6. Agent UI & artifacts: CopilotKit

CopilotKit (MIT — _avoid the `showcase/` dir, it's proprietary_) is the cleanest in-app agent-UI reference, and its core quartet maps directly onto AGI's artifacts + per-tool-permission UX:

- **`defineToolCallRenderer({name, args, render})`** with a status discriminated union (`InProgress→Executing→Complete`) — **an AGI artifact is exactly a named tool whose `render` returns a panel that fills as args stream**; include a `name:"*"` wildcard for model-generated artifacts.
- **`respond(result)` human-in-the-loop** — the entire HITL approval mechanism; directly applicable to per-tool consent and the Local→BYOK explicit-consent fork.
- **Slot-based headless chat UI** — one chat shell serves web + desktop with different chrome.
- **AG-UI SSE event taxonomy** (`TEXT_DELTA`/`TOOL_CALL_*`/`STATE_SNAPSHOT`) with replay-able per-thread streams → reconnect/resume for free.

---

## 7. Infra & multimodal (all commercially usable)

| Tool                                 | Use for                                                                                             | Adopt as                               | License                                               | Priority                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **LMCache**                          | Managed-cloud inference cost: KV-cache reuse for long/RAG/multi-turn contexts (cuts TTFT + prefill) | Service (vLLM sidecar)                 | Apache-2.0                                            | High — directly improves the `04` cost model                    |
| **Apple `container`**                | Agent code-exec sandbox on macOS desktop (VM-level isolation)                                       | Swift dependency behind an abstraction | Apache-2.0                                            | High (macOS 26 + Apple Silicon only; pre-1.0 API)               |
| **liteparse**                        | Local on-device PDF/doc → Markdown for chat/artifacts/RAG (npm/wasm/PyPI/Rust bindings)             | Dependency                             | Apache-2.0 (+ PDFium BSD, Tesseract Apache)           | High — satisfies the Local trust boundary (never leaves device) |
| **VoxCPM**                           | TTS + voice cloning (closes the voice gap); OpenAI-compatible `/audio/speech`                       | Self-host service                      | Apache-2.0 **incl. weights** (rare; commercial-ready) | High — gate cloning behind consent                              |
| **supervision (+ a permissive VLM)** | On-device vision beyond OCR (the real fix for the mobile vision gap R5)                             | Python dependency                      | MIT                                                   | High — **do NOT pair with Ultralytics YOLO (AGPL)**             |
| **timesfm**                          | Usage/capacity forecasting, billing-anomaly detection                                               | Model dependency                       | Apache-2.0 (code + weights)                           | Med                                                             |
| **Open-LLM-VTuber**                  | STT→LLM→TTS streaming pipeline pattern (VAD, barge-in)                                              | Study only                             | MIT (Live2D assets non-MIT)                           | Med                                                             |
| **insomnia**                         | Connector/API dev + testing                                                                         | Dev tool                               | Apache-2.0                                            | Low                                                             |

---

## 8. Consolidated license register (the commercial-ship gate)

AGI ships commercially, so the rule is: nothing AGPL/GPL/non-commercial/source-available-with-competing-use-ban may be embedded or linked into shipped binaries. **Add a CI license-gate** (codebase-memory-mcp ships a good reference at `scripts/license-gate-check.py`).

| Repo / asset                                                                                                                                                                                                                                                        | License                                           | Rule for AGI                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| codex-rs, goose, gemini-cli, qwen-code, aider, continue, agentscope, codebuff, mistral-vibe, SkillSpector, LMCache, container, liteparse, VoxCPM, timesfm                                                                                                           | Apache-2.0                                        | ✅ Port freely; preserve `LICENSE`/`NOTICE`, mark changes.                                                                                        |
| opencode, swe-agent, gptme, openclaw, claw-code, pi, oh-my-pi, hermes-agent, supermemory, codegraph, codebase-memory-mcp, agent-skills, pm-skills, compound-engineering-plugin, CopilotKit (`packages/*`), supervision, Understand-Anything, Open-LLM-VTuber (code) | MIT                                               | ✅ Port freely with attribution.                                                                                                                  |
| **crush**                                                                                                                                                                                                                                                           | **FSL-1.1-MIT**                                   | ⛔ Patterns only — forbids "Competing Use" (exactly what AGI is) until each release auto-converts to MIT 2 years post-release. Study, don't copy. |
| **auto-code-rover**                                                                                                                                                                                                                                                 | **SONAR source-available**                        | ⛔ Not OSS; bans competing use. Ideas only, clean-room reimplement.                                                                               |
| **Devon**                                                                                                                                                                                                                                                           | **AGPL-3.0**                                      | ⛔ Strong copyleft + network clause. Reimplement the idea; do not copy.                                                                           |
| **plandex**                                                                                                                                                                                                                                                         | MIT now, **AGPL-3.0 before v2.0.0**               | ⚠️ Pin to current MIT commits only; pre-2.0 history is AGPL.                                                                                      |
| **OpenHands**                                                                                                                                                                                                                                                       | MIT core, **`enterprise/` = PolyForm Free Trial** | ⚠️ Lift from MIT core only; avoid `enterprise/`.                                                                                                  |
| **CopilotKit**                                                                                                                                                                                                                                                      | MIT, **`showcase/` proprietary**                  | ⚠️ Lift from `packages/*` only.                                                                                                                   |
| **Ultralytics YOLO** (vision companion, not in corpus)                                                                                                                                                                                                              | **AGPL-3.0**                                      | ⛔ Don't pair with supervision; use RF-DETR/permissive ONNX models or buy a commercial license.                                                   |
| **Live2D sample assets** (Open-LLM-VTuber)                                                                                                                                                                                                                          | Live2D terms                                      | ⚠️ Pattern-study only; don't ship the assets.                                                                                                     |
| **init, chat-template** (axis6, from your scout)                                                                                                                                                                                                                    | **NO LICENSE**                                    | ⛔ All-rights-reserved; study & reimplement, never fork.                                                                                          |
| **supermemory engine**                                                                                                                                                                                                                                              | (closed)                                          | ℹ️ Only the in-repo schema/SDK is usable; build the engine yourself.                                                                              |

---

## 9. Consolidated prioritized port plan (merge into `07`)

**NOW (highest ROI, mostly Rust drop-ins):**

1. **C3 — wire `agiworkforce-execpolicy` into the loop** using codex `exec_policy.rs` + `orchestrator.rs`. You already own the engine; this is the single best ROI item.
2. **C1 — introduce the `Tool` trait** from codex `tool_executor.rs`. Unblocks everything else (safety flags, deferral, rendering get a home).
3. **Make the privacy contract real**: port llm-guard secret-scan rules (your scout) + adopt **SkillSpector** as the pre-install gate. Privacy/trust is the product.

**NEXT:** 4. **C2 + C4** — LLM compaction (codex mechanism + gemini prompt) and streaming/recovery (codex `turn.rs`). This is the long-session reliability difference. 5. **VS Code from `continue`** — IDE-host abstraction + autocomplete + lazy-apply (Apache-2.0, code-safe). 6. **Local-path robustness** — adopt the odysseus patterns (RAG tool selection, dual-channel parsing) from `09` + ollama-rs/jan/llama.rn from your scout; evaluate llmfit Cookbook. 7. **LMCache** sidecar for managed-cloud cost; **liteparse** for local file ingestion.

**LATER:** 8. **Memory P0** — supermemory schema + codegraph hybrid + fastembed. 9. **Artifacts/agent UI** — CopilotKit quartet (`defineToolCallRenderer` + HITL `respond` + slots). 10. **Shared runtime** — OpenHands event-sourcing + agentscope MessageBus for the supervisor; sync via PowerSync (your scout). 11. **Voice/vision** — VoxCPM TTS; supervision + permissive VLM (not Ultralytics).

**The meta-point:** between your 9-axis scout, the claude-code/odysseus teardown (`09`), and this corpus, **almost every hard problem in AGI now has a working, license-cleared reference to port from.** The remaining true build-from-scratch items are exactly the three your scout already named — entitlement→request-severing billing, the trust-partition enforcement itself, and the client-side BYOK raw-HTTP layer — which is fitting, because those three are also your differentiators. Adopt aggressively everywhere else; spend your scarce original engineering on the moat.
