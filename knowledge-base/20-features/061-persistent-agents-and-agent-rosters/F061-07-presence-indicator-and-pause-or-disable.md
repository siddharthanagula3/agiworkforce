---
id: "F061-07"
type: "feature"
title: "Presence indicator and pause or disable"
aliases: ["Presence indicator and pause or disable", "Presence/activity indicator (S61.11)", "Agent pause/disable (S61.19)", "Teammate status", "/team status", "TeammateIdle hook"]
area: "61 Persistent agents and agent rosters"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "n/a", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.11", "S61.19"]
depends_on: ["surface:cli", "mode:local", "file:apps/cli/src/teams.rs", "file:apps/cli/src/agents.rs", "F061-01", "F061-14", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-07 Presence indicator and pause or disable

The plan is a status (working, idle, offline) beside each saved agent and a switch to pause or disable it. Neither exists for saved agents on any app. Only live teammates in a CLI team session have a status and a stop command, and those vanish when the session ends.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.11](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6111), [S61.19](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6119).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Planned: show whether each persistent agent is working, idle or offline in the agent roster, and let the user switch an agent off until switched back on. Today the CLI has a narrower thing: live teammates in an agent-team session carry an Active, Idle or Completed status, shown by /team, and can be stopped with /team stop. (brief S61.11, S61.19; apps/cli/src/teams.rs:24-26)

**Why it exists.** A person who owns several agents needs to see which one is busy and needs a way to make one stop acting without deleting it. (brief S61.11, S61.19 'Should')

**Who uses it.** CLI users who start a session with --team (or AGI_TEAM=1) and let the lead spawn teammates. Saved-agent owners on every app would use the planned version. (apps/cli/src/teams.rs:819)

**Problems it solves**

- Not knowing whether a teammate is still working or waiting for a message (apps/cli/src/teams.rs:855-857).
- Stopping a teammate that is running up cost or going the wrong way (apps/cli/src/teams.rs:460-467).
- Lets a user hook automation to the moment a teammate goes idle (apps/cli/src/teams.rs:566-590).

**Use cases**

- In a team session, type /team to see 'alice: researcher, working' or 'idle, waiting for a message'.
- Type /team stop alice to end a runaway teammate.
- Configure a TeammateIdle hook that runs a script whenever a teammate finishes a turn.
- Planned: pause a nightly-report agent for a week without deleting it. [proposed]

## 2. User experience

**Where to find it**

- CLI only, and only when agi is started with --team or AGI_TEAM=1: slash command /team (alias form '/team status'). Without the flag it replies 'Agent teams are off in this session.' (apps/cli/src/teams.rs:817-821; apps/cli/src/lib.rs:8291-8292)
- Web, Desktop, VS Code, Chrome: nothing found; brief marks missing. Mobile: n/a. (brief S61.11, S61.19)
- Saved-agent roster in CLI (/agents picker, /agents list) shows no status. [inferred from apps/cli/src/agents.rs:866 help text listing no status or pause verb]

**Before you start**

- CLI session started with --team or AGI_TEAM set to 1 or true.
- At least one teammate spawned by the lead (spawn_teammate tool). (apps/cli/src/agent/chat.rs:1915)

**Screens and controls**

- /team prints a 'Team' block: the lead line, then one line per teammate sorted by name: '<name>: <role>, <state>' where state is 'working', 'idle, waiting for a message' or 'stopped'. Shared tasks and the last 10 messages follow. (apps/cli/src/teams.rs:845-895)
- /team stop <name> sets the teammate's stop flag. /team <name> <message> sends it a message. (apps/cli/src/teams.rs:824-841)
- No pause, no resume, no disable control exists.

**Journey**

1. Start the CLI with --team.
2. Ask the lead to spawn teammates.
3. Type /team to read each teammate's state.
4. Optionally type /team stop <name>; the reply is 'Stopping teammate '<name>'.'
5. Check /team again; the teammate shows 'stopped' once its loop ends.

**What the person sees and gets**

- Text status lines in the chat.
- A message to a stopped teammate is refused with 'Teammate '<name>' has stopped and will not read new messages.' (apps/cli/src/teams.rs:353-366)
- TeammateIdle hook output depends on the hook the user configured (unknown).

**Settings**

