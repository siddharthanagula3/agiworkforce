# Audit remediation — handoff (2026-08-01)

Branch: `fix/audit-remediation-2026-07-25` · 47 commits · 189 files · +5,667 / −781

Everything below is what a machine could not finish or a person must decide. It is
deliberately short; the reasoning lives in the commit messages.

The stale-doc fixes in §4 and this file itself are not in that diffstat — they are
still uncommitted at the time of writing.

---

## 1. Verification state — what ran on 2026-08-01, and the two reds

Toolchain: node 24 (`.nvmrc`), pnpm 9.15.3, turbo 2.10.5, cargo 1.94.0 / rustc 1.94.0.

Unlike the 2026-07-25 handoff, the suites did run. Two of them are red.

| Command                                       | Exit | Result                                                                                                                                                                         |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck:all`                          | 0    | 46 successful, 46 total; 0 cached; 5m20.944s; zero `error TS`                                                                                                                  |
| `cargo check --workspace`                     | 0    | `Finished` in 6m 24s; 0 warnings, 0 errors, 14 packages                                                                                                                        |
| `pnpm check:llm-operability`                  | 1    | **RED** — 32 of 34 guardrails pass; 14.31s user / 18.476s total                                                                                                                |
| `cargo test --workspace --lib --no-fail-fast` | 101  | **RED** — 6,770 passed; 4 failed; 34 ignored across 14 test binaries (plain fail-fast run stopped after 5 of 14 binaries; the `--no-fail-fast` rerun produced the full totals) |
| `pnpm test` (aggregate)                       | 1    | 41 successful, 45 total, 4m56.774s — red only under CPU contention                                                                                                             |
| per-surface JS reruns                         | 0    | every surface green in isolation; counts below                                                                                                                                 |

**Not run:** `pnpm lint` repo-wide, any e2e suite (wdio / Playwright), `cargo test`
beyond `--lib`, any build or packaging step, any production or Neon probe.

### RED 1 — `pnpm check:llm-operability`, exit 1. This branch owns it.

Two guardrails fail on the **same three missing files**:

- `check:mobile-hygiene` (15 of 34) — aborted the chain.
- `check:readme-ownership` (26 of 34) — never reached by the chain; found only by
  re-running the 19 skipped guardrails individually.

```
Mobile feature directory must have README.md: apps/mobile/src/features/archived-chats
Mobile feature directory must have README.md: apps/mobile/src/features/reflect
Mobile feature directory must have README.md: apps/mobile/src/features/team
```

All three directories were added **by this branch** — `archived-chats` in `db3aca804`,
`reflect` in `7f6a9b2de`, `team` in `072f6c083`. This is the only red the branch created,
and it blocked the pre-push hook (§3) at measurement time.

**RESOLVED after measurement, same day:** commit `528ba8bc3` adds the three READMEs
(each with `Status:`, `Owner`, `Trust boundary:` determined from the feature's own
implementation — all three are Managed Cloud — and `## Purpose`). A fresh
`pnpm check:llm-operability` run afterwards exits **0, 34 of 34 guardrails green**.
The measured red above is kept as the battery's historical truth. Note: none of the
three features has a dedicated test suite; each README says so explicitly rather than
citing coverage that does not exist.

Three things to know before fixing it:

- `check:llm-operability` is 34 `pnpm` invocations joined by `&&`. It reports **one**
  failing guardrail per run and silently skips everything downstream. Fixing
  `check:mobile-hygiene` alone will surface `check:readme-ownership` next; that is not a
  new regression, it was there all along.
- `scripts/check-readme-ownership.mjs:28` also validates content: every README must
  contain `Status:`, `Owner`, and `Purpose`. An empty placeholder moves the failure, it
  does not fix it.
- The house pattern is `apps/mobile/src/features/skills/README.md` (H1, `Status: Current`,
  `Owner: Mobile surface lead`, `Trust boundary: …`, `## Purpose`). The trust-boundary
  line is a mobile convention, not enforced here — but per the Local/BYOK/Managed Cloud
  rule it must be determined from each feature's implementation, **not** copied from
  `skills/`, which declares Managed Cloud.

