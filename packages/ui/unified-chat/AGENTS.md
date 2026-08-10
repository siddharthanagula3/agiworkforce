# Unified Chat Agent Rules

Status: Current
Owner: Frontend platform
Last updated: 2026-07-16

Read root `AGENTS.md`, then this file, then this file.

## Scope

`packages/ui/unified-chat` owns reusable, surface-neutral chat UI: chat
components, chat/artifact/composer/model-selector/command-palette stores and
hooks, shared across Desktop, Web, Mobile-adjacent UI, Chrome, and VS Code.

## Lane Contract

- Primary lane: `chat-artifacts`.
- Owned write path: `packages/ui/unified-chat/**`.
- Shared contracts (`packages/contracts/types`, `packages/contracts/cloud-contracts`), app
  routing/billing/account pages, and provider SDK clients are out of lane.

## High-Risk Areas

- Surface neutrality: no Tauri, Next.js, Chrome, or VS Code APIs except
  behind an explicit host-bridge contract — this package ships into six
  different app shells.
- File attachments, artifact rendering, generated-file previews, and
  Local/BYOK/Managed provider-label display must never obscure where data is
  sent (capability-honesty rule, root `AGENTS.md`).
- Deep imports from `src/components`, `src/stores`, `src/lib` bypass the
  intended export surface (`package.json#exports` -> `src/index.ts`); avoid
  unless the export surface is being expanded intentionally.

## Verification

- `pnpm --filter @agiworkforce/unified-chat typecheck`
- `pnpm --filter @agiworkforce/unified-chat test`
- `pnpm --filter @agiworkforce/unified-chat lint`
- Cross-surface UI contract changes: verify at least one consuming surface
  (Desktop, Web, or Mobile-adjacent) still renders correctly.
