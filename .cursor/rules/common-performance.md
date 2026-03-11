---
description: "Performance: model selection, context management, build troubleshooting"
alwaysApply: true
---
# Performance Optimization

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Build Troubleshooting

If build fails:
1. Analyze error messages carefully
2. Fix incrementally
3. Verify after each fix

### Rust Build Issues
- Run `cargo check` first (faster than `cargo build`)
- Use `cargo clippy` for lint issues
- Check feature flags: `default = ["shell", "updater"]`
- Remember: `unsafe_code`, `dead_code`, `unused_imports`, `unused_variables`, `unused_mut` are denied

### TypeScript Build Issues
- Run `pnpm typecheck` (alias for `cd apps/desktop && tsc --noEmit`)
- Check for strict mode violations
- Verify import paths (absolute imports from `src/`)

### Full Build Verification
```bash
cargo check                    # Rust type check
cargo clippy                   # Rust lint
pnpm typecheck                 # TypeScript check
pnpm lint                      # ESLint
cd apps/desktop && pnpm test   # Vitest
```
