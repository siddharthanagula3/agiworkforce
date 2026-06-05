# apps/mobile/src/features/onboarding

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile first-run disclosures, Local Mode onboarding, and Cloud invite entry points.

## Rules

- Import onboarding UI through `@/src/features/onboarding`.
- Mobile demo starts from Local Mode with small on-device/local LLM routes. Cloud Managed stays visible only through invite/waitlist gates until access is enabled.
- Onboarding state should stay in approved stores/services, not in modal-only components.
