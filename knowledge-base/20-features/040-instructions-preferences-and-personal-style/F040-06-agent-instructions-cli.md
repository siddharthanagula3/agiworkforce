---
id: "F040-06"
type: "feature"
title: "Agent instructions (CLI)"
aliases: ["Agent instructions", "Agent definitions", "Custom agents (CLI)", "/agents", "--agent", "agent_system_prompt", "S40.18"]
area: "40 Instructions, preferences, and personal style"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S40.18"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "file:apps/cli/src/agents.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-06 Agent instructions (CLI)

In the CLI, a person defines a named agent as a Markdown file with front matter and a body that is its system prompt. Running with --agent or choosing it applies its instructions, model, tool limits and spend cap to the session. No other app has it.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.18](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4018).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Loads agent files from project and user folders, and when one is chosen, injects its body as a system message wrapped in <agent_system_prompt agent="name"> and applies its overrides (apps/cli/src/agents.rs:1-12,111-152).

**Why it exists.** So a developer can keep reusable roles with fixed instructions and limits, for example a reviewer that cannot edit files.

**Who uses it.** CLI developers.

**Problems it solves**

- Re-typing role instructions.
- Limiting tools or spend for a role.
- Sharing agents in a repository.

**Use cases**

- Create a 'reviewer' agent restricted to read tools.
- Run agi --agent reviewer for one session.
- Describe an agent in words and have the model draft the file.
- Set a budget cap for an agent.

## 2. User experience

**Where to find it**

- CLI: slash command /agents (list, show, path, create, validate, history, delete, rename, set) (apps/cli/src/agents.rs:580-670); command-line flag --agent <name> (apps/cli/src/lib.rs:10613, applied at lib.rs:8652-8660).
- TUI: agent flow around apps/cli/src/tui/tui_app.rs (brief cites line 1198; not read here).
- Web, Desktop, Mobile, VS Code, Chrome: not available.

**Before you start**

- A trusted project folder to load project agents: project agents load only when repository configuration is allowed by trust (agents.rs:270-274).
- Drafting an agent from a description needs the model (agents.rs:586-594).

**Screens and controls**

- /agents create <name> [--global] writes a blank template.
- /agents set <name> <field> <value> edits a field.
- /agents delete <name> --yes: without --yes it only explains and asks to confirm (agents.rs:1147-1163).
- /agents validate checks files (agents.rs:958).

**Journey**

1. Run /agents create reviewer.
2. Edit the file body to write the instructions.
3. Run /agents show reviewer to check.
4. Start with --agent reviewer or select it in the session.
5. The agent's instructions, model, tools and limits apply.

**What the person sees and gets**

- 'Created project agent `x` at <path>'; 'Deleted agent ...'; warning 'agent not found. Continuing without agent.' (lib.rs:8658-8661); stderr line when a model override fails (agents.rs:101-107).

**Settings**

- Front matter fields: name, description, model, tools, disallowed tools, max turns, permission mode, color, skills, max budget in USD, MCP servers (agents.rs:23-45).
- Folders: .agiworkforce/agents and .claude/agents in the project; the config directory agents folder and ~/.claude/agents for the user (agents.rs:258-330).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Discovery from user and trusted project folders and enabled plugins; users first then project (agents.rs:258-330).
- apply_to_session sets model, tool allow and deny lists within any caller allowlist, MCP servers, max turns, narrowed permission mode, spend cap and preloaded skills, then adds the system prompt message (agents.rs:92-152).
- Permission mode can only stay the same or become stricter (agents.rs:138-148 doc comment).
- Create, rename, set, delete with --yes, validate and history subcommands (agents.rs:580-670).
- Model-drafted agent from a description with bounded sizes and a 90 second timeout (agents.rs:728-740 constants and DRAFT_SYSTEM_PROMPT).

**Incomplete**

- Delete is permanent (remove_file) after --yes, with no Trash step (agents.rs:1157).
- Whether agent instructions survive a switch of trust mode: not traced.

**Present but disconnected or switched off**

- none found

**Not available**

- Agent instructions on Web, Desktop, Mobile, VS Code, Chrome (brief S40.18 missing). Web has a server agent turn config (agent_id on conversations, request-processor.ts:3813-3818,3860-3875) but no instruction authoring was read in this feature.

## 4. Required behaviour

**Established requirements**

- The user can define an agent with its own instructions that apply whenever that agent is used. (source: brief S40.18)
- An agent definition is a file anyone can put in a repository, so it can only hold or narrow permissions. (source: apps/cli/src/agents.rs:138-148)
- A deletion that cannot be undone asks first and names the consequence. (source: doc: AGENTS.md section 9; agents.rs:1152-1156 does ask)

**Acceptance criteria**

