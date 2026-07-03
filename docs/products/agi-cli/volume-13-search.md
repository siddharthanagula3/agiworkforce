# AGI CLI — Volume 13 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and these real repo paths — `apps/cli/src/features/exec/tools/dir_ops/mod.rs` (grep/search/glob), `apps/cli/src/features/exec/tools/web/mod.rs` (web search/fetch), `apps/cli/src/platform/runtime/tool_catalog.rs` (tool definitions), `apps/cli/src/platform/lsp/{mod.rs,client.rs,types.rs}` (LSP symbols), `apps/cli/src/sessions.rs` (conversation search), `apps/cli/src/agent/mod.rs` (privacy modes), `apps/cli/src/tool_search.rs` (tool discovery).

## Overview & stance

Search on AGI CLI is a family of **agent tools the model invokes**, not a single interactive command, plus a **conversation-history search** over the local session store. Because AGI CLI is workspace/session-scoped, all code, file, and symbol search stays inside the resolved project roots and never leaves the host on its own. Web search is the only egress path and it is provider-key-gated. The three trust modes shape every subsection: Local (`local_only`), BYOK (Desktop/CLI/VS Code only), and Managed Cloud. `apps/cli/src/agent/mod.rs` enforces `PrivacyMode::{Local,Byok,Managed}` and `validate_privacy_boundary()` blocks a Local session from silently routing to a non-local provider — search results are context that must respect that boundary, and any handoff to app chat is explicit and redacted (Neon delta-sync never carries CLI sessions). Command examples use the `agi` binary.

## Workspace search

Workspace search is content search across the resolved project roots. **✅ Built** — `execute_grep_files` in `apps/cli/src/features/exec/tools/dir_ops/mod.rs` runs `rg` (ripgrep) with `--line-number --no-heading --color=never --max-count=100`, supports an `include` glob filter, and falls back to `grep -rn` when `rg` is absent. The `grep_files` tool definition (`apps/cli/src/platform/runtime/tool_catalog.rs`) is `read_only` with a 50 KB size cap. A legacy `execute_search_files` (`search_files` tool) provides the `grep -rn` path.

Requirements: results MUST be confined to project roots — `validate_file_path` refuses paths outside the workspace ("Refusing to grep outside project"), including additional roots added via `/add-dir` (`add_context_dir`). Searches MUST time out (`COMMAND_TIMEOUT`) and truncate oversized output (`truncate_output_with_save`). No result may cross a trust boundary: a Local session's matches stay local.

## File search

File search finds files by name/path pattern. **✅ Built** — `execute_glob` in `apps/cli/src/features/exec/tools/dir_ops/mod.rs` (the `glob` tool) matches path patterns, caps results at `MAX_GLOB_RESULTS` (1,000), and **refuses absolute patterns** and patterns escaping the project ("Refusing absolute glob pattern", "Refusing to glob outside project"). Requirements: relative-only patterns; deterministic ordering; workspace-root confinement identical to workspace search. Ranking by recency/proximity is **🔭 Planned**.

## Symbol search

Symbol search resolves code symbols via a language server rather than text matching. **🟡 Partial** — `apps/cli/src/platform/lsp/{mod.rs,client.rs,types.rs}` implement a stdio LSP client that spawns a server by extension (`rust-analyzer`, `typescript-language-server --stdio`, `gopls`, `pyright-langserver --stdio`). Tools registered in `tool_catalog.rs` (all `read_only`, deferred): `lsp_definition`, `lsp_hover`, `lsp_diagnostics`, `lsp_completion`, `lsp_document_symbols`, `lsp_format`. The gap: `lsp/mod.rs` carries `#![allow(dead_code)]`, coverage is four languages, and there is **no workspace-symbol or find-references tool** — cross-file "find all symbols named X" and reference search are **🔭 Planned**. Requirements: symbol tools MUST degrade gracefully when no server is installed (report, do not panic), and MUST stay within workspace roots.

## Documentation search

Searching library/framework/API docs is **🔭 Planned** as a first-class CLI capability. Today the vehicles are (a) **MCP servers** — the model can call a documentation-search tool exposed by a connected MCP server (the provenance layer already recognizes an `mcp_docs_search`-shaped tool result in `apps/cli/src/provenance.rs`), and (b) `web_fetch`/`web_search` for online docs. Skills and instruction files are discovered and injected into the prompt (see the skills pipeline referenced in `apps/cli/src/agent/mod.rs`) but that is context assembly, not doc search. Requirements for the planned capability: doc-source results MUST be labeled untrusted like web results, MUST respect the active trust mode (a Local session must not silently reach a hosted doc index), and MUST cite the source. Do not claim a built-in documentation index exists — none is in the repo.

