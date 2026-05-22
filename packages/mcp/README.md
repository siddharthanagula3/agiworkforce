# @agiworkforce/mcp

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: ts-package
Criticality: high

## Purpose

Shared Model Context Protocol helpers and contracts for MCP server registration, prompts, tools, and connector behavior.

## Consumers

Desktop, CLI-adjacent flows, Web connector surfaces, services, and shared runtime/tooling packages.

## Public API / Exports

`package.json#exports`: `.` -> `./src/index.ts`.

## What Belongs Here

- MCP client/server helper code.
- MCP registry types and prompt/tool abstractions.
- Surface-neutral connector support.

## What Does Not Belong Here

- Desktop-specific install UI.
- Web account settings.
- Provider model adapters.
- Secrets or OAuth token stores.

## Key Files

- `src/index.ts` - public export surface.

## Commands

- `pnpm --filter @agiworkforce/mcp typecheck`
- `pnpm --filter @agiworkforce/mcp test`
- `pnpm --filter @agiworkforce/mcp build`

## Environment / Secrets

Do not commit MCP tokens, OAuth credentials, server secrets, or local user server configs.

## Security, Privacy, Data Boundaries

Security/privacy review is required for server launch, OAuth, tool permissions, prompt injection boundaries, file/network access, and connector install/uninstall behavior.

## Tests Required For Changes

Add tests for registry parsing, tool permission behavior, invalid configs, and prompt/tool discovery.

## Release / Deployment Notes

MCP changes affect trust. Release notes should call out tool permission or connector behavior changes.

## Known Caveats

MCP prompt slash-command parity is still tracked as open work.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: Desktop/Web/CLI owners for consuming surface behavior.
