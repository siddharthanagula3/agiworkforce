# @agiworkforce/skills

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: medium

## Purpose

Shared skill manifest and skill-loading helpers for AGI Workforce customization flows.

## Consumers

Desktop, Web, CLI-adjacent flows, services, and future marketplace/customization surfaces.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- Skill definitions, parsing, validation, and surface-neutral helpers.

## What Does Not Belong Here

- Skill marketplace UI.
- Provider calls.
- Secret storage.
- App-specific install flows.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/skills typecheck`
- `pnpm --filter @agiworkforce/skills test`
- `pnpm --filter @agiworkforce/skills build`

## Environment / Secrets

Do not commit private skills, user prompts, credentials, or imported local user content.

## Security, Privacy, Data Boundaries

Security/privacy review is required for skill execution, prompt injection boundaries, tool permissions, imported Claude skills, and marketplace install behavior.

## Tests Required For Changes

Add tests for manifest parsing, invalid skills, permission behavior, and migration/import paths.

## Release / Deployment Notes

Skill changes affect customization and agent behavior. Keep compatibility with imported skill formats explicit.

## Known Caveats

Claude skill migration exists, but full management UI remains open work.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: surface owner for install/management UI.
