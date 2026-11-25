---
id: "F079-10"
type: "feature"
title: "Specialist workers with their own model"
aliases: ["Custom agents", "Agent definitions", "--agent", "/agents", "Specialist workers", "agent persona", "S79.23"]
area: "79 Routing and model-neutral orchestration"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "missing", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S79.23"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "surface:cli", "file:apps/cli/src/agents.rs", "mode:own-key", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-10 Specialist workers with their own model

In the CLI, a markdown file with front matter defines a custom agent. Running agi --agent <name> or choosing it with /agents applies its model, tool limits, turn limit, permission mode and a spend cap to the session. A cap can only lower an existing budget. Agents started by the model do not get their own model.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.23](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7923).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Loads agent definition files from user and project folders and applies them to a CLI session (apps/cli/src/agents.rs:80-139).

**Why it exists.** To let a person keep named specialists with their own prompt, tools, model and cost cap, as other coding agents allow [inferred].

**Who uses it.** CLI users, including teams that commit agent files to a repository.

**Problems it solves**

- Repeating the same instructions and tool limits.
- Running a cheap model for a narrow job.
- Capping spend for a role.

**Use cases**

- A 'reviewer' agent limited to read tools and a small budget.
- A project agent using a specific model for migrations.
- A model-called helper agent narrowed to the parent's tools.

## 2. User experience

**Where to find it**

- CLI flag --agent <name> (apps/cli/src/lib.rs:424-426).
- REPL slash command /agents (apps/cli/src/repl/slash_commands.rs:71).
- Agent files in .agiworkforce/agents/ and .claude/agents/ in a trusted project, and ~/.agiworkforce/agents/ and ~/.claude/agents/ (agents.rs, discover_agents).

**Before you start**

- CLI installed. Project agents load only when the workspace is trusted to supply configuration (agents.rs trusted_project).
- A model named in the file must be switchable in the session.

**Screens and controls**

- Front matter keys read: name, description, model, tools, disallowedTools (or disallowed_tools), maxTurns (or max_turns), permissionMode (or permission_mode), color, skills, mcpServers, maxBudgetUsd (or max_budget_usd); the rest of the file is the system prompt (agents.rs parse at ~1457-1520).
- Editable fields in the /agents editor: description, model, color, tools, disallowedTools, skills, maxTurns, maxBudgetUsd, permissionMode, prompt (agents.rs:1117-1128).
- Template written by create: name, description, model, color, tools, disallowedTools, skills, maxTurns 20, permissionMode default (agents.rs:1085).

**Journey**

1. Create a markdown file with the front matter in an agents folder.
2. Run agi --agent <name>, or in the REPL run /agents and pick one.
3. The CLI loads the definition and applies it to the session.
4. If the model cannot be switched, a message 'Agent `<name>` model override ignored: ...' is printed and the session keeps its model (agents.rs:92-99).

**What the person sees and gets**

- Warning if agent not found: 'Agent `<x>` not found. Use `/agents` to list available agents.' (apps/cli/src/repl/mod.rs:621).
- Message when the agent asks for a looser permission mode than the session: 'the session keeps <mode>' (agents.rs:163-170).
- Spend cap applied silently; the session ends at the budget.

**Settings**

- Session budget (max_budget_usd) that the agent cap lowers.
- Workspace trust setting that allows project agents.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- apply_to_session switches model, intersects tools with the caller's allowlist, appends denylists, sets max turns, narrows permission mode, caps spend, injects the system prompt and preloads skills (agents.rs:80-139).
- cap_spend takes the smaller of the agent cap and the existing budget (agents.rs:57-65).
- Discovery order: user folders first, then trusted project folders; the first definition of a name wins (agents.rs discover_agents, users_before_project).
- Plugin-provided agent paths are loaded if they stay within the plugin root (agents.rs discover_agents_from).
- Model-called subagents use apply_to_subagent_session: tools intersected with the parent, max turns only lowered, spend capped, model and permission mode ignored (agents.rs:187-196).

**Incomplete**

