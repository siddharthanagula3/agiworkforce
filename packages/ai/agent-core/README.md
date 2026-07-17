# @agiworkforce/agent-core

Status: Current
Owner role: Runtime platform
Last updated: 2026-07-17
Kind: TypeScript package
Criticality: high

## Purpose

Own the host-neutral TypeScript half of AGI's shared agent engine: context usage,
usage-anchored token accounting, and compaction planning/reduction. TypeScript
surfaces depend on this package instead of reimplementing those mechanics.

## Consumers

Mobile and VS Code currently consume the package; Web, Desktop frontend, and
Chrome are migration targets. Provider calls, persistence, and trust-boundary
policy remain in each privileged host adapter.

## Public API / Exports

`src/index.ts`.

## What Belongs Here

- Pure context budgeting and reducer mechanics.
- Provider-usage anchors and deterministic fallback token estimates.
- Host callback contracts for summarization.

## What Does Not Belong Here

- Provider credentials or network calls.
- Filesystem, SQLite, Neon, MMKV, or VS Code storage.
- Local/BYOK/Managed routing decisions.
- UI state.

## Commands

- `pnpm --filter @agiworkforce/agent-core test`
- `pnpm --filter @agiworkforce/agent-core typecheck`
- `pnpm --filter @agiworkforce/agent-core lint`

## Security, Privacy, Data Boundaries

Summarization and embedding are injected callbacks. Callers must choose a host
that matches the active trust mode. Historical content is always labeled as
untrusted data at the compaction boundary.

## CODEOWNERS

Primary: Runtime platform. Secondary: Web, Mobile, and extension owners.
