# AGI Code Master Spec — The Operating Manual

Status: Canonical · the standard operating manual for every autonomous session
Owner: Founder + platform lead
Last updated: 2026-06-28
Location rule: lives in `docs/spec/` (root docs are restricted by `docs/engineering/naming-conventions.md`).

This is the constitution. Every autonomous coding session reads the Preamble + Operating Laws first, then the volume(s) for the surface/domain it is touching. Where a volume names an authority doc, that doc holds the deep detail; this manual holds the binding rules.

---

## Preamble — precedence

When sources conflict, obey in this order:

1. `AGENTS.md` (canonical agent entry) and `CLAUDE.md`.
2. This manual (`docs/spec/`).
3. `docs/current/` (source-of-truth, parity matrix, PRD, byok strategy, trust-mode matrix).
4. `docs/strategy/` (analysis + execution plans 01–15) and `docs/engineering/`.
5. `docs/agent-context/` (repo-map, known-flaws, commands, risk-map).

Treat as evidence/working notes, never as law: `audit/**`, `reports/**`, `tasks/**`, `docs/archive/**`, dated audit dirs, generated parity reports. (These are being removed — see `scripts/clean-repo.mjs`.)

---

## The Operating Laws (binding on every session)

1. **Trust boundaries are absolute.** Local never silently routes to BYOK or Managed. Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent). Any networking change must pass the trust-boundary contract tests. A violation is a P0.
2. **Model IDs are catalog-owned.** Read every model ID/capability from `packages/types/src/models.json`. Never invent or hardcode one.
3. **Adapt, never copy proprietary.** Study `claude-code` for intent; port only from license-clean donors (see Vol 7 / `PORTING-TRACKER.md`). Preserve upstream attribution. The license gate (`scripts/check-licenses.mjs`) must pass.
4. **Verify before done.** No feature is complete on build success alone. Inspect the path, run the surface check from `docs/agent-context/commands.json`, run targeted + trust-boundary tests, run e2e/visual for UI, record residual risk in `known-flaws.md`.
5. **No theater.** No fake tests, swallowed mock assertions, fabricated data, dead controls, or claims beyond shipped scope. Marketing copy may not exceed what the parity matrix marks `Present`.
6. **One concern per file; folder-per-feature.** Follow `docs/strategy/15-structure-and-granularity-conventions.md`. Enforced by `check:structure-conventions`.
7. **Commit + verify loop.** Work in increments on `feat/agi-alpha`; each increment = study → port → attribute → verify → commit (hooks pass, never `--no-verify`) → update `PORTING-TRACKER.md`.
8. **Runtime before surfaces; trust before growth; depth in one vertical before breadth.** (See `docs/strategy/`.)

---

## AGI Invariants (hard-coded product truths)

Non-negotiable. A change that violates one is a release blocker, not a bug. Machine-readable in `docs/spec/artifacts/architecture_report.json`.

1. **Cloud Mode is one logical product.** Desktop Cloud, Web, and Mobile Cloud share identical backend behavior — fix shared backend once; never fork behavior per surface.
2. **Local Mode is completely isolated and never talks to AGI Cloud** (no telemetry, sync, or provider proxy).
3. **BYOK exists only in Local Mode, with no markup.** Web/Mobile v1 expose no BYOK.
4. **Desktop Local and Mobile Local store everything locally.** Local data leaves the device only via an explicit, consented transfer.
5. **Stacks are fixed:** Desktop = Rust/Tauri; Mobile = Expo/React Native; Web = Next.js; backend = Neon + Clerk.
6. **Shared `packages/`/`crates/` are the preferred implementation point.** Platform-specific code is the justified exception.
7. **Billing is subscription-first.** Tokens pass through at cost; monetize the software/governance layer.
8. **Multi-provider is core; no provider lock-in.** Model IDs/capabilities come from `packages/types/src/models.json`.
9. **Trust boundaries are a product invariant.** Local→BYOK→Managed is never crossed silently; a violation is P0.

## Engineering Rules

Binding on every change. Machine-readable: `docs/spec/artifacts/engineering_rules.json`.

