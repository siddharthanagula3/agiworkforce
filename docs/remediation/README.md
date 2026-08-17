# Remediation register

Status: Current
Owner: Platform lead
Last updated: 2026-08-16

Every audit finding, known flaw, gap, blocker and unfinished-work item in this
repository, consolidated into one place so it can be planned and resolved as a
single body of work instead of a dozen drifting documents.

**823 items** — 36 critical, 257 high, 354 medium, 176 low. 737 open, 36 in
progress, 41 unclear (the source documents disagree with each other), 8 wontfix.
A further **328 items** were checked, found already resolved, and retired to
[`RESOLVED.md`](RESOLVED.md) rather than deleted.

## How to use this

- [`WAVES.md`](WAVES.md) — the execution order, and why it is that order. Start here.
- [`waves/`](waves/) — one file per wave, each holding the full detail for its
  items. Open a wave, work it, close it out.
- [`register.json`](register.json) — the same data, machine-readable, for
  scripting a burn-down or feeding a tracker.
- [`RESOLVED.md`](RESOLVED.md) — what was retired as already fixed, with reasons.

Every item states what is wrong, what "done" means, where in the code it lives,
and which original document it came from. The provenance line matters: it is what
lets you go back and check the claim rather than trusting this file.

## The waves

| #   | Wave                                                                                                                                | Items | Open |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- |
| 1   | [Live secret exposure and key custody](waves/W01-live-secret-exposure-and-key-custody.md)                                           | 13    | 12   |
| 2   | [Unauthenticated and pre-auth reachable endpoints](waves/W02-unauthenticated-and-pre-auth-reachable-endpoints.md)                   | 25    | 22   |
| 3   | [Build, CI, deploy and release-publishing integrity](waves/W03-build-ci-deploy-and-release-publishing-integrity.md)                 | 62    | 54   |
| 4   | [Untrusted input: injection, egress, sandbox escape, resource abuse](waves/W04-untrusted-input-injection-egress-sandbox-escape-.md) | 37    | 35   |
| 5   | [Authorization, tenant isolation, enterprise governance](waves/W05-authorization-tenant-isolation-and-enterprise-go.md)             | 31    | 26   |
| 6   | [Privacy, consent, erasure and legal obligations](waves/W06-privacy-consent-erasure-and-legal-obligations.md)                       | 61    | 54   |
| 7   | [Billing, metering and entitlements](waves/W07-billing-metering-and-entitlements.md)                                                | 77    | 70   |
| 8   | [Model routing, agent runtime, connectors, durable execution](waves/W08-model-routing-agent-runtime-connectors-and-durab.md)        | 92    | 82   |
| 9   | [Web application and shared UI surfaces](waves/W09-web-application-and-shared-ui-surfaces.md)                                       | 178   | 167  |
| 10  | [Desktop application](waves/W10-desktop-application.md)                                                                             | 100   | 83   |
| 11  | [Mobile, browser and editor extensions, CLI](waves/W11-mobile-browser-and-editor-extensions-and-cli-sur.md)                         | 85    | 80   |
| 12  | [Observability, scale, published-claim accuracy, dead code, tests](waves/W12-observability-scale-limits-published-claim-accur.md)   | 62    | 52   |

See [`WAVES.md`](WAVES.md) for per-wave open counts and exit criteria.

## Where this came from

Consolidated from these documents. Counts are raw items extracted before
de-duplication; the register is the merged result, so the numbers below sum to
far more than 906.

| Source                                                                                       | Raw items |
| -------------------------------------------------------------------------------------------- | --------- |
| `AuditRemediationLedger.md`                                                                  | 259       |
| `docs/agent-context/known-flaws.md`                                                          | 226       |
| `docs/adr/wire-or-cut.md` + `docs/current/parity-implementation-matrix.md`                   | 237       |
| `audit/capability-gaps.{md,csv}` + `audit/ui-gaps.md`                                        | 393       |
| `ExecutionPlan.md`                                                                           | 186       |
| `audit/parity-2026-08-15/` (untracked)                                                       | 184       |
| `audit/competitive-gap-2026-08-15/` (untracked)                                              | 168       |
| `audit/competitive-gap-2026-08-15/duplication/` (untracked)                                  | 48        |
| `docs/agent-context/phase4-capability-audit.md`                                              | 74        |
| `PLAN.md` + `DPDP_PROGRESS.md`                                                               | 54        |
| `docs/current/gap-audit-2026-08-08.md`                                                       | 48        |
| `FoundersAssistance.md`                                                                      | 36        |
| `docs/current/source-of-truth.md` (P0 list) + `frontend-experience-contract.md`              | 35        |
| `docs/agent-context/HANDOFF.md` + `risk-map.json`                                            | 21        |
| `audit/manual-qa-2026-08-15.md` + `BREACH_RUNBOOK.md` + `docs/runbooks/incident-response.md` | 17        |
| `docs/design/cap-052-*-security-review-2026-08-05.md` + `bug-finding-guide.md`               | 18        |
| Claude Security scan `docs/remediation/security-scan-2026-08-16/` (F1–F30, panel-verified)   | 30        |

