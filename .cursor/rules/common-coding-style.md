---
description: "Coding style: immutability, file organization, error handling, validation"
alwaysApply: true
---
# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate existing ones:

```
// Pseudocode
WRONG:  modify(original, field, value) -> changes original in-place
CORRECT: update(original, field, value) -> returns new copy with change
```

Rationale: Immutable data prevents hidden side effects, makes debugging easier, and enables safe concurrency. This applies to both TypeScript (Zustand + Immer) and Rust (ownership model).

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large modules
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors
- Rust: Use `Result<T, E>` with descriptive error types
- TypeScript: Use try-catch with proper error typing

## Input Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing
- Use schema-based validation where available (Zod for TS, serde for Rust)
- Fail fast with clear error messages
- Never trust external data (API responses, user input, file content)
- Tauri IPC: validate all `invoke()` parameters on the Rust side

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)
- [ ] No `console.log` in production code
