# Reference Structural Patterns — How Shipping Products Organize Code

> Synthesized 2026-05-14 from deep audits of:
>
> - **Anthropic Claude Code** (TS) at `~/Desktop/reference/src/`
> - **OpenAI Codex CLI** (Rust workspace) at `~/Desktop/reference/codex-cli/codex-rs/`
> - **Google Gemini CLI** (TS monorepo) at `~/Desktop/reference/gemini-cli/packages/`
> - **OpenCode** (TS monorepo) at `~/Desktop/reference/opencode/packages/`
>
> This doc is the "Structural alignment" audit dimension. Every audit fire after this point should compare the module under review against these patterns and flag misalignment as a finding.

## Top-line conclusions

| Principle                                        | All 3 do this                                                    | Why it works                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain-first, not layer-first**                | ✓                                                                | `tools/BashTool/` owns logic + UI + prompts + tests for one capability. Avoids `components/` + `services/` + `utils/` sprawl per feature.               |
| **Centralized registry, not plugin discovery**   | ✓                                                                | `commands.ts`, `Tool.ts`, root `Cargo.toml#members` are the source of truth. No magic file-scan.                                                        |
| **Single-direction dependency DAG**              | ✓                                                                | `protocol` is leaf, `tui` is top consumer. Inversion is forbidden.                                                                                      |
| **Tests colocated with source**                  | TS ✓; Rust uses `#[cfg(test)]` inline + `tests/` for integration | `*.test.ts` next to `*.ts`. No `__tests__/` walls. Insta snapshots in `src/snapshots/`.                                                                 |
| **Workspace deps + strict lints in root config** | Rust ✓                                                           | One Cargo.toml defines versions + clippy denies for the whole workspace. Cuts version-skew slop in half.                                                |
| **Naming discipline**                            | ✓                                                                | PascalCase for tools/components, camelCase for fns/utils, kebab-case for folders, snake_case for Rust. **Mixing inside one surface = LLM slop signal.** |

## Anthropic Claude Code — TS, 25+ domain folders

**Top-level src/ domains** (each owns a coherent capability):

- `commands/` (103 folders) — slash commands, each its own folder
- `tools/` (45 folders) — BashTool, FileEditTool, NotebookEditTool, MCP, Agent — each self-contained
- `components/` (146) — UI primitives by feature
- `services/` (38) — stateful business logic (analytics, LSP, MCP servers, OAuth, voice, SessionMemory)
- `bridge/` (33 files) — remote API + messaging + JWT
- `types/` — centralized typedefs (breaks cycles)
- `utils/` (329 files) — domain-grouped helpers (bash/, permissions/, git/, file/)
- `hooks/` (87) — React hooks
- `tasks/` — background tasks (LocalShellTask)
- `state/`, `skills/`, `constants/`, `cli/`, `entrypoints/`, `native-ts/`, `remote/`, `query/`, `server/`

**Tool anatomy** (canonical, mirror for ours):

```
tools/BashTool/
  ├── BashTool.tsx           # buildTool(toolDef) + inputSchema/outputSchema (Zod)
  ├── commandSemantics.ts    # domain logic (bash parsing, semantic interpretation)
  ├── permissions.ts          # permission handler
  ├── security.ts             # parseForSecurity
  ├── UI.tsx                  # renderToolUseMessage, renderToolResultMessage
  ├── prompts.ts              # tool-use prompt
  └── constants.ts
```

**Command anatomy** (two shapes):

- **Prompt-type**: `commands/commit.ts` → `getPromptForCommand()`, `allowedTools`, `progressMessage`
- **JSX-type**: `commands/add-dir/index.ts` → lazy-load `() => import('./add-dir')` for bundle splitting

**Tests**: not in src/ — integration tests live in `integration-tests/` + `evals/`. Forces tests to actually exercise public APIs, not internals.

**File naming**:

- PascalCase: tools, components (`BashTool.tsx`, `FileEditTool.ts`)
- camelCase: utility functions (`expandPath`, `parseForSecurity`)
- kebab-case: command folders (`add-dir/`, `commit-push-pr/`)
- `index.ts` everywhere for re-exports + facade

**Clever pattern**: PII marker types compile-time enforced:

```ts
AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS;
AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED;
```

**Over-engineering to avoid**: 329 utility files = utility creep. Some single-function files belong inline. Don't replicate.

## OpenAI Codex-RS — Rust workspace, 93 crates in 4 groups

**Workspace layout** (root `Cargo.toml` has 108 members):

