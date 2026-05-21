# apps/mobile/src/features/onboarding

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile first-run disclosures, Local Mode onboarding, and disabled BYOK notice surfaces.

## Rules

- Import onboarding UI through `@/src/features/onboarding`.
- Mobile v1 stays Local Mode first. Cloud Managed is waitlist-only, and Mobile BYOK stays disabled until secure key storage ships.
- Onboarding state should stay in approved stores/services, not in modal-only components.