The guardrail chain is now **34** entries. The CHANGELOG 2026-07-26 entry says 27.

### RED 2 — `cargo test --workspace --lib`, exit 101. This branch does not own it.

6,770 passed / 4 failed / 34 ignored. All four failures are in `agiworkforce-desktop`;
all four reproduced deterministically in isolation (zero flakes).

`git diff --numstat main..HEAD` is **empty** for every file involved — `migrations.rs`,
`models_config.rs`, `provider_adapter_tests.rs`, `models.json` are byte-identical between
main and HEAD. **This suite is red on main right now.** The CHANGELOG 2026-07-26 claim
that `cargo test --workspace --lib` is green is stale and must not be re-asserted.

| Failing test                                                                                                               | Cause                                         |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `core::llm::models_config::tests::model_effort_support_comes_from_exact_catalog_request_metadata`                          | catalog/test drift from `3044350c5` (on main) |
| `core::llm::provider_adapter::provider_adapter_tests::tests::test_anthropic_effort_is_model_scoped_and_uses_output_config` | same drift, adapter side                      |
| `data::db::migrations::tests::test_migration_v59_rebuilds_and_redacts_auth_sessions`                                       | migration v76 defect                          |
| `data::db::migrations::tests::test_migration_v59_skips_duplicate_hashed_tokens`                                            | same migration v76 defect                     |

The migration pair is **a production defect, not a fixture problem.** `migrations.rs:6058`
runs `CREATE INDEX IF NOT EXISTS … ON realtime_metrics(…)` in the v76 else-branch.
`IF NOT EXISTS` guards the index name, never the table — so any DB at schema version 58
without `realtime_metrics` hard-errors and aborts the whole migration chain. A real user
DB in that state is bricked the same way. Do not fix it by adding the table to the test
fixtures; that hides the hazard. It is not yet filed in `docs/agent-context/known-flaws.md`.

Measurement note for the next battery: plain `cargo test --workspace --lib` is fail-fast
and hid 9 of 14 binaries (433 tests). Use `--no-fail-fast`. Also beware the nested
`1 passed; 25 filtered out` line inside `utils_absolute_path` — it is a self-respawned
child process, and summing every `test result:` line double-counts it.

### JS suites — green, with a caveat about how they were measured

Every surface passes in isolation. Counts are from those isolated runs:

| Surface       | Measured 2026-08-01                              | 2026-07-26 baseline | Δ    |
| ------------- | ------------------------------------------------ | ------------------- | ---- |
| web           | 4,638 passed \| 1 skipped (484 files, 1 skipped) | 4,453 (447 files)   | +185 |
| desktop       | 1,951 passed \| 1 skipped                        | 1,894               | +57  |
| mobile        | 2,316 passed (264 suites, 28 snapshots)          | 2,121               | +195 |
| extension     | 1,221 passed (88 files)                          | 1,168               | +53  |
| vscode        | 727 passed (61 files)                            | 644                 | +83  |
| **5-surface** | **10,853**                                       | **10,272**          | +581 |

Across all 45 turbo tasks: 14,146 passed / 14 skipped. Shared packages contribute 3,293
of that and have no baseline — do not compare 14,146 to 10,272.

Two honesty notes:

- **A clean full-suite green was never obtained.** Aggregate `pnpm test` exited 1 with
  load average 22.21 while sibling typecheck and cargo agents ran. Every failure was a
  bare 5000ms timeout with no assertion error; `unified-chat` reported
  `import 1941.69s` against `tests 104.32s` under load and `Duration 15.63s` alone.
  `turbo run test` has no `--continue`, so the first failing task cancelled web, desktop
  and mobile mid-flight — their failure counts in that log are lower bounds and mobile
  contributed no number at all. Re-run `pnpm test` once on a quiet machine, or use
  `turbo run test --continue` for measurement runs.