- **Core protocol/comms**: `protocol`, `app-server-protocol`, `codex-mcp`, `mcp-server`, `rmcp-client`
- **Domain systems**: `tui`, `exec`, `hooks`, `core`, `plugin`, `skills`
- **Utilities** (`utils/` prefix, 17 leaf crates): `absolute-path`, `cache`, `cli`, `pty`, `rustls-provider`
- **Integration layers**: `*-client` / `*-server` pairs

**Per-crate anatomy** (canonical):

```
<crate>/
  ├── Cargo.toml             # uses workspace.dependencies (single-source versions)
  ├── src/
  │   ├── lib.rs             # `mod foo;` declarations + re-exports
  │   ├── foo.rs             # snake_case files, flat sibling > nested mod.rs
  │   ├── bar.rs
  │   └── snapshots/         # insta snapshot tests
  └── tests/
      ├── all.rs             # `mod suite;` aggregator (one test binary)
      ├── suite/
      │   ├── scenario_a.rs
      │   └── scenario_b.rs
      └── fixtures/
          └── <domain>/      # JSON configs, sample input
```

**Dependency DAG discipline**:

- `protocol` = leaf (only depends on `utils-*` + `execpolicy`)
- `hooks` = mid (depends on `protocol`, `config`, `plugin`)
- `tui` = top (depends on 43 codex crates)
- **No back-edges**: hooks never imports tui; protocol never imports plugin

**Root Cargo.toml fingerprint** (~50 clippy denies workspace-wide):

- `await_holding_lock = "deny"`
- `unwrap_used = "deny"`
- `expect_used = "deny"`
- `unsafe_code = "deny"`
- Workspace edition = 2024

**Test aggregation pattern**: `tests/all.rs` exposes one binary per crate (faster compile, less linker work). Sub-tests live under `tests/suite/`.

**Over-engineering to avoid**:

- 17 utils crates, some 1-2 files (e.g., `sleep-inhibitor`, `readiness`) — only split a crate when 2+ other crates actually import it
- 10+ `*-client`/`*-server` pairs as thin wrappers — only split when protocol genuinely differs

## Google Gemini CLI — TS monorepo, 7 packages

**Package list**:

- `cli` (binary entry, `bin: { gemini }`)
- `core` (120+ exports — agents, config, MCP, billing)
- `sdk` (published external)
- `vscode-ide-companion` (publishable to marketplace)
- `devtools`, `a2a-server`, `test-utils`

**Cross-package dependency discipline**:

- `cli` → `core` via **`"file:../core"`** AND `tsconfig.json#references: [{ "path": "../core" }]`
- TypeScript project references enforce build order + acyclicity at compile time
- `vscode-ide-companion` is isolated — it talks to `cli` via HTTP server bridge (Express, port-based IPC), **not by importing**

**Test layout**: `*.test.ts` colocated next to source. No `__tests__/`. `posttest: npm run build` ensures CI catches build breaks.

**Surface-integration pattern** (vscode-ide-companion):

- `ide-server.ts` spawns Express server
- `diff-manager.ts` handles patch accept/reject lifecycle
- VSCode commands declared in `package.json#contributes`
- **No direct import** from cli or core — wire boundary is HTTP

## OpenCode — TS monorepo, ~10 packages

**Notable choices**:

