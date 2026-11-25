---
id: "F072-08"
type: "feature"
title: "Exit codes and CI automation"
aliases: ["exit-code contract", "sysexits codes", "CI mode", "--max-budget-usd", "--auto-approve-plan", "--mode dontAsk", "--allowedTools", "S72.09", "S72.37"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.09", "S72.37"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/errors.rs", "file:apps/cli/src/lib.rs", "file:crates/agiworkforce-agent-core/src/engine.rs", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F072-07", "F072-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-08 Exit codes and CI automation

The CLI (surface:cli only) ends with a status that tells scripts what kind of failure happened: 1, 65, 69, 75, 76, 77 or 78, never 2. Flags let CI run without prompts: a spend cap, automatic plan approval, a no-prompt permission mode and a tool allow list. Several statuses outside the contract also exist.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.09](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7209), [S72.37](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7237).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Maps every failure to one exit class (apps/cli/src/errors.rs:246-280, 864-897), maps raw network errors to 69 or 75 (apps/cli/src/lib.rs:8829-8845), and gives unattended runs a budget cap and approval policy flags (apps/cli/src/lib.rs:381-392, 487-492).

**Why it exists.** A CI job must branch on why a run failed: an expired sign-in, an unreachable host and a bad input are different problems (apps/cli/src/errors.rs:240-245 comment).

**Who uses it.** CI authors, script writers and wrapper tools around surface:cli.

**Problems it solves**

- Telling retryable failures (75) from permanent ones.
- Telling sign-in problems (77) from plan or configuration problems (78).
- Stopping a runaway unattended run by spend.
- Running with no human to answer approval prompts.

**Use cases**

- A pipeline retries on 75 and 69 and pages a human on 77 and 78.
- A nightly job runs `agi exec` with `--max-budget-usd` to cap cost.
- A plan-mode run uses `--auto-approve-plan` so no one has to type `/plan accept`.
- A wrapper refuses to continue when status 76 says the CLI is too old.

## 2. User experience

**Where to find it**

- surface:cli: the process exit status (`echo $?`); flags `--max-budget-usd <USD>`, `--auto-approve-plan`, `--mode`/`--permission-mode` (value `dontAsk`), `--allowedTools`/`--disallowedTools`, `-y`, `--full-auto` on exec (apps/cli/src/lib.rs:316-392, 487-492, 770-772). No UI on other apps.

**Before you start**

- A non-interactive invocation (`agi exec`, or `agi "prompt"`).
- For headless file changes, a flag that permits them: `--full-auto`, `--permission-mode auto` or `--dangerously-skip-permissions` (apps/cli/src/features/exec/tools/file_ops/mod.rs:96-97).

**Screens and controls**

- No screen. Controls are flags only.
- stderr shows the cause, for example the refusal text `...requires approval and stdin is not a terminal...` (apps/cli/src/features/exec/tools/file_ops/mod.rs:104-118).

**Journey**

1. 1. Script runs `agi exec "<task>" --max-budget-usd 2 --mode dontAsk`.
2. 2. The CLI runs the turn; a headless tool that needs approval is refused and marked.
3. 3. The process ends; run_to_exit_code maps the outcome (apps/cli/src/lib.rs:8797-8821).
4. 4. The script reads the status and, in JSON modes, the `kind` field.

**What the person sees and gets**

- Exit status.
- stderr error text; error JSON `kind` and `hint` (apps/cli/src/errors.rs:459-475).
- On budget stop: the line `Budget cap reached: ... Stopping agent loop.` (apps/cli/src/agent/chat.rs:3687-3699), plus a machine event in stream-json (status_update, budget_exhausted) or --json-events (budget_exhausted) only (apps/cli/src/lib.rs:6365-6366, 9246-9250, 9279-9291).

**Settings**

