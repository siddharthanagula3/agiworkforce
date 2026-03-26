# AGI Workforce Monorepo

pnpm monorepo + Cargo workspace. 6 apps, 3 Rust crates, 7 shared TS packages, 2 services.

## Apps

- `apps/cli/` — Rust CLI agent (binary: `agiworkforce`, crate: `agiworkforce-cli`)
- `apps/desktop/` — Tauri v2 desktop (Rust backend + React 19/Vite frontend)
- `apps/web/` — Next.js 16 App Router (Supabase auth, Stripe billing)
- `apps/mobile/` — Expo 55 + React Native (NativeWind, MMKV)
- `apps/extension/` — Chrome MV3 (native messaging, DOM automation, WebMCP)
- `apps/extension-vscode/` — VS Code extension (chat participant @agi, agent mode)
- `services/api-gateway/` — Express API (mobile + cloud chat SSE)
- `services/signaling-server/` — WebSocket signaling (cross-device)

## Build Commands

```bash
# Rust
cargo check --workspace                          # Full workspace
cargo check -p agiworkforce-cli                   # CLI only
cargo clippy --workspace --lib -- -D warnings     # Lint
cargo test -p agiworkforce-cli                    # CLI tests (848)
cd apps/desktop/src-tauri && cargo test --lib     # Desktop tests (3868)

# TypeScript
cd apps/desktop && npx tsc --noEmit               # Desktop frontend
cd apps/desktop && npx vite build                  # Desktop Vite build
cd apps/web && pnpm build:next-only                # Web production build
cd apps/mobile && npx tsc --noEmit                 # Mobile typecheck
cd apps/extension && pnpm build                    # Chrome extension
cd apps/extension-vscode && pnpm compile           # VS Code extension
pnpm lint                                          # ESLint (max-warnings=0)
```

## Common Pitfalls

1. **Tauri IPC casing**: TS `invoke()` params = camelCase, Rust `#[tauri::command]` = snake_case. Snake in TS silently arrives as `undefined`.
2. **Serde rename**: Every Rust struct serialized to JSON needs `#[serde(rename_all = "camelCase")]`.
3. **Model IDs**: NEVER hardcode. Source of truth: `apps/desktop/src/constants/models.json`.
4. **rusqlite types**: `u64`/`usize` must cast to `i64` for `ToSql`/`FromSql` (rusqlite 0.39).
5. **Zustand selectors**: Always use `useShallow` when selecting multiple values.
6. **useEffect cleanup**: Tauri `listen()` returns `Promise<UnlistenFn>` — must await and call in cleanup.

## Rust Rules

- Deny: `unsafe_code`, `dead_code`, `unused_imports`, `unused_variables`, `unused_mut`
- Zero `.unwrap()` on fallible ops outside tests — use `?` or `.map_err()`
- `anyhow::Result` for command returns, `thiserror::Error` for domain enums
- State via `State<'_, T>` — never global statics
- Modules < 500 LOC, split at 800
- Graceful degradation: `StateType::new_degraded()` for optional features

## TypeScript Rules

- `strict: true`, `noUnusedLocals`, `noUncheckedIndexedAccess`
- `interface` over `type` for object shapes. Named exports only.
- Toasts: `sonner`. Icons: `lucide-react`. UI: Radix. Variants: CVA.
- `cn()` from `@/lib/utils` for class merging
- Every `invoke()` in try/catch. Timer/listener cleanup in useEffect return.
- Zero `// @ts-ignore` or `as any`

## Conventions

- Commit format: `type(scope): lowercase subject` (commitlint enforced)
- React 19: `useActionState`, `useTransition`, ref-as-prop (no forwardRef)
- Tailwind v4: CSS-first config in `globals.css` via `@theme`
- Store pattern: `create<T>()(devtools(persist(subscribeWithSelector(immer(…)))))`

## Don't

- Never create .md files unless explicitly asked
- Never write implementation plans, summaries, or reports to files
- Never modify `Cargo.lock` or `pnpm-lock.yaml` without justification
- Never modify files in `~/Desktop/claude-code`, `codex-cli`, `opencode`, `gemini-cli`
- Never hardcode model IDs, API keys, or secrets
- Never use `console.log` in production (stripped by esbuild)
- Never run tests unless explicitly asked

## Architecture Reference

- Full architecture: `@docs/architecture.md`
- Per-app details: each app's CLAUDE.md
- Modular rules: `.claude/rules/`
