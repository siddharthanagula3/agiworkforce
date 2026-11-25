---
id: "F098-11"
type: "feature"
title: "Automation hooks"
aliases: ["Hook dispatcher", "Automation hooks", "hooks.json", "agi hooks", "/hooks", "S98.23"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.23"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "F098-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-11 Automation hooks

In the CLI, a person can list commands in ~/.agiworkforce/hooks.json to run at set moments, such as before or after a tool call. A hook can block the action, stop the run, rewrite tool input or output, or add context. User hooks run in the OS sandbox unless turned off; plugin hooks always do.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.23](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9823).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs user, plugin and organization-managed commands at 35 named events in the CLI (for example PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, Stop). The hook gets a JSON description on standard input. Its output or exit code can block the action, stop the loop, rewrite tool arguments, add up to 4 KB of context or replace tool output.

**Why it exists.** Lets people and teams enforce rules and automate around the agent: guard dangerous commands, format after edits, redact secrets, log activity. The event names follow Claude Code's so existing habits carry over (doc comment in apps/cli/src/features/hooks/hooks.rs:140-148; doc: docs/product/requirements.md line 1428-1430 lists hooks among plugin contents).

**Who uses it.** CLI users and developers; organization admins through a managed policy; plugin authors who ship hooks.

**Problems it solves**

- Stopping an unsafe tool call before it runs.
- Automating checks after edits.
- Scrubbing secrets from tool output before it is stored.
- Centrally controlling which hooks may run in an organization.

**Use cases**

- Block 'git push' with a PreToolUse hook scoped by if: Bash(git push*).
- Run a formatter after every edit with a PostToolUse hook.
- Inject project context before each prompt with BeforePromptBuild or UserPromptSubmit.
- An admin turns hooks off for the workspace.

## 2. User experience

**Where to find it**

- CLI only. Command 'agi hooks' with list, add and remove (apps/cli/src/lib.rs:833,4925-4934) and the TUI slash command '/hooks' (apps/cli/src/tui/tui_app.rs:6279).
- Config file ~/.agiworkforce/hooks.json (hooks.rs:928-930). The home folder can be changed with the AGIWORKFORCE_HOME setting (apps/cli/tests/coverage_wave2_hooks_agi_events.rs, set_var line).
- Not on web, desktop, mobile, VS Code or Chrome: none found. The app server can add and remove hooks for a connected client (apps/cli/src/app_server/surfaces.rs:1194,1207); which client calls it was not traced: unknown.

**Before you start**

- The CLI installed. No account is needed for the hooks file to work when signed out (cloud/workspace_policy.rs:107-113,341-343).
- On Unix the hooks file should be mode 600 and owned by the current user; another owner refuses to load (hooks.rs:939-1000).

**Screens and controls**

- 'agi hooks' or '/hooks' with no action lists hooks; when none it prints 'No hooks configured.' plus an example (hooks.rs:1872-1880).
- 'hooks add <event> <command>' and 'hooks remove <event> <index>' (hooks.rs:1832-1863).
- List flags shown per hook: [non-blocking], [<n>s timeout], [matcher: ...], [if: ...] (hooks.rs:1892-1906).
- If the admin turned hooks off the list ends 'Your workspace administrator has turned hooks off, so none of these run.' (hooks.rs:1911-1913).

**Journey**

1. Write hooks.json or run 'agi hooks add PostToolUse ./my-hook.sh'.
2. Start a CLI session. The file is loaded, plugin hooks are appended after the user's own, and any managed policy is applied (hooks.rs:892-926,1034-1059).
3. When an event happens, matching hooks run in order. Each gets JSON on standard input.
4. A blocking failure stops later hooks; a block or stop outcome changes what the agent does (hooks.rs:1395-1428; agent/chat.rs:284-322).
5. The person sees a one-line warning for a hook that failed, once per session (hooks.rs:1599-1625).

**What the person sees and gets**

