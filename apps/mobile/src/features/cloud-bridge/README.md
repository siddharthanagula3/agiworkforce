# cloud-bridge — InviteCodeModal (mobile port)

Status: Residual — no production UI consumer
Owner: Mobile surface lead
Related lock: `memory/locks/v1-cloud-bridge-strategy-2026-05-23.md`
Canonical reference: `apps/desktop/src/features/cloud-bridge/README.md`

## Purpose

Historically, cloud-only mobile features opened this modal. Managed Cloud chat has
since become public alpha and sends signed-out users directly to Clerk sign-in.
After the unshipped Code Sessions and Skills shells were removed on 2026-07-30,
`InviteCodeModal` has no production UI consumer. It remains only as explicitly
tracked cleanup debt in `MOB-CLOUD-INVITE-RESIDUAL-01`; do not reconnect it as a
Cloud-chat access gate.

This is the **mobile port** of the canonical desktop modal. The contract is identical;
the implementation uses React Native primitives + NativeWind theme tokens.

## Props contract

Identical to the canonical desktop contract — see `apps/desktop/src/features/cloud-bridge/types.ts`
for the authoritative type definitions. Mirrored locally in `./types.ts` for mobile imports.

```typescript
interface InviteCodeModalProps {
  open: boolean;
  onClose: () => void;
  source: InviteCodeSource;
  defaultTab?: InviteCodeTab; // 'invite' | 'waitlist'
  onRedeemed?: (inviteId: string) => void;
  onWaitlisted?: (email: string) => void;
}
```

## Two tabs

**Invite tab** — calls `redeemInviteCode(code, source)` from `features/waitlist/service.ts`.
This path contains backward-compatibility behavior for the legacy alpha code but
has no production caller. It is not required for Cloud-chat access.

**Waitlist tab** — preserves the existing mobile rank-in-line UX (email + country).
This is the consolidation of the former `CloudWaitlistSheet.tsx` content. Calls
`joinWaitlist({email, country})` and shows the rank-in-line confirmation.

## Error handling

Imports `InviteCodeError` typed union from `./types`. Uses a `friendlyInviteError(code)`
switch identical in shape to desktop, with mobile-friendly short copy.

## Theme tokens used (via `useThemeColors()`)

Background / foreground / surface / border / accent / state colors — all sourced from
`@agiworkforce/design-tokens` native palette.

## Callers

Re-verified 2026-07-30: zero production callers. Direct references outside this
feature are test-only. `CloudWaitlistSheet.tsx` is also a separate legacy
implementation rather than a thin re-export; both UI implementations and their
orphaned submission service should be removed together in the tracked follow-up.

## v1 lock compliance

- No direct provider-key input fields are visible on Mobile
- Brand string is "AGI" everywhere (per `brand-agi-2026-05-15`)
- No direct mobile database/auth platform client is used
- Managed Cloud chat must remain Clerk-sign-in gated, never invite gated
