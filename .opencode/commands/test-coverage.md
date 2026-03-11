---
description: Analyze test coverage across desktop, web, and Rust
agent: tdd-guide
subtask: true
---

# Test Coverage Command

Analyze test coverage and identify gaps: $ARGUMENTS

## Your Task

1. **Run coverage reports**:
   - Desktop (TS): `cd apps/desktop && pnpm test:coverage`
   - Rust: `cargo test` (use cargo-tarpaulin for coverage if available)
2. **Analyze results** - Identify low coverage areas
3. **Prioritize gaps** - Critical code first
4. **Generate missing tests** - For uncovered code

## Coverage Targets

| Code Type | Target |
|-----------|--------|
| Standard code | 80% |
| LLM routing (llm_router.rs) | 100% |
| Auth/security (ToolGuard, SecretManager) | 100% |
| Utilities | 90% |
| UI components | 70% |
| Tauri commands | 80% |

## Coverage Commands

```bash
# Desktop TypeScript coverage
cd apps/desktop && pnpm test:coverage

# Rust coverage (if cargo-tarpaulin installed)
cargo tarpaulin --out Html

# View HTML report
open apps/desktop/coverage/lcov-report/index.html
```

---

**IMPORTANT**: Coverage is a metric, not a goal. Focus on meaningful tests, not just hitting numbers.
