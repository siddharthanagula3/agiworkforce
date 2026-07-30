# apps/web/features/time-focus

Status: Current
Owner role: Web lead
Last updated: 2026-07-18
Purpose: Website break reminders and quiet-hours nudges driven by account preferences.

## Rules

- Reminders are optional and dismissible; never turn them into an access lock.
- Persist configuration through the canonical account preference API.
- Reuse the shared `@agiworkforce/types` time-window contract across surfaces.
- Keep browser-local activity counters tenant-scoped and fail closed when storage is unavailable.
