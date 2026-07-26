# AGI VS Code Extension — Volume 13 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), the nearest surface guide `docs/surfaces/vscode-extension.md`, and real repo code: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/data/workspaceIndexer.ts`, `apps/extension-vscode/src/data/contextBuilder.ts`, `apps/extension-vscode/src/data/conversationStore.ts`, `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`. Model IDs come only from `packages/contracts/types/src/models.json`.

## Overview & stance

Search on the VS Code surface means finding things the developer needs inside the **current workspace and the current chat session** — files, symbols, docs, and prior turns — and feeding the right ones into an AGI prompt. It is IDE-native and workspace-scoped: the extension exposes Local + BYOK + Managed Cloud with explicit selection and a visible provider label, but search itself runs against on-device workspace state and the extension's own conversation store, not against the cloud account.

Two trust rules shape every subsection. First, **no automatic app-chat sync**: search never reaches into the user's Neon-synced Web/Mobile/Desktop conversation history. A handoff to app chat is explicit and redacted, never a silent query. Second, the **trust mode of the active session governs where retrieved text goes** — search results become prompt context, and prompt context inherits the session's Local / BYOK / Cloud boundary. A Local session must not silently ship matched file contents to BYOK or Cloud; that is the same fork rule (context selection, secret scan, payload preview, consent, visible provider label) applied to retrieval. Search is a read; sending its output to a model is the gated act.

## Workspace Search

The extension performs workspace file search through the VS Code file API. The `@agi` chat sidebar handles a `fileSearch` message by running `vscode.workspace.findFiles('**/*${query}*', '**/node_modules/**', 15)` to power `@`-file mentions ✅ (`apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:287`). A `WorkspaceIndexer` builds a capped index (500 files, 5000 symbols, `node_modules`/`dist`/`build`/`.next`/`target` excluded) via `findFiles`, refreshed incrementally by a `FileSystemWatcher` and aged out after 24h ✅ (`apps/extension-vscode/src/data/workspaceIndexer.ts:137`). Relevance retrieval scores indexed files/symbols against query words and returns the top matches within a char budget ✅ (`workspaceIndexer.ts:176` `getRelevantContext`).

- Filename/glob search and `@`-mention resolution: ✅ Built (`ChatStateManager.ts:287`).
- Keyword-scored workspace retrieval into prompt context: ✅ Built (`workspaceIndexer.ts:176`).
- Full-text / regex **content** grep across the workspace (ripgrep-class), ranked snippets with line anchors: 🔭 Planned — today only filename globs and indexed-symbol keyword scoring exist; no content search.
- Trust gate: results from a Local session must pass the redacted-fork preview before entering a BYOK/Cloud prompt: 🔭 Planned (retrieval exists; the per-result payload preview for the search→prompt hop is not wired).

## Symbol Search

Symbol awareness is document-level today. The indexer extracts each file's top-level symbols with `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)`, filtered to declarations and capped at 50 per file ✅ (`apps/extension-vscode/src/data/workspaceIndexer.ts:211`). Those symbol names are what keyword retrieval scores against, so "find the function that does X" resolves through indexed symbols rather than a dedicated navigator.

- Per-document symbol extraction feeding retrieval: ✅ Built (`workspaceIndexer.ts:211`).
- Cross-workspace symbol lookup (`vscode.executeWorkspaceSymbolProvider`) surfaced as a searchable picker with go-to-definition: 🔭 Planned — not present in source.
- Semantic / embedding symbol search (on-device embeddings for Local; cloud embeddings only in a Cloud session): 🔭 Planned — must respect the trust boundary; a Local session must use an on-device embedding engine (grounded in real engine code when built), never a cloud embedding call.
- Diagnostics-aware symbol search ("symbols with errors"): 🟡 Partial — diagnostics are already gathered for context (`apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` `shareDiagnostics`; `apps/extension-vscode/src/data/contextBuilder.ts`), but they are not joined to a symbol-search surface.

## Documentation Search

There is no in-editor documentation/knowledge search yet. The `agi-workforce.docs` command **generates** doc comments for a selection; it does not query a doc corpus. Provider documentation remains external to this command.

- Searchable in-repo docs / README / ADR index: 🔭 Planned.
- AGI product-docs / provider-docs search from inside the editor: 🔭 Planned — parity with Codex/Claude "@docs"; must not silently call a cloud endpoint from a Local session.
- MCP-backed documentation retrieval: 🔭 Planned — `agiWorkforce.mcp.enabled` exists and defaults off (`package.json` configuration), so any doc-search MCP tool is gated behind that flag and the session trust mode.