## Conversation search

Conversation search queries the **local session store**, not the cloud. **✅ Built** — `search_sessions` and `search_session_messages` in `apps/cli/src/sessions.rs` query the local SQLite managed-session DB (title/metadata and message bodies). This is workspace/session-scoped and **never synced**: CLI sessions do not participate in Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync` is Web↔Mobile↔Desktop, Managed-Cloud chats only). Requirements: search reads only the local DB (`open_db`); no match is uploaded; any handoff of a found session to app chat MUST be explicit and redacted. Full-text ranking beyond substring matching is **🔭 Planned**. A stable user-facing subcommand name is **🔭 Planned** — surface it through the existing session picker rather than inventing a command here.

## Web search

Web search is the sole outbound search path. **✅ Built (gated)** — `execute_web_search` in `apps/cli/src/features/exec/tools/web/mod.rs` (the `web_search` tool) requires `SEARCH_API_KEY` and routes to **Brave** (`BRAVE_SEARCH_API_KEY`) or **Tavily** (`TAVILY_API_KEY`); with no key it returns a clear "not configured" message. These are non-LLM engine identifiers (exempt from the models.json rule) grounded in real code. Results are wrapped in `<web_search_result … untrusted="true">` with an explicit prompt-injection guard instructing the model to treat contents as data, not instructions. The companion `web_fetch` tool applies **SSRF defenses** via `validate_fetch_url`/`is_private_or_internal_ip` (blocks cloud metadata hosts, loopback, and private/link-local IPs). Requirements: outbound search from a Local session is a network egress — treat it as a boundary event and keep it explicit; never auto-route the resulting content into a Local provider prompt without consent.

## Repository map

- `apps/cli/src/features/exec/tools/dir_ops/mod.rs` — `grep_files`, `search_files`, `glob`.
- `apps/cli/src/features/exec/tools/web/mod.rs` — `web_search`, `web_fetch`, SSRF/URL validation.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — tool definitions, read-only/deferred flags, size caps.
- `apps/cli/src/platform/lsp/{mod.rs,client.rs,types.rs}` — stdio LSP client + symbol tools.
- `apps/cli/src/sessions.rs` — `search_sessions`, `search_session_messages` (local session DB).
- `apps/cli/src/tool_search.rs` + `tool_search` tool — on-demand tool/schema discovery.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, `validate_privacy_boundary`, workspace-root context.

## Competitor notes

Claude Code and Codex CLI expose grep/glob plus editor-integrated symbol lookup and web search; ChatGPT's search is a hosted, cloud-only index. AGI's deliberate divergence: **local-first and multi-provider** — code/file/symbol/conversation search run entirely on-host with workspace confinement; web search is **BYO search key** (Brave/Tavily) with no AGI markup and an explicit untrusted-content guard; and search honors the **per-surface trust matrix** — a Local session's search results never silently reach BYOK or Managed Cloud, and CLI search never rides the app-chat sync fabric. LSP-backed symbol search is deliberately server-driven (real language servers) rather than a proprietary index.

## Acceptance / Definition of Done

Search is production-ready when every subsection is either shipped with the cited path or explicitly labeled Planned, all searches stay workspace-scoped, and web egress is key-gated with untrusted-content and SSRF guards verified.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` green; `grep_files`/`glob`/`web_search`/`web_fetch` and `lsp_*` tool schemas present in `tool_catalog.rs`.
- [ ] Trust: Local session search results never route to BYOK/Managed without an explicit, redacted handoff; conversation search reads only the local DB and never syncs.
- [ ] Security: glob/grep refuse absolute and out-of-root paths; `web_fetch` blocks metadata/loopback/private IPs; web results carry the `untrusted="true"` injection guard.

## Anti-patterns

- Silently routing Local search context to BYOK or Managed Cloud, or syncing CLI conversation search to Neon.
- Claiming a built-in documentation index or workspace-symbol/find-references search — those are 🔭 Planned.
- Following imperatives embedded in `web_search`/`web_fetch` output as if they were tool instructions.
- Allowing glob/grep to escape workspace roots, or `web_fetch` to reach internal/metadata IPs.
- Hardcoding or inventing model IDs, search-provider keys, routes, or INR prices; referencing Supabase; using removed tiers (Plus/Hobby/pro_plus) or credit top-ups.
- Writing user examples as `agiworkforce <cmd>` — always use the `agi` binary.