## Where the source corpora live, and why some are not in git

Five of the sources above are on disk but outside git, so repo search will not
find them and CI has never seen them. This is the index for them.

| Corpus                                             | Location                                     | In git                                |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------- |
| Surface parity audit, 2026-08-15                   | `audit/parity-2026-08-15/`                   | no                                    |
| Competitive gap audit, 2026-08-15                  | `audit/competitive-gap-2026-08-15/`          | no                                    |
| Manual QA pass, 2026-08-15                         | `audit/manual-qa-2026-08-15.md`              | no                                    |
| Claude Security scan, 2026-08-16                   | `docs/remediation/security-scan-2026-08-16/` | no, held out by a nested `.gitignore` |
| Live-observed ChatGPT/Claude/Gemini/Manus research | `~/Downloads/competitive-product-research`   | no, outside the repo entirely         |

Committing the three `audit/` entries as they stand converts two local-only
guard failures into CI failures:

- `pnpm check:non-md-artifacts` reports 47 unclassified live non-Markdown
  artifacts — the `.json`, `.py` and `.tsv` files sitting beside the Markdown.
  Classifying them is the same one-line move that classified
  `audit/desktop-ui-computer-use/screenshots/`: add the tree's prefix to
  `allowedLiveNonMarkdownPrefixes` in `scripts/check-non-md-artifacts.mjs`.
- `pnpm check:model-id-literals` reports 191 occurrences across 24 files,
  because live-observed research quotes competitors' model names verbatim.
  There is no classification escape for this one: concrete model IDs are
  allowed only in the model registry and its generated mirrors. The Downloads
  corpus has the same shape — 15 of its 68 files carry 149 such literals — so
  importing it verbatim inherits the failure.

So bringing this evidence in-repo costs a redaction pass that trades away the
exact wording of what was observed in a competitor's UI, which is the thing the
research exists to record. That trade is unmade. Until it is made, these
corpora stay out of git and this table is how a reader finds them.

## What this register is not

It is not a verification pass. Items were extracted from documents that made
claims; the highest-severity ones were spot-checked against the code, and where
that check happened it is recorded in the item. Everything else carries the
source's claim, not an independent confirmation. Where two sources disagreed, the
item is marked `unclear` rather than silently resolved in favour of one.

Nothing here was executed: no tests were run, no exploit was fired. The 30
security items sourced from the Claude Security scan (kept in `security-scan-2026-08-16/`, untracked) are the exception in rigour
only — each was confirmed by a three-lens verification panel, still by reading.

## Retiring the source documents

The intent is for this register to replace the documents it was built from. That
cannot be done by deleting them, because most are load-bearing for CI:

- `audit/ui-gaps.{csv,md}` and `audit/ui-gaps-baseline.json` — `check:ui-gaps`
  validates a 341-row identity check, a CSV↔MD sha256 sync comment, and a
  monotonic P0/P1 count against git history.
- `audit/inventory.json` — `check:audit-inventory` validates a 654-record hash.
- `audit/capability-gaps.csv` — `check:capability-gaps`, minimum 44 rows.
- `docs/agent-context/known-flaws.md` — in `check-agent-context.mjs`'s
  `requiredFiles`, which also demands four specific task IDs and a well-formed
  table inside it; gates `check:llm-operability`.
- `AuditRemediationLedger.md` — `check-audit-progress.mjs` fails closed without
  it, and the pre-tag release gate invokes it.
- `ExecutionPlan.md` — `secret-scan-allowlist.json` has an entry keyed to that
  exact path, and `check-secrets.mjs` fails on stale allowlist entries, so
  deleting the file breaks the secret scan.
- `docs/current/gap-audit-2026-08-08.md` and the cap-052 review — cited by ~15
  files; deleting them creates dangling references that
  `check:reference-integrity` flags.

Retiring each one properly means changing its guard in the same commit, or
leaving a stub that points here and still satisfies the check. Until that
happens, those documents remain on disk but this register is the authority: when
they disagree with it, they are stale.

Two were safe to delete outright and have been removed, their content living on
here: `docs/agent-context/phase4-capability-audit.md` and
`audit/capability-gaps.md` (the `.csv` beside it remains, as the CI-validated
source of truth for that tracker).

`PLAN.md`, `CHANGELOG.md`, `AGENTS.md` and `CLAUDE.md` were read for open items
but are not audit artifacts and were left alone.
