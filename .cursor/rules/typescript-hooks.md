---
description: "TypeScript hooks extending common rules for AGI Workforce"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
# TypeScript/JavaScript Hooks

> Extends the common hooks rule with TypeScript/JavaScript specifics.

## After File Edit Hooks

Configured in `.cursor/hooks.json`:

- **Prettier**: Auto-format JS/TS/CSS/JSON files after edit
- **console.log warning**: Warn about `console.log` in edited production files (skips test files)

## Stop Hooks

- **console.log audit**: Check all modified TS/JS files for `console.log` before session ends

## Build Verification

After significant edits, verify:
```bash
pnpm typecheck          # tsc --noEmit for desktop
pnpm lint               # ESLint
cargo check             # Rust compilation
cargo clippy            # Rust linting
```
