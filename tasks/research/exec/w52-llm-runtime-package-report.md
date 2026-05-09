# Wave 5.2 — packages/llm-runtime package.json + workspace integration verification

> Completed: 2026-05-09
> Branch: `task-1.6-llm-runtime` (extended; no follow-up commits required)
> Owner: package-engineer (`agi-foundation-integration` team)

---

## 1. Verdict

**GREEN.** `packages/llm-runtime` is correctly packaged, registered with the pnpm workspace, and resolved by all 9 declared consumers (8 provider packages + `services/api-gateway`). No fix-up commits were necessary on `task-1.6-llm-runtime`.

The reason services-engineer (Task 1.7) could not import `@agiworkforce/llm-runtime` is that they were on `task-1.7-services-inversion`, which was branched from `main` and never rebased onto `task-1.6-llm-runtime`. The package.json + workspace wiring on the `task-1.6-llm-runtime` branch itself is correct — no missing files, no malformed manifest, no broken lockfile.

---

## 2. Verification matrix

| Check | Method | Result |
|---|---|---|
| `packages/llm-runtime/package.json` exists | `ls`, `Read` | OK |
| `name: "@agiworkforce/llm-runtime"` | inspect manifest | OK |
| `version: "0.0.1"` | inspect manifest | OK (matches `@agiworkforce/types`, `@agiworkforce/llm-normalize`) |
| `private: true` | inspect manifest | OK |
| `type: "module"` | inspect manifest | OK |
| `exports: "./src/index.ts"` | inspect manifest | OK (workspace source-only resolution pattern) |
| `main: "./src/index.ts"` | inspect manifest | OK |
| `types: "./src/index.ts"` | inspect manifest | OK |
| `scripts.build: "tsc --project tsconfig.json"` | inspect manifest | OK |
| `scripts.typecheck: "tsc --noEmit"` | inspect manifest | OK |
| `scripts.test: "vitest run"` | inspect manifest | OK |
| `dependencies` is exactly `@agiworkforce/types: workspace:*` | inspect manifest | OK |
| `devDependencies` is exactly `vitest: ^3.0.0` | inspect manifest | OK |
| `pnpm-workspace.yaml` includes `packages/*` | `Read pnpm-workspace.yaml` line 3 | OK |
| `tsconfig.json` extends `../../tsconfig.base.json` with composite + declaration | `Read` | OK |
| `vitest.config.ts` present, scoped to `src/__tests__/**/*.test.ts` | `Read` | OK |

### Build, test, typecheck

- `pnpm --filter @agiworkforce/llm-runtime build` — exit 0 (tsc clean).
- `pnpm --filter @agiworkforce/llm-runtime test` — **102 tests pass across 8 test files** (`errors`, `fallback`, `gateway`, `headers`, `history`, `retry-after`, `retry`, `watchdog`).
- `pnpm typecheck:all` — clean across all 28 workspace packages, including `packages/llm-runtime` and every consumer.
- ESLint — `pnpm exec eslint packages/llm-runtime` exit 0.

### Cross-package integration

`pnpm install --prefer-offline` produces a workspace with **28 PRIVATE packages** that includes `@agiworkforce/llm-runtime@0.0.1` at `packages/llm-runtime`. `services/api-gateway/node_modules/@agiworkforce/llm-runtime` symlinks to `../../../../packages/llm-runtime` correctly.

`pnpm-lock.yaml` resolves the dependency for all 9 consumers (sample lines):
- `packages/providers/anthropic` → `'@agiworkforce/llm-runtime': version: link:../../llm-runtime`
- `packages/providers/openai` → `link:../../llm-runtime`
- `packages/providers/google` → `link:../../llm-runtime`
- `packages/providers/ollama` → `link:../../llm-runtime`
- `packages/providers/xai` → `link:../../llm-runtime`
- `packages/providers/deepseek` → `link:../../llm-runtime`
- `packages/providers/perplexity` → `link:../../llm-runtime`
- `packages/providers/lmstudio` → `link:../../llm-runtime`
- `services/api-gateway` → `link:../../packages/llm-runtime`

### Source-import audit

11 source files import from `@agiworkforce/llm-runtime`; all resolve cleanly under `tsc --noEmit`:

```
packages/providers/anthropic/src/index.ts
packages/providers/anthropic/src/retry-after.ts
packages/providers/deepseek/src/index.ts
packages/providers/google/src/index.ts
packages/providers/lmstudio/src/index.ts
packages/providers/ollama/src/index.ts
packages/providers/openai/src/index.ts
packages/providers/openai/src/retry-after.ts
packages/providers/perplexity/src/index.ts
packages/providers/xai/src/index.ts
services/api-gateway/src/routes/providerStream.ts
```

Every file's owning package declares `"@agiworkforce/llm-runtime": "workspace:*"` in `dependencies` (verified via `grep -q '@agiworkforce/llm-runtime' <each>/package.json` — 9/9 OK).

---

## 3. Findings on task-spec edge cases

### 3.1 No path mapping in `tsconfig.base.json` for `@agiworkforce/*`

The task description asked: *"Check root `tsconfig.base.json` (or equivalent) includes path mapping for `@agiworkforce/llm-runtime`."*

