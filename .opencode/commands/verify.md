---
description: Run verification loop (tsc, cargo check, clippy, lint, tests)
agent: build
---

# Verify Command

Run verification loop to validate the implementation: $ARGUMENTS

## Your Task

Execute comprehensive verification across the monorepo:

1. **TypeScript Check**: `pnpm typecheck`
2. **Rust Check**: `cargo check`
3. **Rust Lint**: `cargo clippy -- -D warnings`
4. **ESLint**: `pnpm lint`
5. **Unit Tests**: `cd apps/desktop && pnpm test`
6. **Rust Tests**: `cargo test`
7. **Build**: `cd apps/desktop && pnpm build` (if full build requested)

## Verification Checklist

### Code Quality
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] No Rust errors (`cargo check`)
- [ ] No Clippy warnings (`cargo clippy -- -D warnings`)
- [ ] No lint warnings (`pnpm lint`)
- [ ] No console.log statements
- [ ] Functions < 50 lines
- [ ] Files < 800 lines
- [ ] Tauri IPC uses camelCase params

### Tests
- [ ] All Vitest tests passing
- [ ] All Rust tests passing
- [ ] Coverage >= 80%
- [ ] Edge cases covered

### Security
- [ ] No hardcoded secrets
- [ ] Secrets through SecretManager
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities

### Build
- [ ] TypeScript compiles
- [ ] Rust compiles
- [ ] No warnings

## Verification Report

### Summary
- Status: PASS / FAIL
- Score: X/Y checks passed

### Details
| Check | Status | Notes |
|-------|--------|-------|
| TypeScript | pass/fail | [details] |
| Rust | pass/fail | [details] |
| Clippy | pass/fail | [details] |
| Lint | pass/fail | [details] |
| Tests (TS) | pass/fail | [details] |
| Tests (Rust) | pass/fail | [details] |

---

**NOTE**: Verification loop should be run before every commit and PR.
