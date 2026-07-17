# AGI VS Code Extension — Volume 06 — Workspace Context

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `apps/extension-vscode/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `docs/surfaces/vscode-extension.md`. Grounded in real repo paths: `apps/extension-vscode/src/data/workspaceIndexer.ts`, `apps/extension-vscode/src/data/contextBuilder.ts`, `apps/extension-vscode/src/data/contextBudget.ts`, `apps/extension-vscode/src/data/projectInstructions.ts`, `apps/extension-vscode/src/features/trees/contextPanelProvider.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/package.json`.

## Overview & stance

This volume specifies how the AGI VS Code Extension discovers, indexes, and assembles the developer's repository into context for chat, inline, and agent requests. The surface is **workspace-scoped**: everything here reads the folders the user opened and stays there. Trust is **Local + BYOK + Managed Cloud** with explicit selection and a visible provider label (the `agiWorkforce.providerStreamProvider` / model settings in `package.json`), but the trust boundary does not change _what_ is gathered — it changes _where the gathered bytes may travel_. Workspace context is built locally; when it is attached to a request, the request's active trust mode determines the destination. There is **no automatic sync** of workspace context into Web/Mobile/Desktop app chat history: handoff to the desktop is an explicit user command (`agi-workforce.syncContextToDesktop`) and is secret-redacted before it leaves the editor. Local sessions are never silently routed to BYOK or Cloud.

## Repository Discovery

The extension discovers the working set from three sources: (1) `vscode.workspace.workspaceFolders` plus a resolved active folder via `platform/workspaceFolders`; (2) open editor tabs (`vscode.window.tabGroups`), auto-detected in `apps/extension-vscode/src/features/trees/contextPanelProvider.ts` (`_refreshAutoFiles`); and (3) a filtered top-level tree via `ContextBuilder.getWorkspaceStructure()` in `contextBuilder.ts`, which skips noise directories (`node_modules`, `.git`, `dist`, `build`, `.next`, `target`, `__pycache__`, `.venv`, `.vscode`, `.idea`, `coverage`). Project instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) are discovered from the workspace root and injected as data-only context (`projectInstructions.ts`). ✅ Built. Untrusted-workspace handling is enforced: `package.json` declares `capabilities.untrustedWorkspaces: "limited"`, restricting endpoint/gateway/CLI/system-prompt overrides and disabling agent-mode file writes until the workspace is trusted. ✅ Built (`apps/extension-vscode/package.json`). Multi-root ranking beyond "first folder" is 🔭 Planned.

## Indexing

`WorkspaceIndexer` (`apps/extension-vscode/src/data/workspaceIndexer.ts`) performs a lightweight file-and-symbol index. It enumerates source files via `vscode.workspace.findFiles` for a fixed language glob (`ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,h,rb,php,swift,kt`) with `node_modules/dist/build/.next/target` excluded, capped at **500 files / 5,000 symbols**. The index is stored in `context.workspaceState` under `agiWorkforce.workspaceIndex` — device- and workspace-local; it is never delta-synced to Neon. Incremental updates run through a serialized queue on a `FileSystemWatcher` (`onDidChange/Create/Delete`) plus `onDidSaveTextDocument`; the cache ages out after 24h (`MAX_INDEX_AGE_MS`) so long-lived windows re-index. ✅ Built. Retrieval (`getRelevantContext`) is keyword overlap scoring over path + symbol names — no embeddings, no ranking model. 🟡 Partial (`workspaceIndexer.ts:getRelevantContext` — lexical only; semantic/embedding index and cross-file relevance are the gap). Embedding-based semantic retrieval and a persistent on-disk index are 🔭 Planned.

## Symbols

Symbol extraction rides VS Code's language layer: `WorkspaceIndexer._getSymbols` calls `vscode.executeDocumentSymbolProvider`, keeps symbols of kind ≤ `Property`, and caps at 50 names per file. ✅ Built (`workspaceIndexer.ts`). Only symbol **names** are retained (no ranges, containers, signatures, or reference edges), and workspace-wide symbol search (`executeWorkspaceSymbolProvider`) and go-to-definition / find-references enrichment are not wired into context. 🟡 Partial / 🔭 Planned — call-graph and definition-aware context are design intent, not built. Symbol names flow only into the local index and, from there, into a request under the request's active trust mode.

## Dependencies

Dependency-graph awareness — parsing `package.json`/lockfiles, `Cargo.toml`, `requirements.txt`/`pyproject.toml`, `go.mod`, resolving an import graph, or surfacing transitive dependencies as context — is **not implemented**. The current tree view (`getWorkspaceStructure`) lists top-level manifest files by name only; it does not read or resolve them. 🔭 Planned. When built, dependency context must respect the same caps and secret-redaction rules as file context, must never fetch remote registry metadata in Local mode, and must attribute any network resolution to the visible provider/trust label.

## Language Servers — LSP integration

The extension **consumes the editor's existing language servers**; it does not host its own. Two LSP-backed signals are wired today: document symbols (`vscode.executeDocumentSymbolProvider`, per Symbols above) and diagnostics (`ContextBuilder.getDiagnosticsContext` via `vscode.languages.getDiagnostics`, errors/warnings first, capped at 20). ✅ Built (`workspaceIndexer.ts`, `contextBuilder.ts`). The extension also _contributes_ editor providers (hover in `src/features/hover`, code lens in `src/features/code-lens`), but consuming richer LSP results — definitions, references, type hierarchy, workspace symbols — for context assembly is 🔭 Planned. There is a separate localhost desktop bridge (`src/features/desktop-bridge/desktopBridge.ts`, `ws://127.0.0.1:8787/ws`, token at `~/.agiworkforce/bridge-token` mode 0600, migration target Unix domain socket / named pipe) that can hand context to the desktop app on explicit command; it is a transport, not a language server, and does not auto-route local data.