1. **Never duplicate business logic.** Prefer shared `packages/`/`crates/`; a second copy needs an explicit removal plan.
2. **Fix the shared backend before platform-specific code.** Platform code adapts to the shared contract, not vice versa.
3. **Cross-surface verification:** if Mobile Cloud changes a shared API, verify Desktop Cloud + Web; if the backend changes, verify all Cloud surfaces (see `dependency_graph.json`).
4. **Every feature has runtime validation** — validate all tool/LLM/API/IPC inputs (Zod/serde); no unvalidated external input.
5. **Every bug requires** reproduction → root cause → fix → regression test → verification. No fix lands without a regression test.
6. **No speculative refactors during Alpha stabilization.** Refactor only what the active increment touches.
7. **Adapt, never copy proprietary** (Law 3); **verify before done** (Law 4); **no theater** (Law 5).

## Machine-readable artifacts

`docs/spec/artifacts/` holds diffable JSON curated alongside this spec — `engineering_rules.json`, `feature_matrix.json`, `competitor_matrix.json`, `implementation_map.json`, `dependency_graph.json`, `release_checklist.json`, `roadmap.json`, `architecture_report.json`. Diff them across snapshots (git or a validator) to track drift over time.

---

## Volume index

Volumes 1–8 are platform law. 9–33 are domain law. 34–40 are program + governance.

| #   | Volume                                     | Authority / depth                                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------ |
| 1   | Mission, Vision, Philosophy, Architecture  | this manual + `docs/strategy/README.md`                            |
| 2   | Repository Map & Structure                 | `docs/agent-context/repo-map.json`, `docs/strategy/15`             |
| 3   | Modes & Trust (Cloud/Local/Hybrid/Privacy) | `docs/current/source-of-truth.md`, `trust-mode-surface-matrix.md`  |
| 4   | Tenancy, Identity, Entitlement             | `docs/current/` + this manual                                      |
| 5   | Applications (all surfaces)                | `docs/strategy/12–14`, per-surface `AGENTS.md`                     |
| 6   | Runtime (cloud/local/hybrid)               | `docs/strategy/04`, `docs/strategy/10`                             |
| 7   | Providers & abstraction                    | `docs/current/byok-open-model-provider-strategy.md`, `models.json` |
| 8   | Model Layer                                | `packages/types/src/models.json`, `model-catalog.ts`               |
| 9   | Conversation System                        | this manual                                                        |
| 10  | Prompt System                              | this manual                                                        |
| 11  | Context System                             | this manual                                                        |
| 12  | Memory                                     | `docs/strategy/10` §4                                              |
| 13  | Projects                                   | this manual                                                        |
| 14  | Artifacts                                  | `docs/strategy/02`, `10`                                           |
| 15  | Files                                      | this manual                                                        |
| 16  | AI Features                                | this manual                                                        |
| 17  | Agent System                               | `docs/strategy/09`, `10`                                           |
| 18  | Tools                                      | `docs/strategy/15` §2                                              |
| 19  | MCP                                        | `docs/strategy/10`                                                 |
| 20  | Connectors                                 | this manual                                                        |
| 21  | Skills                                     | `docs/strategy/10` §5                                              |
| 22  | Plugins                                    | `docs/strategy/10` §5                                              |
| 23  | UI System                                  | this manual                                                        |
| 24  | Streaming                                  | this manual                                                        |
| 25  | Storage                                    | `docs/strategy/04`                                                 |
| 26  | Synchronization                            | `docs/strategy/04`                                                 |
| 27  | Authentication                             | this manual                                                        |
| 28  | Billing                                    | `docs/strategy/05`, `06`                                           |
| 29  | Observability                              | this manual                                                        |
| 30  | Security                                   | `docs/strategy/03`, `docs/agent-context/risk-map.json`             |
| 31  | Performance                                | `docs/strategy/04`                                                 |
| 32  | Testing & QA                               | `docs/strategy/03` §5                                              |
| 33  | Developer Experience                       | this manual                                                        |
| 34  | Competitive Parity (Claude/ChatGPT RE)     | `docs/strategy/01`, `02`                                           |
| 35  | Implementation Audit & Tech Debt           | `docs/strategy/03`                                                 |
| 36  | Roadmap & Release Readiness                | `docs/strategy/07`, `11`, `12–14`                                  |
| 37  | Founder Report (GTM/Fundraising)           | `docs/strategy/05`, `06`                                           |
| 38  | Schemas & Contracts                        | `packages/types`, this manual                                      |
| 39  | Output Directory Structure                 | this manual                                                        |
| 40  | Governance & the Session Loop              | `docs/strategy/11`                                                 |

---

## Volume 1 — Mission, Vision, Philosophy, Architecture

