# apps/mobile/src/features/settings/account-security

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-30
Purpose: Account-owned security status, current Mobile session disclosure, device-lock navigation, and bounded Web handoffs.

## Rules

- Treat `GET /api/settings/2fa` as the only authoritative Mobile account-factor status.
- Keep every fetch bound to the current Clerk account epoch and AGI Cloud egress mode.
- Do not infer passkeys, SMS factors, other devices, or cross-device revocation from the current
  Clerk session.
- Add editable controls only after their account contract, verification ceremony, recovery path,
  and revocation behavior are implemented and tested end to end.
