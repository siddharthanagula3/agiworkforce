# @agiworkforce/types

Status: Current
Owner role: Platform lead
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

`@agiworkforce/types` is the shared TypeScript contract package for AGI Workforce. It owns cross-surface schemas for providers, models, chat, artifacts, memory, billing catalogs, dispatch, MCP, tools, users, runtime events, and other product/platform data shapes.

## Consumers

- Web, Desktop, Mobile, Chrome extension, VS Code extension, services, and shared packages.
- Provider packages and runtime packages.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`
- `./models.json` -> `./src/models.json`

Do not deep-import from individual `src/*` files unless an existing consumer already does so and the contract is being migrated. Prefer exports through `src/index.ts`.

## What Belongs Here

- Stable cross-surface TypeScript types and Zod-compatible schemas.
- Provider/model/catalog contracts.
- Privacy, artifact, generated-file, memory, project, billing, and runtime event contracts.
- Tests for catalog and schema invariants.

## What Does Not Belong Here

- UI components.
- Runtime side effects.
- Network calls.
- Provider SDK clients.
- App-specific types that only one surface uses.

## Key Files

- `src/index.ts` - public export surface.
- `src/provider*.ts`, `src/model*.ts` - provider/model contracts.
- `src/artifacts.ts`, `src/runtime.ts`, `src/tool-events.ts` - runtime and artifact contracts.
- `src/billing-catalog.ts` - billing catalog source of truth.
- `src/__tests__/` - catalog/schema tests.

## Commands

- `pnpm --filter @agiworkforce/types typecheck`
- `pnpm --filter @agiworkforce/types test`
- `pnpm --filter @agiworkforce/types build`

## Environment / Secrets

No secrets belong in this package.

## Security, Privacy, Data Boundaries

Security/privacy review is required for changes to privacy modes, provider modes, artifact/generated-file schemas, billing/usage contracts, auth/user fields, retention/deletion fields, and anything that affects what data can leave Local mode.

## Tests Required For Changes

- Schema or catalog change: add/update unit tests in `src/__tests__/`.
- Breaking contract change: update all consumers or provide compatibility fields.
- Privacy/billing/provider changes: run affected surface checks.

## Release / Deployment Notes

Types are consumed directly from source in the workspace. Treat exported fields as cross-surface API.

## Known Caveats

Some consumers may still deep-import historical paths. Prefer migration to `src/index.ts` exports.

## CODEOWNERS

Primary: Platform lead.
Secondary: affected surface owner for schema changes; security/privacy for privacy, auth, billing, provider, artifact, and generated-file contracts.
