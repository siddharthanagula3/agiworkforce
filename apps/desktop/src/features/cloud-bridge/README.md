# cloud-bridge — InviteCodeModal canonical

Status: Current
Owner: Desktop surface lead
Related lock: `memory/locks/v1-cloud-bridge-strategy-2026-05-23.md`

## Purpose

Every cloud-only feature in v1 must open this modal when the user taps the locked surface. v1
ships local-only; this modal is the single, consistent gate for cloud access.

## Props contract (canonical for all cross-surface ports)

```typescript
import type { InviteCodeModalProps, InviteCodeSource, InviteCodeTab } from './types';

interface InviteCodeModalProps {
  open: boolean;
  onClose: () => void;
  source: InviteCodeSource; // see types.ts for full union
  defaultTab?: InviteCodeTab; // 'invite' | 'waitlist'; default 'invite'
  onRedeemed?: (inviteId: string) => void;
  onWaitlisted?: (email: string) => void;
}
```

## Two-tab structure

**Tab 1: "Enter invitation code"** (default tab)

- Auto-uppercase input; min 6 chars before enabling submit.
- Calls `waitlistService.validateInviteCode(code)` (1-arg; existing service).
- On success: shows "Cloud unlocked!" confirmation + calls `onRedeemed(invite.id)` + closes after 1.5 s.
- Error copy mapped in `friendlyInviteError()` by pattern-matching prose strings returned by the
  service (typed error codes are a server-side backlog item — see
  `docs/audit/2026-05-23-r27-v1-backlog.md §2.1`).
- "Don't have a code?" link switches to Tab 2.

**Tab 2: "Join waitlist"**

- Email (required, validated by regex) + name (optional).
- Calls `waitlistService.joinWaitlist({ email, name, referralSource: source })`.
  NOTE: the desktop service method is `joinWaitlist`, NOT `addToWaitlist`. Ports to surfaces that
  have their own waitlist service should verify the local method name.
- On success: shows "You're on the list!" + calls `onWaitlisted(email)` + closes after 2 s.

## Modal copy (verbatim — do not localise in ports without team-lead sign-off)

Title: `Cloud features`

Description: `Cloud features are gated for v1. Join the waitlist, or enter your invitation code
below to unlock cloud routing. AGI will route your requests through one of: BYOK (your provider
key), Groq (free tier, US-routed), OpenRouter, or DeepSeek (with explicit data-residency
disclosure).`

Brand string: always `AGI` (not "AGI Workforce"). Per LC-03.

## i18n note

Copy is English-only for v1 (consistent with `CloudWaitlistSheet.tsx` on mobile). Hindi and other
locales deferred to v1.1. If the surface already has an i18n system, add keys for the strings
above — but do not block the port on translation.

## Styling constraints (all ports must respect)

- No hardcoded color literals (hex / rgb / hsl / named CSS colors). Use design tokens / theme
  variables only.
- Desktop tokens used in this implementation:
  - `bg-background`, `text-foreground`, `text-muted-foreground` (semantic, light/dark via CSS vars)
  - `border-border`, `bg-muted`, `bg-agent-success` (from `@theme` in `globals.css`)
  - `text-destructive` (error text)
  - `text-primary-foreground` (icon color on success badge)
  - Tailwind utility classes: `ring-ring`, `ring-offset-background`, `ring-offset-2`
- Each surface has its own token system:
  - Mobile: `useThemeColors()` palette keys (`colors.agentSuccess`, `colors.textPrimary`, etc.)
  - Web: same Tailwind token set as desktop (shared `packages/design-tokens`)
  - Chrome ext: Chrome extension theme API / CSS variables
  - VS Code ext: webview CSS variables or VS Code theme tokens

## Dependency on waitlistService

The modal calls two methods on the singleton `waitlistService`:

```typescript
waitlistService.validateInviteCode(code: string): Promise<{
  valid: boolean;
  invite?: BetaInvite;
  error?: string;
}>

waitlistService.joinWaitlist(entry: WaitlistEntry): Promise<{
  success: boolean;
  error?: string;
}>
```

**Known gap:** `beta_invites` and `beta_redemptions` tables are not yet created in Supabase.
Every call to `validateInviteCode` will return `{ valid: false, error: '...' }` until the
migration in `docs/audit/2026-05-23-r27-v1-backlog.md §2.7` is applied.

## How to open the modal from any cloud-gated entry point

```tsx
import { useState } from 'react';
import { InviteCodeModal } from '@/features/cloud-bridge';

function MyCloudFeatureButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open cloud feature (locked)</button>
      <InviteCodeModal
        open={open}
        onClose={() => setOpen(false)}
        source="connectors" // use the matching source literal
        defaultTab="invite"
        onRedeemed={(id) => console.log('redeemed', id)}
        onWaitlisted={(email) => console.log('waitlisted', email)}
      />
    </>
  );
}
```

## Cross-surface port guide

| Surface    | Recommended base                                                         | Notes                                                                                 |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| mobile     | `apps/mobile/src/features/waitlist/InviteCodeModal.tsx`                  | Port from desktop; `CloudWaitlistSheet` becomes Tab 2 content; use `useThemeColors()` |
| web        | `apps/web/src/components/cloud-bridge/InviteCodeModal.tsx`               | Same Radix + Tailwind stack; token names identical                                    |
| chrome-ext | `apps/extension/src/features/side-panel/invite-code-modal.ts`            | Vanilla TS + DOM; render via shadow DOM or iframe                                     |
| vscode-ext | `apps/extension-vscode/src/features/cloud-bridge/InviteCodeModalView.ts` | QuickPick stub or webview panel                                                       |
