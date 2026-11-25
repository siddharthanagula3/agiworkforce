---
id: "F061-09"
type: "feature"
title: "Agent activity history"
aliases: ["Agent activity history", "/agents history", "/agents activity", "/agents log", "Agent activity (S61.22)", "subagents.jsonl audit log"]
area: "61 Persistent agents and agent rosters"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.22"]
depends_on: ["surface:cli", "mode:local", "store:subagents.jsonl", "file:apps/cli/src/subagent_audit.rs", "file:apps/cli/src/agents.rs", "F061-01", "F061-20", "SYS-agents-tools-and-automation", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-09 Agent activity history

In the CLI, /agents history shows the 20 newest runs of named agents: local time, agent name, outcome, files changed and spend, plus any error. /agents history <name> filters to one agent. Runs are kept in a local log file. Web, Desktop, VS Code and Chrome have no history.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.22](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6122).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person review what each named agent did: when, how it ended, how many files it changed and what it cost. (apps/cli/src/agents.rs:1349-1390)

**Why it exists.** To audit agent work and spend after the fact without storing the prompt text. (brief S61.22; apps/cli/src/subagent_audit.rs doc comment)

**Who uses it.** CLI users who run saved agents, subagents with an agent name, or teammates.

**Problems it solves**

- Not knowing which agent made a change or failed.
- Not knowing what an agent cost.
- Keeping a record without leaking file contents the parent read (only prompt length kept).

**Use cases**

- Run /agents history to see the last 20 runs of all agents.
- Run /agents history reviewer to check one agent's recent failures.
- Check the spend of a teammate after a team session.
- See the error text of a failed run.

## 2. User experience

**Where to find it**

- CLI slash command /agents history, aliases /agents activity and /agents log; also listed in the /agents help text as '/agents history [name] show what agents did: runs, outcome, files, spend'. (apps/cli/src/agents.rs:624,866)
- Other apps: not found.

**Before you start**

- CLI installed; at least one finished run of a named agent or teammate.

**Screens and controls**

- Text output only. Optional name argument; flags are skipped when picking the name (first_non_flag).

**Journey**

1. Run a named agent or let a teammate work.
2. Type /agents history or /agents history <name>.
3. Read the lines, newest first.

**What the person sees and gets**

- Header 'Agent activity, newest first' or 'Activity for `<name>`, newest first'.
- Each line: date and time (local, YYYY-MM-DD HH:MM), agent name, outcome (completed, failed, cancelled), '<n> file(s) changed', and spend in credits or 'no usage recorded', then the error if any. (apps/cli/src/agents.rs:1366-1388)
- Empty: 'No recorded runs for agent `<name>` yet.' or 'No recorded agent runs yet.'
- Read failure: 'Could not read agent activity: <error>'.

**Settings**

- None found in the code for history. The log sits in the CLI config directory as subagents.jsonl. (apps/cli/src/subagent_audit.rs:130-132)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Every finished subagent run is appended as one JSON line; running status is not recorded. (apps/cli/src/subagent_audit.rs:56-60,87-96)
- The subagent code calls the recorder on finish and on cancel before start. (apps/cli/src/subagent.rs:725-755)
- Teammate turns are recorded too, with agent set to the teammate name. (apps/cli/src/teams.rs:773-784)
- recent_agent_runs reads the file newest first, skips bad lines, matches names case-insensitively, skips rows with no agent name, takes 20. (apps/cli/src/subagent_audit.rs:98-120; agents.rs:1350)
- Error text and description are sanitized; prompt stored as character count only. (apps/cli/src/subagent_audit.rs:36-85)

**Incomplete**

- Teammate rows always record files_modified 0. (apps/cli/src/teams.rs:783)
- Reads the whole file each time; no rotation or size limit found. [inferred from read_to_string at subagent_audit.rs:101]
- Write failure only logs a warning, so a run can be missing from history. (apps/cli/src/subagent_audit.rs:91-95)

**Present but disconnected or switched off**

- Subagents with no agent name are written to the log but never listed. (apps/cli/src/subagent_audit.rs:112-114)

**Not available**