- **Mission:** the AI workspace you own — multi-provider, local-first, private by architecture.
- **Vision:** the application layer users choose for Claude/ChatGPT-class workflows without single-lab lock-in; earn a sovereign/privacy-first enterprise wedge.
- **Philosophy:** thin clients over one shared agent runtime; adapt licensed OSS, originate only the moat (trust enforcement, billing, client-side BYOK).
- **Architecture:** six surfaces over shared `packages/` (TS) + `crates/` (Rust); `services/` backend; Neon canonical DB. Runtime built once, reused everywhere.

## Volume 2 — Repository Map & Structure

- Surfaces in `apps/{web,desktop,mobile,cli,extension,extension-vscode,sandbox}`; shared TS in `packages/*`; shared Rust in `crates/*`; backend in `services/*`; canonical migrations in `apps/web/db/neon`.
- Packages must not import from apps. Services must not import UI. Reusable runtime → `crates/` only with a second consumer.
- Structure law: folder-per-tool/command/feature, one concern per file, co-located `prompt`/`UI`/validators, barrels (`index.ts`/`mod.rs`), domain-grouped `utils/`, isolated `generated/`. Full rules + enforcement: `docs/strategy/15`.

## Volume 3 — Modes & Trust

- Modes: **Local** (on-device/local host), **BYOK** (user key, direct), **Managed Cloud** (AGI-managed; public alpha, open by default, env kill-switch only). **Hybrid** = routing across them with explicit, consented boundary crossings.
- Privacy modes and labels come from `packages/types/src/suite-contracts.ts`; never hardcode new wording. `assertSurfaceCanSyncChats` governs sync.
- Web/Mobile v1 expose no BYOK. CLI/VS Code/Chrome stay workspace/task-scoped (no auto app-chat sync). Authority: `docs/current/source-of-truth.md`, `trust-mode-surface-matrix.md`.

## Volume 4 — Tenancy, Identity, Entitlement

- Scope: organizations, teams, workspaces, user profiles, RBAC, permissions, quotas, usage policies, licensing, subscription tiers, multi-tenant isolation.
- Rules: every record carries org/workspace/user scope; RLS enforced at the DB; managed access is subscription/entitlement-gated (not waitlist). Quotas + spend limits enforced server-side. Enterprise: SSO/SCIM/audit/data-residency (Vol 28/30).

## Volume 5 — Applications (surfaces)

- Surfaces & current role: Web (Neon-backed account/sync, no BYOK), Desktop (Tauri local-private host, Local+BYOK+Managed), Mobile (on-device LLM + public-alpha cloud, no BYOK), CLI (Rust dev engine), VS Code, Chrome; planned: Safari/Firefox/Edge extensions, JetBrains plugin, API, SDK, MCP server.
- Each surface declares the surfaces+sync/trust boundary it crosses. Per-surface production law: `docs/strategy/12` (web), `13` (mobile), `14` (desktop). New surfaces inherit shared runtime + contracts; never re-implement trust logic locally.

## Volume 6 — Runtime

- **Cloud runtime:** LLM execution, streaming, function/tool calling, background tasks, queues, scheduling, retry, checkpointing. One hardened streaming gateway; exactly-once metering.
- **Local runtime:** local models via the tier ladder (system models → ExecuTorch → llama.cpp/llama.rn), GPU/CPU/NPU, ONNX, MLX, Ollama/LM Studio, vLLM/TensorRT where applicable. Never require an AGI account for Local.
- **Hybrid runtime:** capability/cost/health/trust-aware routing; failover + fallback across providers; offline mode; smart routing must explain its choice and never silently cross a trust boundary. Authority: `docs/strategy/04`, `10`.

## Volume 7 — Providers & abstraction

- Provider set lives in `models.json` (15 providers incl. OpenAI, Anthropic, Google, DeepSeek, xAI, OpenRouter, Groq, Mistral, Qwen, Moonshot, Zhipu, NVIDIA NIM, Perplexity, Runway, managed_cloud). Add via the provider abstraction; never scatter provider literals.
- Auth shapes differ (e.g., Anthropic uses `X-API-Key` + beta headers, not Bearer) — encode per provider. BYOK base URLs pass an SSRF guard. Custom providers via the provider SDK. Port robustness patterns per `docs/strategy/10` §2 (RLLM/Portkey/Bifrost).

## Volume 8 — Model Layer

