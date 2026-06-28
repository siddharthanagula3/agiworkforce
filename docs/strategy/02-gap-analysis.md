# Gap Analysis — Target Suite vs. AGI Codebase

Status: Strategy analysis (not source-of-truth)
Owner: Founder
Last updated: 2026-06-27
Companion docs: `01-competitive-teardown.md`, `03-code-reality-and-tech-debt.md`, your own `docs/current/parity-implementation-matrix.md`

This maps the competitive target (from `01`) onto what actually exists in the AGI monorepo (verified by code audit, see `03`). It is the second half of the brief: _what does not exist in the project yet?_

You already maintain `docs/current/parity-implementation-matrix.md`, which is excellent and more granular than anything an outsider would produce. This doc does **not** replace it — it sits above it, adds the competitive "why," and reframes the gaps by _business impact_ rather than feature-by-feature parity. Where the two differ, your parity matrix wins on detail; this doc wins on prioritization.

Status legend: **Present** (real, wired end-to-end) · **Partial** (exists but incomplete/placeholder) · **Missing** (no reliable implementation) · **Differentiator** (AGI ahead of or orthogonal to incumbents).

---

## 1. The one-paragraph verdict

AGI has built the _spine_ of a competitive suite — multi-provider chat with real streaming and persistence on every surface, a genuine on-device mobile LLM, a Claude-Code-class CLI, and the trust-boundary contracts that are its reason to exist. What it lacks is **depth on the high-visibility "platform" features** (artifacts polish, projects/memory completeness, global search, a real connectors/apps directory, deep research, the visual design workspace) and **production hardening** (audit-log immutability, TLS pins, a few security gates). The gap to "looks like Claude/ChatGPT in a demo" is **months, not years**. The gap to "is as reliable and complete as Claude/ChatGPT at scale" is the harder, longer road — and most of it is concentrated in the shared runtime, not the surfaces.

---

## 2. Platform-level capability gaps (these matter most — shared across surfaces)

| Capability                                        | Incumbent target                                              | AGI status                                                                                               | Business impact of the gap                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Multi-provider model catalog + routing            | Single-lab (a non-feature for them)                           | **Differentiator** — 57 models / 15 providers + 4 auto-routing tiers in `models.json`                    | This is your wedge. Already real. Protect it.                                                   |
| Local-first / no-egress trust boundary            | Structurally avoided by incumbents                            | **Differentiator** — `suite-contracts.ts`, fail-closed gates, privacy modes                              | Your single most defensible asset. Must be provably airtight (see `03` Rust-egress note).       |
| BYOK at no markup                                 | Not offered                                                   | **Differentiator (Local/Desktop/CLI)**                                                                   | A trust feature, not a revenue line. See `05` — do not let it _be_ the business model.          |
| Agent runtime (tool loop, subagents, approvals)   | Claude Code / Responses API — the core asset                  | **Partial→Present** — CLI is strong; desktop has a real agentic loop; not unified across surfaces        | The highest-leverage investment. One hardened runtime > six half-built ones.                    |
| MCP client + connectors directory                 | 200+ connectors, registry, in-chat MCP apps                   | **Partial** — MCP plumbing exists; no polished directory/categories/search/per-tool permission UX        | Connectors are how incumbents create lock-in. A thin directory reads as "demo," not "platform." |
| Artifacts (create/version/publish/AI-powered)     | Mature; AI-powered artifacts are a novel distribution channel | **Partial** — web sidecar + desktop workbench exist; versioning/publish/AI-powered/MCP-backed incomplete | Artifacts are the most "wow" surface in a demo. Worth disproportionate polish.                  |
| Projects + Memory (RAG, isolation, import/export) | Mature, per-project memory, 24h synthesis                     | **Partial** — project scaffolding + memory exist; RAG/isolation/import incomplete                        | Table-stakes for retention. Without it, users don't form a workspace habit.                     |
| Global search (chats/projects/artifacts/files)    | Standard in both                                              | **Partial/Missing** — historically stubbed                                                               | A "looks unfinished" gap the moment a user has >20 chats. Cheap to fix, high perceived value.   |
| Deep research (multi-step, cited report)          | ChatGPT Deep Research; Claude research flows                  | **Partial/Missing**                                                                                      | High marketing value; can be built on the existing agent loop + web search.                     |
| Visual design workspace (canvas/artboards/decks)  | Claude Design-style canvas (reference-only)                   | **Missing/Gated**                                                                                        | Net-new scope. Defer unless it becomes a wedge — it's a product in itself.                      |
| Voice (dictation + live conversation)             | Mature on all surfaces                                        | **Partial** — CLI + extension voice code exists; suite-wide settings incomplete                          | Increasingly expected on mobile/desktop. Medium priority.                                       |
| Managed cloud (metering, billing, abuse, refunds) | The whole business for incumbents                             | **Partial (public alpha)**                                                                               | The revenue engine. Must be hardened before scale — see `04`/`06`.                              |

