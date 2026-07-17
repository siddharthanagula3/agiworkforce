# cloud-bridge — InviteCodeModal (mobile port)

Status: Current
Owner: Mobile surface lead
Related lock: `memory/locks/v1-cloud-bridge-strategy-2026-05-23.md`
Canonical reference: `apps/desktop/src/features/cloud-bridge/README.md`

## Purpose

Historically, every cloud-only feature on mobile opened this modal when the user tapped the
locked surface. As of PA-2 (founder decision 2026-06-27), the primary Cloud-chat access gate
no longer uses this modal — Cloud is public alpha, open by default, and a signed-out user
tapping Cloud in the chat header routes straight to sign-in
(`apps/mobile/app/(app)/chat/[id].tsx` `handleTapCloudMode`). This modal remains live only for
the genuinely-unshipped feature surfaces (Connectors, Skills, hosted Code environments,
cloud-connectors OAuth, shared-links) that gate on their own feature flags independent of
cloud-chat access — see `MOB-CLOUD-INVITE-RESIDUAL-01` in `docs/agent-context/known-flaws.md`
for the full residual scope and the PA-5 follow-up to retire this modal from any remaining
cloud-chat-adjacent path.

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
This path is retained for backward-compat (legacy `ALPHATESTER` code) but is no longer
required for Cloud-chat access, which is public alpha and sign-in gated. For the
still-unshipped feature surfaces that call this modal (see Callers below), the invite tab
lets early testers unlock that specific feature ahead of its general release.

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

## Callers

Re-verified 2026-07-11: `app/(app)/chat/[id].tsx` and `AddToChatSheet.tsx` no longer import
this modal — their Cloud-access gating now routes directly to sign-in. Confirmed current
callers: `src/features/code-sessions/components/EnvironmentOptionsSheet.tsx` (Code mode gate),
`app/(app)/settings/shared-links.tsx`, and `app/(app)/skills/index.tsx` — all gated on their
own unshipped-feature flags per `MOB-CLOUD-INVITE-RESIDUAL-01`, not on cloud-chat access.

The former `CloudWaitlistSheet.tsx` remains as a thin re-export for Detox E2E spec
compatibility — will be removed once the Detox suite is migrated in a follow-up.

## v1 lock compliance

- No direct provider-key input fields are visible on Mobile
- Brand string is "AGI" everywhere (per `brand-agi-2026-05-15`)
- No direct mobile database/auth platform client is used
- Cloud surfaces opened by this modal are gated behind invite-code redemption
