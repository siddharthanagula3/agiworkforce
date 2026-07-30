# apps/mobile/src/features/settings

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile settings domains, including mode status, capabilities, notifications, and personalization.

## Rules

- Keep settings screens and setting-specific domain folders here.
- Platform permission calls belong in `src/platform` or approved services.
- Mobile settings must show Local Mode and local LLMs as active. Cloud Managed account/subscription access is public alpha, open by default (sign-in gated, no invite/waitlist — see `MOB-CLOUD-INVITE-RESIDUAL-01`). Plugins remain genuinely unshipped. Connectors and the read-only Skills catalog have supported, separately gated Cloud contracts; none of these capabilities should be presented as broad cloud-access waitlisting.
