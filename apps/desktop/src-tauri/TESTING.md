# Windows Automation MCP - Testing Documentation

## Overview

This document describes the comprehensive test coverage for the Windows Automation MCP (Model Context Protocol) component of the AGI Workforce desktop application.

## Test Structure

### Unit Tests

Unit tests are co-located with source files in dedicated `tests.rs` modules:

- **`src/automation/input/tests.rs`** - Tests for clipboard, keyboard, and mouse input
- **`src/automation/screen/tests.rs`** - Tests for screen capture, OCR, and display management
- **`src/automation/uia/tests.rs`** - Tests for UI Automation service and element interaction

### Integration Tests

Integration tests verify complete workflows:

- **`tests/automation_integration.rs`** - End-to-end automation workflows
- **`tests/automation_db_tests.rs`** - Database integration and schema validation

### Performance Benchmarks

Performance benchmarks measure critical operations:

- **`benches/automation_benchmarks.rs`** - Performance benchmarks for automation operations

## Running Tests

### Run All Unit Tests

```bash
cd apps/desktop/src-tauri
cargo test --lib
```

### Run Integration Tests

```bash
cargo test --test '*'
```

### Run Tests with OCR Feature

```bash
cargo test --features ocr
```

### Run Ignored Tests (Interactive/Disruptive)

Some tests are marked with `#[ignore]` because they require user interaction or disrupt the system. Run them explicitly:

```bash
# Run only ignored tests
cargo test -- --ignored

# Run all tests including ignored ones
cargo test -- --include-ignored
```

### Run Specific Test Suite

```bash
# Clipboard tests only
cargo test clipboard_tests

# Screen capture tests only
cargo test capture_tests

# UIA tests only
cargo test service_tests
```

### Run Performance Benchmarks

```bash
cargo bench
```

## Test Coverage

### Coverage Goals

- **Overall target**: >70% code coverage
- **Critical modules**: >80% coverage
  - Input simulation (clipboard, keyboard, mouse)
  - Screen capture
  - UI Automation service

### Generate Coverage Report

Using `cargo-tarpaulin`:

```bash
# Install tarpaulin (Windows)
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin --workspace --out Html --output-dir coverage --timeout 300 --exclude-files 'src/commands/*'

# View HTML report
start coverage/index.html
```

### Coverage by Module

Current coverage estimates:

| Module | Coverage | Notes |
|--------|----------|-------|
| `automation/input/clipboard.rs` | ~85% | All operations tested except error paths |
| `automation/input/keyboard.rs` | ~75% | Interactive tests marked #[ignore] |
| `automation/input/mouse.rs` | ~75% | Interactive tests marked #[ignore] |
| `automation/screen/capture.rs` | ~90% | Comprehensive coverage |
| `automation/screen/dxgi.rs` | ~80% | Display enumeration tested |
| `automation/screen/ocr.rs` | ~60% | Requires Tesseract installation |
| `automation/uia/mod.rs` | ~70% | Core functionality tested |
| `automation/uia/element_tree.rs` | ~75% | Element finding and querying |
| `automation/uia/patterns.rs` | ~65% | Pattern detection tested |
| `automation/uia/actions.rs` | ~60% | Requires live UI elements |

## Test Categories

### Safe Tests (Always Run)

These tests don't disrupt the system:

- Clipboard save/restore operations
- Data structure serialization/deserialization
- Database schema validation
- Service initialization
- Window enumeration (read-only)
- Display information retrieval

### Interactive Tests (`#[ignore]`)

These tests require manual verification and may disrupt workflow:

- Keyboard input simulation
- Mouse movement and clicks
- Application launching and automation
- Text entry and modification

**When to run**: In isolated test environments only, never during active development.

### Feature-Gated Tests

Tests that require optional features:

- `#[cfg(feature = "ocr")]` - OCR extraction tests
- `#[cfg(feature = "local-llm")]` - Local LLM tests (if applicable)

## Test Organization

