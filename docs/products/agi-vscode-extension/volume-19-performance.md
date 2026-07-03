# AGI VS Code Extension — Volume 19 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, the nearest surface rules `apps/extension-vscode/AGENTS.md`, and `docs/surfaces/vscode-extension.md`. Real code cited: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/core/subsystemHealth.ts`, `apps/extension-vscode/src/data/workspaceIndexer.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

Performance on the VS Code surface is measured against the editor's own budgets, not a browser tab or a mobile app. The extension host is shared with every other extension, so AGI must activate fast, never block the UI thread, and degrade gracefully when its backends are absent. AGI VS Code is workspace-scoped and exposes all three trust modes — **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** — with explicit selection and visible provider labels. Trust boundaries shape performance directly: Local runs against the on-device/local runtime, BYOK calls user-supplied providers directly, and Managed Cloud streams through the AGI gateway. There is **no automatic app-chat sync**; any handoff to app chat is explicit and redacted, so the extension carries no background sync loop competing for the extension host. This volume covers startup latency, lazy activation, workspace indexing, response streaming, and large-repository scaling.

## Startup

The extension must activate without blocking the editor's first paint. `activate()` is a synchronous, fast-returning entry point that orchestrates subsystem boot through discrete lifecycle modules rather than one monolithic initializer (`src/extension.ts`). Every optional subsystem boots inside an isolated try/catch via `runBoot()` so one slow or failing subsystem (telemetry, model metrics, checkpoints, desktop bridge) cannot abort activation or wedge the host; failures are recorded and surfaced through subsystem health, not thrown (`src/core/subsystemHealth.ts`). The desktop bridge is wrapped so a missing desktop app produces a warning, not an activation failure (`src/extension.ts`, `src/features/desktop-bridge/desktopBridge.ts`). ✅ Built.

Testable requirements: activation performs no synchronous network I/O and no synchronous filesystem scans of the workspace; subsystem failures are non-fatal and observable; a cold start with no desktop app, no API key, and no network still yields a usable command surface. A published activation-time budget enforced in CI against `vscode.extensions.activationTimes` is 🔭 Planned.

## Extension Activation — lazy activation events

The manifest scopes activation to three events rather than `*`: `onStartupFinished`, `onChatParticipant:agiworkforce.agi`, and `onView:agi-workforce.sidebar` (`apps/extension-vscode/package.json`). This keeps AGI out of the critical path during the editor's own startup window and lets the chat participant or sidebar trigger activation on first real use. ✅ Built for these events.

Finer-grained deferral of heavy features **within** the activated host — dynamic `await import()` of the agent loop, webview bundle, indexer, or provider transports so they load only when first invoked — is 🔭 Planned; the current activation path wires providers, chat, and commands eagerly after `onStartupFinished` (`src/extension.ts`). Testable requirements for the planned work: language-model and MCP transports must not be constructed until a request needs them; the sidebar webview HTML/JS must load only when the view is revealed; and no feature may register an `onDidChange*` listener that fires work before the user opts into that feature.

## Workspace Indexing

Indexing is a lightweight symbol gatherer, not a semantic embedding store. `WorkspaceIndexer` builds a capped index of source files and top-level symbols to feed workspace context into requests, with hard ceilings of **500 files** and **5,000 symbols**, a per-file cap of 50 symbols, and an initial `findFiles` scan that excludes `node_modules`, `dist`, `build`, `.next`, and `target` (`src/data/workspaceIndexer.ts`). Updates are incremental through a `FileSystemWatcher` on known source extensions, and async updates are serialized through an update queue so concurrent `workspaceState` writes never race. The cached index ages out after 24h so long-lived windows periodically refresh rather than serving permanently stale retrieval. ✅ Built.

Testable requirements: the initial scan never exceeds the file cap; index writes never block the UI thread; a watcher-triggered reindex touches only the changed file. Semantic/embedding-based retrieval, `.gitignore`-aware traversal beyond the fixed exclude glob, and ranked relevance scoring are 🔭 Planned.

## Streaming

