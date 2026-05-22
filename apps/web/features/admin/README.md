# apps/web/features/admin

Status: Current
Owner role: Web lead
Last updated: 2026-05-21
Purpose: Enterprise/admin readiness UI and policy-control Web feature code.

## Rules

- Keep admin-only components and helpers in this domain.
- Route files under `apps/web/app/admin` should import through this feature barrel.
- Do not mix customer chat UI, billing flows, or support case UI into this folder.
