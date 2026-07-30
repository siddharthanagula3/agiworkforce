# apps/desktop/src/features

Status: Current
Owner role: Desktop lead
Last updated: 2026-05-21
Purpose: Canonical Desktop feature-domain root for Tauri/React product code that has been separated from legacy component layers.

## Rules

- New Desktop feature domains land here when they are not reusable shared packages.
- Legacy `components/`, `services/`, `stores/`, and `hooks/` code is migrated one domain at a time.
- Feature domains import reusable primitives from `components/ui`, shared packages, or Desktop platform boundaries.
- Do not move Tauri command implementations here; Rust/native code stays in `src-tauri` or shared crates.