- History on Web, Desktop, VS Code, Chrome (brief S61.22 missing). Mobile: not listed in the brief for this item.
- Server-side or synced history: none found.
- Filtering by date, outcome or exporting: none found.

## 4. Required behaviour

**Established requirements**

- The user can review the history of what each agent did. (source: brief S61.22)

**Acceptance criteria**

1. /agents history lists at most 20 runs, newest first.
2. /agents history <name> lists only that agent's runs, ignoring letter case.
3. Each line shows local time, agent, outcome, files changed count and spend.
4. A failed run shows its error text.
5. With no runs the exact empty-state text appears for both forms.
6. A subagent without an agent name never appears.
7. The log file never contains the prompt text, only its length.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- History should survive across sessions; the file persists on disk. [inferred from apps/cli/src/subagent_audit.rs:130]

**Proposed improvements** (suggestions, not requirements)

- Offer the same history on Web and Desktop from a synced store. [proposed]
- Count teammate file changes. [proposed]
- Add rotation of the log. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | format_agent_history | `apps/cli/src/agents.rs` | Renders the history text (line 1349). |
| command | render_agents_command history arm | `apps/cli/src/agents.rs` | Routes history, activity, log (line 624). |
| command | is_management_subcommand | `apps/cli/src/agents.rs` | Treats history verbs as management, not agent names (line 566). |
| command | agents help text | `apps/cli/src/agents.rs` | Documents the verb (line 866). |
| command | /agents slash handler | `apps/cli/src/tui/tui_app.rs` | Sends management verbs to the renderer (line 6131). |
| service | recent_agent_runs | `apps/cli/src/subagent_audit.rs` | Reads and filters the log (line 98). |
| service | record_subagent | `apps/cli/src/subagent_audit.rs` | Appends one row; warns on failure (line 87). |
| schema | SubagentAuditEntry | `apps/cli/src/subagent_audit.rs` | Row fields: timestamp, id, agent, description, depth, prompt_chars, outcome, error, usage, files_modified, cwd. |
| schema | SubagentAuditOutcome | `apps/cli/src/subagent_audit.rs` | completed, failed, cancelled. |
| store | subagents.jsonl | `apps/cli/src/subagent_audit.rs` | Log file in the CLI config directory (line 130). |
| service | append_entry_at / sanitize_field | `apps/cli/src/approval_audit.rs` | Shared append and clean-up helpers (imported at subagent_audit.rs:5). |
| service | subagent spawn audit hook | `apps/cli/src/subagent.rs` | Calls record_subagent with agent name, files and usage (lines 725-755). |
| job | teammate audit record | `apps/cli/src/teams.rs` | Records each teammate turn (line 773). |
| service | format_usd_as_credits | `apps/cli/src/cost_ledger.rs` | Turns cost into credits text (used at agents.rs:1368). |
| service | SubagentUsage | `apps/cli/src/subagent.rs` | Usage struct stored in each row (imported in subagent_audit.rs:6). |
| test | subagent_audit tests | `apps/cli/src/subagent_audit.rs` | Four unit tests of rows. |
| test | every_management_verb_is_routed_to_the_renderer_not_to_activation | `apps/cli/src/agents.rs` | Checks history/activity/log routing (line 1704). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A named agent or teammate run finishes; the audit row is built with timestamp, outcome, usage and file count. | device | apps/cli/src/subagent.rs:725-755; apps/cli/src/teams.rs:773 |
| The row is appended to subagents.jsonl in the CLI config directory. | device | apps/cli/src/subagent_audit.rs:87-96,130-132 |
| Person types /agents history; the file is read, parsed line by line, filtered and formatted. | device | apps/cli/src/agents.rs:1349-1390; subagent_audit.rs:98-120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run record: time, agent, description, depth, prompt length, outcome, error, usage with model name and cost, files modified count, working directory | subagents.jsonl in the CLI config directory (store:subagents.jsonl) | No sync code found | Appended forever; no deletion or rotation code found |

