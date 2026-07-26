# Desktop Startup Recovery Feature

Status: Current
Owner: Desktop surface lead
Purpose: Own the fail-closed startup UI shown when Desktop cannot safely open or verify local data.

## Boundaries

- Keep recovery-specific UI and native startup-command composition in this folder.
- Preserve local data on startup failures; recovery must never delete, reset, rename, or replace the database.
- Keep key management, database recovery mechanics, and privileged filesystem operations in the Tauri boundary.
- Export only sanitized diagnostics and do not expose native error details, secrets, keys, or user paths in the UI.
- Mount the normal application only after the native startup check reports that recovery is not required.
