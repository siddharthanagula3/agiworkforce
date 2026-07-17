# AGI CLI — Volume 06 — Workspace Context

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in real source at `apps/cli/src/context.rs`, `apps/cli/src/path_security.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/agent/prompt.rs`, `apps/cli/src/features/exec/tools/dir_ops/mod.rs`, and the tool host in `crates/agiworkforce-app-server` (surfaced via `apps/cli/src/app_server.rs`). Model IDs, when referenced, come only from `packages/contracts/types/src/models.json`.

## Overview & stance

Workspace context is how AGI CLI turns "the directory you launched in" into structured, bounded facts the agent can reason over: which repo, which language, which package manager, which files it may read, and what to ignore. On the CLI this is a **local-first, workspace/session-scoped** operation. Every detector in `apps/cli/src/context.rs` runs on-device against the current working directory; nothing here calls a provider. Context only leaves the machine when a turn is actually sent, and only under the session's active trust mode (`PrivacyMode::Local | Byok | Managed` in `apps/cli/src/agent/mod.rs`). A Local session is hard-blocked from shipping context to a non-local provider by `AgentSession::validate_privacy_boundary`; Local→BYOK is the explicit, consented fork documented in Volume 02. Workspace context is never auto-synced to app chat — the Neon delta-sync fabric (`apps/web/app/api/{chat,memory,projects}/sync`) is Web/Mobile/Desktop-only; any handoff of CLI context to a cloud chat is explicit and redacted.

## Repository Detection

✅ Built — `apps/cli/src/context.rs`. `detect_git_branch` (`git rev-parse --abbrev-ref HEAD`), `detect_git_status_summary` (`git status --short`, parsed into modified/added/deleted/untracked counts, or `clean`), and `detect_git_remote_url` (`git remote get-url origin`) shell out to git and fail soft to `None` outside a repo. Requirement: detection must never panic or block on a missing/malformed repo, and a non-git directory must still yield a usable `SystemContext`. Deeper VCS facts (ahead/behind, submodules, worktree topology, non-git VCS) are 🔭 Planned.

## Workspace Discovery

✅ Built — `gather_system_context()` in `apps/cli/src/context.rs` snapshots the cwd plus OS and shell, then runs every detector. The workspace **root boundary** is enforced separately in `apps/cli/src/path_security.rs`: `validate_workspace_path` / `allowed_workspace_roots` confine tool reads and writes to the cwd and any registered roots. Requirement: discovery is cwd-anchored, every path a tool touches must pass `validate_workspace_path`, and traversal outside the allowed roots must be refused with an actionable error, not silently clamped.

## Multi-root Workspaces

✅ Built — `AgentSession::add_context_dir` (`apps/cli/src/agent/mod.rs`) registers an additional root via `path_security::register_additional_workspace_root`, deduplicates, and loads that directory's instruction lineage into session context (mirrors Claude Code `/add-dir`; the example command is `agi` never `agiworkforce`). `registered_additional_workspace_roots()` widens `allowed_workspace_roots` so tools may read the new root. Requirement: each added root is validated and canonicalized before use; adding a root outside the initial tree is allowed only through this explicit call, and instruction files found there are attributed to their source directory. Cross-root symbol/dependency unification is 🔭 Planned.

## Ignore Rules

🟡 Partial — `apps/cli/src/features/exec/tools/dir_ops/mod.rs`. `grep_files` shells to `rg`, which honors `.gitignore`/`.ignore` and skips hidden/VCS dirs by default; `glob` uses the `glob` crate and **refuses absolute patterns and patterns escaping the project**. Gap: the `search_files` path uses `grep -rn --include=*`, which does **not** honor `.gitignore`; there is no unified ignore engine and no first-class `.agiignore`/allowlist config file in `apps/cli/src`. Requirement (to close): one ignore layer that both search paths share, honoring `.gitignore` plus a project ignore file, with `node_modules`/`target`/`.git` excluded by default and an opt-in to include ignored files. Until then, ignore behavior differs by tool and must be documented per tool.

## Symbol Extraction

🔭 Planned — no tree-sitter, ctags, AST walker, or in-process LSP client exists under `apps/cli/src` today (verified: no `tree_sitter`/`ctags`/symbol-index modules). Design intent: extract definitions (functions, types, exports) per file into a queryable symbol table so the agent can jump to a definition without re-reading whole files. Requirement when built: extraction is local-only, incremental, and language-pluggable; it must respect the Ignore Rules layer and the workspace-root boundary. Not shipped — do not describe symbol search as available.

## Dependency Detection

