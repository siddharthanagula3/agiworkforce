# AGI Runtime — Volume 07 — Context Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and `apps/desktop/AGENTS.md` (nearest surface for the local context host); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `packages/client/client-runtime/src/context/agentContext.ts`, `crates/agiworkforce-protocol/src/{message_history.rs,items.rs,memory_citation.rs}`, `apps/desktop/src-tauri/src/sys/commands/project_context.rs`, `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs`, `apps/desktop/src-tauri/src/core/agent/code_generator.rs`, `packages/contracts/types/src/memory.ts`, `apps/web/app/api/memory/search/route.ts`, `apps/web/app/api/{chat,memory,projects}/sync`.

## Overview & stance

The Context Engine is the internal Runtime subsystem that decides **what the model sees**: which repository facts, workspace scope, prior turns, files, symbols, and persistent memories are assembled into a prompt, how they are compressed to fit a window, and how they are ranked when they will not all fit. It is not a user surface; it is shared machinery the six surfaces call into.

Trust boundaries are the first-class constraint here, because context is exactly the data most likely to leak across them. A Local session's repository, workspace files, and conversation history are gathered and kept **on the host** — never uploaded, embedded remotely, or fed to BYOK/managed-cloud providers without an explicit Local→BYOK fork (context selection, secret scan, payload preview, visible provider label, consent). Managed-Cloud chats are the only rows that delta-sync (Neon, `apps/web/app/api/{chat,memory,projects}/sync`); Local/BYOK context never enters that path. On Mobile and Web there is **no BYOK and no on-host filesystem context** — their Context Engine draws only from cloud-synced conversation and memory. Desktop, CLI, and VS Code assemble filesystem/symbol context locally and keep it local unless the user forks. Most parity-grade retrieval (semantic memory, symbol graphs, relevance ranking) is 🔭 today.

### Repository Context — project structure

Requirements: the engine must derive a compact structural summary of the active project — a bounded directory listing plus a detected primary project type — and inject it as a system fragment, without walking the whole tree. **🟡 Partial** — `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs` builds `build_project_context_message(folder)` which lists up to 25 top-level entries (then "… and N more items") and probes language manifest markers to name the project type. Gap: no repo-wide index, dependency graph, or ignore-file-aware traversal; the listing is a flat cap, not a structural model.

### Workspace Context — workspace representation

Requirements: represent the active workspace as a validated root that scopes file, terminal, and tool operations, and expose it to executors. **🟡 Partial** — `apps/desktop/src-tauri/src/sys/commands/project_context.rs` defines `ProjectContext { folder, name, is_valid }` and publishes the root via `PROJECT_FOLDER_ENV_VAR` so folder-aware tools stay scoped. Gap: single-root only; multi-root workspaces, per-root trust policy, and a shared cross-surface workspace descriptor are 🔭. CLI and VS Code workspace scope stays task-local and does not auto-hand-off to app chat.

### Conversation Context — conversational history

Requirements: preserve ordered prior turns per conversation, propagate the active conversation identity through the async execution chain, and (for Managed-Cloud only) delta-sync history across devices. **🟡 Partial** — `crates/agiworkforce-protocol/src/message_history.rs` defines `HistoryEntry { conversation_id, ts, text }`; `packages/client/client-runtime/src/context/agentContext.ts` carries `conversationId`/`activeModelId`/`planTier` through `AsyncLocalStorage` so concurrent sessions never bleed; Managed-Cloud chats delta-sync via `apps/web/app/api/chat/sync` (cursor + tombstones + idempotent upsert). Gap: a single centralized turn-window assembler with per-model token budgeting is not yet one component; Local/BYOK conversations must never enter the sync path.

### File Context — inject relevant files

Requirements: read named files, sanitize their contents against prompt-injection/control characters, and inject them as bounded fragments. **🟡 Partial** — `prompt_context.rs` provides `sanitize_for_prompt` and `sanitize_multiline_for_prompt` (strip control chars and backticks, truncate) and folds selected files into the prompt; `apps/desktop/src-tauri/src/core/agent/code_generator.rs` `analyze_existing_code(&[PathBuf])` reads file contents into a map for generation. Gap: **relevance-driven** file selection (which files matter for this turn) is 🔭 — today files are user-attached or explicitly named, not auto-retrieved.

### Symbol Context — inject classes and functions

Requirements: parse source into a symbol table (classes, functions, signatures) and inject only the relevant definitions rather than whole files. **🔭 Planned** — no code-symbol indexer exists. The only tree-sitter-style parsing in-repo is `crates/agiworkforce-execpolicy/src/parser.rs`, which parses **shell commands** for the exec policy, not code symbols. Design intent: a local, on-host AST index (Desktop/CLI/VS Code) that never uploads symbols under Local trust; no such crate is built.

### Memory Context — inject persistent memories

