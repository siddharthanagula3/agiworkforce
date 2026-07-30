# apps/mobile/src/features/waitlist

Status: Compatibility residual
Owner role: Mobile lead
Last updated: 2026-07-30
Purpose: Historical waitlist UI/service plus the compatibility store currently
used as a signed-in Cloud-entitlement mirror.

## Rules

- Import waitlist code through `@/src/features/waitlist`.
- Do not recreate retired waitlist paths under `components/`, `services/`, or `stores/`.
- Managed Cloud chat is public alpha and Clerk-sign-in gated. Never present the
  waitlist or invite UI as its access gate.
- `CloudWaitlistSheet.tsx` and the submission/redemption service have no
  production UI caller. Their removal, and migration away from the historically
  named compatibility store, is tracked by `MOB-CLOUD-INVITE-RESIDUAL-01`.
