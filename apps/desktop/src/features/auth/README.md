# Desktop Auth Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the Desktop Cloud sign-in page and its in-app device authorization entry point.

## Boundaries

- Keep auth feature-specific UI and local composition in this folder.
- Cloud authentication must stay inside an owned Desktop webview. Do not add
  password fields backed by a separate Desktop-only auth implementation or
  redirect the system browser for sign-in.
- Keep shared state, runtime bridges, and API clients in their existing shared roots until a deliberate package or core boundary is created.
- Import shared UI primitives from `@/components/ui/*`.