- Registry + metadata in `models.json` / `model-catalog.ts`: capabilities (context window, reasoning/thinking, vision, audio, video), embeddings, rerankers, safety/moderation models.
- Auto-routing tiers (`auto`, `auto-economy`, `auto-balanced`, `auto-premium`) control cost/latency; default casual traffic to economy. Expose reasoning/effort only when the model supports it. User-preferred model respected within the active trust boundary.

## Volume 9 — Conversation System

- Scope: conversations, branches/forks, history, search, archive/delete/recover, pin/favorites, sharing, templates, export/import, metadata, summaries, memory.
- Rules: **one chat** accepts prompts + files + reference files + images + project context + tools + artifacts (no separate file-chat). Temporary chats never update memory and never persist pre-send. Branch/fork records source + selected context + redaction hash when crossing a boundary. Every message carries provider + privacy labels.

## Volume 10 — Prompt System

- Scope: system/user/project/workspace/agent prompts, templates, variables, libraries, versioning.
- Rules: tool/agent prompts live in a co-located `prompt.ts`/`prompt.rs` (Vol 18, Vol 2). Prompt assembly is deterministic and cache-stable — never mutate the API-bound object; clone for observers (prompt-cache discipline). Version prompts; no inline magic strings (Vol 38/constants).

## Volume 11 — Context System

- Scope: files, projects, memories, search, knowledge, connectors, MCP, skills, plugins, prior conversations, user/team profile.
- Rule: **dynamic context assembly** is a cost-ordered, trust-scoped pipeline. Only assemble context the active trust boundary permits; Local context never leaks into a BYOK/Managed request. RAG retrieval over full-context stuffing near limits.

## Volume 12 — Memory

- Scope: episodic, semantic, procedural, working memory; user/project/workspace/global scopes; search, summarization, pruning, import/export.
- Rules: two-layer store (RAG chunks + distilled facts with source provenance); generated-from-history pipeline; trust-scoped isolation via a container-tag equivalent (Local memory never surfaces cross-boundary); TTL forgetting; user view/manage/reset. Build the engine; adapt the schema (`docs/strategy/10` §4).

## Volume 13 — Projects

- Scope: creation, instructions, files, members, memories, knowledge, settings, models, artifacts, tasks, agents.
- Rules: project memory respects the project boundary; shared projects isolate by member RBAC; per-project model/provider defaults inherit but never override trust mode.

## Volume 14 — Artifacts

- Scope: documents, code, markdown, HTML, React, canvas, diagrams, images, PDFs, slides, tables; versioning, diff, restore, publish/share.
- Rules: every generated artifact has a manifest (checksum, MIME, TTL/retention, owner, privacy/provider mode). Rendering is isolated (sandbox iframe). AI-powered artifacts gated by capability + trust + auth. Renderer model adapts `defineToolCallRenderer` patterns (`docs/strategy/10` §6).

## Volume 15 — Files

- Scope: upload/download, drag&drop, clipboard, camera, photos, scanner, OCR, preview, indexing, search, versioning.
- Rules: local file ingestion is on-device by default (Local trust boundary; e.g., liteparse) and never leaves the device unless explicitly transferred. Scan/secret-check on ingest; carry privacy mode + source surface + storage scope on every attachment.

## Volume 16 — AI Features

- Scope: chat, thinking, deep research, web search, vision, OCR, voice/TTS/STT, image/video/audio generation, translation, summarization, coding/debugging/refactoring, planning, reasoning, simulation.
- Rules: each feature declares the surfaces + trust modes it supports and the model capabilities it requires; it is hidden (not faked) where unsupported. Claims must match shipped scope (Operating Law 5).

## Volume 17 — Agent System

- Scope: single/multi-agent, planner/reflector/critic/executor/reviewer, delegation, long-running/autonomous/scheduled/background agents, agent memory, marketplace.
- Rules: subagents are the same loop forked with scoped context, their own tool/permission/MCP envelope, and exhaustive cleanup. Autonomous/background runs require sandboxing + approval gates + human-in-the-loop for boundary-crossing or destructive actions.

## Volume 18 — Tools

- Scope: terminal, browser, computer use, filesystem, git, docker, SQL, REST/GraphQL, SSH, email, calendar, Slack, GitHub, Jira, Notion, Drive/OneDrive/Dropbox.
- Rules: every tool is a folder implementing the `Tool` trait/interface with fail-closed safety defaults (`is_read_only`/`is_concurrency_safe`/`is_destructive`/`check_permissions`), co-located prompt + validation + UI. Permission pipeline is layered + fail-closed; deny beats allow. Authority: `docs/strategy/15` §2, `10` §2.

