# apps/mobile/src/features/onboarding

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile first-run disclosures, Local Mode onboarding, and disabled BYOK notice surfaces.

## Rules

- Import onboarding UI through `@/src/features/onboarding`.
- Mobile v1 stays Local Mode first with small on-device/local LLM routes. Cloud Managed is waitlist/invite-only, and BYOK is unavailable on Mobile.
- Onboarding state should stay in approved stores/services, not in modal-only components.
