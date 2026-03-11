---
description: Enforce TDD workflow with 80%+ coverage
agent: tdd-guide
subtask: true
---

# TDD Command

Implement the following using strict test-driven development: $ARGUMENTS

## TDD Cycle (MANDATORY)

```
RED -> GREEN -> REFACTOR -> REPEAT
```

1. **RED**: Write a failing test FIRST
2. **GREEN**: Write minimal code to pass the test
3. **REFACTOR**: Improve code while keeping tests green
4. **REPEAT**: Continue until feature complete

## Test Frameworks

| Workspace | Framework | Command |
|-----------|-----------|---------|
| Desktop (TS) | Vitest | `cd apps/desktop && pnpm test` |
| Desktop (E2E) | Playwright | `cd apps/desktop && pnpm test:e2e` |
| Desktop (Rust) | cargo test | `cargo test` |
| Web | Next.js test | `cd apps/web && pnpm test` |

## Your Task

### Step 1: Define Interfaces (SCAFFOLD)
- Define TypeScript interfaces or Rust types for inputs/outputs
- Create function signature with `throw new Error('Not implemented')` (TS) or `todo!()` (Rust)

### Step 2: Write Failing Tests (RED)
- Write tests that exercise the interface
- Include happy path, edge cases, and error conditions
- Run tests - verify they FAIL

### Step 3: Implement Minimal Code (GREEN)
- Write just enough code to make tests pass
- No premature optimization
- Run tests - verify they PASS

### Step 4: Refactor (IMPROVE)
- Extract constants, improve naming
- Remove duplication
- Run tests - verify they still PASS

### Step 5: Check Coverage
- Target: 80% minimum
- 100% for critical business logic
- Add more tests if needed

## Coverage Requirements

| Code Type | Minimum |
|-----------|---------|
| Standard code | 80% |
| LLM routing logic | 100% |
| Authentication logic | 100% |
| Security-critical code (ToolGuard, SecretManager) | 100% |

---

**MANDATORY**: Tests must be written BEFORE implementation. Never skip the RED phase.
