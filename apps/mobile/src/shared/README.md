# apps/mobile/src/shared

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Shared Mobile components and helpers used by multiple product domains without a single feature owner.

## Rules

- Keep domain-owned code in `src/features/<domain>`.
- Shared components must avoid business state and provider-specific side effects.
- Promote repeated cross-feature UI here only after a second real caller exists.
