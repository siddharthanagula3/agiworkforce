# Cloud Contracts Agent Rules

Status: Current
Owner: Platform lead
Last updated: 2026-07-16

Read root `AGENTS.md`, then this file, then `packages/contracts/cloud-contracts/README.md`.

## Scope

`packages/contracts/cloud-contracts` owns the canonical managed-cloud wire contracts
for AGI Workforce: Zod schemas, endpoint paths, stream deltas, and typed
clients shared by Web, Desktop, Mobile, and the transitional
`@agiworkforce/services` facade. Contracts only — no persistence, sync-apply
mechanics, artifact derivation, provider execution, auth, billing, or
product policy.

## Lane Contract

- Primary lane: `contracts-types`.
- Owned write path: `packages/contracts/cloud-contracts/**`.
- Production dependencies are limited to `@agiworkforce/types` and `zod`; do
  not add dependencies on applications, `@agiworkforce/services`, or
  `packages/contracts/licensing`.

## High-Risk Areas

- The top-level module list (`generated-files`, `library`, `managed-media`,
  `me`, `sync`, `managed-cloud-settings-client`, `projects`,
  `managed-cloud-projects-client`, `conversations`,
  `managed-cloud-chat-client`, `tool-events`, `tool-approval-resume`,
  `connectors`, `capability-handshake`) is guard-enforced: adding, removing,
  or renaming a module requires updating the hardcoded list in
  `scripts/check-cloud-contract-ownership.mjs` in the same change, or
  `pnpm check:cloud-contract-ownership` fails.
- `@agiworkforce/services` only re-exports this package for compatibility;
  new first-party consumers must import `@agiworkforce/cloud-contracts`
  directly, never through the facade.
- Managed cloud is public alpha and open by default (root `AGENTS.md`) —
  contracts here must not reintroduce a waitlist/private-beta gate.

## Verification

- `pnpm --filter @agiworkforce/cloud-contracts typecheck`
- `pnpm --filter @agiworkforce/cloud-contracts test`
- `pnpm --filter @agiworkforce/cloud-contracts lint`
- `pnpm check:cloud-contract-ownership`
