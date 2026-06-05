# cloud-bridge — InviteCodeModal (mobile port)

Status: Current
Owner: Mobile surface lead
Related lock: `memory/locks/v1-cloud-bridge-strategy-2026-05-23.md`
Canonical reference: `apps/desktop/src/features/cloud-bridge/README.md`

## Purpose

Every cloud-only feature on mobile (Connectors, Cloud Sync, Web Search, Computer Use, etc.)
opens this modal when the user taps the locked surface. The local demo path stays usable,
and this modal is the single, consistent gate for Cloud Managed access.

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
Mobile public v1 keeps Cloud closed by default, but private beta testers can
unlock the auth/cloud surface with an invitation code before signing in or
creating an account.

**Waitlist tab** — preserves the existing mobile rank-in-line UX (email + country).
This is the consolidation of the former `CloudWaitlistSheet.tsx` content. Calls
`joinWaitlist({email, country})` and shows the rank-in-line confirmation.

## Error handling

Imports `InviteCodeError` typed union from `./types`. Uses a `friendlyInviteError(code)`
switch identical in shape to desktop, with mobile-friendly short copy.

## Theme tokens used (via `useThemeColors()`)

Background / foreground / surface / border / accent / state colors — all sourced from
`@agiworkforce/design-tokens` native palette. **No hardcoded color literals** except a
backdrop scrim using `rgba(0,0,0,0.55)` which mirrors the pre-existing pattern in
`EnvironmentOptionsSheet.tsx`. A `scrim` token addition is tracked as a follow-up.

## Callers (3 sites, migrated in Stage 0d)

- `app/(app)/chat/[id].tsx` — Cloud sync prompt
- `src/features/chat/components/AddToChatSheet.tsx` — Connectors gate
- `src/features/code-sessions/components/EnvironmentOptionsSheet.tsx` — Code mode gate

The former `CloudWaitlistSheet.tsx` remains as a thin re-export for Detox E2E spec
compatibility — will be removed once the Detox suite is migrated in a follow-up.

## v1 lock compliance

- No direct provider-key input fields are visible on Mobile
- Brand string is "AGI" everywhere (per `brand-agi-2026-05-15`)
- No direct mobile database/auth platform client is used
- Cloud surfaces opened by this modal are gated behind invite-code redemption
