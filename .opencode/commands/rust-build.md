---
description: Fix Rust build and clippy errors
agent: rust-build-resolver
subtask: true
---

# Rust Build Command

Fix Rust build, clippy, and compilation errors: $ARGUMENTS

## Your Task

1. **Run cargo check**: `cargo check`
2. **Run cargo clippy**: `cargo clippy -- -D warnings`
3. **Fix errors** one by one
4. **Verify fixes** don't introduce new errors

## Common Rust Errors in AGI Workforce

### Unused Imports/Variables (denied in Cargo.toml)
```
error: unused import: `foo`
```
**Fix**: Remove unused import

### Dead Code (denied in Cargo.toml)
```
error: function `bar` is never used
```
**Fix**: Remove or gate with `#[cfg(test)]` or `#[cfg(feature = "...")]`

### Type Mismatch
```
error: expected `String`, found `&str`
```
**Fix**: Use `.to_string()` or change signature to accept `&str`

### Missing Trait Implementation
```
error: the trait bound `X: Send` is not satisfied
```
**Fix**: Add `Send` bound or restructure state management

## Build Commands

```bash
# Check all packages
cargo check

# Clippy with all warnings as errors
cargo clippy -- -D warnings

# Check specific package
cargo check -p agiworkforce-desktop

# Run tests
cargo test

# Format code
cargo fmt
```

## Verification

After fixes:
```bash
cargo check     # Should succeed
cargo clippy -- -D warnings  # Should have no warnings
cargo test      # Tests should pass
```

---

**IMPORTANT**: Fix errors only. No refactoring, no improvements. Get the build green with minimal changes.