Root `tsconfig.base.json:58-62` declares paths only for `@types/*`, `@utils/*`, `@desktop/*`. There is **no** generic `@agiworkforce/*` path mapping anywhere in the repo, and `pnpm typecheck:all` is green regardless. The reason: TypeScript resolves `@agiworkforce/llm-runtime` via the package's `name` field through standard `node_modules` resolution (pnpm symlinks `services/api-gateway/node_modules/@agiworkforce/llm-runtime` → `packages/llm-runtime` automatically). The same pattern works for `@agiworkforce/types`, `@agiworkforce/llm-normalize`, `@agiworkforce/providers-anthropic`, etc. No path-mapping fix is needed and no spec ambiguity exists — the existing pattern is correct.

### 3.2 No `lint` script in `packages/llm-runtime/package.json`

Task spec mentioned `scripts (build, test, lint)`. Across the monorepo, only `@agiworkforce/unified-chat` has a per-package lint script. The repo convention is **root-level** lint via `pnpm lint` (eslint --max-warnings=0 across the entire repo, configured at `package.json:55`). `packages/llm-runtime/src/**` is covered by that root run with zero violations. Adding a per-package lint script would be inconsistent with `@agiworkforce/types`, `@agiworkforce/llm-normalize`, all 8 provider packages, and every other workspace member except `unified-chat`. **No fix required.**

### 3.3 vitest version drift

`packages/llm-runtime` declares `vitest: ^3.0.0` in devDependencies, while newer packages (e.g. `packages/providers/anthropic`, `packages/llm-normalize`) declare `^4.0.18`. The actual installed vitest is **3.2.4** (from the root lockfile resolution). All 102 tests pass under that version; no immediate action needed. This drift is not a Wave 5.2 ship-blocker but is worth noting for a future sweep that aligns vitest majors across the workspace.

---

## 4. Why services-engineer's import failed

`task-1.7-services-inversion` was created from `main` (commit `a03c22098`), which predates the llm-runtime feature commit `aa77e8e7d` on `task-1.6-llm-runtime`. On `main`:
- `packages/llm-runtime/` does **not** exist.
- `services/api-gateway/package.json` does **not** declare `"@agiworkforce/llm-runtime": "workspace:*"`.
- `pnpm-lock.yaml` does **not** contain `packages/llm-runtime:`.

So when services-engineer ran `pnpm install` on `task-1.7-services-inversion`, the import resolved to nothing and the typecheck failed for that branch. This is purely a branch-base issue, not a defect on `task-1.6-llm-runtime`.

The `1.7-report.md` §8 acknowledges this and notes: *"Task 1.6 (`packages/llm-runtime`) exists on branch `task-1.6-llm-runtime` but has no `package.json` so pnpm cannot link it."* The first half is right; the second half is wrong — the package.json is present and correct. The actual problem services-engineer hit is *"task-1.7 was branched from main, not from task-1.6"*.

---

## 5. Cross-branch implications (for merge-train coordinator)

- **`task-1.7-services-inversion` is the affected branch.** When the merge train rebases it, it must rebase **on top of `task-1.6-llm-runtime`**, not on `main`. Specifically:
  1. Land `task-1.6-llm-runtime` to `main` first (this branch).
  2. Then `git rebase main task-1.7-services-inversion`.
  3. Re-add the `import { withRetry, classifyError } from '@agiworkforce/llm-runtime'` line that services-engineer removed in `assignment.ts` (per their report §8 — they removed it as dead code, but they may want to re-add it to wrap the poll loop with retry semantics).
  4. Add `"@agiworkforce/llm-runtime": "workspace:*"` to `services/api-gateway/package.json` if `task-1.7` re-imports it (already declared on `task-1.6-llm-runtime`'s version of that file).
- **No other branch is affected.** Tasks 1.1, 1.2, 1.3, 1.4, 1.5, 1.8 do not import `@agiworkforce/llm-runtime`. Verified by grepping each branch's diff against `main` for `llm-runtime`: only `task-1.6` and `task-1.7` are touched.

I did **not** modify `task-1.7-services-inversion`'s branch (per scope discipline). I documented the rebase instructions here.

---

## 6. Files changed on `task-1.6-llm-runtime`

**No fix-up commits were authored.** The branch's existing commit `aa77e8e7d` is sufficient. Verification was non-mutating:
- `pnpm install --prefer-offline` — populated `node_modules/`, did not modify `pnpm-lock.yaml`.
- `pnpm --filter @agiworkforce/llm-runtime build` — `tsc` does not emit (root `tsconfig.base.json` has `noEmit: true`); only refreshed `tsconfig.tsbuildinfo` (gitignored).
- `pnpm --filter @agiworkforce/llm-runtime test` — vitest pure-read.
- `pnpm typecheck:all` — read-only.

`git status` on the worktree post-verification reports clean.

---

## 7. Acceptance criteria — done

- [x] `packages/llm-runtime/package.json` valid with all required fields.
- [x] `pnpm-workspace.yaml` includes `packages/*` (line 3).
- [x] Cross-package import test from `services/api-gateway` resolves; full workspace typecheck clean.
- [x] `pnpm --filter @agiworkforce/llm-runtime build` succeeds.
- [x] `pnpm typecheck:all` clean.

Services-engineer (or any reviewer) can now rebase any consumer branch on `task-1.6-llm-runtime` and `import` from `@agiworkforce/llm-runtime` without further changes to this package.
