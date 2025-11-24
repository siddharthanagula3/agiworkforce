# Testing Guide

Comprehensive testing guide for the AGI Workforce desktop application.

## Table of Contents

- [Overview](#overview)
- [Test Organization](#test-organization)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Mocking Strategies](#mocking-strategies)
- [CI/CD Integration](#cicd-integration)
- [Coverage Requirements](#coverage-requirements)
- [Best Practices](#best-practices)

## Overview

The AGI Workforce application has a comprehensive testing infrastructure covering:

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test interactions between multiple components
- **End-to-End Tests**: Test complete user workflows
- **Security Tests**: Validate security measures and prevent vulnerabilities
- **Performance Benchmarks**: Measure and track performance metrics

## Test Organization

### Rust Tests

```
apps/desktop/src-tauri/
├── src/
│   ├── agi/
│   │   └── tests/
│   │       ├── mod.rs
│   │       ├── core_tests.rs
│   │       ├── executor_tests.rs
│   │       ├── knowledge_tests.rs
│   │       ├── learning_tests.rs
│   │       ├── memory_tests.rs
│   │       ├── resources_tests.rs
│   │       ├── security_tests.rs              # NEW: Security tests
│   │       ├── process_reasoning_tests.rs     # NEW: Process reasoning tests
│   │       └── outcome_tracker_tests.rs       # NEW: Outcome tracking tests
│   ├── router/
│   │   └── tests/
│   ├── automation/
│   │   └── tests/
│   └── test_utils/                            # NEW: Test utilities
│       ├── mod.rs
│       └── mocks.rs
├── tests/
│   ├── integration_tests.rs                   # Enhanced integration tests
│   ├── test_config.toml                       # NEW: Test configuration
│   └── fixtures/
│       └── mock_responses.json                # NEW: Mock LLM responses
└── benches/
    ├── automation_benchmarks.rs
    └── agi_benchmarks.rs                      # NEW: AGI benchmarks
```

### Frontend Tests

```
apps/desktop/
├── src/
│   ├── __tests__/
│   │   ├── stores/
│   │   │   ├── agiStore.test.ts              # NEW: AGI store tests
│   │   │   ├── unifiedChatStore.test.ts
│   │   │   └── automationStore.test.ts
│   │   ├── hooks/
│   │   └── components/
└── e2e/
    └── tests/
        └── agi-workflow.spec.ts               # NEW: AGI E2E tests
```

## Running Tests

### Rust Unit Tests

Run all unit tests:

```bash
cd apps/desktop/src-tauri
cargo test --lib
```

Run specific test module:

```bash
cargo test --lib agi::tests::security_tests
```

Run tests with output:

```bash
cargo test --lib -- --nocapture
```

### Rust Integration Tests

Run all integration tests:

```bash
cd apps/desktop/src-tauri
cargo test --test '*'
```

Run with single thread (for tests that modify shared state):

```bash
cargo test --test '*' -- --test-threads=1
```

### Security Tests

Run security-specific tests:

```bash
cd apps/desktop/src-tauri
cargo test security::
```

### Performance Benchmarks

Run all benchmarks:

```bash
cd apps/desktop/src-tauri
cargo bench
```

Run specific benchmark:

```bash
cargo bench --bench agi_benchmarks
```

### Frontend Unit Tests

Run all frontend tests:

```bash
pnpm --filter @agiworkforce/desktop test
```

Run with UI:

```bash
pnpm --filter @agiworkforce/desktop test:ui
```

Run with coverage:

```bash
pnpm --filter @agiworkforce/desktop test:coverage
```

### E2E Tests

Run all E2E tests:

```bash
pnpm --filter @agiworkforce/desktop test:e2e
```

Run specific test file:

```bash
pnpm --filter @agiworkforce/desktop exec playwright test agi-workflow.spec.ts
```

Run in headed mode (see browser):

```bash
pnpm --filter @agiworkforce/desktop exec playwright test --headed
```

### All Tests

Run complete test suite:

```bash
# From repository root
pnpm test              # Frontend tests
cd apps/desktop/src-tauri
cargo test --all       # Rust tests
cargo bench            # Benchmarks
```

## Writing Tests

### Rust Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_functionality() {
        let result = my_function(42);
        assert_eq!(result, 84);
    }

    #[tokio::test]
    async fn test_async_functionality() {
        let result = my_async_function().await;
        assert!(result.is_ok());
    }
}
```

### Integration Tests

```rust
// tests/my_integration_test.rs
use agiworkforce_desktop::*;

#[tokio::test]
async fn test_full_workflow() {
    let fixture = test_utils::TestFixture::new();

    // Create goal
    let goal_id = create_test_goal(&fixture.db).await;

    // Execute goal
    let result = execute_goal(&fixture.db, &goal_id).await;

    // Verify results
    assert!(result.is_ok());
}
```

### Frontend Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const result = myFunction();
    expect(result).toBe(expectedValue);
  });

  it('should handle errors', async () => {
    await expect(myAsyncFunction()).rejects.toThrow();
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('complete user workflow', async ({ page }) => {
  await page.goto('http://localhost:1420');
  await page.click('[data-testid="create-button"]');
  await expect(page.locator('[data-testid="result"]')).toBeVisible();
});
```

## Mocking Strategies

### Mock LLM Router

```rust
use crate::test_utils::mocks::MockLLMRouter;

#[tokio::test]
async fn test_with_mock_llm() {
    let mock_router = MockLLMRouter::with_responses(vec![
        "Response 1".to_string(),
        "Response 2".to_string(),
    ]);

    let response = mock_router.complete("test prompt", 100).await.unwrap();
    assert_eq!(response, "Response 1");
}
```

### Mock File System

```rust
use crate::test_utils::mocks::MockFileSystem;

#[test]
fn test_with_mock_fs() {
    let fs = MockFileSystem::new();
    fs.create_file("/test.txt", "content");

    let content = fs.read_file("/test.txt").unwrap();
    assert_eq!(content, "content");
}
```

### Mock Database

```rust
use crate::test_utils::mocks::MockDatabase;

#[test]
fn test_with_mock_db() {
    let db = MockDatabase::new();

    let mut record = HashMap::new();
    record.insert("id".to_string(), json!("1"));
    record.insert("name".to_string(), json!("test"));

    db.insert("users", record).unwrap();

    let results = db.query("users").unwrap();
    assert_eq!(results.len(), 1);
}
```

### Frontend Mocking

```typescript
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ success: true }),
}));
```

## CI/CD Integration

Tests run automatically on:

- **Push** to main, develop, or claude/\*\* branches
- **Pull requests** to main or develop
- **Daily schedule** at 2 AM UTC

### GitHub Actions Workflows

- **tests.yml**: Comprehensive test suite
  - Rust unit tests
  - Rust integration tests
  - Security tests
  - Frontend unit tests
  - E2E tests
  - Performance benchmarks
  - Code coverage

### Running CI Tests Locally

Simulate CI environment locally:

```bash
# Install act (GitHub Actions local runner)
# https://github.com/nektos/act

act -j rust-unit-tests
act -j frontend-unit-tests
act -j e2e-tests
```

## Coverage Requirements

### Minimum Coverage Thresholds

- **Overall**: 70% minimum
- **Critical modules** (security, AGI core): 85% minimum
- **New code**: 80% minimum

### Generating Coverage Reports

#### Rust Coverage

```bash
# Install cargo-llvm-cov
cargo install cargo-llvm-cov

# Generate coverage
cd apps/desktop/src-tauri
cargo llvm-cov --all-features --workspace --html

# View report
open target/llvm-cov/html/index.html
```

#### Frontend Coverage

```bash
pnpm --filter @agiworkforce/desktop test:coverage

# View report
open apps/desktop/coverage/index.html
```

### Coverage Reports in CI

Coverage reports are automatically:

- Generated on every push
- Uploaded to Codecov
- Commented on pull requests
- Used to fail builds below threshold

## Best Practices

### Test Isolation

✅ **Good**: Tests are independent

```rust
#[test]
fn test_isolated() {
    let fixture = TestFixture::new();
    // Use fixture's isolated database
}
```

❌ **Bad**: Tests share state

```rust
static mut SHARED_STATE: i32 = 0;

#[test]
fn test_not_isolated() {
    unsafe { SHARED_STATE += 1; }  // Don't do this!
}
```

### Test Data

✅ **Good**: Use test fixtures

```rust
let fixture = TestFixture::new();
let test_file = fixture.create_file("test.txt", "content").unwrap();
```

❌ **Bad**: Hard-coded paths

```rust
std::fs::write("/tmp/test.txt", "content").unwrap();  // Don't do this!
```

### Test Names

✅ **Good**: Descriptive names

```rust
#[test]
fn test_prompt_injection_detection_blocks_malicious_input() { }
```

❌ **Bad**: Generic names

```rust
#[test]
fn test_1() { }
```

### Assertions

✅ **Good**: Clear assertions with messages

```rust
assert_eq!(
    result.status,
    Status::Success,
    "Expected goal execution to succeed, but got: {:?}",
    result.status
);
```

❌ **Bad**: Silent assertions

```rust
assert!(result);  // What does this test?
```

### Async Tests

✅ **Good**: Use tokio::test

```rust
#[tokio::test]
async fn test_async_function() {
    let result = my_async_function().await;
    assert!(result.is_ok());
}
```

❌ **Bad**: Block on async in regular test

```rust
#[test]
fn test_async_function() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        // ...
    });
}
```

### Security Testing

Always test security boundaries:

```rust
#[test]
fn test_path_traversal_is_blocked() {
    let paths = vec!["../../../etc/passwd", "..\\..\\windows\\system32"];

    for path in paths {
        let result = validate_path(path);
        assert!(result.is_err(), "Failed to block: {}", path);
    }
}
```

### Performance Testing

Use benchmarks for performance-critical code:

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_my_function(c: &mut Criterion) {
    c.bench_function("my_function", |b| {
        b.iter(|| my_function(black_box(42)));
    });
}

criterion_group!(benches, benchmark_my_function);
criterion_main!(benches);
```

## Test Configuration

Tests can be configured via `apps/desktop/src-tauri/tests/test_config.toml`:

```toml
[test]
timeout_seconds = 30
parallel_tests = true

[llm]
use_mock = true
mock_responses = "fixtures/mock_responses.json"

[database]
use_in_memory = true
reset_between_tests = true

[security]
enable_all_validations = true
```

## Troubleshooting

### Tests Hanging

If tests hang, check for:

- Deadlocks in async code
- Missing `.await` on futures
- Infinite loops

Solution: Add timeouts to tests

```rust
#[tokio::test(timeout = 5000)]  // 5 second timeout
async fn test_with_timeout() {
    // ...
}
```

### Flaky Tests

If tests pass/fail randomly:

- Check for race conditions
- Verify test isolation
- Add proper waits in E2E tests

Solution: Use deterministic waits

```typescript
// Bad: arbitrary timeout
await page.waitForTimeout(1000);

// Good: wait for condition
await page.waitForSelector('[data-testid="result"]');
```

### Memory Leaks in Tests

If tests consume too much memory:

- Ensure cleanup after tests
- Use scoped fixtures
- Drop large objects

Solution: Use test fixtures with cleanup

```rust
impl Drop for TestFixture {
    fn drop(&mut self) {
        // Cleanup happens automatically
    }
}
```

## Resources

- [Rust Testing Documentation](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Criterion Benchmarking](https://github.com/bheisler/criterion.rs)

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass locally
3. Add integration tests for new workflows
4. Update this documentation if needed
5. Verify CI passes before requesting review

Minimum requirements for PR approval:

- All tests passing
- Coverage >= 70%
- No security test failures
- Benchmarks show no significant regressions