## Volume 19 — MCP

- Scope: client, server, registry, discovery, permissions, authentication, tool execution, resources, prompts, sessions.
- Rules: MCP tools are deferred (loaded on use) to save context; per-agent scoping; OAuth/PKCE for remote servers; per-tool permission + consent UI. MCP-sourced skills may not shell-inject (untrusted-remote boundary).

## Volume 20 — Connectors

- Scope: Gmail/Outlook, Slack/Discord, GitHub/GitLab, Jira/Linear, Notion, Drive/Dropbox, Salesforce/HubSpot, Postgres/MySQL/BigQuery/Snowflake, REST/GraphQL.
- Rules: a connector directory with categories, search, OAuth/custom MCP, per-tool permissions, per-conversation loading, and admin controls. Connectors read third-party data only with explicit permission + a visible context label; respect per-user source permissions.

## Volume 21 — Skills

- Scope: installed/custom skills, marketplace, execution, permissions, lifecycle.
- Rules: a skill is `SKILL.md` (YAML frontmatter) + progressive disclosure (name/description preloaded, body on invoke); declares `allowed-tools`; per-skill permissions. Third-party skills pass the vetting gate before install + a rug-pull re-scan on update (Vol 30). `.skillignore` keeps secrets out of bundles.

## Volume 22 — Plugins

- Scope: registry, install, update, sandbox, permissions, signing.
- Rules: a plugin bundles skills + agents + hooks + commands + MCP/LSP; installs only from an allowlisted marketplace; runs with user privileges → must pass vetting + a declared-vs-actual permission check; pinned by commit/SHA; admin allowlist for managed deployments.

## Volume 23 — UI System

- Scope: navigation, sidebar, tabs, bottom bar, sheets, dialogs, toasts, context menus, keyboard shortcuts, gestures, themes, accessibility, animations, responsive layouts.
- Rules: the empty chat state shows input + plus + file attach + model selector + mic + send/stop + a visible trust/provider label (UX Lock, source-of-truth). Trust labels come from `suite-contracts.ts`, never hardcoded. WCAG 2.1 AA baseline (Vol 32). One headless chat shell, themed per surface.

## Volume 24 — Streaming

- Scope: token/markdown/code/tool-call/artifact/image/audio streaming; interrupt/resume/retry/cancel.
- Rules: persist the stream lifecycle (queued/running/tool_wait/completed/interrupted/failed); UTF-8-safe SSE parsing; stop cancels stream + tool execution and records interrupted state; on context overflow, withhold-and-recover (drain → compact → escalate) instead of erroring.

## Volume 25 — Storage

- Cloud: PostgreSQL (Neon canonical), Redis, blob/object storage, CDN, vector DB. Local: SQLite, MMKV, IndexedDB, SecureStore/Keychain, filesystem, cache, temp.
- Rules: RLS on every table; audit logs append-only; secrets in the OS keystore (Desktop stronghold/keychain, CLI keyring, Mobile SecureStore); Web/Chrome hold no BYOK keys; local data stays local unless explicitly transferred.

## Volume 26 — Synchronization

- Scope: conversations, projects, files, artifacts, memories, settings; offline queue, conflict resolution, background/live/delta sync.
- Rules: one conflict model (server-side LWW / version vectors) scoped strictly to the app-chat boundary; Web/Desktop/Mobile sync app chats only; CLI/VS Code/Chrome stay local unless an explicit redacted handoff. Local/BYOK never sync into Managed.

## Volume 27 — Authentication

- Scope: Clerk, OAuth, passkeys, MFA, session/device management, account switching.
- Rules: managed access is auth + entitlement gated; CSRF on state-changing routes; device/session list + revoke; secrets never in client logs; BYOK keys never transit AGI servers.

## Volume 28 — Billing

- Tiers: Free, Plus, Pro, Max, Enterprise. Scope: usage metering, credits, invoices, refunds, cost estimation, budget limits.
- Rules: tokens pass through at cost (no markup) — the business is the software/governance layer, not resold tokens (`docs/strategy/05`). Exactly-once metering (idempotent debit on retries; reserve-then-settle); daily drift audit between usage events and the credit ledger before managed agentic billing scales; spend limits enforced server-side.