- Permission mode default in config (`default.permission_mode`); a stored bypass mode is refused (apps/cli/src/cli_options.rs:27-33).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Seven classes with distinct codes 1, 65, 69, 75, 76, 77, 78; 2 is reserved for the parser (apps/cli/src/errors.rs:246-296).
- Every CliError variant answers an exit class (apps/cli/src/errors.rs:864-897): signed out or bad key 77; config 78; plan excludes model, paywall, usage limit 78; server error or network or model unavailable 69; rate limit or retryable stream 75; context overflow 65; client too old 76.
- A raw HTTP timeout maps to 75 and a connect error to 69 (apps/cli/src/lib.rs:8829-8845).
- A headless change that was refused makes an otherwise successful run exit 1 (apps/cli/src/lib.rs:8813; apps/cli/src/features/exec/tools/file_ops/mod.rs:96-118).
- Ctrl+C exits 130 after killing tool processes (apps/cli/src/lib.rs:8633-8637).
- A closed output pipe exits 141 (apps/cli/src/broken_pipe.rs:7).
- `--max-budget-usd` stops the tool loop when spend reaches the cap, checked after the first completion and after each continuation (crates/agiworkforce-agent-core/src/engine.rs:79-87, 282-290).
- Teammates started by the lead get the remaining budget only (apps/cli/src/agent/chat.rs:1901-1926).

**Incomplete**

- Budget stop returns normally, so the exit status is most likely 0, not a distinct code [inferred from crates/agiworkforce-agent-core/src/engine.rs:79-87 and tests at crates/agiworkforce-agent-core/tests/turn_loop.rs:680-730]. The brief's contract names no budget code.
- Budget machine events are emitted only with stream-json or --json-events; text and json modes get none (apps/cli/src/lib.rs:9246-9250 comment).
- `agi update --check` exits 1 when a newer release exists (apps/cli/src/lib.rs:6573-6578), a generic code outside the table's meaning.
- An untrusted folder in headless use ends with a plain error (apps/cli/src/lib.rs:6160-6167) that has no CliError, so it exits 1 [inferred from apps/cli/src/lib.rs:8829-8845].
- `agi doctor` returns success even when checks fail (apps/cli/src/doctor.rs:49-57).
- `-p` does not mean print (apps/cli/src/lib.rs:195).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Budget flags and exit classes exist only on surface:cli; other apps have no exit codes.

## 4. Required behaviour

**Established requirements**

- Exit status distinguishes failure classes: 1 generic, 65 data, 69 unavailable, 75 temporary, 76 too old, 77 not permitted, 78 configuration; 2 reserved for usage. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.09)
- CI scripts can drive the CLI non-interactively with machine output, auto-approval policy, spend cap and meaningful exit codes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.37)
- Code 2 is never produced by the CLI's own classes. (source: apps/cli/src/errors.rs:262-296)
- Paywall and usage-limit failures exit 78. (source: apps/cli/src/errors.rs:200-210, 891-894)

**Acceptance criteria**