---

## 3. Surface-by-surface gap map

Ratings are the code-audit verdicts from `03`. "% real" is the audit's honest estimate of end-to-end-wired vs. stubbed/gated.

### Web (Next.js) — ~80% real, Production-ish core

- **Present:** Clerk auth → CSRF/rate-limit/credit-metered → 13-provider streaming → Neon persistence; conversation routes are IDOR-safe; CORS/CSRF helpers are correct.
- **Partial:** settings IA parity, connector/app directory, global search, full projects/files/memory parity, temporary/incognito pre-send conversations, attachment ingestion for non-images, regenerate preserving turn metadata.
- **Missing/honest-stub:** billing-history UI (returns `[]` pending endpoints), SCIM/directory-sync, image/video gen (dead Vite/Netlify leftovers — delete these).
- **Biggest lever:** settings IA + global search + connectors directory. These three close most of the "feels unfinished" perception gap.

### Desktop (Tauri v2 + React + Rust) — ~88–92% real, the strongest surface

- **Present:** ~1,500 Tauri commands, ~90 real tool executors, real agentic streaming loop, artifact workbench, MCP direction, local generated files, a 70KB battle-tested SSE parser.
- **Partial:** settings IA vs. the locked spec; AGI Code mode exists (`CodeModeHome.tsx`) but is **unmounted** in the V3 shell; office-doc _editing_ ~50% stubbed (creation works); research email/calendar agents stubbed; cross-platform speech gaps.
- **Differentiator:** this is the Tauri/Rust wedge made real — the local-private compute host incumbents don't offer.
- **Biggest lever:** mount or cleanly gate AGI Code; finish settings IA; finish office-doc editing or stop claiming it.

### Mobile (Expo / React Native) — ~80% real, on-device LLM is genuinely strong

- **Present (and impressive):** a real tier-1→2→3 on-device runtime ladder (system models → ExecuTorch → llama.rn) with real streaming, fallback, thermal checks, and SHA-256-verified resumable model downloads. This is the _hard_ part of an on-device AI app, done properly.
- **Partial/Gated:** cloud features gated off by design; vision is OCR-only (not image understanding); "60+ language translation" is en↔hi only; iOS Apple Foundation Models path is a stub.
- **Missing/blocker:** TLS pins are placeholders (`PINNING_ENFORCED=false`) — a real pre-launch blocker.
- **Biggest lever:** provision real TLS pins; align marketing claims to shipped scope (see `03`); ship the App Store build (this is the active surface per your source-of-truth).

### CLI (Rust) — ~90% real, genuinely Claude-Code-class