- Hook JSON output: {"decision":"block","reason":...}, {"continue":false}, {"updated_input":{...}}, {"additional_context":"..."} (capped 4096 bytes), {"updated_mcp_tool_output":"..."} (hooks.rs:1179-1262).
- Exit code 2 blocks with the first line of standard error as the reason; any other non-zero exit shows a warning and does not block (hooks.rs:1566,1627-1665).
- Timeout: a blocking hook that times out blocks with 'timed out after Ns, so the action was stopped' (hooks.rs:1649-1659).
- Warnings: 'hooks.json failed to load ..., hooks disabled', 'security warning: hooks.json is group/other-writable', and 'hooks did not run: your workspace policy disallows them or could not be checked' (hooks.rs:901-905; workspace_policy.rs:775-777).

**Settings**

- hooks.json keys: hooks (event to list), sandbox (false runs the person's hooks outside the sandbox) (hooks.rs:513-529).
- Per hook: command, args (program launch without shell), timeout seconds (default 10), blocking (default true), matcher regex, if rule such as Bash(git *) (hooks.rs:26-60).
- Environment variable AGIWORKFORCE_SANDBOX_HOOKS=0 also runs user hooks outside the sandbox (apps/cli/src/sandbox.rs:676; message hooks.rs:1583-1587).
- Managed policy file managed-settings.json: managedHooksOnly, allowPluginHooks, allowedCommands, hooks (managed.rs:1-30).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Load and validate hooks.json; unknown event names are refused with the list of events; old names still load with a one-time deprecation notice (hooks.rs:281-330,339-418).
- 35 events defined (hooks.rs:149-235,1738-1774); each has a call site in the CLI (call sites found for 34 by event name, e.g. PreToolUse agent/chat.rs:298, PostToolUse chat.rs:3276, SessionStart repl/mod.rs:214, tui_app.rs:7073); UserPromptSubmit runs through features/hooks/user_prompt.rs:12.
- Matcher regex and if rule are AND-ed (hooks.rs:1121-1160).
- Run sequentially, stop later hooks after a failed blocking hook (hooks.rs:1395-1428).
- Sandbox rule: plugin hooks always sandboxed; user hooks sandboxed unless 'sandbox': false or the environment variable; managed hooks never (hooks.rs:1431-1454).
- Project-local plugin hooks are blocked; only plugins in ~/.agiworkforce/plugins contribute hooks (hooks.rs:1034-1059).
- Aggregate: Blocked beats Stop beats Continue (hooks.rs:823-870).
- Workspace admin switch: hooks do not run when policy disallows them (hooks.rs:1410; workspace_policy.rs:752-780).
- Add, remove and list from CLI and TUI with one implementation (hooks.rs:1832).

**Incomplete**

- The documented model override for BeforeModelResolve ({"model": ...}, hooks.rs:173) is not read by parse_hook_output (it has no model field, hooks.rs:1168-1262), and the call site ignores the results (apps/cli/src/agent/chat.rs:1423-1436).
- BeforePromptBuild is documented to inject context via additional_context (hooks.rs:178-181), but its call site also drops the results (chat.rs:1404-1417). Whether another path applies it was not found.
- The brief cites hooks.rs:1155 as dispatch and chat.rs:260; at HEAD run_hooks is at hooks.rs:1395 and the PreToolUse handling at agent/chat.rs:284-322; line 1155 is inside hook matching and chat.rs:260 is tool-argument error code. The brief predates HEAD.
- The file header comment (hooks.rs:3-4) names three events but 35 exist.
- Which of the 35 events actually fire in each mode (REPL, TUI, daemon, app server) was not traced for every event: unknown.

**Present but disconnected or switched off**

- Hooks are skipped when the workspace policy turns the 'hooks' feature off, or when a signed-in account has no known policy yet (workspace_policy.rs:359-361,752-780).
- Project-local plugin hooks are blocked on purpose (hooks.rs:1034-1059).

**Not available**

- Web, desktop, mobile, VS Code and Chrome: no hooks (none found in the code; decision doc says no plugin hooks where no user shell runs, doc: docs/decisions/2026-09-27-founder-decisions.md:103-105).

## 4. Required behaviour

**Established requirements**

- A hook dispatcher runs configured hooks at lifecycle events and applies their outcome (S98.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.23)
- Hooks, skills, plugins and subagents are in scope; plugins include hooks. (source: doc: docs/product/requirements.md (lines 370, 1565-1568))
- No plugin hooks where no user shell runs (so hooks are CLI and desktop-with-shell only). (source: doc: docs/decisions/2026-09-27-founder-decisions.md)
- Never weaken guards or trust boundaries; a guard that did not finish must not read as a guard that allowed. (source: doc: AGENTS.md section 9; hooks.rs:1612-1614 comment)

**Acceptance criteria**

1. A hook exiting with code 2 blocks the tool call and shows its standard error line.
2. A blocking hook that times out blocks; a non-blocking one does not.
3. A hook whose matcher or if rule does not match does not run.
4. With {"sandbox": false} a user hook runs on the host; a plugin hook still runs sandboxed.
5. An unknown event name in hooks.json produces an error listing valid events and old names.
6. A hooks.json owned by another user is refused.
7. When the admin turns hooks off, the list says so and no hook runs.
8. A PreToolUse hook returning updated_input changes the tool arguments that run.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local, own-key and Cloud sessions all run hooks the same way, because hooks run on the device and the checks use sign-in state, not mode [inferred from workspace_policy.rs:341-343].
- A hook must not be able to move a Local session to another provider (AGENTS.md section 6); the unapplied model override means this is not a risk today [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Either apply the BeforeModelResolve and BeforePromptBuild results (with a guard that blocks cross-boundary model changes) or remove the promise from the code comments and docs.
- [proposed] Tell the person when hooks are skipped because a policy could not be read, with a retry path.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Hook runner and config | `apps/cli/src/features/hooks/hooks.rs` | Types (26-60), events (149), load (892-1006), plugin merge (1034), matching (1121), output parsing (1191), run_hooks (1395), sandbox rules (1431-1565), failure handling (1627), add/remove/list (1781-1913). |
| service | Managed hook policy | `apps/cli/src/features/hooks/managed.rs` | Organization policy file with allowed commands and plugin-hook switch (lines 1-30). |
| service | UserPromptSubmit check | `apps/cli/src/features/hooks/user_prompt.rs` | Runs hooks when a prompt is submitted (line 12). |
| service | Agent loop dispatch | `apps/cli/src/agent/chat.rs` | PreToolUse outcome (284-322), PostToolUse (3276,3329), tool batch, compaction, subagent, permission and error events. |
| service | REPL dispatch | `apps/cli/src/repl/mod.rs` | SessionStart (214), Stop (658), SessionEnd (696). |
| screen | TUI dispatch and /hooks | `apps/cli/src/tui/tui_app.rs` | SessionStart (7073), SessionEnd (7159), PlanModeChanged, Stop (7912); /hooks handler (6279). |
| service | Daemon dispatch | `apps/cli/src/daemon.rs` | DaemonStarted (334), DaemonStopped (499), CronTriggered, WebhookReceived, FileChanged (1468-1470). |
| service | Tool and MCP dispatch | `apps/cli/src/features/exec/tools/mod.rs` | PermissionRequest (2043-2047); git worktree events in tools/git/mod.rs (158, 222); MCP elicitation in mcp/mod.rs (986-1004). |
| command | agi hooks | `apps/cli/src/lib.rs` | Subcommand (833) and run_hooks_command (4925). |
| endpoint | App server hook edits | `apps/cli/src/app_server/surfaces.rs` | Add and remove hook calls for a connected client (1194, 1207). |
| config | hooks.json | `~/.agiworkforce/hooks.json` (not found) | User hook file, mode 600, owner checked. |
| service | Sandbox helpers | `apps/cli/src/sandbox.rs` | SANDBOX_HOOKS_ENV (676), sandbox settings and credential locations used by hook runs. |
| service | Workspace policy | `apps/cli/src/cloud/workspace_policy.rs` | hooks_allowed (752) and feature_enabled (359). |
| service | Plugin manager | `apps/cli/src/features/plugins/plugins.rs` | Supplies plugin hook declarations (hook_configs) merged at hooks.rs:1034. |
| test | Hook unit tests | `apps/cli/src/features/hooks/hooks.rs` | About 91 tests from line 1915 on. |
| test | Event round-trip tests | `apps/cli/tests/coverage_wave2_hooks_agi_events.rs` | Runs a no-op hook for each AGI-specific event. |
| test | Plugin tests | `apps/cli/tests/coverage_wave2_plugins.rs` | Plugin loading tests (contents not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The CLI loads hooks.json (checks owner and mode on Unix), appends plugin hooks, applies the managed policy. | device | hooks.rs:892-1006 |
| At an event the agent code builds a HookInput and calls run_hooks. | device | agent/chat.rs:296-306 |
| run_hooks filters hooks by matcher and if rule, and returns nothing if the workspace policy disallows hooks. | device | hooks.rs:1395-1411 |
| Each hook starts as a shell line or a program with arguments, sandboxed or on the host, with the JSON on standard input and a timeout. | device | hooks.rs:1456-1565 |
| Output and exit code are turned into block, stop, updated input, context or replaced output; results are combined with Blocked over Stop over Continue. | device | hooks.rs:1191-1262,1667-1740,823-870 |
| For a signed-in account the CLI reads the workspace policy from our servers to learn whether hooks are allowed. | our servers | apps/cli/src/cloud/workspace_policy.rs:331-349,752-780 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Hooks configuration | ~/.agiworkforce/hooks.json on the device | No sync found | Edited by add and remove or by hand |
| Hook input JSON (event, session id, model name, tool name, arguments, output, message) | Passed to the hook process; not stored by the runner | No | Hook's own behaviour; hook rewrites of input are audit-logged with redaction (hooks.rs:1280-1355) |
| Managed policy | managed-settings.json on the device | Delivered by the organization's own means; method unknown | Operator managed |
| Workspace policy cache | CLI tier and policy cache on the device | Fetched from our servers when signed in | Freshness rule in workspace_policy.rs; details not read |

**Models and providers.** No model runs a hook. The input names the session's model. A documented model override is not applied (see incomplete). Hook text goes to the provider only if a hook adds additional_context, which then enters the next model request.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account needed. Signed out, hooks are allowed (signed_out policy, workspace_policy.rs:107-113,341-343). Signed in, hooks need the workspace policy to be known and to allow hooks. |
| Permissions | hooks.json must be owned by the current user; managed policy can allow only listed commands and switch off plugin hooks (managed.rs:12-24). Workspace admin can switch the 'hooks' feature off. |
| Subscription | No plan rule found in the hooks code read. Capability documents were not found to gate hooks: unknown. |
| Limits and metering | Default timeout 10 seconds; additional_context capped at 4096 bytes (hooks.rs:136-138,1179). No usage metering found. |
| Feature flags | AGIWORKFORCE_SANDBOX_HOOKS, 'sandbox' in hooks.json, AGIWORKFORCE_HOME, managed-settings.json keys. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Hooks run entirely on the device in every mode; they work signed out and offline. Inference mode does not change the hook runner [inferred]. A hook command may itself call the network; the user-hook sandbox keeps the network (hooks.rs:1517-1521). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| hooks.json missing | Empty config; 'No hooks configured.' with an example in the list. | hooks.rs:945,1873-1880 |
| hooks.json malformed or foreign-owned | Warning 'hooks.json failed to load ... hooks disabled'; managed hooks still apply if present. | hooks.rs:896-912,975-993 |
| Group or other readable or writable file | Security warning with 'chmod 600' advice; still loads. | hooks.rs:957-974 |
| Invalid regex matcher | Validation error when adding; at run time the hook is skipped. | hooks.rs:111-122,1125-1130 |
| Hook cannot start | A blocking hook blocks with 'could not run'; non-blocking only warns. | hooks.rs:1627-1665 |
| Timeout | Blocking blocks; non-blocking continues. | hooks.rs:1649-1659 |
| Cancel | TurnCancelled event fires when a turn is cancelled (agent/chat.rs:516); cancelling a running hook is not handled beyond its timeout. | chat.rs:516-524 |
| Workspace policy unknown after sign-in | Hooks do not run and a one-line warning shows once per account. | workspace_policy.rs:752-780 |
| Platform without a sandbox | User hook runs as configured. | hooks.rs:1511-1514 |
| Accessibility and app differences | Terminal output is sanitized for control characters in plugin messages; no other accessibility handling found. | hooks.rs:1048-1050 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/features/hooks/hooks.rs`: Inline tests from line 1915: sandbox rules, listing order, timeout, block JSON, exit code 2, non-zero exit, could-not-run, sandbox failure message, aggregation, project-local plugin hooks blocked.
- `apps/cli/tests/coverage_wave2_hooks_agi_events.rs`: Each AGI-specific event name maps to its event and fires a no-op hook.
- `apps/cli/tests/coverage_wave2_plugins.rs`: Plugin loading (contents not read).

**Test scenarios**

- **Exit code 2 blocks**
  1. agi hooks add PreToolUse 'echo nope >&2; exit 2'.
  2. Ask the CLI to run a shell command.
  - Expected: The tool call is not run; 'nope' is shown as the reason.
- **Matcher scoping**
  1. Add a PreToolUse hook with if: Bash(git *) by editing hooks.json.
  2. Run 'git status' and 'ls' through the agent.
  - Expected: Hook fires only for the git command.
- **Sandbox opt-out**
  1. Add a hook that writes outside the workspace.
  2. Run it, then set "sandbox": false and run again.
  - Expected: First fails with the sandbox note naming the opt-out; second writes.
- **Bad event name**
  1. Put "OnSave" as an event in hooks.json.
  2. Start the CLI.
  - Expected: Warning 'hooks.json failed to load: unknown hook event "OnSave". Events: ...' and no hooks run.
- **Admin turns hooks off**
  1. Sign in to a workspace where the 'hooks' feature is off.
  2. Run 'agi hooks list' and trigger a tool call.
  - Expected: List ends with the administrator notice; no hook runs.
- **Model override promise**
  1. Add a BeforeModelResolve hook that prints {"model":"x"}.
  2. Send a prompt.
  - Expected: Current code does not change the model; record the result.

**Where to look when it fails**

- stderr warnings beginning 'warning:' and 'security warning:'; '[plugins] security: hooks ... blocked'.
- HookResult.stderr text 'Failed to execute hook' and 'Hook timed out after Ns'.
- Audit log of rewritten inputs (hooks.rs:1280-1355).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **BeforeModelResolve and BeforePromptBuild results are ignored** Affects: CLI hook authors. Evidence: chat.rs:1404-1436 drops results; hooks.rs:1168-1262 has no model field. Work needed: Apply the outputs with a boundary guard, or remove the claim from comments and docs.
- **Hooks silently unavailable on other apps** Affects: Desktop, VS Code, web users expecting hooks. Evidence: Not found outside apps/cli; decision doc. Work needed: State this in product docs for each surface.
- **Policy-unknown skip is a warning only** Affects: Signed-in CLI users offline. Evidence: workspace_policy.rs:752-780. Work needed: Offer a retry or cached last-known policy.
- **Brief evidence lines are stale** Affects: Maintainers. Evidence: hooks.rs:1155 and chat.rs:260 do not hold dispatch code. Work needed: Refresh the brief's code references.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- F098-08

## Unknown

- Whether each of the 35 events fires in every CLI mode (REPL, TUI, daemon, app server).
- How managed-settings.json reaches a machine.
- Whether any plan or capability denies hooks.
- Which client calls the app-server hook edit methods.
- Contents of coverage_wave2_plugins.rs.
- Policy cache freshness window.
