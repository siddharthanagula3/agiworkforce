# Dead-Code Detection (knip)

Status: Current
Owner: Platform lead
Last updated: 2026-08-07

Dead-export and dead-file detection for the TypeScript workspaces.

`knip` has been a devDependency since the repo restructure, and `PLAN.md` item 2
assumed a sweep that never ran, because no config and no script existed. The
2026-08-05 checklist audit then found ~26 unwired modules **by hand** — exactly
the class this finds mechanically.

Rust reachability is covered separately by
`scripts/check-module-reachability.mjs`; this config deliberately does not
duplicate it.

```
pnpm check:knip              # unused files, exports, and dependencies
pnpm check:knip:production   # production-only graph (ignores test entry points)
```

## Status: discovery tool, NOT a blocking gate

This is deliberately **not** wired into CI yet, and `check:knip` is not part of
any aggregate check.

First run against this config (2026-08-06):

| Category              | Count |
| --------------------- | ----: |
| Unused files          |   760 |
| Unused exports        |   739 |
| Unused exported types |   253 |
| Duplicate exports     |   106 |
| Unused dependencies   |    84 |
| Unlisted dependencies |    92 |

Those numbers are **not** 760 dead files. They are a starting signal that still
needs config tuning before it can be trusted as a gate — the entry-point globs
above do not yet model every way this repo reaches a module (React `lazy()`
dynamic imports, Next.js route co-location, adapter-driven settings panels, and
the shared-package re-export chains all produce false positives).

Turning this into a real gate is its own piece of work, in this order:

1. Tune `entry` per workspace until the false-positive rate is low enough that a
   maintainer believes the output. Compare against known-good modules first.
2. Freeze the surviving findings into a baseline that only ratchets down, the
   same shape `scripts/config/reference-integrity-allowlist.json` already uses:
   entries that stop reproducing fail as stale, so fixing one forces its
   baseline line out in the same commit.
3. Only then add it to CI.

Do not add `check:knip` to a required CI step before step 2. A gate that fails
with hundreds of untriaged findings gets skipped, and a skipped gate is worse
than no gate — it looks like coverage that is not there.