- **Present:** 50+ real tools (LSP, git worktrees, A2A, apply-patch), real OAuth (GitHub/OpenAI), reqwest streaming, read-before-write freshness checks, approval gates, privacy-mode guards, local model discovery (Ollama/LM Studio).
- **Partial/honest-stub:** `--include-partial-messages` and `--input-format stream-json` accepted but bail; headless permission mode unwired; cloud-exec waitlist-gated.
- **Biggest lever:** a stricter parity pass against Claude Code + Codex CLI; finish or remove the bailing SDK flags.

### Chrome extension (MV3) — ~75% real, Functional-partial

- **Present:** 64 real background message handlers, real content-script browser actions + autofill, sync-boundary tests.
- **Partial/Gated:** polished side-panel UX, least-privilege permissions story, the desktop `/pair` bridge dependency, human-approval gates for autonomous actions.
- **Risk:** this is where the prompt-injection tax lives (per `01`). Do not demo autonomous browser actions until approval gates + sender validation are confirmed.

### VS Code extension — ~75% real, Functional-partial

- **Present:** real provider client (`utils/api.ts` → `agiworkforce.com/api/llm/v1`), agent loop, diff/edit/checkpoint/terminal providers.
- **Partial:** cloud sign-in copy drifts from API-key reality; align to the Codex/Claude IDE baseline (chat/edit/agent modes, @ file refs, diagnostics, diff review, cloud handoff preview).

### Sandbox — intentionally minimal, correct by design (not a gap).

---

## 4. What AGI has that the incumbents do not

These are not gaps — they are the assets. Treat them as the product's center of gravity.

1. **Provable local-first privacy** with explicit, code-enforced trust boundaries (`suite-contracts.ts`, `assertSurfaceCanSyncChats`, fail-closed `remoteChatGate`/`llmGate`). Incumbents architecturally cannot match this without self-harm.
2. **Multi-provider neutrality** — 15 providers, 4 auto-routing tiers, a single catalog source of truth. No incumbent offers cross-lab choice.
3. **BYOK at no markup** in Local/Desktop/CLI — a credibility/trust signal incumbents won't copy.
4. **Rust/Tauri desktop** — a genuine performance/footprint edge over both Electron incumbents.
5. **A real on-device mobile LLM** — most "AI apps" are thin clients to a cloud; AGI actually runs models locally on the phone.
6. **An honest, self-auditing engineering culture** — `known-flaws.md`, `risk-map.json`, and the F01–F24 ledger are diligence assets most startups can't show. (See `03`.)

---

## 4b. Reference codebases close many of these gaps for you

Two of these gaps now have working reference implementations you can read directly (full analysis in `09-reference-codebases.md`):

- The **agent-runtime gaps** (one shared, reliable runtime) are answered by `claude-code` — your CLI matches on breadth but lags on a real `Tool` trait, LLM-summarization compaction, wiring your already-built policy engine, and streaming tool execution.
- The **local-path and breadth gaps** (multi-provider robustness, memory/skills, deep research, the "feels like a workspace" surfaces) are answered by `odysseus` — ~14 adoptable patterns plus OSS (llmfit, Tongyi DeepResearch, ChromaDB, fastembed) to leverage instead of building.

Net effect: several "Missing/Partial" rows above are less risky than they look, because a proven implementation already exists to adapt.

## 5. Prioritized gap-closing themes (detail in `07-roadmap-12-month.md`)

1. **Harden the one shared agent runtime** before widening surfaces. Highest leverage.
2. **Close the "feels unfinished" perception gaps** that are cheap and high-visibility: global search, settings IA, connectors directory, artifacts polish.
3. **Production-harden the trust boundary** (audit-log immutability, TLS pins, Rust-egress gating) — because privacy _is_ the product, any leak is existential, not cosmetic.
4. **Finish the active surface (Mobile) to App Store release** before opening new fronts, per your own serial-by-surface rule.
5. **Make managed cloud safe to scale** (metering, abuse, refund/chargeback) — the revenue engine.
6. **Stop claiming what isn't shipped** (mobile vision/translation, "parity") — diligence and app-store review both punish overclaiming.
