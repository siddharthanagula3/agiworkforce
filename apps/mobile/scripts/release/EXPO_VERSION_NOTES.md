# Expo SDK 55 — accepted version exceptions

## React 19.2.6 (Expo expects 19.2.0)

We pin React 19.2.6 across the monorepo via root `package.json` →
`pnpm.overrides`. This is a workspace-wide decision driven by
desktop + web + current Next.js needs; the mobile surface inherits it.

Running `npx expo install --check` will warn:

    react@19.2.6 - expected version: 19.2.0

This warning is **accepted**. Do NOT downgrade React in mobile to
19.2.0 — that would force a fork against the rest of the workspace
and likely break shared packages like `@agiworkforce/runtime`,
`@agiworkforce/types`, and the React 19 transition the desktop is on.

Re-evaluate this exception when:

1. Expo SDK 56 lands and either matches React 19.2.6 or moves React
   forward.
2. The desktop/web workspace bumps React to a version Expo SDK 55+
   accepts.

Owner: TL.
Last verified: 2026-05-18.