### Unit Test Patterns

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_functionality() {
        // Arrange
        let service = Service::new().unwrap();

        // Act
        let result = service.operation();

        // Assert
        assert!(result.is_ok());
    }

    #[test]
    #[ignore]
    fn test_interactive_operation() {
        // Tests that affect system state
        // Run with: cargo test -- --ignored
    }
}
```

### Integration Test Patterns

```rust
#[test]
fn test_complete_workflow() {
    // Setup
    // Execute complete workflow
    // Verify results
    // Cleanup
}
```

## CI/CD Integration

Tests run automatically in GitHub Actions on:

- Push to `main`, `master`, or `develop` branches
- Pull requests to protected branches
- Manual workflow dispatch

### CI Test Jobs

1. **Unit Tests** - Fast unit tests for quick feedback
2. **Integration Tests** - Full integration test suite
3. **Coverage** - Code coverage report generation
4. **OCR Tests** - Tests with Tesseract installed
5. **Benchmarks** - Performance baseline tracking

See `.github/workflows/test-automation.yml` for full configuration.

## Troubleshooting

### Tests Fail on CI but Pass Locally

**Common causes**:
- Different Windows version (CI uses windows-latest)
- Missing dependencies (e.g., Tesseract for OCR)
- DPI scaling differences
- Screen resolution variations

**Solution**: Ensure tests are deterministic and don't depend on specific screen configurations.

### COM Initialization Errors

**Error**: "CoInitializeEx failed"

**Solution**: UIA tests initialize COM automatically. If running multiple tests in parallel, use `serial_test` crate to enforce sequential execution:

```rust
use serial_test::serial;

#[test]
#[serial]
fn test_uia_operation() {
    // Test code
}
```

### Clipboard Tests Fail Intermittently

**Cause**: Clipboard is a shared system resource that can be locked by other applications.

**Solution**: Clipboard tests use `serial_test` to run sequentially and save/restore original content.

### Screen Capture Errors

**Common issues**:
- Multiple monitors with different DPI scaling
- HDR displays
- Virtual desktops
- Permission errors on certain windows

**Solution**: Test with primary display first, then add multi-monitor tests.

## Performance Targets

### Latency Requirements

| Operation | Target | Acceptable | Notes |
|-----------|--------|------------|-------|
| Screen capture (1080p) | <100ms | <200ms | Depends on screen size |
| Screen capture (4K) | <150ms | <300ms | 4x pixels of 1080p |
| Clipboard get/set | <5ms | <10ms | Usually instant |
| Keyboard input (single key) | <5ms | <10ms | SendInput overhead |
| Keyboard input (text 100 chars) | <50ms | <100ms | ~1ms per character |
| Mouse movement | <2ms | <5ms | Near-instant |
| Mouse click | <5ms | <10ms | Movement + click |
| UIA list windows | <50ms | <100ms | Depends on window count |
| UIA find element | <100ms | <200ms | Depends on tree depth |
| OCR processing (1080p) | <2s | <5s | Depends on text density |
| Thumbnail generation | <50ms | <100ms | Resize operation |

### Throughput Requirements

- **Screen captures**: >5 per second (for screen recording scenarios)
- **UI automation queries**: >10 per second
- **Keyboard events**: >20 per second (typing simulation)
- **Database inserts**: >100 per second (automation history logging)

## Test Data and Fixtures

### Test Applications

Recommended applications for automated testing:

1. **Notepad** (`notepad.exe`)
   - Available on all Windows systems
   - Simple UI with predictable elements
   - Safe for automation testing

2. **Calculator** (`calc.exe`)
   - Good for button click testing
   - Predictable layout

3. **Test Fixtures** (create custom test apps)
   - Create simple WPF/WinForms apps with known elements
   - Include test buttons, text boxes, checkboxes
   - Deploy with test suite

### Sample Test Data

```rust
// apps/desktop/src-tauri/tests/fixtures/
├── test_screenshot.png      // Known screenshot for OCR testing
├── test_text.txt            // Expected OCR output
└── test_app_config.json     // Test application metadata
```

## Best Practices

### DO:
- Use `#[ignore]` for tests that affect system state
- Save and restore system state (clipboard, focus)
- Use `serial_test` for tests accessing shared resources
- Test error paths and edge cases
- Document why tests are ignored
- Use meaningful test names describing what is tested

### DON'T:
- Run interactive tests during active development
- Assume specific screen resolution or DPI
- Leave applications running after tests
- Test implementation details instead of behavior
- Create tests that depend on execution order
- Ignore test failures

## Future Test Improvements

- [ ] Add property-based testing with `proptest`
- [ ] Create dedicated test application with known UI elements
- [ ] Add snapshot testing for UI element trees
- [ ] Implement visual regression testing for overlays
- [ ] Add stress tests for concurrent automation
- [ ] Create performance regression detection
- [ ] Add fuzzing for input validation

## Resources

- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Criterion Benchmarking](https://bheisler.github.io/criterion.rs/book/)
- [Windows UI Automation](https://docs.microsoft.com/en-us/windows/win32/winauto/entry-uiauto-win32)
- [Serial Test Crate](https://docs.rs/serial_test/)
