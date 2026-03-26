# VS Code Extension

Model-agnostic AI coding assistant. 15+ LLMs, smart auto-routing. Package: `agi-workforce`, v0.3.0.

## Commands

```bash
pnpm compile    # esbuild → out/extension.js (dev, sourcemaps)
pnpm watch      # esbuild watch mode
pnpm package    # production build + VSIX
pnpm lint       # ESLint
pnpm test       # Vitest (219 tests)
pnpm typecheck  # tsc --noEmit
```

## Source Structure

- `src/extension.ts` — Activation, 41+ commands, strict registration order
- `src/providers/` — 13 providers (chat, sidebar, agent mode, diff, CodeLens, hover, inline, diagnostics, terminal, error explainer)
- `src/services/` — 9 services (desktopBridge, patchEngine, contextBuilder, workspaceIndexer, contextBudget, tokenCounter, modelMetrics, checkpointManager, telemetry)
- `src/utils/api.ts` — HTTP client, SSE streaming, retry (raw http/https, NOT fetch)

## Key Patterns

- Only runtime dep: `ws`. Everything else is devDependencies.
- `vscode` is external — provided by VS Code at runtime
- API key in SecretStorage (OS keychain) — never getConfiguration()
- Non-critical features wrapped in try/catch during activate()
- Webview CSP: nonce-based style/script tags
- postMessage protocol with discriminated union types
- Singleton services: `let instance` + `get{Name}()` accessor
- Patch engine: SEARCH/REPLACE with 4-tier fuzzy matching
- Checkpoint: git stash-based, max 20, auto-created before patches

## Desktop Bridge

- WebSocket: `ws://127.0.0.1:{port}/ws` (real-time events)
- HTTP POST: `http://127.0.0.1:{port}/api/bridge/{command}` (commands)
- Reconnect: exponential backoff 1→2→4→8s max
- All bridge features degrade silently when desktop not running

## Don't

- No external packages beyond `ws`
- No default exports — named exports only
- Never use getConfiguration() for secrets
- Model IDs: read from modelConstants.ts, never hardcode

## Full Architecture

See `docs/architecture.md`