**Models and providers.** History uses no model. Each row stores the model name and cost of the run, taken from the run's usage.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code; reads a local file. |
| Permissions | Filesystem read access to the config directory only. |
| Subscription | none found in the code. Spend is displayed in credits; whether the run was included in a subscription is stored (via_subscription) but not shown. (apps/cli/src/subagent_audit.rs tests; subagent.rs SubagentUsage) |
| Limits and metering | Shows 20 rows. (apps/cli/src/agents.rs:1350) |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device with no network. Runs with a local model would show their recorded cost; how cost is computed for local models is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Exact empty-state strings by name or overall. | apps/cli/src/agents.rs:1354-1359 |
| Log file missing | Treated as empty. | apps/cli/src/subagent_audit.rs:100-104 |
| Unreadable file | 'Could not read agent activity: ...'. | apps/cli/src/agents.rs:1351-1352 |
| Corrupt line | Skipped silently. | apps/cli/src/subagent_audit.rs:108 |
| Bad timestamp | Raw timestamp shown. | apps/cli/src/agents.rs:1368-1376 |
| No usage | Shows 'no usage recorded'. | apps/cli/src/agents.rs:1378-1381 |
| Cancelled before start | Recorded as cancelled with no usage. | apps/cli/src/subagent.rs:752-755 |
| Name with different case | Matches. | apps/cli/src/subagent_audit.rs:111 |
| Accessibility and other apps | Text only; no history on other apps. Not handled in the code. | apps/cli/src/agents.rs:1349-1390 builds plain text lines only |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/subagent_audit.rs (tests)`: Running run not audited; completed row keeps outcome, usage, prompt length; failed row error sanitized; rows append as JSONL.
- `apps/cli/src/agents.rs (tests)`: history, activity, log routed as management verbs. No test of format_agent_history output or recent_agent_runs filtering found.

**Test scenarios**

- **List all**
  1. Run two named agents
  2. Type /agents history
  - Expected: Two lines, newest first, with outcome, files and spend.
- **Filter**
  1. Type /agents history Reviewer where agent is saved as reviewer
  - Expected: Only reviewer rows.
- **Empty**
  1. Use a fresh config directory
  2. Type /agents history and /agents history x
  - Expected: 'No recorded agent runs yet.' and 'No recorded runs for agent `x` yet.'
- **Failure**
  1. Run an agent that fails with a provider error
  - Expected: Row shows failed and the error text.
- **Privacy**
  1. Run an agent with a distinctive prompt
  2. Open subagents.jsonl
  - Expected: prompt_chars present, prompt text absent.
- **Unnamed subagent**
  1. Spawn a subagent without an agent name
  - Expected: Not listed in history.

**Where to look when it fails**

- Warning log 'failed to append CLI subagent audit entry'.
- Error text 'Could not read agent activity'.
- File subagents.jsonl in the CLI config directory.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)

## 10. Gaps and dependencies

- **No history on other apps** Affects: Web, Desktop, VS Code, Chrome users. Evidence: brief S61.22. Work needed: Design a synced run record and a history view per app.
- **Teammate files changed always 0** Affects: CLI team users reading history. Evidence: apps/cli/src/teams.rs:783. Work needed: Count files modified per teammate turn.
- **No test of the history output or filter** Affects: Maintainers. Evidence: grep of apps/cli found no test calling recent_agent_runs or format_agent_history. Work needed: Add tests with a temp config directory.
- **No retention, size limit or delete for the log** Affects: Heavy CLI users. Evidence: apps/cli/src/subagent_audit.rs:98-120. Work needed: Decide retention and add rotation.
- **History is per device, not per account** Affects: Users with several machines. Evidence: local file path (subagent_audit.rs:130). Work needed: Decide on sync.
- Not built on: Web, Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:local
- store:subagents.jsonl
- file:apps/cli/src/subagent_audit.rs
- file:apps/cli/src/agents.rs
- F061-01
- F061-20
- SYS-agents-tools-and-automation
- SYS-observability-and-operations

## Unknown

- How cost is computed and displayed for local models.
- Whether the TUI agent picker shows history.
- Whether the config directory path differs per platform (resolved by CliConfig::config_dir, not opened).
- Whether any doc under docs/ describes the history command.
