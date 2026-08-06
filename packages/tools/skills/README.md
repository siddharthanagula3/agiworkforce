# @agiworkforce/skills

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-08-05
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
- `src/integrity.ts` - normative `agiskill-sha256-v1` specification.
- `reference-bundles/` - non-loadable upstream bundle examples (no `SKILL.md`).

## Skill Integrity (`agiskill-sha256-v1`)

Every loaded skill carries `contentHash`, and packaged skills also carry
`treeHash`, so a caller can detect that a skill changed between two `skill`
tool calls. An optional frontmatter `version` is surfaced alongside them; a
`SKILL.md` without one still loads.

- **Content hash** — `sha256:<hex>` over the raw bytes of the skill markdown
  file as read from disk.
- **Tree hash** — `sha256-tree-v1:<hex>` over the whole package directory:
  walk recursively, skip any entry whose basename starts with `.` and any
  symlink, join relative paths with `/`, sort by UTF-8 byte order, then feed a
  SHA-256 accumulator `<relPath>` + `0x00` + `<hex sha256 of file bytes>` +
  `\n` per member. `SKILL.md` is included, so the tree hash alone detects any
  change inside the package.

`src/integrity.ts` is normative. The algorithm is reimplemented in
`apps/cli/src/skills.rs` and `scripts/verify-skills-lock.mjs`; all three assert
the same known-answer vector, so a divergence fails a test instead of producing
two disagreeing "integrity" values.

`skills-lock.json` records the tree hash of every skill vendored under its
declared roots. `node scripts/verify-skills-lock.mjs` recomputes them and fails
on a mismatch, an unlocked skill, a stale entry, or a `SKILL.md` appearing in a
declared non-loadable reference tree; `--regenerate` rewrites it and
`--self-test` checks only the algorithm vector.

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