1. A signed-out Cloud run exits 77.
2. A missing config value or plan exclusion exits 78.
3. A refused connection exits 69; a request timeout exits 75.
4. A context-overflow failure exits 65.
5. A headless run that needed approval for a file change exits 1 and prints the flag hint.
6. Parser errors exit 2 and no CliError uses 2.
7. With --max-budget-usd below the first completion's cost, no tool runs after it and a budget event appears in stream-json.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every non-zero status outside the seven classes (130, 141, update --check 1) should be listed in the public contract [inferred].
- A budget stop should be distinguishable by a script [inferred from S72.37 wording `meaningful exit codes`].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give budget exhaustion its own exit status or a field in the JSON result.
- [proposed] Make `agi doctor` exit non-zero when overall status is Fail, behind a flag.
- [proposed] Publish the full status table (including 130 and 141) in `--help` and docs/runbooks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ExitClass | `apps/cli/src/errors.rs` | Seven classes, codes, labels, USAGE_EXIT_CODE (246-296). |
| service | CliError::exit_class | `apps/cli/src/errors.rs` | Maps each error variant to a class (864-902). |
| service | CliError::turn_failure | `apps/cli/src/errors.rs` | Maps errors to protocol failure codes shared with other surfaces (904-1000). |
| service | run_to_exit_code | `apps/cli/src/lib.rs` | Final status: success, failure on refused change, broken pipe, mapped error (8797-8821). |
| service | exit_code_for | `apps/cli/src/lib.rs` | Reads CliError or reqwest timeout/connect from the error chain (8829-8845). |
| service | exit_interrupted | `apps/cli/src/lib.rs` | Kills process trees and exits 130 (8633-8637). |
| service | headless_change_was_refused | `apps/cli/src/features/exec/tools/file_ops/mod.rs` | Flag set when a change needed approval with no terminal (96-118). |
| service | broken pipe handling | `apps/cli/src/broken_pipe.rs` | Exit 141 when a reader closes stdout. |
| command | --max-budget-usd | `apps/cli/src/lib.rs` | Flag (487-492) and wiring (6365-6366, 9246-9291). |
| service | budget guard | `crates/agiworkforce-agent-core/src/engine.rs` | Stops the loop at the cap, emits BudgetExceeded (79-87, 282-290). |
| service | budget narration | `apps/cli/src/agent/chat.rs` | Prints the cap line and calls the sink (3687-3699). |
| command | --auto-approve-plan / --mode / --allowedTools | `apps/cli/src/lib.rs` | CI approval flags (381-392). |
| schema | PermissionMode | `apps/cli/src/cli_options.rs` | Values including dontAsk (10-25). |
| test | errors.rs tests | `apps/cli/src/errors.rs` | Exit class table and distinct codes (2060-2140, 2248-2262). |
| test | turn_loop tests | `crates/agiworkforce-agent-core/tests/turn_loop.rs` | Budget cap behaviour (680-730). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A failure arises in the run (auth, network, tool, plan, usage). | device | apps/cli/src/errors.rs:864-897 |
| Some failures originate from our servers (paywall, usage limit, plan excluded) and are classified on the device. | our servers | apps/cli/src/errors.rs:200-215 |
| The device maps the error to an exit class and the process exits. | device | apps/cli/src/lib.rs:8797-8845 |
| Budget: after each completion the engine compares spend to the cap and stops the loop. | device | crates/agiworkforce-agent-core/src/engine.rs:79-87, 282-290 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cumulative session spend | In-memory cost ledger of the session | Managed turns are also metered on our servers (unknown detail) | Per session; saved with the session record when persistence is on |