1. --agent with an existing name applies its system prompt message.
2. --agent with an unknown name prints a warning and continues.
3. An agent with a looser permission mode than the session does not widen it.
4. /agents delete without --yes does not delete.
5. An agent with a tools list cannot use tools outside the caller's allowlist.
6. Project agents from an untrusted folder are not loaded.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The agent text is a system message, so it is applied after the output style and memory files already in the session [inferred from push order in apply_to_session].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move deleted agent files to Trash first.
- [proposed] Decide whether other apps should author agents; product docs not read for that.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | AgentDefinition | `apps/cli/src/agents.rs` | Definition struct, load, apply to session. |
| command | /agents | `apps/cli/src/agents.rs` | render_agents_command subcommands. |
| command | --agent flag | `apps/cli/src/lib.rs` | Selects and applies a named agent (apply_named_agent). |
| service | discover_agents | `apps/cli/src/agents.rs` | Finds agent files in project, user and plugin folders. |
| service | trust restrictions | apps/cli/src/trust.rs (not found) (not found) | Decides if project config may load (used at agents.rs:270-274; file path inferred from crate::trust). |
| service | tool_filters::intersect_allowlists | `apps/cli/src/tool_filters.rs` | Keeps agent tools inside the caller allowlist (path inferred). |
| service | plugins agent entries | apps/cli/src/plugins (not found) (not found) | Plugin-supplied agents (path inferred from crate::plugins). |
| config | AGENT_COLORS and EDITABLE_AGENT_FIELDS | `apps/cli/src/agents.rs` | Allowed colours and editable fields. |
| service | draft system prompt | `apps/cli/src/agents.rs` | DRAFT_SYSTEM_PROMPT builds an agent from a description. |
| test | agents.rs inline tests | `apps/cli/src/agents.rs` | Module tests (many #[test] functions from line 1705). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI starts with --agent name; find_agent searches the folders. | device | apps/cli/src/lib.rs:8652-8660; agents.rs:482-492 |
| apply_to_session sets overrides and pushes the instruction message. | device | agents.rs:92-152 |
| Turns go to the chosen model; in Managed mode through our servers, in own-key through the provider, in Local to the local model. | device and our servers | [inferred] privacy modes at apps/cli/src/platform/runtime/session.rs:255-259 |
| Drafting from a description sends the description to the model with a fixed system prompt. | outside service | agents.rs:728-740 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent Markdown files | <project>/.agiworkforce/agents, <project>/.claude/agents, config dir agents, ~/.claude/agents | No | Deleted by remove_file after /agents delete --yes |

**Models and providers.** The agent may override the model; if the switch fails a message is printed and the session model stays (agents.rs:98-108). No model names are fixed in the file.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for loading local agent files; model use follows the session mode. |
| Permissions | Permission mode can only be kept or narrowed; tool allowlist limited by caller; project agents need folder trust. |
| Subscription | none found in the code for agent definition files; model calls follow the session's access rules. |
| Limits and metering | max_budget_usd can cap spend, taking the smaller of the agent and session caps (agents.rs:57-65); draft sizes limited to 300, 12000 and 48 characters. |
| Feature flags | --agent and --agent-id (lib.rs:10613-10615). |
| Model compatibility | Model override must exist in the CLI catalog; otherwise ignored with a message. |
| Provider restrictions | none found in the code. |
| Local mode | Agent files work in Local mode fully on the device; model drafting needs a model in the chosen mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Agent not found | Warning and the session continues without it. | lib.rs:8658-8661 |
| Model override fails | Message on stderr; session keeps its model. | agents.rs:98-108 |
| Malformed file | Reported by /agents validate; loading uses load_agent results. | agents.rs:958-1037 (validation) |
| Delete without --yes | Explains it cannot be undone and asks for --yes. | agents.rs:1152-1156 |
| Draft timeout | 90 second limit; failure text from draft_failure. | agents.rs:733,738 |
| Untrusted repository | Project agents not loaded. | agents.rs:270-274 |
| Terminal text | Agent name sanitised before printing. | agents.rs:103-106 |
| Offline, retry, cancel | not handled in the code for loading files (local); drafting depends on the model call. | agents.rs |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/agents.rs`: Inline unit tests from line 1705 on: parsing, discovery, apply to session, commands (individual test names not read).

**Test scenarios**

- **Create and run**
  1. /agents create reviewer
  2. Edit the body to 'You only review code.'
  3. Start the CLI with --agent reviewer.
  - Expected: Session contains the <agent_system_prompt agent="reviewer"> message.
- **Unknown agent**
  1. Start with --agent nope.
  - Expected: Warning that the agent was not found; session continues.
- **Widening refused**
  1. Set permission_mode to a looser mode in the agent file.
  2. Start with a strict session.
  - Expected: Session mode unchanged.
- **Delete guard**
  1. Run /agents delete reviewer.
  2. Run /agents delete reviewer --yes.
  - Expected: First asks; second deletes the file.
- **Other apps**
  1. Look for agent authoring in Web, Mobile, VS Code, Chrome.
  - Expected: Not present.

**Where to look when it fails**

- /agents validate output.
- /agents history <name>.
- stderr lines 'Agent ... model override ignored' and 'agent ... not found'.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Agent authoring exists only in the CLI.** Affects: Web, Desktop, Mobile, VS Code, Chrome. Evidence: brief S40.18 missing; no code found. Work needed: Product decision on parity.
- **Delete is permanent, no Trash step.** Affects: CLI users. Evidence: agents.rs:1157. Work needed: Follow AGENTS.md section 9 if it applies to user files [proposed].
- **Draft cites tui_app.rs:1198 and lib.rs:5040 that I did not verify.** Affects: Engineers. Evidence: not opened. Work needed: Read those flows.
- **Individual agent tests were not read.** Affects: Testers. Evidence: agents.rs:1705+. Work needed: List test names.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- file:apps/cli/src/agents.rs

## Unknown

- How the TUI selects an agent mid-session (tui_app.rs not read).
- What lib.rs:5040 does in the agent flow.
- Names and coverage of the agents.rs tests.
- Whether agent text is carried across trust-mode switches.
- Whether the web agent_id turn config shares authoring with CLI definitions.
