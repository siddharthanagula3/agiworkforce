# @agiworkforce/unified-chat

Status: Current
Owner role: Frontend platform
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

`@agiworkforce/unified-chat` owns reusable chat UI, chat stores, artifact UI, composer behavior, model selector UI, command palette pieces, and shared frontend chat primitives used across AGI Workforce surfaces.

## Consumers

- Desktop, Web, Mobile-adjacent shared UI, Chrome extension, and VS Code extension where compatible.
- Product surfaces that need consistent chat, artifact, model, budget, and tool-call UX.

## Public API / Exports

`package.json#exports`:

- `.` -> `./src/index.ts`

Prefer imports from the package root. Avoid deep imports from `src/components`, `src/stores`, or `src/lib` unless the export surface is being expanded intentionally.

## What Belongs Here

- Surface-neutral React chat components.
- Shared chat stores and hooks.
- Artifact, tool-call, composer, model, usage, and command UI primitives.
- UI-level host bridge abstractions that remain surface-neutral.

## What Does Not Belong Here

- App routing, billing pages, account pages, or settings pages that only one app uses.
- Provider SDK clients.
- Server-only logic.
- Tauri, Next.js, Chrome, or VS Code APIs unless hidden behind host bridge contracts.

## Key Files

- `src/index.ts` - public export surface.
- `src/components/` - reusable chat UI components.
- `src/stores/` - Zustand stores for chat-related state.
- `src/hooks/` - reusable chat hooks.
- `src/lib/` - UI helpers and host bridge contracts.

## Commands

- `pnpm --filter @agiworkforce/unified-chat typecheck`
- `pnpm --filter @agiworkforce/unified-chat test`
- `pnpm --filter @agiworkforce/unified-chat lint`

## Environment / Secrets

No secrets belong in this package. Do not read provider keys or user files directly.

## Security, Privacy, Data Boundaries

Security/privacy review is required for file attachments, artifact rendering, generated-file previews, provider labels, Local/BYOK/Managed indicators, host bridge payloads, tool-call display, and anything that could hide where data is sent.

## Tests Required For Changes

- Component/store change: add/update unit tests where behavior changes.
- Accessibility-sensitive change: verify keyboard/focus/labels.
- Privacy label or attachment change: add tests or manual verification evidence.

## Release / Deployment Notes

This package affects multiple surfaces. Verify at least one consuming surface when changing exported UI contracts.

## Known Caveats

Some components may still reflect desktop-first assumptions. Do not add surface-specific behavior without a host bridge or prop boundary.

## CODEOWNERS

Primary: Frontend platform.
Secondary: Web/Desktop/Mobile owners for behavior changes; security/privacy for attachments, artifacts, provider labels, and host bridge payloads.
