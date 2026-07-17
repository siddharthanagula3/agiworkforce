# apps/mobile/src/features/onboarding

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile first-run disclosures, Local Mode onboarding, and Cloud invite entry points.

## Rules

- Import onboarding UI through `@/src/features/onboarding`.
- Mobile demo starts from Local Mode with small on-device/local LLM routes. Cloud Managed is public alpha and open by default — it stays visible through a sign-in entry point, not an invite/waitlist gate.
- Onboarding state should stay in approved stores/services, not in modal-only components.
