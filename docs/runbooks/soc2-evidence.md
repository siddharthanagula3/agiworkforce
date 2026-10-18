# SOC 2 evidence collection

Status: Current
Owner: Founder
Last updated: 2026-10-18

One command produces a dated, read-only evidence pack for every SOC 2 control
the company operates, so that when a CPA firm is engaged the evidence already
exists, and so that a Type 2 observation period accumulates it month by month.
The pack is evidence for the auditor to test. It is not a report and it
claims no certification (`docs/compliance/README.md` rule 4).

The pieces:

| Piece          | Path                                                | What it owns                                                                    |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Control list   | `docs/compliance/soc2-controls.json`                | Each control, the criteria it meets, its owner, frequency and evidence          |
| Collector      | `scripts/compliance/collect-soc2-evidence.mjs`      | The read-only collectors, redaction and the pack format                         |
| Guard          | `scripts/check-soc2-controls.mjs`                   | Fails when a control cites a collector that is gone, or a collector proves none |
| Collector test | `scripts/compliance/collect-soc2-evidence.test.mjs` | Catalog validation, redaction and unavailable handling                          |

The catalog is the single list of controls. This runbook does not repeat it:
the pack's `SUMMARY.md` prints every control, which collector backs it, its
cycle 1 scope, the hand-collected items for the period and every control not
yet operated.

Two rules decide what the catalog may say:

- **Operated means running today with passing evidence.** A control that is
  built, documented or designed but has no passing evidence in a pack is
  `not-yet-operated`, with the gap written down. Statuses were reconciled on
  2026-10-18 against the production observations in
  `audit/flows/soc2-readiness-2026-10-18.md`.
- **Cycle 1 is Security plus Confidentiality.** Availability, Processing
  Integrity and Privacy controls stay listed, marked `out-of-scope` for
  cycle 1, so their gaps stay visible until a later cycle takes them in.

## When to run it

- **Monthly during a Type 2 observation window**, on the first working day of
  the month, covering the calendar month just ended. The window length (3 to
  12 months) is set by the CPA firm in the engagement letter.
- Once at the start and once at the end of the window.
- After any change to access, branch protection or the Neon project, so the
  change is captured on the day it happened.

Do not plan to backfill. Commit history and workflow runs can be read again
later, but branch protection, members, MFA status and Neon settings are read
as they are at collection time; a month not collected is a month with no
configuration evidence.

## Before you run it

Each collector is optional. One whose tool or credential is missing is marked
`unavailable` with the reason and the rest still run, so check the list below
for what you want in this month's pack. Inside a collector the same rule holds
per fact: a value the API did not return, such as two-factor status GitHub
hides from the token or Vercel does not expose at all, is recorded as
`{"status": "unavailable", "reason": ...}`, never as `false` or a guess.

| Collectors     | Needs                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `github.*`     | `gh auth login` with read access to the repository                                                |
| Vercel deploys | `vercel login`, and `.vercel/project.json` from `vercel link` (or `--vercel-project <name>`)      |
| Vercel members | `VERCEL_TOKEN` in your shell; the CLI has no member listing, so this one reads the REST API       |
| `neon.*`       | `neonctl auth`, and `NEON_PROJECT_ID` set to the production project id (or `--neon-project <id>`) |
| Dependencies   | `pnpm`; `cargo audit` needs `cargo install cargo-audit`                                           |
| `repo.*`       | A checkout with `node_modules` installed                                                          |

Load tokens from your own shell environment. Never paste one into the command
line, where shell history keeps it.

## Run it

List the collectors and what each reads:

```bash
node scripts/compliance/collect-soc2-evidence.mjs --list
```

Collect last month (dates are UTC days; `--until` is exclusive in practice
because it is midnight of that day):

```bash
NEON_PROJECT_ID=<production project id> \
  node scripts/compliance/collect-soc2-evidence.mjs --since 2026-10-01 --until 2026-11-01
```

Without `--since` and `--until` it covers the last 31 days up to now. Other
flags: `--only <key,key>` runs a subset, `--repo <owner/name>` overrides the
GitHub remote, and `--guard-log <file>` attaches the output of a local guard
chain run (digest, size, time and last 20 lines):

```bash
pnpm check:llm-operability 2>&1 | tee <log file outside the repository>
```