- --team flag and AGI_TEAM environment variable turn teams on (apps/cli/src/lib.rs:342,8291).
- Hooks configuration with a TeammateIdle event (apps/cli/src/features/hooks/hooks.rs:218).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Teammate status enum Active/Idle/Completed, set Active when a turn starts, Idle after a reply is sent to the lead, Completed when the loop ends. (apps/cli/src/teams.rs:24-26,725,806,813)
- /team lists those states in words. (apps/cli/src/teams.rs:855-857)
- /team stop and stop_all set an atomic stop flag; the running turn is abandoned and the loop exits. (apps/cli/src/teams.rs:460-474,681-684,758)
- TeammateIdle hook fires with the teammate name as message when status becomes Idle. (apps/cli/src/teams.rs:574-589)

**Incomplete**

- The status lives only in memory in the TeamManager; it is gone when the session ends. [inferred from apps/cli/src/teams.rs:141,241 holding it in Arc<RwLock<HashMap>>; no persistence code found]
- Stop is final: no code resumes a stopped teammate (the only flag write is true). (apps/cli/src/teams.rs:465)

**Present but disconnected or switched off**

- All team features are off unless --team/AGI_TEAM is set. (apps/cli/src/teams.rs:819)

**Not available**

- Status for saved agents (files in the agents store) on every app: none found. (brief S61.11)
- Pause/disable and re-enable of a saved agent on every app: none found. (brief S61.19)
- Offline state: the enum has no such value. (apps/cli/src/teams.rs:24-26)
- Any status on Web, Desktop, VS Code, Chrome. Mobile does not apply.

## 4. Required behaviour

**Established requirements**

- The roster shows whether each agent is working, idle or offline. (source: brief S61.11)
- The user can pause or disable an agent so it stops acting until re-enabled. (source: brief S61.19)

**Acceptance criteria**

1. A saved agent in the roster shows one of working, idle or offline on Web, Desktop, CLI, VS Code and Chrome.
2. Pausing an agent stops it starting new runs, including scheduled ones, until it is re-enabled.
3. A paused agent stays in the roster with its settings and history.
4. The paused state survives restart and syncs across the user's apps.
5. In the CLI today, /team shows 'working' during a turn and 'idle, waiting for a message' after the reply.
6. /team stop <name> makes later messages to that teammate fail with 'has stopped'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pause should be enforced where runs start (server for Cloud, device for Local), not only hidden in the UI. [inferred]
- The existing stop flag is a one-way kill, not a pause. [inferred from apps/cli/src/teams.rs:465]

**Proposed improvements** (suggestions, not requirements)

- Add a persisted enabled flag to the agent definition and a /agents pause and /agents resume pair. [proposed]
- Reuse the teammate status words in the roster so one vocabulary covers both. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | TeammateStatus enum | `apps/cli/src/teams.rs` | Active, Idle, Completed values for a live teammate (line 24). |
| service | TeamManager.update_teammate_status | `apps/cli/src/teams.rs` | Writes the status and runs the TeammateIdle hook when Idle (line 567). |
| service | TeamManager.stop_teammate / stop_all | `apps/cli/src/teams.rs` | Sets the stop flag for one or all teammates (lines 460, 470). |
| job | run_teammate loop | `apps/cli/src/teams.rs` | Runs turns, flips status Active/Idle/Completed, waits for messages polling every 500 ms (lines 14, 687-814). |
| command | team_command (/team) | `apps/cli/src/teams.rs` | Renders status, sends messages, stops teammates (line 815). |
| command | /agents handler | `apps/cli/src/tui/tui_app.rs` | Slash command for saved agents; has no status or pause verb (line 6131). |
| command | agents help text | `apps/cli/src/agents.rs` | Lists the management verbs; none is pause (line 866). |
| event | HookEvent::TeammateIdle | `apps/cli/src/features/hooks/hooks.rs` | Hook event name, parsing and display (lines 218, 266, 368). |
| config | --team flag / AGI_TEAM | `apps/cli/src/lib.rs` | Turns team mode on (lines 342, 8291). |
| service | spawn_teammate launch | `apps/cli/src/agent/chat.rs` | Builds the TeammateLaunch the lead uses (line 1915). |
| test | stopped_teammates_refuse_new_messages | `apps/cli/src/teams.rs` | Unit test of the stop behaviour (line 1312). |
| test | team module tests | `apps/cli/src/teams.rs` | Tests for messages, tasks and stop_all in the same file (lines ~1290-1577). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types /team in the CLI; the command reads the in-memory teammate map and prints states. | device | apps/cli/src/teams.rs:815-895 |
| Person types /team stop <name>; the stop flag is set; the running model call is dropped by a select and the loop ends with status Completed. | device | apps/cli/src/teams.rs:460-467,758,813 |
| A teammate turn itself calls the chosen model provider through the session; this is the only network part. | outside service | apps/cli/src/teams.rs:753-759 (session.send); provider unknown without reading the route |
| On Idle, the configured TeammateIdle hook command runs locally. | device | apps/cli/src/teams.rs:574-589 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Teammate status and stop flags | Process memory in TeamManager (teammates and stops maps) | No | Lost when the session ends [inferred; no persistence found] |