- The recorded baseline's own arithmetic is off by 8: the CHANGELOG says 10,272 but its
  per-surface figures sum to 10,280. Deltas above use the recorded 10,272.

### Highest-risk areas in the 47 commits

Scope tally from `git log main..HEAD`: mobile 30, desktop 9 (6 of them MCP-scoped),
web 6, i18n 1, chore(deps) 1.

| Area                                                                                                                    | Why                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| mobile dependency swap — `expo-background-fetch` → `expo-background-task`, `@expo-google-fonts/newsreader`, `expo-font` | manifest + lockfile change; typecheck and jest are green, no device or EAS build ran                     |
| desktop MCP protocol negotiation and sanitisation (6 commits)                                                           | changes the revision our client and our own server agree on; unit tests only, no live third-party server |
| mobile brand and theme sweep (30 commits)                                                                               | almost entirely visual; 28 jest snapshots are the only guard                                             |
| `feat(desktop): give desktop a reasoning-effort control` (`e205bb2b1`)                                                  | same effort surface as the two failing catalog tests in RED 2                                            |
| `fix(artifacts): keep the sandbox csp inside head so it is enforced` (`59002b215`)                                      | a security control; enforcement is asserted only in unit tests                                           |
| `test(desktop): add the isolated wdio build config that e2e always required` (`44b073183`)                              | added because e2e needed it — and e2e was not run                                                        |

---

## 2. Working tree and local-only state

Clean at `07b87a6fd`, apart from the §4 doc edits and this file.

- **Lockfile committed** in `07b87a6fd` — one file, +17 / −6. Contents are exactly the
  three expected mobile pairings: `@expo-google-fonts/newsreader@0.4.1` added,
  `expo-background-fetch@55.0.18` removed / `expo-background-task@55.0.20` added,
  `expo-font@55.0.8` added. `pnpm install --frozen-lockfile` exits 0 in 1.8s across 49
  projects; no plain-install fallback was needed and the install did not rewrite it.
- One benign install notice, pre-existing and untouched: `The following dependencies have
build scripts that were ignored: expo`. Worth resolving via `pnpm.onlyBuiltDependencies`
  before anyone attempts a native mobile build.
- **Three untracked root scratch files deleted** — `after-websearch.md`,
  `artifact-test.md`, `websearch-test.png`. Regenerable Playwright snapshots from a
  2026-07-31 session. They were hard-failing `check:repo-organization`
  (`Unclassified root file`) and therefore the pre-push hook. Being untracked, they are
  not recoverable from git.

**Gitignored local config a fresh clone or a successor will not have** (names only):
root `.env.local`; `apps/web/.env.local`; `apps/desktop/.env.local` and `.env.production`;
`apps/extension/.env.local`; `apps/mobile/.env`; `.mcp.json`; `.claude/settings.local.json`.
Committed `.env*.example` counterparts exist for each app and `pnpm check:env-contract`
validates the contract (green).

Verified-clean negatives, so nobody hunts for them:

- No extra git worktrees — `git worktree list` shows only this checkout.
- No submodules — there is no `.gitmodules`.
- No listening dev servers as of 2026-08-01.
- `.playwright-mcp/` is gitignored (`.gitignore:85`) and inert.

---

## 3. Push, PR, CI

**Nothing was pushed and no PR was opened. Founder decision, 2026-08-01.**

- `origin/fix/audit-remediation-2026-07-25` is an ancestor of HEAD, 280 commits behind, so
  `git push origin fix/audit-remediation-2026-07-25` is a plain fast-forward whenever it
  is authorized.
- **Pushing this branch triggers no CI.** `ci.yml`, `repo-operability.yml` and
  `e2e-tests.yml` trigger on main / develop / pull_request only.
- **Opening a PR** triggers `ci.yml` (which runs `pnpm install --frozen-lockfile` — the
  lockfile commit in §2 is what keeps that from failing) and `repo-operability.yml`.
