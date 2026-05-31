# reference-index/ci/

Phase 8 enforcement-gate prototypes. **None of these scripts are wired
into any CI workflow yet.** They are documented here so the founder can
review them before Phase 8 enables anything.

## Scripts

| Script                        | What it checks                                                                                                                                                                                                                                                                                            | Intended trigger                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `check-structure.sh`          | Every TS/TSX file under `apps/<surface>/` (for surfaces that have a `reference-index/<surface>-ownership.json`) lives in `src/{entry,core,features,platform,integrations,data,ui}/`. Files at legacy paths listed in `reference-index/temp-barrel-catalog.json` are tolerated until Phase 7 deletes them. | **Phase 8a:** nightly cron, warn-only. **Phase 8b:** required check on every PR that touches `apps/<surface>/`. |
| `check-no-temp-barrels.sh`    | Every entry in `reference-index/temp-barrel-catalog.json` whose `consumers_still_using_old_path` array is empty must already be deleted from the tree. Optional `--threshold YYYY-MM-DD` flag forces ALL legacy paths to be removed after that date — the Phase 7→8 cutoff.                               | **Phase 8b:** required check on every PR. Auto-relaxes when the catalog is empty/absent.                        |
| `check-ownership-coverage.sh` | The schema validator passes (`pnpm tsx reference-index/scripts/validate-ownership.ts`), AND every TS/TSX file currently in `apps/<surface>/` appears in exactly one `by_owner.<role>` list of the corresponding ownership map. `--strict` mode also fails when the `unassigned` bucket is non-empty.      | **Phase 8a:** nightly cron, warn-only. **Phase 8b:** required check on PRs that add new files.                  |

## Requirements

- bash 3.2+ (works on stock macOS — explicitly tested)
- `jq` (used by `check-no-temp-barrels.sh` and `check-ownership-coverage.sh`)
- `pnpm` + `pnpm tsx` (used by `check-ownership-coverage.sh` to invoke
  `validate-ownership.ts`)
- `git` (used by `check-structure.sh` and `check-ownership-coverage.sh`
  to enumerate tracked files via `git ls-files`)

## Smoke results (against current main, 2026-05-18)

These results are informative — they show the scripts work AND surface
real audit findings even before Phase 8 is enabled:

```
$ bash reference-index/ci/check-structure.sh
[check-structure] 203 violation(s) — see canonical layout in apps/<surface>/src/README.md
# Expected: main hasn't merged the mobile pilot reorg yet, so all legacy
# mobile paths fail the gate. When the pilot is merged AND
# temp-barrel-catalog.json lists every legacy file still hosting a
# barrel, this count drops to 0.

$ bash reference-index/ci/check-no-temp-barrels.sh
[check-no-temp-barrels] OK — no overdue legacy paths.
# Expected: the three waitlist legacy paths in the catalog each still
# have non-zero consumer counts, so they aren't overdue.

$ bash reference-index/ci/check-no-temp-barrels.sh --threshold 2026-01-01
[check-no-temp-barrels] 3 stale legacy path(s) still in the tree.
# Expected: threshold mode forces all 3 entries to fail because today is
# past 2026-01-01.

$ bash reference-index/ci/check-ownership-coverage.sh
[check-ownership-coverage] 10 gap(s).
# Real finding: apps/mobile/services/healthKitQuery.ts is in main but
# not in the worktree-snapshot mobile-ownership.json. 9 stale entries
# are config files that the script's exclusion rules don't claim back.
# Both are actionable: re-run the generator and update healthKitQuery's
# owner, or extend the script's exclusion regex.
```

## Why not just write the workflow YAML now?

Two reasons:

1. **Calibration.** The scripts emit non-trivial counts against current
   main. Phase 8a runs them in warn-only mode to drive those counts to
   zero before they gate PRs.
2. **Scope.** Each surface adopts the canonical layout independently
   (mobile pilot first; then desktop / web / cli / extensions). A
   per-surface enable lets us flip on `check-structure.sh` for `mobile`
   while the others are still legacy.

## Phase 8 rollout order (recommended)

| Step | Gate                                  | Mode              | Why first                                                                                                                                                                  |
| ---- | ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `check-ownership-coverage.sh`         | warn-only nightly | Has the lowest false-positive rate — it just diffs two file lists. Fixing its gaps is mostly metadata work, not code moves.                                                |
| 2    | `no-cross-layer-import` ESLint rule   | warn-only on PRs  | One warn-only soak week. The rule fires on real cross-layer imports that are usually already TODOs. Easy to triage.                                                        |
| 3    | `check-structure.sh`                  | warn-only nightly | Higher false-positive risk during the multi-surface reorg. Run nightly first so the violation count is visible without blocking PRs.                                       |
| 4    | `check-no-temp-barrels.sh`            | required on PRs   | Last because it requires Phase 7 to ship the catalog file. Default mode (consumers-empty) is gentle; the `--threshold` flag enables the hard cutoff at the end of Phase 8. |
| 5    | Flip all four gates to `error` on PRs | enforce           | Only after step 1-4 counts hit zero and stay zero for one week.                                                                                                            |

See `reference-index/phase8-eslint-prototype/README.md` for the ESLint
piece of step 2.
