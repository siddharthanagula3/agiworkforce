# apps/mobile/src/features/settings

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile settings domains, including mode status, capabilities, notifications, and personalization.

## Rules

- Keep settings screens and setting-specific domain folders here.
- Platform permission calls belong in `src/platform` or approved services.
- Mobile settings must show Local Mode and local LLMs as active. Cloud Managed account/subscription access is public alpha, open by default (sign-in gated, no invite/waitlist — see `MOB-CLOUD-INVITE-RESIDUAL-01`). Connectors, plugins, and skills are separate, genuinely-unshipped features still gated behind their own feature flags with honest coming-soon copy, not cloud-access waitlisting.
