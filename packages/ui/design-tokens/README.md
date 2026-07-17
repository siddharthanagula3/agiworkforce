# @agiworkforce/design-tokens

Status: Current
Owner role: Frontend platform
Last updated: 2026-05-20
Kind: ts-package
Criticality: medium

## Purpose

Shared design tokens and CSS exports for AGI Workforce surfaces.

## Consumers

Web, Desktop, Chrome extension, unified chat, and other frontend surfaces.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`
- `./chat.css` -> `./src/chat.css`

## What Belongs Here

- Brand colors, spacing, typography, semantic tokens, and shared CSS token files.

## What Does Not Belong Here

- Components.
- App-specific styles.
- Generated design screenshots.

## Key Files

- `src/index.ts` - TypeScript token export.
- `src/chat.css` - CSS token export.

## Commands

- `pnpm --filter @agiworkforce/design-tokens typecheck`
- `pnpm --filter @agiworkforce/design-tokens build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Review accessibility, contrast, focus states, and privacy/status label color semantics when tokens change.

## Tests Required For Changes

Run typecheck and verify affected surfaces visually when changing major tokens.

## Release / Deployment Notes

Token changes affect multiple surfaces; coordinate with frontend platform.

## Known Caveats

Do not use this as a component library.

## CODEOWNERS

Primary: Frontend platform. Secondary: Web/Desktop/Mobile owners for visible brand shifts.
