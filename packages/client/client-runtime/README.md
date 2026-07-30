# @agiworkforce/client-runtime

Status: Current
Owner role: Platform lead
Last updated: 2026-05-21
Kind: ts-package
Criticality: high

## Purpose

`@agiworkforce/client-runtime` owns shared TypeScript runtime primitives that can be used across AGI Workforce surfaces without importing app code.

## Consumers

- Web, Desktop, Mobile, Chrome extension, shared UI packages, and services where runtime helpers are appropriate.
- Future agent/session orchestration adapters when they are TypeScript-side and surface-neutral.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`
- `./node` -> `./src/node.ts`
- `./state` -> `./src/state/index.ts`
- `./queue` -> `./src/queue/index.ts`

Do not deep-import implementation files. Add an explicit `package.json#exports`
entry before introducing a new public subpath.

## What Belongs Here

- Shared command/runtime helpers.
- Surface-neutral state/event/queue primitives.
- Runtime detection helpers.
- Node-specific runtime helpers under the explicit `./node` export.

## What Does Not Belong Here

- UI components.
- App-specific bridge code.
- Provider SDK adapters.
- Desktop-only Tauri command implementations.
- Web-only API route code.

## Key Files

- `src/index.ts` - public browser-safe exports.
- `src/node.ts` - Node-specific export.
- `src/events.ts`, `src/command.ts`, `src/registry.ts` - runtime primitives.
- `src/agentActivity.ts` - portable canonical agent-event projection and local terminal handling.
- `src/state/` - shared state helpers.
- `src/queue/` - shared queue helpers.

## Commands

- `pnpm --filter @agiworkforce/client-runtime typecheck`
- `pnpm --filter @agiworkforce/client-runtime test`
- `pnpm --filter @agiworkforce/client-runtime build`

## Environment / Secrets

No secrets belong in this package. Node-only code must stay behind the `./node` export.

## Security, Privacy, Data Boundaries

Security/privacy review is required for file, network, command execution, queue persistence, event logging, or model/provider-routing behavior.

## Tests Required For Changes

- Runtime primitive change: add/update unit tests.
- Export change: update consumer imports and README.
- Node/browser boundary change: verify browser consumers do not pull Node-only code.

## Release / Deployment Notes

This package is source-consumed in the workspace. Keep public exports stable and avoid hidden app dependencies.

## Known Caveats

Runtime should not become a generic dumping ground. Move code here only when at least two consumers need it.

## CODEOWNERS

Primary: Platform lead.
Secondary: security/privacy for file, network, command, persistence, provider-routing, or privacy-boundary changes.