🟡 Partial — `apps/cli/src/context.rs` identifies the **toolchain**, not the graph: `detect_package_manager` maps lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`, `Cargo.lock`, `go.sum`, `Pipfile.lock`, `poetry.lock`) to a manager, and `detect_monorepo_type` maps `pnpm-workspace.yaml`/`lerna.json`/`nx.json`/`turbo.json`/`rush.json` to an orchestrator, ordered by specificity. Gap: no parsing of declared dependencies, versions, or the resolved graph. Requirement to advance: read manifests to enumerate direct dependencies and surface outdated/vulnerable hints, still fully on-device. Full graph resolution is 🔭 Planned.

## Language Detection

✅ Built (project-level) — `detect_project_type` and `detect_project_language` in `apps/cli/src/context.rs` classify a repo from marker files (Rust, Go, Elixir, Ruby, Java, .NET, Python, Node) and split TypeScript vs JavaScript by `tsconfig.json` presence. Requirement: detection is deterministic and priority-ordered (e.g. `Cargo.toml` outranks `package.json`), and returns `None` cleanly when unknown. Per-file / per-extension language histograms and mixed-language weighting are 🔭 Planned.

## Context Building

✅ Built — `AgentSession::new_with_provider` (`apps/cli/src/agent/mod.rs`) assembles the system message from `SystemContext`, project instruction files, discovered skills, memory (`MemoryManager`), and rules via `prompt::build_system_prompt` (`apps/cli/src/agent/prompt.rs`); `SystemContext`'s `Display` renders a compact `<environment>` block. `attach_context_files` folds file bodies into session context under explicit budgets (see below). Requirement: assembled context is bounded, prompt-injection-hardened (see `agent/prompt.rs` guards), and identical whether the model is Local, BYOK, or Managed — trust mode governs egress, not what is gathered.

## Incremental Indexing

🔭 Planned — there is no persistent code index, embedding store, or repo map under `apps/cli/src`. The `notify` crate is a declared dependency (`apps/cli/Cargo.toml`) providing an fs-watch primitive, but it is not wired to an index. Design intent: a local, incrementally updated index (symbol table + optional on-device embeddings) refreshed on file-change events, invalidated per-file. Requirement when built: index data stays on-device for Local sessions, honors Ignore Rules, and is never uploaded implicitly. Any embedding model must be a real, referenced on-device engine, not a hardcoded LLM catalog ID.

## Large Repository Handling

🟡 Partial — `apps/cli/src/features/exec/tools/dir_ops/mod.rs` caps output today: `MAX_GLOB_RESULTS = 1000`, `rg --max-count=100`, the `grep` fallback `-m 200`, a `COMMAND_TIMEOUT`, and `truncate_output_with_save` for oversized results; `attach_context_files` (`apps/cli/src/agent/mod.rs`) enforces a 120,000-char total / 40,000-char per-file attachment budget with truncation flags. Gap: no index-driven navigation, so very large repos rely on bounded search rather than smart sampling. Requirement to advance: index-backed retrieval, deterministic result ranking, and graceful degradation that stays within the same caps.

## Repository map

- `apps/cli/src/context.rs` — `SystemContext`, all detectors (git, language, package manager, monorepo, CI, containers, editors).
- `apps/cli/src/path_security.rs` — workspace-root registration and path validation.
- `apps/cli/src/agent/mod.rs` — `add_context_dir`, `attach_context_files`, `PrivacyMode`, `validate_privacy_boundary`, context assembly.
- `apps/cli/src/agent/prompt.rs` — system-prompt / context builder and injection guards.
- `apps/cli/src/features/exec/tools/dir_ops/mod.rs` — `search_files`, `grep_files`, `glob`, output caps.
- `crates/agiworkforce-app-server` (via `apps/cli/src/app_server.rs`) — tool host exposing search/read tools over JSON-RPC/WS.

## Competitor notes

Claude Code and Codex CLI ground the agent in the working directory with git awareness, gitignore-respecting search, and (Codex) an `AGENTS.md`-style instruction pickup; neither exposes on-device provider choice at the context layer. AGI's deliberate divergence: context gathering is **multi-provider-agnostic and trust-scoped** — the same `SystemContext` feeds a local Ollama model, a BYOK provider key, or Managed Cloud, but `validate_privacy_boundary` guarantees a Local session's workspace context cannot silently reach a remote provider. BYOK is available here (CLI is one of the three BYOK surfaces) but never on Web/Mobile. Multi-root and instruction pickup match Claude Code `/add-dir`; symbol/index parity is explicitly 🔭.

## Acceptance / Definition of Done

The domain is production-ready when detection is deterministic and non-panicking on non-git/empty/huge repos, all tool paths honor a shared Ignore Rules layer and the workspace-root boundary, and no context egress occurs outside the active trust mode.

- [ ] Build/behavior: `cargo test -p agiworkforce-cli --lib` green (context + path_security + dir_ops suites); detectors return `None`/empty cleanly on unknown dirs.
- [ ] Trust: a Local session with a cloud model is blocked by `validate_privacy_boundary`; multi-root adds go through `path_security` validation; no automatic sync to app chat.
- [ ] Security: search/glob/read refuse paths outside allowed roots; output caps and attachment budgets enforced; ignore layer excludes secrets-bearing dirs by default once unified.

## Anti-patterns

- Silently routing Local workspace context to BYOK or Managed Cloud, or auto-syncing CLI context to app chat.
- Reading or searching outside registered workspace roots, or clamping instead of refusing out-of-bounds paths.
- Claiming symbol extraction or incremental indexing as shipped — they are 🔭 Planned; cite no path you cannot show.
- Hardcoding or inventing LLM model IDs for an embedding/index feature (use `packages/contracts/types/src/models.json`; on-device embedding engines must be real and referenced).
- Referencing Supabase, `middleware.ts`, removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or invented INR prices.
- Using `agiworkforce <cmd>` in examples — the user-facing binary is `agi`.