**Models and providers.** The status feature itself uses no model. Each teammate's turn uses the model route inherited from the lead session (apps/cli/src/agent/chat.rs:1918 InheritedRoute).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account check in the status or stop code. none found in the code |
| Permissions | Teammates inherit the lead's permission mode and tool allow/deny lists. (apps/cli/src/agent/chat.rs:1920-1923) |
| Subscription | none found in the code for status or stop. Teammate turns are metered like any CLI turn. |
| Limits and metering | A team spend cap divides the remaining budget among live teammates; a teammate that hits it reports to the lead and stops. (apps/cli/src/teams.rs:731-750) |
| Feature flags | --team flag or AGI_TEAM=1/true. (apps/cli/src/lib.rs:8291-8292) |
| Model compatibility | none found in the code that restricts it. |
| Provider restrictions | none found in the code. |
| Local mode | Status and stop run entirely on the device. Whether a teammate can use a local model depends on the inherited route; unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Teams off | /team replies 'Agent teams are off in this session.' | apps/cli/src/teams.rs:817-821 |
| No teammates | Prints 'No teammates yet. Ask the lead to spawn some.' | apps/cli/src/teams.rs:845-848 |
| Stop unknown name | stop_teammate returns an error, shown as text. | apps/cli/src/teams.rs:461-464 |
| Message to stopped teammate | Refused with 'has stopped and will not read new messages'. | apps/cli/src/teams.rs:353-366 |
| Session ends or restarts | Status is gone; not handled in the code. | no persistence found in apps/cli/src/teams.rs |
| Accessibility | Plain text output; no separate accessible indicator. Not handled in the code. | apps/cli/src/teams.rs:855-857 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/teams.rs (test module)`: Stopped teammates refuse messages; stop_all; message and task rules.
- `apps/cli/src/tui/tui_app.rs (test module)`: Teammate message shows its sender in the thread (lines ~11527-11600). No test of /team status text was found.

**Test scenarios**

- **Status words**
  1. Start agi --team
  2. Ask the lead to spawn a teammate with a long task
  3. Type /team during the task, then after it replies
  - Expected: First 'working', then 'idle, waiting for a message'.
- **Stop**
  1. Type /team stop <name>
  2. Type /team <name> hello
  - Expected: 'Stopping teammate' then an error saying it has stopped; /team shows 'stopped'.
- **Idle hook**
  1. Configure a TeammateIdle hook that writes a file
  2. Let a teammate finish a turn
  - Expected: The hook runs once per idle transition with the teammate name.
- **Teams off**
  1. Start agi without --team
  2. Type /team
  - Expected: Message that teams are off.
- **Saved agent has no status**
  1. Run /agents list
  - Expected: No working/idle/offline marker and no pause control (confirms the gap).

**Where to look when it fails**

- Reply text 'Agent teams are off in this session.'
- Hook run logs from apps/cli/src/features/hooks/hooks.rs (log lines unknown).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/cli/061-persistent-agents-and-agent-rosters.md)

## 10. Gaps and dependencies

- **No presence indicator for saved agents** Affects: All users on Web, Desktop, CLI, VS Code, Chrome. Evidence: brief S61.11 statuses; apps/cli/src/agents.rs has no status field in help text (line 866). Work needed: Define a persisted run-state model per agent and render it in each roster.
- **No pause or disable for saved agents** Affects: All users on all apps. Evidence: brief S61.19. Work needed: Add an enabled flag, enforce at run start, add controls and confirm copy.
- **No Offline state and no resume after stop** Affects: CLI team users. Evidence: apps/cli/src/teams.rs:24-26,465. Work needed: Extend the status model and add resume.
- **Teammate status not persisted or synced** Affects: CLI team users. Evidence: apps/cli/src/teams.rs:141. Work needed: Decide whether live status needs to outlive the session.
- Not built on: Web, Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:local
- file:apps/cli/src/teams.rs
- file:apps/cli/src/agents.rs
- F061-01
- F061-14
- SYS-agents-tools-and-automation

## Unknown

- Whether a hook configuration surface in the CLI documents TeammateIdle for users.
- Whether teammates can run on a local model route.
- Whether any app other than the CLI has design work for presence (no file found).
- Exact log lines for hook failures.