## Volume 29 — Observability

- Scope: logs, analytics, traces, metrics, Sentry, crash reporting, feature flags, A/B testing.
- Rules: OpenTelemetry end-to-end (emit `gen_ai.*`); SLOs per surface; alert on provider error rate, stream stalls, metering drift, and trust-boundary violations (P0); no raw Local content in telemetry without consent.

## Volume 30 — Security

- Scope: encryption, secrets, BYOK, key rotation, CSRF/XSS/SSRF, RLS, sandboxing, isolation, audit logs, compliance.
- Rules: trust-partition enforcement in code (the moat) + contract tests; fail-closed secret-scan at the Local→BYOK fork; SSRF allowlist on outbound + BYOK base URLs; agent code runs sandboxed; third-party skills/plugins/MCP vetted before install; audit logs immutable; claim only what evidence backs (`docs/strategy/03`).

## Volume 31 — Performance

- Scope: startup, memory, battery, CPU/GPU, rendering, streaming latency, network, caching, lazy loading.
- Rules: per-surface budgets (web LCP < 2.5s; chat first-token p95 < 2.5s managed); prompt caching + batch by default; lazy-load heavy modules; route casual traffic to economy models. Targets: `docs/strategy/04` §7.

## Volume 32 — Testing & QA

- Scope: unit, integration, e2e, Playwright, Xcode, Android, load, chaos, fuzz, security, accessibility, performance.
- Rules: per-increment gate = typecheck/lint/cargo + targeted tests + surface check + trust-boundary tests + e2e/visual for UI. Web via Playwright + Chrome MCP; Mobile via Xcode MCP + Detox/Jest; Desktop via Playwright/smoke + cargo + computer-use MCP. No fake/hollow tests; provider-contract tests for every provider.

## Volume 33 — Developer Experience

- Scope: CLI, SDK, API, documentation, examples, templates, scaffolding, devtools, debugging, profiling.
- Rules: scaffolds emit the canonical structure (Vol 2 / naming-conventions); SDK + API are first-party contracts in `packages/types`; docs live under `docs/`; examples are runnable.

## Volume 34 — Competitive Parity

- Authority: `docs/strategy/01` (Claude + ChatGPT/Codex teardown), `02` (gap analysis), `docs/current/parity-implementation-matrix.md`.
- Rule: parity = user-capability + workflow parity, never copied code/assets/branding; marketing gated to `Present` rows.

## Volume 35 — Implementation Audit & Tech Debt

- Authority: `docs/strategy/03` + `docs/agent-context/known-flaws.md`, `risk-map.json`.
- Rule: audits are triage queues, not remediation — fix the cited source or record a concrete blocker with evidence.

## Volume 36 — Roadmap & Release Readiness

- Authority: `docs/strategy/07` (12-month), `11` (execution loop), `12–14` (per-surface). Sequence: Website → Mobile → Desktop.
- Rule: a surface ships only when its plan's exit criteria + per-increment gates are green.

## Volume 37 — Founder Report

- Authority: `docs/strategy/05` (GTM/business model), `06` (fundraising), `README`.
- Rule: "no markup" is a trust feature, not the revenue line; monetize the software/governance layer; lead with the sovereign/privacy-first enterprise wedge.

## Volume 38 — Schemas & Contracts

- Scope: JSON schemas, CSV schemas, wire/persistent contracts.
- Rules: shared contracts in `packages/types`; model catalog in `models.json`; generated types under `*/generated/`; validate every tool/LLM/API/IPC input (Zod/serde) — no unvalidated external input.

## Volume 39 — Output Directory Structure

- Rules: every generated artifact/file carries a manifest + a defined storage scope and retention; local generated files stay local; managed outputs follow retention/deletion policy; define per-surface output paths in the surface plan; never write outputs into source trees.

## Volume 40 — Governance & the Session Loop

- This manual is canonical; change it in the same PR as any rule change.
- **Session loop (every autonomous session):** read Preamble + Operating Laws → pick one increment from `PORTING-TRACKER.md` → study references for intent → port from license-clean donors → attribute → verify (Law 4) → commit on `feat/agi-alpha` (hooks pass; never `--no-verify`) → update the tracker → next.
- Enforcement: `check:structure-conventions`, `check:agent-context`, `check:licenses`, `check:llm-operability`, and the trust-boundary contract tests.
