# @agiworkforce/compliance

Status: Current
Owner role: Security/privacy owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared compliance logic and policy helpers for privacy, audit, and regulatory-facing product behavior.

## Consumers

Web, services, and shared packages that need compliance-oriented checks or metadata.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Compliance helpers.
- Policy metadata.
- Shared privacy/audit validation logic.

## What Does Not Belong Here

- Legal advice prose as source of truth.
- Billing ledger implementation.
- UI-only disclosure components.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/compliance typecheck`
- `pnpm --filter @agiworkforce/compliance test`
- `pnpm --filter @agiworkforce/compliance build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for retention, deletion, consent, audit logs, policy labels, provider retention flags, and any compliance claim surfaced to users.

## Tests Required For Changes

Run tests and add cases for new policy branches or data classification behavior.

## Release / Deployment Notes

Compliance behavior should be reflected in docs/legal or product copy when user-visible.

## Known Caveats

Final legal documents still need legal review outside this package.

## CODEOWNERS

Primary: Security/privacy owner. Secondary: backend/data for audit and retention behavior.