- A model-spawned specialist cannot use its own model; the model override is deliberately withheld (agents.rs:187-196,495-497).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile and Chrome: missing per brief; no code searched beyond the brief.
- Web, Desktop, VS Code: not listed in the brief; custom agent files with their own model were not found in these apps in the files opened (not exhaustively searched).

## 4. Required behaviour

**Established requirements**

- Work is delegated to specialist workers that can use their own models. (source: S79.23 brief 'Should')
- The file sets the session model, allowed tools and spend cap; the cap can only lower an existing budget. (source: S79.23 task text; agents.rs:57-65)
- A definition file cannot widen the session's authority: permission mode only narrows, tools stay within the caller's allowlist. (source: agents.rs:80-96,146-170 (code comment and logic))

**Acceptance criteria**

1. Running agi --agent <name> with a model line switches the session model.
2. A tools list narrows the tools to the intersection with any command-line allowlist.
3. An agent with a looser permission mode than the session leaves the session mode unchanged and prints a message.
4. maxBudgetUsd 5 on a session with budget 2 leaves 2; on a session with no budget sets 5.
5. A model-called subagent never changes the session model.
6. An agent in an untrusted project folder is not loaded.
7. An unknown agent name prints the not-found message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI model override still obeys the trust boundary rules of switch_model [inferred from agents.rs:92-99 using session.switch_model].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Allow a model-called specialist to pick a model only within the same trust mode and plan, with consent shown.
- [proposed] Surface agents in VS Code through the same definition files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | AgentDefinition and apply_to_session | `apps/cli/src/agents.rs` | Definition, session application, spend cap, permission narrowing. |
| service | apply_to_subagent_session | `apps/cli/src/agents.rs` | Narrow-only application for model-called agents (190). |
| service | discover_agents | `apps/cli/src/agents.rs` | Folder discovery and trust check. |
| service | agent_tool_catalog | `apps/cli/src/agents.rs` | Bounded catalog for the model-callable agent tool (500-515). |
| command | --agent flag | `apps/cli/src/lib.rs` | Declares the flag at 424-426. |
| config | launch options | `apps/cli/src/cli_options.rs` | Carries agent into launch state (63,179). |
| command | /agents slash command | `apps/cli/src/repl/slash_commands.rs` | Lists, shows, creates, activates (71, 866-870). |
| service | REPL agent activation | `apps/cli/src/repl/mod.rs` | Not-found messages (131, 621) and agent requests (734). |
| service | switch_model | `apps/cli/src/agent/mod.rs` | Session model switch called by the agent (method defined on AgentSession; line not recorded). |
| service | permission narrowing | `apps/cli/src/cli_options.rs` | persisted_permission_mode and is_looser_than used by narrow_permission_mode. |
| service | trust restrictions | apps/cli/src/trust.rs (not found) (not found) | restrictions_for decides whether project config loads (used in agents.rs trusted_project). |
| service | plugins manager | apps/cli/src/plugins.rs (not found) (not found) | Plugin agent paths (used in discover_agents_from). |
| service | skills | `apps/cli/src/skills.rs` | preload_skills uses discover_skills. |
| service | tool filters | `apps/cli/src/tool_filters.rs` | intersect_allowlists for tools. |
| event | subagent audit | `apps/cli/src/subagent_audit.rs` | Records subagent runs with the agent name (field at 35). |
| test | agents.rs in-file tests | `apps/cli/src/agents.rs` | apply_to_session with model override (2451), managed cap (2437), subagent narrowing (2490), catalog bound (2566). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI parses --agent and finds the definition in the folders. | device | apps/cli/src/lib.rs:424-426; agents.rs discover_agents |
| The definition is applied to the session: model, tools, turns, permission mode, budget, prompt, skills. | device | agents.rs:91-139 |
| The session then runs turns with the chosen model through its normal path (own key, Managed Cloud or Local, whichever the session uses). | device and our servers | apps/cli/src/agent/chat.rs (session provider); managed route needs agi login (errors.rs:621) |
| Provider generates the text for non-Local models. | outside service | apps/cli/src/models/streaming.rs |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent definition file | Markdown file in project or user agents folder on the device | No (project files go with the repository if committed) | Until the user deletes it; the editor writes files in these folders |
| Subagent run record | CLI local audit data via subagent_audit.rs | unknown | unknown |