- `bun workspaces + workspace:*` (leaner than file:// refs, requires bun)
- `@opencode-ai/` namespace for everything
- Apps vs libs distinguished by package name (`core`, `app`, `web`, `desktop`) vs (`ui`, `sdk`, `plugin`)
- `effect` library usage (functional patterns) — purist FP overhead for some teams; selective adoption

## Where AGI Workforce currently aligns vs diverges

### Aligned ✓

- **Top-level `apps/` + `packages/` + `crates/` + `services/`** — same shape as gemini-cli + opencode
- **6 surface apps** distinct from shared `packages/` — same apps-vs-libs split as gemini
- **Rust workspace at root** — same as codex-rs (just smaller, 14 crates vs 93)
- **`packages/` with chat, api, types, runtime, utils, llm-normalize, providers, mcp, skills, apply-patch, browser-tool, stores** — domain-first naming, matches Claude Code's `services/` style

### Diverges ✗ (these are audit-finding territory)

| Divergence                                            | Example                                                                                       | Reference pattern                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI is one mega-crate with mostly flat files**      | `apps/cli/src/` has 200+ .rs files mostly at root level + a few subdirs (tui/, mcp/, policy/) | codex-rs splits this into 30+ crates (protocol, tui, hooks, etc.). At minimum, group ours into `cli/src/{commands,tools,services,protocol,runtime}/` |
| **God files**                                         | `apps/cli/src/a2a.rs` (1,649 LOC); `apps/cli/src/tui/tui_app.rs` (~2000 LOC)                  | Claude Code's BashTool is one folder with 18 small files. Split a2a.rs into `a2a/{types.rs, server.rs, client.rs, jsonrpc.rs, registry.rs}/`         |
| **Tools registered inline in tools.rs**               | Tool definitions interleaved with dispatch                                                    | Claude Code's `tools/<ToolName>/` folder pattern — each tool self-contained                                                                          |
| **No `tests/suite/` aggregation in CLI tests**        | Inline `#[cfg(test)] mod tests` only                                                          | codex-rs's `tests/all.rs → mod suite` pattern would reduce compile cost as our crate grows                                                           |
| **No insta snapshot tests for TUI rendering**         | We render via direct assertions                                                               | Codex's `src/snapshots/*.snap` would catch UI regression more reliably                                                                               |
| **Workspace-wide clippy lints scattered**             | `apps/cli/Cargo.toml` has its own lint section                                                | Codex puts ~50 clippy denies in **root** Cargo.toml `[workspace.lints]` — one source of truth                                                        |
| **Per-app test colocation inconsistent**              | Some surfaces `*.test.ts` next to source; others have `__tests__/` directories                | Pick ONE (`*.test.ts` next to source, gemini + opencode pattern) and enforce uniformly                                                               |
| **No explicit dependency DAG check**                  | Packages import from each other ad-hoc; cycles possible                                       | Gemini's `tsconfig.json#references` forces a single-direction DAG. We should add similar for `packages/`.                                            |
| **VSCode + Chrome ext integration via desktopBridge** | Already aligns with Gemini's HTTP-bridge pattern ✓                                            | Keep this; don't directly import `apps/desktop` into extensions                                                                                      |

## Recommended structural moves (prioritized)

### P0 — root-config wins (1-fire each, low risk)

1. **Add workspace-level clippy lints** in root `Cargo.toml` (move from `apps/cli/Cargo.toml`) — single source of truth
2. **Codify naming + test colocation conventions** in CLAUDE.md so future LLM contributions can't drift

### P1 — split god files (per-fire-LOC-budget candidates)

3. **Split `apps/cli/src/a2a.rs` (1649 LOC) into `a2a/` directory** with `mod.rs` + `types.rs` + `server.rs` + `client.rs` + `jsonrpc.rs` + `registry.rs` — pure refactor, no behavior change. Tests preserved.
4. **Split `apps/cli/src/tui/tui_app.rs` (~2000 LOC) into focused submodules** under `tui/app/` — slash dispatch, key handling, overlay slot, etc.
5. **Group apps/cli/src/ flat files into domain folders**: `tools/`, `commands/`, `services/`, `runtime/`, `protocol/`

### P2 — test discipline (≤1 day each)

6. **Add `tests/all.rs → mod suite` aggregation** for apps/cli — reduces compile cost
7. **Add insta snapshot tests** for at least 3 TUI widgets (chatwidget, approval_overlay, list_selection_view)
8. **TS test layout: enforce `*.test.ts` next to source**, remove any `__tests__/` walls (audit each surface)

### P3 — dependency DAG enforcement

9. **Add TypeScript `references` in tsconfig.json for `packages/`** so import cycles fail at compile time
10. **Document the layer DAG** in CLAUDE.md: `types` is leaf; `chat` consumes `types`; `apps/*` consume `packages/*` but not vice versa.

## The "Structural alignment" audit dimension (added to future audit fires)

When auditing a module, flag the following as findings:

| Finding type                                     | Severity | Pattern                                                                                                                   |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **God file** (single file >1000 LOC)             | High     | Domain belongs as a folder, not a megafile. Cite this doc's "Per-domain self-containment" pattern.                        |
| **Layer-first organization in a feature folder** | Medium   | A feature mixing `services/`, `components/`, `utils/` from `apps/<surface>/` instead of grouping into one feature folder. |
| **Inline test mixed with src in TS**             | Low      | Want `*.test.ts` next to source. `__tests__/` walls considered drift.                                                     |
| **Tool registered inline in dispatcher**         | Medium   | Tool should be its own folder/module with schemas + handler + UI + prompts.                                               |
| **Cross-package cycle**                          | Critical | If `packages/A` imports from `packages/B` AND `packages/B` imports from `packages/A`, cycle exists.                       |
| **Workspace lint scope leak**                    | Low      | Clippy lints duplicated per-crate instead of centralized in root Cargo.toml.                                              |
| **Naming inconsistency within a module**         | Low      | Mixed PascalCase/snake_case within one TS surface or mixed snake_case/camelCase within one Rust crate.                    |

Cite this doc by including `(ref: REFERENCE_STRUCTURE.md#<section>)` in the audit finding.

---

**Last refreshed**: 2026-05-14. Re-run the 3 Explore agents whenever reference materials change.