- `.husky/pre-push` runs `pnpm check:llm-operability` plus `git diff --check` and
  `git diff --cached --check`. It was red at measurement time (RED 1 in §1 is exactly what
  it runs); commit `528ba8bc3` fixed the three READMEs and a fresh chain run exits 0, so
  the gate is green as of 2026-08-01 — re-verify before pushing anyway. `SKIP_PRE_PUSH=1`
  exists; using it pushes unverified state silently. If it is ever used, it must be
  recorded here.
- Open PR #397 (`feat/p3-model-env-gating`, June) is unrelated and was not touched.

---

## 4. Stale docs — fixed and remaining

Fixed, uncommitted at time of writing (`AGENTS.md`, `CLAUDE.md`, `PLAN.md`):

- `CLAUDE.md` doc-usage rule — dropped the `TODO.md` clause; now points at PLAN.md's
  Exact Resume Point, `CHANGELOG.md`, and `known-flaws.md`.
- `AGENTS.md:92` root-control-docs rule — deleted the token `` `TODO.md`, `` only; the
  rest of the bullet is byte-identical.
- `PLAN.md` — header date to 2026-08-01; phase note repointed the executable queue from
  `TODO.md` to the Exact Resume Point section; the external migration gate rescoped from
  "0056 → 0057/0058" to the unapplied `apps/web/db/neon` migrations from 0056 through the
  current head `0080_device_refresh_token_rotation.sql`, with an instruction to re-read the
  directory rather than trust the number; a dated 2026-08-01 checkpoint appended.

**No checker was weakened to make this pass.** `scripts/check-agent-context.mjs` mirrors no
phrase containing `TODO.md`, so both removals were free and the guard is unmodified.
`check:agent-context`, `check:doc-status`, `check:executable-docs`,
`check:structure-conventions` and `check:repo-organization` all passed on the first run
after the edits, and the three files are already Prettier-stable.

Remaining, deliberately not fixed:

- **`scripts/check-codeowners-contract.mjs:37` still requires CODEOWNERS to contain a
  `/TODO.md` entry.** `check:codeowners` passes only because CODEOWNERS still carries that
  line — the repo is required to own a file deleted in `906fe5cda`. Drop it from the
  checker's required-path list and from CODEOWNERS **together**; changing one turns the
  guardrail red.
- `scripts/check-repo-organization.mjs:40` and `scripts/check-structure-conventions.mjs:132`
  still allowlist a root `TODO.md`. Dead entries, harmless.
- **Four references point at a plan document that no longer exists.** `PLAN.md:6`
  ("Detailed plan"), `PLAN.md:182`, `docs/current/technical-architecture.md:9` and
  `CHANGELOG.md:972` all cite `docs/plans/monorepo-restructure-2026-07-08.md`, which
  `906fe5cda` deleted. `docs/plans/rust-engine-extraction-2026-07-09.md` is dangling the
  same way. The restructure this branch belongs to currently has no readable plan file.
- `PLAN.md` "Active Workstream" narrative predates this branch — the 47 commits (mobile 30,
  desktop 9, web 6, i18n 1, chore 1) do not map onto its four lanes.
- `PLAN.md` ~line 230 "the TODO wiring-gap audit" names a past web dead-stack audit, not
  the deleted root `TODO.md`. Left intentionally; a future grep will hit it and look like a
  miss.
- The `PLAN.md` phase note still cites "10,272 passing tests, 27 green operability
  guardrails". Kept because it is explicitly dated 2026-07-26 and is accurate as a baseline
  statement; the new checkpoint supersedes both figures in place.
- `docs/agent-context/lanes.json:398` ("update changelog/TODO") — note only. Editing it
  risks `check:lane-ownership` churn for no gain.

---

## 5. Stashes — 18, cited by message only

`lint-staged` creates and drops backup stashes, so indices shift. Never cite by index.