## Conversation Search

The extension persists conversations in `globalState` (max 50, oldest pruned) with `getAll` / `get` / `delete` / `save` ✅ (`apps/extension-vscode/src/data/conversationStore.ts`), and the History tree lists them (`agi-workforce.conversations` view; `agi-workforce.refreshConversations`, `agi-workforce.openConversation` in `package.json`). But there is **no text/date/model search or filter** over stored conversations — `getAll` sorts by `updatedAt` and returns everything.

- List / open / delete stored conversations via History tree: ✅ Built (`conversationStore.ts`; `package.json` views + commands).
- Full-text search across the extension's local conversation store (query, model, date range): 🔭 Planned.
- Search across **cloud-synced** Web/Mobile/Desktop conversation history from inside VS Code: 🔭 Planned **and intentionally gated** — the VS Code surface is workspace-scoped and does **not** auto-sync app chat (`docs/products/README.md` trust rules); any such search would require an explicit, redacted handoff, never a background Neon query. Local/BYOK conversation rows never sync at all.

## Repository map

- `apps/extension-vscode/src/data/workspaceIndexer.ts` — file/symbol index, `findFiles` crawl, `getRelevantContext` scoring.
- `apps/extension-vscode/src/data/contextBuilder.ts` — active file, editors, git, diagnostics context assembly + `redactSecrets`.
- `apps/extension-vscode/src/data/conversationStore.ts` — local conversation persistence (`globalState`).
- `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` — `fileSearch` handler, `@`-mention resolution, diagnostics sharing.
- `apps/extension-vscode/src/features/trees/{conversationTreeProvider,contextPanelProvider}.ts` — History + Context Files trees.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge (`ws://127.0.0.1:8787/ws`, token at `~/.agiworkforce/bridge-token`, 0600) for any future desktop-side search delegation.
- `apps/extension-vscode/package.json` — `contributes.commands`, `views`, `configuration` (`agiWorkforce.mcp.enabled`, `agiWorkforce.desktopBridge.*`).

## Competitor notes

Claude Code and the Codex IDE extension both offer `@`-file references, editor-context capture, and diagnostics-aware retrieval; Codex adds workspace symbol navigation and richer content search. AGI matches the file-mention and context-retrieval baseline today and treats content grep, workspace-symbol pickers, and doc search as near-term parity work. AGI's deliberate divergence: search is **multi-provider and trust-scoped** — the same query can run under Local, BYOK (Desktop/CLI/VS Code only), or Managed Cloud, with the retrieved payload never crossing a trust boundary without an explicit redacted fork; and conversation search stays **workspace-local by default**, refusing the always-on cloud history search that hosted assistants assume.

## Acceptance / Definition of Done

A search capability is production-ready when it returns correct, ranked, workspace-scoped results; respects `.gitignore`/exclude globs and the file caps; never leaks Local/BYOK content into a Cloud prompt without the explicit fork; and shows the active provider label on any result that becomes prompt context.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; new search paths have tests under `apps/extension-vscode/src/__tests__/`.
- [ ] Trust: every search→prompt hop inherits the session trust mode; Local results never auto-route to BYOK/Cloud; cloud/app-chat conversation search only via explicit redacted handoff (no background Neon query).
- [ ] Security: `redactSecrets` (`contextBuilder.ts`) runs on any matched content before it enters a payload preview; excludes cover `node_modules`/build dirs; untrusted-workspace restrictions from `package.json` `capabilities` hold.

## Anti-patterns

- Do not run content or symbol search results straight into a BYOK/Cloud prompt from a Local session — that violates the fork rule (context selection, secret scan, payload preview, consent, visible label).
- Do not silently query the user's Neon-synced Web/Mobile/Desktop conversation history from VS Code; handoff must be explicit and redacted.
- Do not claim ripgrep-class content search, workspace-symbol pickers, doc search, or conversation full-text search as shipped — they are 🔭 until a real path exists.
- Do not hardcode or invent model IDs for semantic/embedding search; LLM IDs come from `packages/contracts/types/src/models.json`, and Local embeddings must use a repo-grounded on-device engine, never a cloud call.
- Do not reference removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups in any search gating; the tier ladder is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
- Do not reference Supabase; storage is `globalState`/`workspaceState` locally and Clerk + Neon + Stripe server-side. Never bypass the 0600 bridge-token check when delegating search to the desktop host.
