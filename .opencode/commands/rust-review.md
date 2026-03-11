---
description: Rust code review for Tauri v2 patterns and best practices
agent: rust-reviewer
subtask: true
---

# Rust Review Command

Review Rust code for idiomatic patterns and Tauri v2 best practices: $ARGUMENTS

## Your Task

1. **Analyze Rust code** for idioms and patterns
2. **Check async safety** - tokio, async/await, lock holding
3. **Review error handling** - proper error types and propagation
4. **Verify Tauri patterns** - command handlers, state management
5. **Check clippy compliance** - all warnings are errors

## Review Checklist

### Tauri v2 Patterns
- [ ] `#[tauri::command]` handlers use proper signatures
- [ ] State accessed via `State<'_, T>` not global
- [ ] Managed state uses degraded constructors for optional features
- [ ] Event channels emit correctly typed payloads

### Error Handling
- [ ] No `.unwrap()` in production code (use `?` or `map_err`)
- [ ] Errors have context (anyhow/thiserror)
- [ ] No `panic!()` in command handlers

### Safety
- [ ] No `unsafe` blocks (denied in Cargo.toml)
- [ ] No `clippy::await_holding_lock` violations
- [ ] Proper `Send + Sync` bounds on shared state

### Performance
- [ ] Avoid unnecessary clones
- [ ] Use `&str` over `String` for function params where possible
- [ ] Async operations don't block the main thread

## Report Format

### Idiomatic Issues
- [file:line] Issue description
  Suggestion: How to fix

### Error Handling Issues
- [file:line] Issue description
  Suggestion: How to fix

---

**TIP**: Run `cargo clippy -- -D warnings` for automated checks.