| Stash message contains                                                                      | Disposition                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIP on fix/audit-remediation-2026-07-25: 001a0bb87`                                        | This branch's WIP — Connectors settings tab (+13), `skills-lock.json` (+120). Review, then resume or drop.                                                        |
| `lint-staged automatic backup`                                                              | `apps/web/lib/e2b/execution-tools.ts` + its test (+165 / −8), from 2026-07-29. Inspect, then drop. Not a leftover from this session — that backup was cleaned up. |
| `RECOVERED: unrelated apps/web WIP accidentally popped by concurrent-agent stash collision` | Quarantined incident recovery. Founder decision only.                                                                                                             |
| `RECOVERY-2026-07-19: bad-pop of stale stash@{0} + any session WIP — untangle later`        | Quarantined incident recovery. Founder decision only.                                                                                                             |

The remaining 14 are historical May–June branches.

---

## 6. Decisions only you can make

1. **Production Neon migration state is UNKNOWN.** It cannot be verified locally. The
   PLAN.md gate has been rescoped from 0058 to the current head
   `0080_device_refresh_token_rotation.sql` — apply and probe through the head on
   production Neon before merging to main, and re-read the directory rather than trusting
   the number in this document.
2. **Authorize the push and the PR.** Neither ran. RED 1 has since been cleared
   (`528ba8bc3`, chain re-run green 34/34), so the pre-push hook no longer blocks —
   the decision is now purely whether to publish.
3. **Decide the models.json effort question.** Either the economy route genuinely admits
   `claude-sonnet-5` at low effort and the two assertions are updated, or the catalog
   over-declares and `supportedEfforts` is narrowed. Do not guess — the comment block at
   `models_config.rs:746-755` documents a real prior bug in that area. Whichever way it is
   answered, both failing tests move together. (While in there: the local binding at
   `provider_adapter_tests.rs:1028` is named `haiku` but the model under test is
   `claude-sonnet-5` — leftover from the haiku-4.5 retirement in `f62274b63`.)
4. **Decide whether main gets fixed before this branch merges.** The v76 migration hazard
   is a production defect on main, not a failing fixture.
5. **Stash disposal** — §5.
6. **CHANGELOG.** The battery was not fully green, so no Verified entry was added. Either
   fix the reds, re-run, and write the entry, or write a dated entry that records the reds
   explicitly.

---

## 7. Not done — and why

| Item                                 | Why                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHANGELOG "Verified" entry           | §1 has two reds. "Do not mark work complete from build success alone" is a phrase-guarded rule in `AGENTS.md`/`CLAUDE.md`. CHANGELOG stays at 2026-07-26; this document carries the verification state. |
| The three mobile READMEs             | This pass was measurement, tree hygiene and documentation by instruction. It is the branch's only self-inflicted red and it blocks pushing.                                                             |
| The four desktop cargo failures      | Pre-existing on main, not caused or worsened here. Needs the §6 decisions, not a mechanical edit.                                                                                                       |
| A `known-flaws.md` entry for v76     | The repo's own rules put durable defects there. The hazard is recorded here and in PLAN.md but not yet filed.                                                                                           |
| A clean full-suite `pnpm test` green | Never obtained on a quiet machine — see §1.                                                                                                                                                             |
| Push, PR, merge                      | Founder decision, 2026-08-01.                                                                                                                                                                           |

The executable queue lives in **`PLAN.md` → Exact Resume Point** since `TODO.md` was
deleted in `906fe5cda` (2026-07-29). The 2026-08-01 checkpoint at the end of that section
is the resume point.

Cheap follow-ups nobody took: `turbo.json`'s `outputs` key for the five `typecheck` tasks
that emit nothing (5 warnings, and the reason those tasks can never cache);
`pnpm.onlyBuiltDependencies` for `expo`; `turbo run test --continue` for measurement runs.

Pointers: `docs/agent-context/known-flaws.md`; the `CHANGELOG.md` 2026-07-26 Verified entry
(the baseline §1 measures against — its cargo claim is stale and its arithmetic is 8 off);
the prior handoff via
`git show 461f8a5b4:docs/agent-context/remediation-handoff-2026-07-25.md`.
