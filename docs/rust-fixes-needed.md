# Rust Fixes Needed

## CodeRabbit: productivity_executor.rs test uses `::new()` instead of `::default()`

### File

`apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs` (line 756)

### Issue

The `test_default_impl` test calls `ProductivityExecutor::new()` instead of `ProductivityExecutor::default()`. The struct derives `#[derive(Default)]`, so the test should verify the `Default` trait implementation works correctly. Using `::new()` tests the constructor but not the derived trait, making the test name misleading.

### Fix

Change `::new()` to `::default()` in the test:

```rust
// Before
let executor = ProductivityExecutor::new();

// After
let executor = ProductivityExecutor::default();
```

### Validation

```bash
cargo test --package agi-desktop -p agi-desktop -- core::agi::executors::productivity_executor::tests::test_default_impl
```

---

## CodeRabbit: file_executor_tests.rs test uses `::new()` instead of `::default()`

### File

`apps/desktop/src-tauri/src/core/agi/executors/tests/file_executor_tests.rs` (line 78)

### Issue

The `test_file_executor_default` test calls `FileExecutor::new()` instead of `FileExecutor::default()`. Same inconsistency as the productivity executor test above — the struct derives `#[derive(Default)]` but the test does not exercise the derived trait.

### Fix

Change `::new()` to `::default()` in the test:

```rust
// Before
let executor = FileExecutor::new();

// After
let executor = FileExecutor::default();
```

### Validation

```bash
cargo test --package agi-desktop -p agi-desktop -- core::agi::executors::tests::file_executor_tests::test_file_executor_default
```