**Models and providers.** Spend is computed from model pricing known to the CLI; a Local model costs zero [inferred from apps/cli/src/output.rs:779-785]. Provider errors are classified by status and message across vendors (apps/cli/src/errors.rs:12-60).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Exit 77 when not signed in and no key route exists (apps/cli/src/errors.rs:868-869). |
| Permissions | --mode dontAsk: only pre-approved safe work runs (apps/cli/src/cli_options.rs:22-24). -y approves reads, searches and listings only (apps/cli/src/features/exec/tools/file_ops/mod.rs:96-97). |
| Subscription | Paywall and usage-limit responses become exit 78; they come from the server's 429 with kind paywall (apps/cli/src/errors.rs:200-210). Plan table: doc: docs/product/definition.md:294-301. |
| Limits and metering | --max-budget-usd is a per-run cap in USD shown as credits (apps/cli/src/agent/chat.rs:3690-3696); server quota is separate. |
| Feature flags | none found in the code for the exit contract. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Exit classes apply the same in Local mode; a Local model has zero cost so a budget never trips [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Timeout | 75 (reqwest timeout) or a retryable stream/rate-limit error. | apps/cli/src/lib.rs:8829-8845; apps/cli/src/errors.rs:884-889 |
| Offline | 69 for connect error or Network error. | apps/cli/src/lib.rs:8837-8840; apps/cli/src/errors.rs:882 |
| Cancel | 130. | apps/cli/src/lib.rs:8633-8637 |
| Budget reached | Loop stops, warning line, event in some modes; exit most likely 0 [inferred]. | crates/agiworkforce-agent-core/src/engine.rs:79-87 |
| Approval needed, no terminal | Tool refused, run ends non-zero (1). | apps/cli/src/features/exec/tools/file_ops/mod.rs:104-118 |
| Untrusted folder, no terminal | Fails with the trust message before any model call. | apps/cli/src/lib.rs:6160-6167 |
| Retry | Automatic retry and model fallback exist (fallback chain), not an exit-code feature. | apps/cli/src/lib.rs:6279-6283 |
| Accessibility | not handled in the code (exit status is not a display). | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/errors.rs`: Each failure kind exits on its own class, never on the parser status; every class has a distinct code and sentence; incomplete turns exit by retryability (tests at 2060, 2126, 2248).
- `crates/agiworkforce-agent-core/tests/turn_loop.rs`: Budget cap trips, emits event, stops tool side effects (tests at 692-730).
- `apps/cli/src/lib.rs`: max_budget_usd flag parses; exec resolves permissions like an interactive run; mode wins over permission-mode (tests at 10645-10800).
- `apps/cli/tests/broken_pipe.rs`: SIGPIPE status when a reader stops early.

**Test scenarios**

- **Signed-out Cloud run**
  1. Run `agi logout`.
  2. Run `agi exec "hi" -m <a cloud-only model>`; echo $?
  - Expected: Exit 77 and a message naming `agi login`.
- **Unreachable host**
  1. Set AGIWORKFORCE_API_BASE to a closed local port is refused; instead block the network.
  2. Run a Cloud turn.
  - Expected: Exit 69 (or 75 on timeout).
- **Headless edit refused**
  1. In a trusted repo run `agi exec "create file x" -y </dev/null`.
  - Expected: Refusal text naming --full-auto; exit 1.
- **Budget**
  1. Run `agi --output-format stream-json --max-budget-usd 0.0001 "use tools to list files"`.
  - Expected: A status_update with reason budget_exhausted, no further tool run; record the exit status (unknown today).
- **Interrupt**
  1. Start a long run and press Ctrl+C; echo $?
  - Expected: Exit 130.

**Where to look when it fails**

- stderr `Error:` line (apps/cli/src/lib.rs:8823-8827).
- JSON `kind` values (apps/cli/src/errors.rs:2060-2085 expected table).
- Trust message text (apps/cli/src/lib.rs:6167).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **Budget stop has no distinct exit status and no machine event in text or json modes.** Affects: surface:cli CI users using --max-budget-usd. Evidence: crates/agiworkforce-agent-core/src/engine.rs:79-87; apps/cli/src/lib.rs:9246-9250. Work needed: Define the status and event; add a test.
- **Statuses 130, 141 and `update --check` 1 are outside the stated contract.** Affects: surface:cli scripts. Evidence: apps/cli/src/lib.rs:8633-8637, 6573-6578; apps/cli/src/broken_pipe.rs:7. Work needed: Document them or fold them into the contract.
- **Untrusted-folder failure has no class (likely 1) though it needs user action like 78.** Affects: surface:cli CI. Evidence: apps/cli/src/lib.rs:6160-6167. Work needed: Return a CliError::Config.
- **`agi doctor` always exits 0.** Affects: surface:cli CI health checks. Evidence: apps/cli/src/doctor.rs:49-57. Work needed: Optional strict flag.
- **No binary-level test of exit statuses.** Affects: surface:cli. Evidence: apps/cli/tests/ has no exit-code test. Work needed: Add tests that spawn the binary.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/errors.rs
- file:apps/cli/src/lib.rs
- file:crates/agiworkforce-agent-core/src/engine.rs
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F072-07
- F072-10

## Unknown

- The actual exit status after a budget stop (inferred 0).
- Whether server-side enforcement refuses CLI use on plans below Premium.
- Exit status of `--json-events` runs when the error event is emitted (apps/cli/src/lib.rs:6460-6490 ends with exit_with_error, so the class code, but not run).
- Whether `-y` plus `dontAsk` combine as the flag help implies.
