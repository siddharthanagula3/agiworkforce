# QA governance

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-20

How quality is decided in this repository: what a test has to be worth, what
blocks a merge, what a regression obliges, and how a test failure finds its
owner. This is the operating rule behind the guard chain, not a restatement of
it. `docs/development/ci-and-deploys.md` is what CI runs; this is why.

The premise is `AGENTS.md` §4: a guard beats a convention. Anything here that
could be violated silently has an executable check named beside it, and
anything that has no check says so.

## 1. Quality is a property of the architecture, not a phase

A test suite is not where correctness is decided in this repository. Most of
what would otherwise be a test is a shape the code cannot get wrong: a
discriminated union that has no invalid state, a registry every consumer
enumerates, a guard that fails the build when a route joins the tree without
the decision it needs. `scripts/check-org-permissions.mjs` is the clearest
example: it resolves every organization-scoped mutating route through its own
import graph to a call that consults the permission grid, so a new route that
decides by nothing at all fails the build without anybody writing a test for it.

The practical rule that follows: **when the same mistake has been made twice,
the fix is a guard, an abstraction or a type, not a longer review checklist.**
A third occurrence means the first two fixes were prose.

## 2. QA starts before implementation

Before a feature is built, three things are decided, and they are decided in
code rather than in a plan:

1. **Its contract.** The types and the registry entry come first, because a
   contract written after the implementation describes the implementation
   rather than constraining it.
2. **Its governance.** Anything that is not generally available carries a
   `FeatureGovernance` record in
   `packages/contracts/types/src/feature-registry.ts` with its owner, exit
   criteria, kill switch, data migration, rollout ring and support commitment.
   That record is written when the feature is declared, not when it ships,
   because every field is a question somebody asks during an incident.
3. **How it will be falsified.** The assertion that would fail if the feature
   stopped working, named before the feature exists. For a universal claim
   (every, all, never) that assertion has to enumerate from the source of
   truth: the migrations, a registry, the route table or the import graph. A
   hand-written list of what to check is not a proof of a universal.

`docs/specs/<feature>/` is where that work lives while it is in flight.

## 3. What blocks a merge

CI is a fan of lanes with one gate at the end: `ci-complete` in
`.github/workflows/ci.yml` lists every lane in `needs` and fails if any of them
reports failure or cancelled. There is no lane whose failure is advisory by
accident; an advisory lane is advisory because it is not in that list.

| Lane                                                                         | What it is defending                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `repo-guards`                                                                | The `scripts/check-*` chain: structure, claims, registries |
| `database`                                                                   | Migration numbering, dependencies and the ledger           |
| `js-verify`                                                                  | Unit and integration tests, types, lint                    |
| `security`                                                                   | The security guards and scanning                           |
| `contracts`                                                                  | Generated protocol types and the contract registry         |
| `rust-desktop-cli`                                                           | The Rust crates and the CLI                                |
| `desktop-e2e`, `browser-extension-e2e`, `vscode-extension-e2e`, `mobile-e2e` | Each client surface end to end                             |
| `web-a11y`                                                                   | Accessibility on the web surface                           |
| `clippy-all-features`, `macos-smoke`, `windows-smoke`                        | Platform-specific breakage                                 |

## 4. What a test may not be

`scripts/check-test-integrity.mjs` enforces this, so it is a build failure
rather than a review comment. A test may not assert a tautology, may not assert
that a mock is defined, may not restate the implementation, and may not be the
only evidence for a behaviour while being a snapshot. `it.only` and a skipped
test are both caught: a suite that silently stopped running is worse than one
that was never written, because it reports green.

Coverage is a floor per project, recorded in `scripts/.coverage-floors.json`
and checked by `scripts/check-coverage-floors.mjs`. A floor may rise and never
fall, and a project with no floor is itself a failure, so a new package cannot
join the tree uncovered. The floor is a ratchet, not a target: nothing in this
repository treats a coverage percentage as evidence that a behaviour works.

## 5. Regression policy

A production bug is process feedback, and the process it feeds back into is
mechanical:

1. **Reproduce it as a failing assertion first.** The fix is not started until
   something in the repository is red for the right reason. A fix landed
   without that has no way of staying fixed.
2. **Put the assertion where the defect was possible, not where it was
   observed.** A bug found in a page whose cause was a shared helper gets its
   test on the helper, because the next consumer of that helper is the next
   occurrence.
3. **Ask whether one guard would cover the whole class.** One data-driven guard
   that enumerates from the source of truth is worth more than forty single
   assertions, and it is the only thing that catches the instance nobody has
   thought of yet.
4. **A jsdom pass is not a browser pass** for anything involving event order,
   focus or competing listeners. Those need a spec under `apps/web/e2e/`.
5. **A live sweep only measures the states the account's data produces.** Empty,
   error and loading states are invisible to it and belong at component level,
   where the state is deterministic.

## 6. Flaky tests

Playwright retries twice on CI and not at all locally
(`apps/web/playwright.config.ts`), with a trace captured on the first retry. A
retry is a diagnostic, not a pass: a spec that only passes on retry is a spec
with a race in it or in the product, and the trace is there to tell which.

There is no quarantine list and no flaky-test registry in this repository, and
no automated owner assignment. Attribution is by workflow:
`.github/workflows/ci-failure-attribution.yml` runs after CI and reports which
change a failure belongs to. Ownership after that is the author of the commit
the attribution names. Deleting or skipping a flaky test to get a merge through
is the one response this document rules out, because it converts a known
intermittent failure into an unknown permanent one.

## 7. Traceability

Three links, each of which is a file rather than a record in a tracker:

- **Feature to owner.** `FeatureGovernance.owner` is a path in this repository,
  so the owner cannot outlive the code it points at.
- **Claim to proof.** Every assertive sentence in `docs/security/security.md` is
  indexed in `docs/security/security-claims.json` to a named test or guard that
  exists, and the same holds for the indexed help-centre articles through
  `apps/web/content/support/support-claims.json`. Both guards fail when the
  document changes without the index.
- **Deployment to state.** The production deploy records the migration state it
  serves, and a rollback writes its reason and both deployment ids to the
  release audit trail.

## 8. Maturity gates

The vocabulary is `FEATURE_MATURITIES` in
`packages/contracts/types/src/model-catalog.ts`: `experimental`, `beta`,
`general_availability`, `deprecated`. The gate between them is the
`FeatureGovernance` record, not a meeting.

| Stage                  | What it must already have                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `experimental`         | A governance record, a kill switch that works, and a user-visible label                |
| `beta`                 | The above, plus its exit criteria written as something checkable                       |
| `general_availability` | No governance record and no label, so every claim it makes is proved by the chain      |
| `deprecated`           | A label again, and a migration path recorded in `docs/standards/deprecation-policy.md` |

The asymmetry is deliberate. An unfinished feature has to say more about itself
than a finished one, because a finished one is defended by the guards that apply
to everything.

## 9. What this repository does not have

Said here so nobody looks for it:

- No test plan documents, no manual test scripts and no QA sign-off step. The
  gate is `ci-complete`.
- No flaky-test quarantine, no flake dashboard and no per-test owner registry.
- No performance regression gate. Load testing exists as a runbook
  (`docs/runbooks/capacity-and-load-testing.md`), not as a merge blocker.
- No staffed QA function. This is a one-person operation, which is the reason
  the checks above are executable rather than procedural.
