# MiniMax Tool Assets

Status: Current
Owner role: Platform lead + docs/tooling owner
Last updated: 2026-05-21
Kind: tool assets

## Purpose

`.minimax/` contains tracked document-generation helper assets used by local tool workflows. These files are not product runtime code and should not be imported by AGI Workforce apps or services.

## Tracked Policy

- Treat binaries and generated validators as third-party/tool assets.
- Review license and redistribution terms before using this folder in public releases.
- Keep new durable document-generation product code under an owned app, service, package, or crate instead.

## Verification

- `pnpm check:repo-organization`
- License/security review before distribution.