The collector validates the catalog first and collects nothing if the catalog
is broken. It exits 1 when any collector failed with an error rather than
being unavailable, so a scheduled run notices.

The run reads, and never writes, anything outside the pack directory. It
calls `gh api` and `gh run list`, `vercel list`, `vercel inspect` and
`vercel whoami`, `neonctl me`, `neonctl projects get`, `neonctl branches list`
and `neonctl api` GET routes, `pnpm audit`, `cargo audit`, `git log`, and the
repository's own read-only guards. `cargo audit` may refresh its local
advisory database cache.

Every Vercel call goes through one function that permits only `list`,
`inspect` and `whoami`. The Vercel CLI reads any first argument it does not
recognise as a path and deploys it (`vercel --help` shows
`vercel [options] <command | path>` with deploy as the default), so a mistyped
or unsupported subcommand would ship the working tree. CLI 50.1.3 has no
`vercel api` command; never run it to read team data, use `VERCEL_TOKEN`
with this collector or the Vercel MCP read tools instead.

## Where the pack goes

By default `.cache/soc2-evidence/<UTC timestamp>/`, which `.gitignore`
excludes. The collector refuses an output directory inside the repository
that git does not ignore, and one that already holds files.

| File               | Contents                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| `<collector>.json` | One per collector: status, reason when unavailable, the data, the period and the time  |
| `SUMMARY.md`       | Collector results, control table, criteria coverage, the hand checklist and a sign-off |
| `manifest.json`    | Commit, uncommitted file count, catalog digest and a sha256 of every file in the pack  |

Move the pack to the evidence archive outside the repository the same day,
and keep it for the observation period plus whatever retention the CPA firm
asks for. Never commit it, attach it to an issue, or upload it as a workflow
artifact: the pack holds collaborator handles, member names and deployment
records. Emails are reduced to their domain, known token shapes and the run's
own tokens are removed, and secret scanning alerts are counted without their
values, but the pack is still internal.

## Review and sign it

1. Read `SUMMARY.md`. Every `error` row is a collector bug or a vendor outage;
   fix or rerun before signing. An `unavailable` row is acceptable only when
   the reason is one you chose.
2. Read the access section of the GitHub, Vercel and Neon member files and
   remove anyone who should not be there. That review is control AC-01.
3. Collect every hand item in the checklist and file it beside the pack.
4. Write each exception and what was done about it under **Review**, sign and
   date. The signed summary is control GV-08.

## What the collector cannot collect

These come from people and documents, not systems, and the founder keeps
them by hand. The pack's checklist names the ones the catalog requires for
each period; the full set an auditor will ask for is:

- **People**: role descriptions, offer letters, background checks, onboarding
  and offboarding records, code of conduct acknowledgements and security
  awareness training completion, for the founder too. None exists yet.
- **Governance**: the annual risk assessment, including fraud and change
  risk, and minutes of the management review that stands in for a board.
- **Vendors**: each subprocessor's current SOC 2 or ISO report, its signed
  DPA, and a note of the complementary user entity controls it expects. The
  list comes from the `repo.subprocessors` file in the pack, not from memory.
- **Operations**: incident records and postmortems, the pager history export,
  the support access grant trail export, data export and deletion request
  counts, and the commit each production deployment was built from.
- **Account security**: a screenshot of two-factor status for every GitHub
  and Vercel account, which neither API exposes to the tokens used here.
- **Annual sign-offs**: the security document, the continuity, rollback and
  vendor exit plans, and any key rotation that fell due.

## Changing the controls

Edit `docs/compliance/soc2-controls.json`, then run:

```bash
pnpm check:soc2-controls
```

A new collector goes in `COLLECTORS` in the collector module with a test, and
a control must cite it or the guard fails. A control moves from
not-yet-operated to operated only when a pack shows it running and passing,
never because a document describing it was written or the code exists. Set
its `cycle1` to `out-of-scope` only when it cites a criterion outside the
cycle 1 categories; the guard refuses to park a Security or Confidentiality
control there. Change `lastReviewed` when the
catalog is read against the system as a whole.

## Why there is no scheduled workflow

The repository is public, and workflow artifacts on a public repository can
be downloaded by any signed-in GitHub user, so the pack cannot go there.
`GITHUB_TOKEN` also cannot read branch protection, collaborator two-factor
status or any vendor, so a scheduled run would produce the least useful half
of the pack. Run it locally with your own credentials instead.
