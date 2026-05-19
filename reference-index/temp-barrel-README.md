# temp-barrel-catalog — the alias-removal worklist

## What this is

`temp-barrel-catalog.json` is the durable record of every **temporary barrel re-export** added during the reorg phases (3-6). A "temp barrel" is a stub file kept at an OLD file path after a real implementation moved to a NEW canonical path, so existing import sites keep resolving while migration happens incrementally.

Each entry pins down four facts:

1. The OLD path (where the barrel lives today).
2. The NEW canonical path it forwards to.
3. Who added the barrel (phase + branch + commit, for audit).
4. Which consumers in the working tree still import via the OLD path.

The catalog is **append-only** during Phases 3-6 and **consumed (then truncated)** by Phase 7.

## Why this exists

The reorg phases overlap in time. Phase 3 (mobile pilot) merged barrels for the waitlist feature; Phases 4 (contracts), 5 (web + desktop), and 6 (CLI + chrome + vscode) are running concurrently and will produce many more. Without a single catalog:

- Phase 7 has to re-discover every barrel by grepping for marker comments, which is slow and brittle.
- Owners can't see which features are "almost migrated" vs. "barely started".
- Phase 8 (the lint/CI gate against re-introducing legacy paths) can't pre-load a denylist of paths that should never come back.

The catalog turns a discovery problem into a lookup.

## How Phase 7 will use it

Phase 7 is the alias-removal phase. For each entry in `temp-barrel-catalog.json`:

1. Recount `consumers_still_using_old_path` with `grep -rn "@/<old-path-suffix>"` (and any relative variants). If the list has changed since the entry was written, refresh the field.
2. For every consumer found, edit the import to point at the NEW path (or at the feature's public barrel — e.g. `@/src/features/waitlist`).
3. Re-grep. If zero consumers reference the OLD path, delete the barrel file.
4. Remove the entry from the catalog.
5. Commit per surface (one commit per feature usually keeps diffs reviewable).

Phase 7 is **done** when `temp-barrel-catalog.json` is `[]` and `grep -rln "Temporary barrel" .` returns nothing under `apps/`, `packages/`, `services/`, `crates/`.

Phase 8 then promotes the (now-empty) old-path list into an eslint `no-restricted-imports` rule so the structure can't regress.

## How Phase 4/5/6 supervisors append entries

Each time you land a commit that adds a temp barrel, append an entry to the catalog. The seed file (Phase 3) shows the exact shape; do not invent new fields.

**Single bash snippet** — run from the repo root on whichever branch contains your barrel work. It greps for consumers, writes a fresh entry, and re-formats the JSON in place. Edit the four UPPERCASE placeholders first:

```bash
OLD_PATH="apps/web/services/billing.ts"
NEW_PATH="apps/web/src/features/billing/service.ts"
PHASE=5
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse HEAD)"

# Build the "@/..." alias suffix that consumers would use.
# Mobile/web/desktop typically alias `@/<rest-of-path-after-app-root>` minus
# the leading `apps/<surface>/`. Tweak the sed if your surface differs.
ALIAS_SUFFIX="$(echo "$OLD_PATH" | sed -E 's#^apps/[^/]+/##; s#\.tsx?$##')"

# Find consumers of both alias and relative imports.
CONSUMERS=$(
  grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --exclude-dir=node_modules --exclude-dir=.expo --exclude-dir=.next \
    --exclude-dir=dist --exclude-dir=build --exclude-dir=target \
    -E "from ['\"]@/${ALIAS_SUFFIX}['\"]|from ['\"][./]+${ALIAS_SUFFIX}['\"]" . \
    | grep -v "^${OLD_PATH}:" \
    | awk -F: '{print "    \""$1":"$2"\""}' \
    | paste -sd ",\n" -
)

# Append the entry. Requires `jq`.
jq --arg op "$OLD_PATH" --arg np "$NEW_PATH" --arg br "$BRANCH" --arg co "$COMMIT" --argjson ph "$PHASE" \
   --argjson cs "[$(echo "$CONSUMERS" | sed 's/^    //' )]" \
   '. += [{
      "old_path": $op,
      "new_path": $np,
      "barrel_type": "re-export",
      "phase_added": $ph,
      "phase_added_branch": $br,
      "phase_added_commit": $co,
      "consumers_still_using_old_path": $cs,
      "ready_for_removal_when": "all consumers migrated OR phase 7"
   }]' reference-index/temp-barrel-catalog.json > /tmp/cat.json \
   && mv /tmp/cat.json reference-index/temp-barrel-catalog.json
```

Then commit only the catalog:

```bash
git add reference-index/temp-barrel-catalog.json
git commit -m "chore(reorg): catalog temp barrel for <feature> (phase $PHASE)"
```

If `jq` isn't available, hand-edit the JSON following the seed entries; the schema is small and lint-friendly.

## ready_for_removal criteria

An entry is **ready for removal** when ALL of the following hold:

1. `consumers_still_using_old_path` is `[]` after a fresh grep (refresh first; the recorded list goes stale as other phases migrate callers).
2. The new path resolves and exports every symbol the OLD path used to (verify with `pnpm --filter <surface> typecheck` for TS surfaces, or `cargo check -p <crate>` for Rust).
3. No external consumer references the OLD path (e.g. install scripts, Tauri commands, mobile native plugin code) — search `*.json`, `*.toml`, `*.rs`, `*.swift`, `*.kt` paths too if the file is referenced from non-TS code.

When criterion 1 is met but 2 or 3 are not, leave the entry in place and flag in `tasks/todo.md`.

Phase 7 may also remove a barrel **even if consumers remain**, by migrating those consumers in the same commit. The `ready_for_removal_when` string `"all consumers migrated OR phase 7"` captures both paths.

## Schema reference

```json
{
  "old_path": "repo-relative path of the barrel file",
  "new_path": "repo-relative path of the canonical implementation",
  "barrel_type": "re-export | named-re-export | type-only-re-export",
  "phase_added": 3,
  "phase_added_branch": "claude/<phase-branch-name>",
  "phase_added_commit": "full sha of the commit that introduced the barrel",
  "consumers_still_using_old_path": ["path:line", "..."],
  "ready_for_removal_when": "human-readable criterion (default: 'all consumers migrated OR phase 7')"
}
```

Top-level shape: a JSON array. Empty array (`[]`) means no barrels outstanding.