Requirements: retrieve durable user/project memories relevant to the turn, inject them, and attach verifiable citations. **🟡 Partial** — `packages/contracts/types/src/memory.ts` models a memory with an optional `embedding?: number[]` field; `apps/web/app/api/memory/search/route.ts` performs an escaped `ILIKE` text search (its own comment: "can be upgraded to vector similarity later"); `crates/agiworkforce-protocol/src/memory_citation.rs` (`MemoryCitation` / `MemoryCitationEntry { path, line_start, line_end, note }`) carries source citations; Managed-Cloud memory delta-syncs via `apps/web/app/api/memory/sync`. Gap: semantic/vector retrieval and automatic injection ranking are 🔭; the `embedding` field is transport-only and unused for search. Local memory stays on-host.

### Context Compression — reduce token usage

Requirements: when accumulated context nears the model window, compact older turns/tool output into a summary and emit a lifecycle event so surfaces can render the boundary. **🟡 Partial** — `crates/agiworkforce-protocol/src/items.rs` defines `ContextCompactionItem` and emits `ContextCompactedEvent` as a first-class turn item. Gap: the actual summarizer (what to keep/drop, per-model token budget, tool-output truncation strategy) is 🔭 — the event/item type exists but the compression algorithm and its trigger policy are not implemented as a shared component.

### Context Prioritization — rank contextual relevance

Requirements: when candidate context (files, symbols, memories, prior turns) exceeds the budget, score each by relevance and include the highest-ranked within the token limit deterministically. **🔭 Planned** — no relevance ranker exists; current bounds are static caps (e.g., 25 listed entries, fixed truncation lengths), not scored selection. Design intent: a single ranking pass feeding the prompt-assembly engine (Volume 08), trust-mode-aware so Local candidates are never scored against or shipped to cloud providers.

## Repository map

- `packages/client/client-runtime/src/context/agentContext.ts` — per-command `AgentContext` propagation (conversation/model/tier isolation).
- `crates/agiworkforce-protocol/src/message_history.rs` — conversation `HistoryEntry` shape.
- `crates/agiworkforce-protocol/src/items.rs` — `ContextCompactionItem` / `ContextCompactedEvent`.
- `crates/agiworkforce-protocol/src/memory_citation.rs` — memory citation entries.
- `apps/desktop/src-tauri/src/sys/commands/project_context.rs` — workspace root state + scoping.
- `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs` — repository/OS/file context builders + sanitizers.
- `apps/desktop/src-tauri/src/core/agent/code_generator.rs` — file-content ingestion for generation.
- `packages/contracts/types/src/memory.ts` — memory record + embedding field.
- `apps/web/app/api/memory/search/route.ts`, `apps/web/app/api/{chat,memory,projects}/sync` — cloud memory search + delta-sync.

## Competitor notes

Claude Code, ChatGPT, and Codex assemble context around a single first-party provider and (Claude/Codex) a local repo map with implicit uploads to that vendor. AGI diverges deliberately: (1) **multi-provider** — context assembly is provider-neutral, so the same fragments feed the Model Router's chosen backend (IDs only from `packages/contracts/types/src/models.json`); (2) **per-surface trust** — filesystem/symbol context exists only where the surface allows it (Desktop/CLI/VS Code), and Mobile/Web have none; (3) **local-first** — under Local trust, repository, workspace, file, and symbol context are gathered and retained on the host, and crossing to BYOK/cloud is an explicit, previewed, consented fork, not a silent upload; (4) **BYOK where allowed only** — never on Web or Mobile.

## Acceptance / Definition of Done

Production-ready when: repository/workspace/file/conversation context assemble deterministically within a per-model token budget; every candidate carries a trust label; compression and prioritization are single shared components with tests; and no Local/BYOK context reaches a cloud path without an audited fork.

- [ ] Build: context assembly is deterministic and byte-bounded; compaction emits `ContextCompactedEvent`; assembler unit-tested per surface.
- [ ] Trust: Local/BYOK context is provably excluded from `apps/web/app/api/{chat,memory,projects}/sync`; Local→BYOK requires context selection + secret scan + payload preview + provider label + consent.
- [ ] Security: injected file/memory content passes `sanitize_*_for_prompt`; memory citations resolve to real `path`/line ranges; no prompt-injection escape via unsanitized tool output.

## Anti-patterns

- Silently embedding or uploading Local repository/file/symbol context to any BYOK or managed-cloud provider — a trust-boundary violation.
- Syncing Local or BYOK conversation/memory rows through the Neon delta-sync APIs (cloud-only).
- Claiming semantic memory retrieval, a symbol index, a compression summarizer, or a relevance ranker as shipped — these are 🟡/🔭; never assert shipped state without a real repo path.
- Hardcoding or inventing model IDs / token-window numbers; resolve models from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus, `pro_plus`, Hobby, a consumer Team tier), inventing INR prices beyond Basic ₹399, or adding credit top-ups.
- Referencing Supabase, `middleware.ts`, or the `agiworkforce <cmd>` invocation — use Clerk/Neon/Stripe, `proxy.ts`, and the `agi` binary.
