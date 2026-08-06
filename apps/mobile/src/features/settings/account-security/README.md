# apps/mobile/src/features/settings/account-security

Status: Current
Owner role: Mobile lead
Last updated: 2026-08-05
Purpose: Account-owned security status, account session/device listing and revocation, device-lock navigation, and bounded Web handoffs.

## Rules

- Treat `GET /api/settings/2fa` as the only authoritative Mobile account-factor status.
- Treat `GET /api/settings/sessions` as the only authoritative device list, and
  `DELETE /api/settings/sessions/{sessionId}` as the only revocation path. Render
  `currentSessionKnown: false` as "we could not match this device", never as a missing row.
- Keep every fetch bound to the current Clerk account epoch and AGI Cloud egress mode.
- Do not infer passkeys, SMS factors, other devices, or cross-device revocation from the current
  Clerk session. A server read that returns real device rows is not an inference; deriving device
  state from the locally held session is.
- Add editable controls only after their account contract, verification ceremony, recovery path,
  and revocation behavior are implemented and tested end to end.
