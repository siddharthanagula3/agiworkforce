# audit

Every audit, gap register and completeness report for the product lives here,
and nowhere else in the repository. The folder is a to-do list: each file
describes work that is not finished yet, and is deleted when that work is done.
When the product is complete, only `ledger/`, `registers/` and `baselines/`
remain.

Start with [`plan/waves.md`](plan/waves.md). It lists every open item, grouped
into the order it should be fixed in, with live counts.

## Layout

| Folder or file                         | What it holds                                                                                                                                                                              | Who writes it                   | When it goes away                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------- |
| [`plan/waves.md`](plan/waves.md)       | The resolution plan: wave 0 blockers, then migrations, switch-ons, half-built features, missing features, live checks                                                                      | generated                       | when every wave is empty                                                            |
| [`blockers/`](blockers/)               | One file per release blocker, security defect or runbook gap, with the code location and the fix                                                                                           | by hand                         | each file, when its fix lands                                                       |
| [`missing/`](missing/)                 | One file per product area: features that do not exist, and the surfaces they are needed on                                                                                                 | generated                       | each file, when its last item is built                                              |
| [`partial/`](partial/)                 | One file per product area: features that exist but are unfinished, with what is left on each surface and the code to start from                                                            | generated                       | each file, when its last item is finished                                           |
| [`live-check/`](live-check/)           | Cells only the running product can settle, and the queue for the live-check agent                                                                                                          | generated, plus the queue       | when checked and the ledger updated                                                 |
| [`flows/`](flows/)                     | Cross-product journeys that do not work end to end                                                                                                                                         | by hand                         | when every flow works                                                               |
| [`codex-reaudit/`](codex-reaudit/)     | Codex's 2026-09-29 read-only re-audit, triaged: open defects and half-built work, new capabilities for the owner to review, and future risks to watch                                      | by hand                         | each entry, when fixed, decided or no longer applicable                             |
| [`decisions/`](decisions/)             | Product calls the code cannot settle (`founder-decisions.md`), open design questions (`open-questions.md`), and actions only the founder can take (`founder-actions.md`)                   | by hand                         | each entry, when it is decided or done; decisions are recorded in `docs/decisions/` |
| [`doc-corrections/`](doc-corrections/) | Documents that disagree with the code, and what to correct                                                                                                                                 | by hand                         | when every listed document is corrected                                             |
| [`prior-audits/`](prior-audits/)       | Earlier audits, registers and trackers (including `active-issues-register.md` and the `website-launch/` working set), kept until what they report is fixed or split into the folders above | by hand                         | each file, when nothing in it is still open                                         |
| [`overview.md`](overview.md)           | Plain-language summary of the 2026-09-26 audit: what works, and the verdict per surface                                                                                                    | by hand                         | with the last open file                                                             |
| [`ledger/`](ledger/)                   | The capability ledger: 3,435 items, one status per surface, with evidence; and the source inventory it audits                                                                              | agents fixing items             | stays (the record of what is done)                                                  |
| [`registers/`](registers/)             | Guard-checked registers: `ui-gaps`, `capability-gaps`, `code-reachability-inventory`, and `known-flaws.md` (open defect rows, cited by ID from CI and tests)                               | by hand, validated by `check:*` | stays; rows close as work lands                                                     |
| [`baselines/`](baselines/)             | Ratchet baselines for `check:raw-error-to-user`, `check:theme-text-colours`, `check:ui-gaps`                                                                                               | guards                          | stays; shrinks to empty                                                             |

## Tracked elsewhere

These files record open work outside `audit/` because a guard, a tool or code
reads them where they are, or because a feature spec owns its own checklist.
They are listed here so that this folder stays the one index of open work.

| File                                                                                        | What is open in it                                                                                          | Why it stays there                                                                                              |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `docs/specs/jev-auto-routing/tasks.md`                                                      | The unchecked tasks of the Jev Auto routing feature                                                         | A spec owns its own `tasks.md` (`docs/specs/README.md`)                                                         |
| `docs/specs/guardian-phase-3/tasks.md` and the "Known limitations / risks" of its `spec.md` | Guardian phase 3 tasks and limitations                                                                      | Spec-owned; `.agi-guardian.yml` cites task 4. Its external blockers are in `decisions/open-questions.md`        |
| `docs/specs/semantic-decisions/audit.md`, `call-sites.json`, `inventory.csv`                | "Rollout and remaining work"; every decision kind is disabled                                               | Spec-owned; `tools/evals/semantic-decisions/inventory.mjs` reads `call-sites.json`                              |
| `docs/specs/desktop-global-voice/spec.md`                                                   | The release gate for system dictation (`DESKTOP-SYSTEM-DICTATION-UNWIRED-01` in `registers/known-flaws.md`) | The feature spec, cited from the desktop dictation source                                                       |
| `docs/security/security.md`                                                                 | §1.8 and §5.4 known gaps                                                                                    | `check:security-claims` indexes every falsifiable sentence in it against `docs/security/security-claims.json`   |
| `docs/product/surface-feature-matrix.json`                                                  | Absent and unverified feature-by-surface cells                                                              | Held by `check:surface-feature-matrix`; whether to keep it beside `ledger/` is in `decisions/open-questions.md` |
| `tools/evals/prompt-coverage.json`                                                          | Prompts with no eval corpus                                                                                 | A ratchet read by `tools/evals/scripts/prompt-coverage.mjs`                                                     |

## How to resolve an item

1. Pick the next file from `plan/waves.md` and fix the code.
2. In `ledger/ecosystem-capability-ledger.jsonl`, set each fixed cell's `s` to
   `done`, remove its `remaining` and `miss`, and point `ev` at the code that
   now does it (`p` path, `l` line range).
3. Run `pnpm audit:worklist`. The item leaves its file; an emptied file is
   deleted, and `plan/waves.md` is recounted.
4. For a file under `blockers/`, `flows/`, `decisions/`, `doc-corrections/` or
   `prior-audits/`, delete the file (or the entry) yourself once it is fixed.
   For a defect row in `registers/known-flaws.md`, delete the row in the commit
   that fixes it.

`pnpm check:audit-worklist` (part of `pnpm check:llm-operability`) fails when a
generated file is stale or an emptied file was left behind.

## Statuses

A cell is `done` only when a mounted entry point on that surface reaches a real
handler with no stub, no flag that is off by default, and persistence only
through migrations that production has applied (0294 since 2026-09-27; the audit assumed 0273). `partial`
names what is left and which link is missing (`ui`, `handler`, `api`,
`persistence`, `mount`, `flag-off`, `pending-migration`, `states`,
`surface-only`). `missing` means a three-way search (screen copy, code
identifier, route or table) found nothing. `n/a` explains why the surface does
not apply.

The ledger was audited against `21d439536` by reading code only. Where it
disagrees with the running product, the running product wins: correct the
ledger cell.
