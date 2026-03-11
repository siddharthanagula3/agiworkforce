---
description: Remove dead code and consolidate duplicates across monorepo
agent: refactor-cleaner
subtask: true
---

# Refactor Clean Command

Analyze and clean up the codebase: $ARGUMENTS

## Your Task

1. **Detect dead code** using analysis tools
2. **Identify duplicates** and consolidation opportunities
3. **Safely remove** unused code with documentation
4. **Verify** no functionality broken

## Detection Phase

### Run Analysis Tools

```bash
# Find unused exports (TypeScript)
pnpm exec knip

# Find unused dependencies
pnpm exec depcheck

# Rust dead code (enforced by Cargo.toml deny)
cargo clippy -- -D dead_code

# Check for unused Tauri commands not registered in lib.rs
grep -r "#\[tauri::command\]" apps/desktop/src-tauri/src/ | wc -l
```

### Manual Checks

- Unused functions (no callers)
- Unused Tauri commands (not in generate_handler!)
- Unused Zustand stores
- Unused React components
- Commented-out code
- Unreachable code

## Verification

After cleanup:

1. `cargo check` - builds successfully
2. `cargo clippy -- -D warnings` - no warnings
3. `pnpm typecheck` - no TypeScript errors
4. `pnpm lint` - no new lint errors
5. `cd apps/desktop && pnpm test` - all tests pass

---

**CAUTION**: Always verify before removing. When in doubt, ask or add `// TODO: verify usage` comment.
