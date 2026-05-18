# temp-barrel-catalog — Phase 8 follow-ups

Open issues discovered while running the Phase 8 informational gates against the Phase 3 (mobile pilot) branch state on 2026-05-18. Filed by the Phase 3 supervisor for the Phase 8 supervisor / founder to triage.

## Issue 1 — `check-no-temp-barrels.sh` false-positives Expo route wrappers

### Symptom

Running `reference-index/ci/check-no-temp-barrels.sh` against the Phase 3 mobile-pilot branch (`claude/reorg-mobile-pilot-2026-05-18` at `a1cedef5f`) reports **6 violations**:

```
VIOLATION: apps/mobile/app/(app)/feedback.tsx
VIOLATION: apps/mobile/app/(app)/compare.tsx
VIOLATION: apps/mobile/app/(app)/share-preview.tsx
VIOLATION: apps/mobile/app/(app)/settings/notifications.tsx
VIOLATION: apps/mobile/app/(app)/widget-setup.tsx
VIOLATION: apps/mobile/app/(app)/settings/capabilities.tsx
  reason:  zero consumers remain, but the legacy barrel is still on disk
  fix:     delete the legacy barrel and remove its catalog entry.
```

The script's "fix" is wrong for these specific entries. Deleting them would break the Expo router, not advance the migration.

### Root cause

The catalog's `consumers_still_using_old_path` field is computed by grepping `*.ts` / `*.tsx` files for `import ... from '<old-path>'` patterns. This is correct for plain TS module barrels (e.g. `apps/mobile/services/waitlist.ts`).

But Expo route files have a second class of consumer that grep cannot see: **routing-based consumers**. Examples in the current tree:

- `apps/mobile/app/_layout.tsx:85`  `<Drawer.Screen name="settings/personalization" />`
- `apps/mobile/app/(app)/(tabs)/settings.tsx:486`  `onPress: push('/(app)/settings/personalization')`
- `apps/mobile/app/_layout.tsx:435`  `router.push('/(app)/share-preview?text=...')`

These references invoke the route by **string path**, which Expo router resolves by **filename**, not by JS import. Grep emits zero matches for the import patterns the script checks, so the entry's `consumers_still_using_old_path: []` looks empty even though the route file is load-bearing.

**Expo route wrappers are permanent contract**, not transitional barrels. They must remain at `apps/mobile/app/<route>.tsx` (or sub-paths) for the router to bind the route. They re-export the implementation that lives in `apps/mobile/src/features/<feature>/index.tsx`, and that re-export *is* the renderable component for the route.

### Proposed fix

Add a `barrel_type` discrimination so the script can skip wrappers that have a permanent purpose.

**Schema change in `temp-barrel-catalog.json`** — extend the existing `barrel_type` field's allowed values:

```diff
- "barrel_type": "re-export" | "named-re-export" | "type-only-re-export"
+ "barrel_type":
+   | "re-export"            // transitional named/default re-export — delete in Phase 7
+   | "named-re-export"      // transitional, named exports only
+   | "type-only-re-export"  // transitional, type-only
+   | "expo-route-wrapper"   // PERMANENT — Expo router contract; do not delete
```

The wrapper-type entries continue to live in the catalog as an inventory of "where each route's implementation actually lives," but they are explicitly out of scope for the alias-removal sweep.

**Script change in `check-no-temp-barrels.sh`** — at the existing `for entry in $entries` loop, skip entries whose `barrel_type` is `expo-route-wrapper`:

```bash
# (sketch, not committed)
barrel_type=$(jq -r '.barrel_type' <<< "$entry")
if [[ "$barrel_type" == "expo-route-wrapper" ]]; then
  continue   # permanent contract, not transitional
fi
```

**Migration of existing catalog entries** — re-tag the 8 Expo route wrappers currently in the catalog:

| Entry | Current type | Should be |
|---|---|---|
| `apps/mobile/app/(app)/feedback.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/compare.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/share-preview.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/settings/personalization.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/settings/notifications.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/widget-setup.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/settings/capabilities.tsx` | `re-export` | `expo-route-wrapper` |
| `apps/mobile/app/(app)/(tabs)/settings.tsx` | `re-export` | `expo-route-wrapper` |

The 3 waitlist entries (the original Phase 7 seed) remain as `re-export` because they are not Expo route files — they live under `services/`, `stores/`, `components/` and have transitional TS-import consumers.

### Alternative fix considered (and not recommended)

Expand the consumer-counting logic to also detect route-string references — grep for `router.push('/(app)/...'`, `<Stack.Screen name="..."`, `<Drawer.Screen name="..."`, `<Tabs.Screen name="..."`, `<Slot />` parents, and the deep-link share-target intent strings.

Rejected because:
1. Coverage is unreliable. String matches can hide behind interpolation, helper functions, or array iteration over route lists.
2. Even with perfect detection, the field's *meaning* still misleads: an Expo route wrapper with route-string consumers is still **permanent**, not "almost ready for removal." The right answer is a separate type, not a richer count.