## Context Building

`ContextBuilder.buildFullContext()` (`apps/extension-vscode/src/data/contextBuilder.ts`) assembles the request payload from: active file (path, language, cursor, truncated selection ≤ 3,000 chars), open files, prioritized diagnostics, git status, and workspace structure — wrapped in `--- Workspace Context ---` markers. Git context runs `git status --porcelain` + `git diff --stat` and passes the diff through `redactSecrets` before it can leave the editor (JWT/`sk-`/`AKIA`/`ghp_` patterns). ✅ Built. The **Context Files tree** (`ContextPanelProvider`) exists and backs the `agi-workforce.contextPanel` view: pinned files plus auto-detected open tabs, with add/remove/clear/refresh commands and `getContextFiles()` feeding the builder. ✅ Built (`features/trees/contextPanelProvider.ts`; view registered in `package.json`). Assembly is model-aware and budgeted: `getContextBudget()` (`data/contextBudget.ts`) sizes the payload to the selected model's context window (3% chat / 5% agent, clamped 1–20%, ~40% of the char budget to the indexer section), using `MODEL_CONTEXT_LIMITS` from `features/model-picker/modelConstants` rather than any hardcoded model ID. ✅ Built.

## Repository map

- `apps/extension-vscode/src/data/workspaceIndexer.ts` — file/symbol index, watcher, cache.
- `apps/extension-vscode/src/data/contextBuilder.ts` — full-context assembly, git redaction, diagnostics.
- `apps/extension-vscode/src/data/contextBudget.ts` — model-aware token/char budgeting.
- `apps/extension-vscode/src/data/projectInstructions.ts` — CLAUDE.md/AGENTS.md/.cursorrules discovery.
- `apps/extension-vscode/src/features/trees/contextPanelProvider.ts` — Context Files tree.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — explicit, redacted desktop handoff.
- `apps/extension-vscode/src/platform/workspaceFolders.ts` — active-folder resolution.
- `apps/extension-vscode/package.json` — views, settings, untrusted-workspace capability.

## Competitor notes

Claude Code and Codex IDE extensions build context from `@`-referenced files, open editors, diagnostics, and editor selection, and preview a cloud handoff. AGI matches the editor-context and diagnostics posture but diverges deliberately: (1) **multi-provider** — context is provider-agnostic and the destination provider is user-selected and labeled, with **BYOK allowed here** (Desktop/CLI/VS Code only, never Web/Mobile); (2) **per-surface trust** — workspace context stays workspace-scoped and is never auto-synced to app chat, unlike consumer conversation sync; (3) **local-first** — indexing, symbol extraction, and secret redaction happen on-device, and Local sessions never egress. Where competitors lean on a hosted semantic index, AGI's index is currently local and lexical (🟡), with semantic retrieval as a tracked 🔭 item rather than an assumed capability.

## Acceptance / Definition of Done

Production-ready when workspace context is discovered, budgeted, and assembled deterministically; secrets are redacted before any egress; the Context Files tree reflects pinned + auto state; and no path silently crosses a trust boundary.

- [ ] **Build:** `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; index respects 500-file / 5,000-symbol caps and 24h staleness; budget clamps to model context window from `modelConstants`.
- [ ] **Trust:** workspace context never enters Neon delta-sync; desktop handoff only via explicit `agi-workforce.syncContextToDesktop`; active provider/trust label visible on every request that includes context; Local never routed to BYOK/Cloud.
- [ ] **Security:** `redactSecrets` applied to git diff and any file content before egress; untrusted-workspace restrictions honored (no endpoint/prompt override, no agent writes until trusted); bridge token permission check (0600) enforced.

## Anti-patterns

- Auto-syncing workspace context, symbols, or the index into Web/Mobile/Desktop app chat, or into Neon (`apps/web/app/api/{chat,memory,projects}/sync`) — handoff must be explicit and redacted.
- Silently routing a Local-mode request that carries workspace context to BYOK or Managed Cloud without the explicit fork (context selection, secret scan, payload preview, consent, visible label).
- Hardcoding or inventing model IDs or context-window sizes — read from `packages/contracts/types/src/models.json` / `modelConstants`.
- Sending git diffs or file bytes upstream without `redactSecrets`, or indexing `node_modules`/build output.
- Claiming semantic/embedding retrieval, dependency-graph context, or workspace-symbol search as shipped — they are 🟡/🔭.
- Referencing Supabase, or reintroducing removed tiers. Note: `package.json`'s `agiWorkforce.tier` enum still encodes `hobby`/`pro_plus` (🟡 — reconcile to Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise; no top-ups) as a separate tracked task.
