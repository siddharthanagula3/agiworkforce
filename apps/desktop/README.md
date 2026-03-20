# Desktop App

Tauri v2 + React 19 desktop application. The flagship surface.

## Quick Start

```bash
pnpm install
cd apps/desktop && pnpm dev          # Vite + Rust hot reload
cd apps/desktop && pnpm dev:vite     # Frontend only (no Rust rebuild)
```

## Architecture

- **Rust backend**: `src-tauri/src/` — core/, sys/, automation/, features/, data/, integrations/
- **React frontend**: `src/` — components/, stores/, hooks/, services/, api/
- **IPC**: `invoke()` with camelCase params (Tauri auto-converts to snake_case)
- **State**: Zustand v5 + Immer + Persist (55+ stores)
- **UI**: Radix UI + Tailwind 4 + Lucide icons

## Key Commands

```bash
pnpm test                    # Vitest
pnpm typecheck               # tsc --noEmit
cargo check                  # Rust type check
cargo clippy                 # Rust linting
```

## Environment Variables

See `.env.example` for required variables. API keys go through SecretManager (Rust side).
