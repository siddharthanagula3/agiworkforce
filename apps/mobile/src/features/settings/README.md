# apps/mobile/src/features/settings

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile settings domains, including mode status, capabilities, notifications, and personalization.

## Rules

- Keep settings screens and setting-specific domain folders here.
- Platform permission calls belong in `src/platform` or approved services.
- Mobile v1 settings must show Local Mode and local LLMs as active, Cloud Managed as waitlist/invite-only, and BYOK as unavailable on Mobile.
