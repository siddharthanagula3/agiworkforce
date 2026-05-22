# Phase 8 prototype — `no-cross-layer-import`

Draft custom ESLint rule that enforces the canonical layer-map from
`apps/<surface>/src/README.md`. **Not wired into `eslint.config.mjs`.**
Founder reviews before Phase 8 enables anything.

## Files

| Path                       | Purpose                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-cross-layer-import.js` | The rule and a flat-config-compatible plugin wrapper. Plain JS so it works under Node without a build step.                                                         |
| `test-runner.js`           | Standalone smoke harness using `RuleTester` from `eslint` v9. Run with `node reference-index/phase8-eslint-prototype/test-runner.js`. Verified all 9 fixtures pass. |
| `test-cases/valid/`        | Files that import across layers in legal ways.                                                                                                                      |
| `test-cases/invalid/`      | Files that violate one of the five canonical rules. Each fixture has an `Expected diagnostic:` comment at the bottom.                                               |

## Layer-map (canonical, from mobile pilot)

| Layer                       | Owns                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `entry/`                    | Bootstrap, route wrappers, app-level providers. Wires features into routes. |
| `core/`                     | State orchestration, flows shared across screens.                           |
| `features/`                 | Self-contained feature folders (chat, onboarding, billing, …).              |
| `platform/`                 | Native adapters: health, permissions, intent bridges, push.                 |
| `integrations/`             | The only place network/IO/SDK calls happen.                                 |
| `data/` (alias: `storage/`) | Data boundary. Reads/writes through here.                                   |
| `ui/`                       | Reusable presentation primitives. No business logic.                        |

The rule recognises `storage/` as an alias of `data/` — both classify to
the same bucket — so the rule survives the rename without a flag-day.

## Legality matrix

The rule classifies BOTH the importing file and the imported module by
matching their paths against `apps/<surface>/src/<layer>/` or the
`@/src/<layer>/` alias. The pair is then looked up in this matrix:

| from \ to        | entry | core | features | platform | integrations | data | ui  |
| ---------------- | ----- | ---- | -------- | -------- | ------------ | ---- | --- |
| **entry**        | OK    | OK   | NO       | OK       | OK           | OK   | OK  |
| **core**         | NO    | OK   | NO       | OK       | OK           | OK   | NO  |
| **features**     | NO    | OK   | NO\*     | OK       | OK           | OK   | OK  |
| **platform**     | NO    | OK   | NO       | OK       | OK           | OK   | NO  |
| **integrations** | NO    | OK   | NO       | OK       | OK           | OK   | NO  |
| **data**         | NO    | NO   | NO       | NO       | NO           | OK   | NO  |
| **ui**           | NO    | NO   | NO       | NO       | NO           | NO   | OK  |

(\*) `features → features` is allowed only for the **same** feature
(internal modules). A different-feature import is blocked unless the pair
appears in the rule's `allowFeaturePairs` option.

The two leaf layers (`data` and `ui`) can only depend on themselves.
That's the strongest invariant in the system, and it lets the data layer
be tested in isolation and the UI layer be reused across surfaces without
dragging app-specific logic with it.

## Detected violations

1. **Cross-layer import** — any import whose `(from, to)` cell is `NO`
   in the matrix. Diagnostic: `crossLayer` with a per-pair rationale
   string.
2. **Sibling-feature import** — `features/X` importing from `features/Y`
   when `X !== Y`. Diagnostic: `siblingFeature`.
3. **UI transit through a feature** — a `features/*` file that imports
   a UI primitive and then re-exports it from the feature's barrel
   (named re-export, `export ... from`, or `export * from`). Diagnostic:
   `uiTransit`.

`no-restricted-imports` can express "from anywhere, never import X" but
cannot express "from features/X, never import features/Y", because the
legality depends on the importing file's path. That's why the rule has
to be a custom AST visitor.

## Why a custom rule, not `eslint-plugin-boundaries`?

`eslint-plugin-boundaries` v5 supports flat config and could express most
of the matrix using its `boundaries/element-types` rule with patterns
keyed off `apps/*/src/<layer>`. It is the obvious upgrade once Phase 8
exits the prototype stage.

Reasons to start with a hand-rolled rule first:

- **Zero install surface.** The prototype is one JS file; reviewing it
  doesn't require pulling a new dependency into `pnpm-lock.yaml`.
- **Project-specific diagnostics.** The rationale strings reference the
  mobile pilot README directly. A library rule would emit generic
  "boundaries violation" text.
- **The UI-transit check is bespoke.** `eslint-plugin-boundaries` can
  block imports but doesn't natively detect "imported then re-exported".
  The custom rule walks `ExportNamedDeclaration` / `ExportAllDeclaration`
  in the same pass.
- **Migration path is intact.** When we adopt `eslint-plugin-boundaries`
  for the cross-layer matrix, the UI-transit logic stays as a small
  custom rule alongside it.

## Configuration shape (planned, not yet enabled)

```js
// eslint.config.mjs — planned diff, do NOT apply yet
import agiLayers from './reference-index/phase8-eslint-prototype/no-cross-layer-import.js';

export default [
  // …existing config…
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    plugins: { 'agi-layers': agiLayers },
    rules: {
      'agi-layers/no-cross-layer-import': [
        'warn', // Phase 8a: warn-only soak for one week.
        {
          // Optional escape hatches for known cross-feature deps. Empty
          // by default; every entry needs a code comment justifying it.
          allowFeaturePairs: [
            // { from: 'chat', to: 'attachments' },
          ],
        },
      ],
    },
  },
];
```

After one warn-only week, flip `warn` → `error` and remove the soft
warnings emitted via `.eslint-import-boundaries.example.json`.

## Verifying the prototype locally

```bash
# From repo root
node reference-index/phase8-eslint-prototype/test-runner.js
```

Expected output:

```
[phase8 harness] OK — 9 cases verified (4 valid, 5 invalid)
```

## Known gaps

1. **Path-alias coverage is mobile-only.** The classifier matches
   `@/src/<layer>/…` (mobile's alias) and absolute `apps/<surface>/src/<layer>/…`
   paths. Per-surface aliases (`@desktop/`, `@web/`) need to be added as
   each surface ships its reorg.
2. **No autofix.** Cross-layer violations need design decisions, not
   mechanical rewrites. Leave autofix off.
3. **Type-only imports are treated like value imports.** This is
   intentional — a type from `features/Y` still creates a compile-time
   dependency on `features/Y` — but we may want to relax it later if
   it causes friction for shared `types/` modules. The relaxation
   would live in the rule, not in a new escape hatch.
4. **Barrel re-exports during migration.** Files at legacy paths
   (`apps/mobile/services/waitlist.ts`) currently `export * from
'@/src/features/waitlist/service'`. Because legacy paths are not
   under `apps/*/src/`, the classifier doesn't see them — they sail
   through. That's the correct behavior during Phases 3-7 and
   self-resolves when Phase 7 deletes the legacy paths.
