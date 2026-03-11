---
description: "Common patterns: repository, API response, Tauri IPC"
alwaysApply: true
---
# Common Patterns

## Tauri IPC Pattern

All frontend-backend communication goes through Tauri `invoke()`:

```
Frontend (TypeScript) -- invoke("command_name", { camelCaseParams }) --> Rust #[tauri::command]
```

CRITICAL: All `invoke()` calls MUST use camelCase param keys. Tauri auto-converts from Rust snake_case. Snake_case in invoke() silently fails.

## State Management Pattern

- Frontend: Zustand v5 + Immer + Persist middleware
- Backend: Tauri managed state via `app.manage()` + `State<'_, T>`
- Use degraded state constructors for optional features: `MemoryState::degraded()`

## Design Patterns

### Repository Pattern

Encapsulate data access behind a consistent interface:
- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details
- Business logic depends on the abstract interface
- Enables easy swapping of data sources and simplifies testing

### API Response Format

Use a consistent envelope for all API responses:
- Include a success/status indicator
- Include the data payload (nullable on error)
- Include an error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)

## Skeleton Projects

When implementing new functionality:
1. Search for battle-tested patterns in the existing codebase first
2. Check similar implementations in the monorepo
3. Use parallel agents to evaluate options
4. Iterate within proven structure
