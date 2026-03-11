---
description: Fix TypeScript and Rust build errors with minimal changes
agent: build-error-resolver
subtask: true
---

# Build Fix Command

Fix build errors with minimal changes: $ARGUMENTS

## Your Task

1. **Run TypeScript check**: `pnpm typecheck`
2. **Run Rust check**: `cargo check`
3. **Run Rust lint**: `cargo clippy -- -D warnings`
4. **Collect all errors**
5. **Fix errors one by one** with minimal changes
6. **Verify each fix** doesn't introduce new errors
7. **Run final check** to confirm all errors resolved

## Approach

### DO:
- Fix type errors with correct types
- Add missing imports
- Fix syntax errors
- Make minimal changes
- Preserve existing behavior
- Run `pnpm typecheck` and `cargo check` after each change

### DON'T:
- Refactor code
- Add new features
- Change architecture
- Use `any` type (unless absolutely necessary)
- Add `@ts-ignore` comments
- Add `#[allow()]` attributes
- Change business logic

## Common Error Fixes

### TypeScript
| Error | Fix |
|-------|-----|
| Type 'X' is not assignable to type 'Y' | Add correct type annotation |
| Property 'X' does not exist | Add property to interface or fix property name |
| Cannot find module 'X' | Install package or fix import path |
| Object is possibly 'undefined' | Add null check or optional chaining |

### Rust
| Error | Fix |
|-------|-----|
| unused import | Remove the import |
| dead_code | Remove or add `#[cfg(test)]` |
| cannot find value | Add use statement or fix path |
| mismatched types | Fix type conversion |

## Verification Steps

After fixes:
1. `pnpm typecheck` - should show 0 errors
2. `cargo check` - should succeed
3. `cargo clippy -- -D warnings` - should show 0 warnings
4. `pnpm lint` - should show 0 errors

---

**IMPORTANT**: Focus on fixing errors only. No refactoring, no improvements, no architectural changes. Get the build green with minimal diff.