**Models and providers.** The model string in the file is passed to session.switch_model; which provider serves it is decided by the session's trust mode and model name. No model id is fixed in the feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account needed for the agent feature; the chosen model may need a key or agi login. |
| Permissions | Definition can only keep or tighten permission mode; project agents load only in trusted workspaces; plugin paths must stay in the plugin root (agents.rs). |
| Subscription | Not checked by the agent code; the plan check happens when the model is used (CliError::PlanExcludesModel in errors.rs:~632). |
| Limits and metering | max_turns and max_budget_usd set per agent; the budget is only ever lowered (agents.rs:57-65). |
| Feature flags | none found in the code |
| Model compatibility | A model the session cannot switch to is ignored with a message (agents.rs:92-99). |
| Provider restrictions | A model-called subagent cannot change model, so it cannot cross the egress or billing boundary (agents.rs:187-196). |
| Local mode | A Local session stays Local unless switch_model refuses or allows the model; whether an agent can name a cloud model in a Local session is decided in switch_model (not opened): unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Agent not found | Warning and continue without it. | apps/cli/src/repl/mod.rs:131,621 |
| Model override fails | Message printed, other overrides still apply. | agents.rs:92-99 |
| Same name in user and project folders | User definition wins. | agents.rs users_before_project |
| Looser permission mode | Ignored with a message. | agents.rs:163-170 |
| Invalid permission mode in a file | Validation reports 'unknown permission_mode'. | agents.rs:979-985 |
| Untrusted workspace | Project agents skipped. | agents.rs trusted_project |
| Offline, retry, cancel | not handled in this feature's code; the session handles them (see F079-07). | apps/cli/src/agents.rs contains no network or retry code (file read in part) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs`: In-file tests: apply_to_session sets model and tools, model override, managed permission cap cannot be lifted, model-invoked agent only narrows, catalog bounded and withholds secrets, subagent listing.
- `apps/cli/src/repl/slash_commands.rs`: /agents command activation tests (lines 866-870 call it).

**Test scenarios**

- **Own model**
  1. Create .agiworkforce/agents/x.md with a model line.
  2. Run agi --agent x.
  - Expected: Session model becomes that model.
- **Budget only lowers**
  1. Run with a session budget of 2 and an agent maxBudgetUsd of 5.
  - Expected: Budget stays 2.
- **Permission narrowing**
  1. Run a default-mode session with an agent asking for bypass-permissions.
  - Expected: Message and mode unchanged.
- **Untrusted project**
  1. Open a project not trusted for configuration with an agent file.
  - Expected: Agent not listed.
- **Subagent model ignored**
  1. Let the model call an agent that has a model line.
  - Expected: Parent model continues.

**Where to look when it fails**

- stderr lines beginning 'Agent `<name>`'.
- CLI subagent audit (apps/cli/src/subagent_audit.rs).
- Run /agents to list and validate files.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **Model-called specialists cannot use their own model.** Affects: CLI. Evidence: agents.rs:187-196. Work needed: Design a consent-based model choice inside the same trust mode if required.
- **No specialist selection on Mobile, Chrome, Web, Desktop, VS Code.** Affects: Mobile, Chrome (brief missing); others unlisted. Evidence: Brief S79.23. Work needed: Decide scope per surface.
- **No test of the --agent flag end to end found.** Affects: CLI. Evidence: Tests found only in agents.rs and slash_commands.rs. Work needed: Add an integration test.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- surface:cli
- file:apps/cli/src/agents.rs
- mode:own-key
- mode:cloud

## Unknown

- What switch_model allows in a Local or own-key session when the agent names another provider's model.
- Whether the Desktop or VS Code surfaces read the same agent files through the CLI runtime.
- Retention of subagent audit data.
- Exact line of the model switch method.