### Who should act

- **Phase 8 supervisor**: decide on the `barrel_type` schema extension and update `check-no-temp-barrels.sh` + `temp-barrel-catalog.json` schema docs (`reference-index/temp-barrel-README.md` and any JSON Schema file).
- **Phase 3 supervisor (me)**: once the schema is locked, re-tag the 8 Expo route wrappers in the catalog. Single doc commit.

Not blocking the founder review of `claude/reorg-mobile-pilot-2026-05-18`. The Phase 8 scripts are informational prototypes, not yet wired into CI, so this gap does not gate any current merge.

## Issue 2 — ownership map drift after upstream activity

### Symptom

`reference-index/ci/check-ownership-coverage.sh` reports 42 gaps on the current branch state:

- **33 files in tree but not in the ownership map.** Includes the 9 new `apps/mobile/src/features/` files from Phase 3 migrations + ~24 new files from upstream commits (`add 10 edge-case modals` brought in `apps/mobile/components/edge-cases/*`, `add performance settings page` brought in `apps/mobile/services/performanceMonitor.ts`, healthkit work brought in `services/healthKitQuery.ts`).
- **9 stale entries in the map but not in the tree.** All config files: `app.config.js`, `babel.config.js`, `jest.config.js`, `jest.setup.js`, `metro.config.js`, `nativewind-env.d.ts`, `scripts/screenshots/pipeline.ts`, `scripts/screenshots/specs/01-multi-provider.spec.ts`, `tailwind.config.js`. The original indexer (Phase 3 Step 2, commit `d7dc24ee1`) included these, but `check-ownership-coverage.sh` correctly excludes them per its documented exclusion list.

### Root cause

Two independent drifts:

1. **My Phase 3 files post-date the indexer.** The indexer ran at Phase 3 Step 2, before any file moves. The 9 new `src/features/` paths and their classifications never made it into `mobile-code-index.json` / `mobile-ownership.json`.
2. **Upstream added files that no indexer has captured.** The accessibility audit, edge-cases, performance-settings, and healthkit commits added files between my Step 2 and now.

The 9 "stale" config-file entries are an indexer-vs-script disagreement: the indexer was inclusive of all `.ts`/`.tsx` (and picked up some `.js` configs via the broader sweep); the script's exclusion list narrowly defines "ownership-relevant" files. This is a script bug or an indexer over-inclusion — needs the Phase 8 supervisor's call.

### Proposed fix

Per founder direction: **WAIT**. Upstream is actively regenerating the ownership map. Once their regeneration lands, the 33 new-file gaps will resolve (or the new-file ownership-rule decisions will surface naturally). The 9 stale entries can be cleaned up in the same regeneration.

If a regeneration is needed sooner, run:

```bash
cd <repo-root>
pnpm tsx reference-index/scripts/generate-mobile-index.ts
```

Then commit only `reference-index/mobile-{code-index,ownership}.json`.

### Who should act

- **Upstream's ownership-map regen sweep** (already in flight per the founder).
- **Phase 8 supervisor**: confirm whether `check-ownership-coverage.sh`'s exclusion list and the indexer's inclusion rules agree on the boundary (config files in or out?).

Not blocking the founder review of `claude/reorg-mobile-pilot-2026-05-18`.

## Issue 3 — `check-structure.sh` 215-violation report is expected at Phase 3

### Symptom

`reference-index/ci/check-structure.sh` reports 215 violations — every legacy file under `apps/mobile/{components,services,stores,storage,lib,hooks,types}/` is flagged as "not inside src/ (surface=mobile)."

### Root cause and proposed handling

This is **by design**. Phase 3's stated scope is "mobile pilot — single feature first, then a small batch of follow-ups." Of ~266 mobile files, Phase 3 migrated 9 (plus 5 barrels at old paths to preserve consumer contracts). The other 215+ are precisely the **work remaining** for Phase 5-onward.

No fix needed. The script's output is informational and accurately describes the Phase 3 partial-migration state. As later phases migrate more files, the violation count will drop monotonically.

If desired, the script could grow a `--phase <N>` flag that fails only on regressions (files outside `src/` newly added since the prior phase) rather than the full backlog. That's a future enhancement; not blocking review.

### Who should act

- **Nobody right now**. Surface it in the Phase 8 README so future readers don't mistake the 215 count for a quality regression.

---

## Summary

| Issue | Severity | Blocks Phase 3 review? | Action owner |
|---|---|---|---|
| 1. Expo route wrappers misclassified as removable | medium — script will produce false enforcement once wired | no — informational only | Phase 8 supervisor (schema + script) + me (re-tag entries) |
| 2. Ownership map drift | low — already in flight upstream | no | Upstream regen sweep |
| 3. `check-structure.sh` 215-count alarm | none — by design | no | Documentation note in Phase 8 README |

None of the three issues block the founder review of `claude/reorg-mobile-pilot-2026-05-18` at commit `a1cedef5f`. All three are tracked for the next Phase 8 iteration.