Chat responses stream token-by-token into VS Code's native `ChatResponseStream`; the participant writes each fragment via `stream.markdown()` as it arrives rather than buffering a full completion (`src/features/chat-participant/chatParticipant.ts`). Streaming is on by default (`agiWorkforce.streamingEnabled`, default `true` in `package.json`) and honors the request `CancellationToken`, so a cancelled or superseded turn stops consuming tokens. When the AGI backend is unavailable, the participant falls back to the VS Code built-in Language Model API and streams that response with the same `for await` fragment loop (`streamVscodeLmFallback`). ✅ Built.

Inline completions have their own latency budget: requests are debounced (`agiWorkforce.inlineCompletions.debounceMs`, default 300ms), bounded by `maxLength` (default 500 chars), served from a bounded LRU keyed by document/line/column/context to avoid re-requesting on cursor jitter, and cancelled via the provider's `CancellationToken` (`src/features/inline-completions/inlineCompletionProvider.ts`, `package.json`). ✅ Built.

Testable requirements: first streamed token renders progressively (no full-response buffering); cancellation halts network consumption promptly; the completion cache is bounded and evicts LRU; the provider label for the active trust mode stays visible throughout the stream.

## Large Repositories

Large-repo behavior today is guard-rail-based: the 500-file / 5,000-symbol index cap plus the exclude glob keep indexing bounded on any repository size, and the incremental watcher avoids full re-scans on edits (`src/data/workspaceIndexer.ts`). 🟡 Partial — the caps prevent runaway work but silently truncate coverage on monorepos far larger than 500 source files, and there is no multi-root sharding, background-priority indexing, or telemetry on truncation.

Planned (🔭): `.gitignore`- and `files.exclude`-aware traversal, per-root shards with incremental persistence, a background/idle indexing budget that yields to editor interaction, and a visible indicator when the index is truncated so users know context coverage is partial. Testable requirements for the planned work: on a repo with >500 eligible files, indexing must complete without UI jank and must not exceed a bounded memory ceiling; truncation must be observable; and re-indexing must never re-scan unchanged roots.

## Repository map

- `apps/extension-vscode/src/extension.ts` — activation entry, lifecycle orchestration.
- `apps/extension-vscode/src/core/subsystemHealth.ts` — `runBoot` isolation + health reporting.
- `apps/extension-vscode/src/data/workspaceIndexer.ts` — capped, incremental workspace index.
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — streaming chat + `vscode.lm` fallback.
- `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts` — debounced, LRU-cached completions.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — backoff reconnect, health loop, rate limiting.
- `apps/extension-vscode/package.json` — `activationEvents`, streaming/completion/indexing settings.

## Competitor notes

Claude Code's VS Code extension and the Codex IDE extension both emphasize fast activation, streamed chat/edit responses, and editor-context indexing, but each is single-vendor. AGI's deliberate divergence is multi-provider under three explicit trust modes: the same streaming and indexing paths serve Local, BYOK, and Managed Cloud, with the provider label visible during every stream. Local-first means indexing and completion caches stay on-device and workspace-scoped, and unlike a cloud-only assistant the extension must perform with no network at all. Where competitors index into vendor cloud services, AGI keeps the symbol index in `workspaceState` and never ships it off-device without an explicit, redacted handoff.

## Acceptance / Definition of Done

The domain is production-ready when activation is non-blocking and budgeted, indexing is bounded and non-janky at scale, and streaming is progressive and cancellable across all three trust modes with visible provider labels.

- [ ] Build: activation performs no synchronous network/FS scan; subsystem failures are non-fatal (`runBoot`); cold start with no backend yields a usable surface.
- [ ] Trust: Local/BYOK/Managed each stream with a visible provider label; no automatic app-chat sync; index stays workspace-scoped and on-device.
- [ ] Security: streamed and cached data respect trust boundaries; large-repo truncation never leaks excluded paths; cancellation stops backend consumption.

## Anti-patterns

- Activating on `*` or doing synchronous network/FS work in `activate()`.
- Buffering full completions instead of streaming; ignoring the `CancellationToken`.
- Unbounded indexing or unbounded completion caches; re-scanning unchanged roots.
- Silently routing Local or BYOK context to Managed Cloud, or auto-syncing IDE context into Web/Mobile/Desktop app chat.
- Hardcoding or inventing model IDs (read from `packages/types/src/models.json`), referencing removed tiers (Plus/Hobby/pro_plus), adding credit top-ups, or referencing Supabase.
- Claiming shipped indexing/streaming behavior without a real repo path.
