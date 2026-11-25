---
id: "F072-06"
type: "feature"
title: "Tools, skills, plugins and background runs"
aliases: ["Tool/MCP commands", "S72.20", "Skill/Plugin commands", "S72.21", "Background-task management", "S72.31", "agi mcp", "agi plugin", "agi background", "agi bg", "/mcp", "/skills", "/skills-toggle", "/plugin", "/plugins", "/tasks", "/background", "/bg"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.20", "S72.21", "S72.31"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/background.rs", "file:apps/cli/src/mcp/mod.rs", "file:apps/cli/src/features/plugins/plugins.rs", "file:apps/cli/src/installs.rs", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "F072-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-06 Tools, skills, plugins and background runs

Connecting and managing extra capabilities in the CLI: `agi mcp ...` manages the registry of outside tool servers, `agi plugin ...` and `/plugin`, `/skills` manage plugins and skills, and `agi background ...` runs a prompt that keeps going after the terminal closes. `/tasks` lists sub-agents and shell jobs in the screen.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.20](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7220), [S72.21](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7221), [S72.31](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7231).

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

**What it does.** Adds and controls MCP servers (outside tools), installs and checks plugins (with integrity and signature rules), lists and toggles skills, and runs detached background agent runs with logs, stop, remove and attach.

**Why it exists.** The requirements list MCP server management, hooks, skills and subagents for the CLI (doc: docs/product/requirements.md:1157-1178). The brief asks for MCP, skill, plugin and background management from the terminal (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.20, S72.21, S72.31).

**Who uses it.** Developers extending the agent with tools and automations, and people running long tasks unattended.

**Problems it solves**

- Giving the agent access to a database or ticket system.
- Installing shared team plugins safely.
- Turning skills on and off.
- Letting a long task finish after the laptop lid or terminal closes.

**Use cases**

- `agi mcp add github --url https://...` then `agi mcp login github`.
- `agi plugin install <git-url> --integrity sha256:<hex>`.
- `/skills-toggle` to switch off a noisy skill.
- `agi background start "update the changelog"` then `agi background logs <id>`.

## 2. User experience

**Where to find it**

- surface:cli shell: `agi mcp add|list|get|enable|disable|allow|ask|block|unset|login|logout|remove` (apps/cli/src/lib.rs:2126-2213); `agi plugin list|install|info|login|configure|remove|enable|disable|update|digest|sign` (apps/cli/src/lib.rs:2017-2081); `agi background start|list|logs|stop|rm|attach` (alias `bg`) (apps/cli/src/lib.rs:2083-2113, 909-912).
- surface:cli screen: `/mcp` shows configured servers and their state; `/mcp tools [server]`, `/mcp restart`, `/mcp enable|disable <name>` (apps/cli/src/tui/tui_app.rs:6055-6125); `/skills` lists, `/skills import <path>`, `/skills remove <name>`, `/skills-toggle` opens a toggle overlay (apps/cli/src/tui/tui_app.rs:6169-6215, 7011); `/plugin` or `/plugins` opens a tabbed overlay titled `Plugins (← → switch tabs · Esc close)`, with `/plugin enable|disable|remove|update|configure <name>` as text commands (apps/cli/src/tui/tui_app.rs:6285-6330); `/tasks` and `/background <instruction>` (apps/cli/src/tui/tui_app.rs:5616, 5960).

**Before you start**

- MCP: a server command or URL; remote servers may need OAuth sign-in.
- Plugin install: a source (git URL or folder) and either a publisher signature, a pinned sha256 digest, or an explicit unsafe flag.
- Background: a working model route; nobody is at the terminal to approve tools.

**Screens and controls**

- `/mcp` list with a status per server: Connected, Starting, NeedsAuth, Disabled, Blocked, Failed, and the tool count (apps/cli/src/tui/tui_app.rs:6090-6118).
- Skills overlay: `Skills (↑↓ navigate · Space toggle · Enter save · Esc cancel)` (apps/cli/src/tui/tui_app.rs:6226-6232).
- Plugin tabs: Installed and Marketplaces, with ✔ or ◯ per plugin and a Project or User group (apps/cli/src/tui/tui_app.rs:6292-6325).
- `agi background list` prints one line per run; `--json` prints id, state, prompt, cwd, session id, times and exit code (apps/cli/src/lib.rs:1731-1757).

**Journey**

1. MCP: `agi mcp add name --command npx --arg ...` writes the registry file and prints `Registered MCP server '<name>' in <path>.`; `agi mcp list` shows enabled, disabled or blocked; `agi mcp login <name>` runs OAuth for a remote server (apps/cli/src/lib.rs:5101-5160).
2. Plugin: `agi plugin install <source>` verifies integrity and signature, installs, prints contents (hooks, servers) and asks for settings at a terminal (apps/cli/src/lib.rs:6833-6905).
3. Background: `agi background start <prompt>` prints the run id and the commands to see logs, attach and stop; `agi background attach <id>` resumes the finished conversation in a normal session (apps/cli/src/lib.rs:1710-1730, 1783-1812).
4. In the screen, `/bg <instruction>` saves this conversation, starts a background run that resumes it, and opens a new conversation here (apps/cli/src/background.rs:303-340).

**What the person sees and gets**

- `Registered MCP server ...`, `No MCP servers registered in <path>.`, `blocked` with the policy reason (apps/cli/src/lib.rs:5101-5160).
- `Installed to <path> (<format> manifest), <signature label>` followed by plugin contents and a Trust row: `its hooks and MCP servers run on this computer with your permissions` (apps/cli/src/lib.rs:6860-6880, apps/cli/src/features/plugins/plugins.rs:530-536).
- `Refusing install: ...` on integrity or signature failure (apps/cli/src/lib.rs:6833-6860).
- `Started background run <id>. It keeps going after this terminal closes.` and states running, finished, failed, stopped, `ended without a result` (apps/cli/src/background.rs:40-58).
- `/tasks` shows sub-agent tasks and shell jobs: `list`, `show|output|stop|cancel <id>`, `transcript <id>` (apps/cli/src/repl/registry.rs:484-560).

**Settings**

- MCP registry file `mcp.json` in the config folder (default `~/.agiworkforce/mcp.json`); project `.mcp.json` or `mcp.json` in the repo, with consent (apps/cli/src/mcp/registry.rs:63-67, apps/cli/src/mcp/consent.rs:39).
- `plugins.require_signed`, `plugins.trusted_publishers` in config (apps/cli/src/features/plugins/plugins.rs:256-300, 571-580).
- Disabled skills set (apps/cli/src/skills.rs load_disabled_skills).
- `--mcp-config <file>` at launch (apps/cli/src/lib.rs:402-404).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- MCP registry commands add, list, get, enable, disable, allow, ask, block, unset, login, logout, remove are implemented and read the same registry rows (apps/cli/src/lib.rs:5095-5300).
- The registry file is `mcp.json` in the config folder, whose root can be moved with AGIWORKFORCE_HOME; `~/.agiworkforce` is the default (apps/cli/src/mcp/registry.rs:63-67, apps/cli/src/config.rs:480-484).
- In the screen, MCP connect runs in the background so a slow OAuth server cannot hold up start; until it finishes, turns run without MCP tools (apps/cli/src/tui/tui_app.rs:7021-7050, 7200-7222).
- A project's own MCP config needs the user's consent and policy can block a server (apps/cli/src/mcp/consent.rs, apps/cli/src/tui/tui_app.rs:6103-6112).
- Entering Local mode drops every connected remote MCP server and its tools and prompts (apps/cli/src/mcp/mod.rs:2376-2391).
- Plugin install: default checks a publisher signature; `--integrity sha256:<hex>` pins a digest; `--unsafe-no-integrity` skips with a warning; an unsigned plugin installs with a warning unless `plugins.require_signed` is set, where it is refused unless `--unsafe-allow-unsigned` is given and managed settings allow it (apps/cli/src/lib.rs:6845-6870, apps/cli/src/features/plugins/plugins.rs:538-580).
- Plugins can be listed, shown, configured, enabled, disabled, updated, signed and digested from the shell (apps/cli/src/lib.rs:2017-2081, 6780-6830).
- `/plugin enable|disable|remove|update|configure` work as text commands in the screen (apps/cli/src/installs.rs:561-590).
- Background runs: a detached supervisor launches a hidden `agi --print` child with the run's args; records are `run.json` and `output.log` under `<config>/background/<id>` (apps/cli/src/background.rs:6-7, 65-75, 246-300, 474-520).
- States Running, Finished, Failed, Stopped and Lost are computed from the record and process checks (apps/cli/src/background.rs:40-58, 199-245).
- `stop` ends the run's process group and records it as stopped; `rm` refuses a running run (apps/cli/src/background.rs:523-600).
- `attach` shows the log while running, or resumes the saved conversation after it finished (apps/cli/src/lib.rs:1783-1812).
- `/tasks` lists sub-agent tasks and shell jobs, and can show, stop or transcript one (apps/cli/src/repl/registry.rs:484-560, apps/cli/src/tui/tui_app.rs:7733-7743).

**Incomplete**

- `/skills` only lists, imports and removes; toggling is a separate `/skills-toggle` overlay that is not in the shared registry (apps/cli/src/tui/tui_app.rs:6169-6215, 4503-4527).
- `/tasks` does not list `agi background` runs; those are listed only by `agi background list` (apps/cli/src/repl/registry.rs:484-520 reads the sub-agent manager and shell jobs).
- A background run does not receive `--max-budget-usd` or other limits from `agi background start`; only model and permission mode are passed (apps/cli/src/background.rs:246-262).
- The Marketplaces tab content and install flow in the screen were not traced.

**Present but disconnected or switched off**

- The decision log (2026-07-30) says `/background` and `/bg` were cut because they returned an unavailable message; the code now has a working hand-off and a durable background module, so the log row is out of date (doc: docs/decisions/wire-or-cut.md:55, apps/cli/src/tui/tui_app.rs:5960, apps/cli/src/background.rs:303-340).

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: not part of this item (brief status n/a). The surface matrix says the CLI has no connectors directory; third parties come in through MCP (doc: docs/product/surface-feature-matrix.md:357).

## 4. Required behaviour

**Established requirements**

- The user can add, list, inspect, authenticate and remove MCP servers from the terminal and see connected tools. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.20)
- The user can list/toggle skills and list/install/update plugins from the terminal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.21)
- The user can list, inspect and stop background tasks (sub-agents or long-running commands) from the terminal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.31)
- The CLI includes MCP server management, hooks and skills, subagents, and stays local unless the user hands off. (source: doc: docs/product/requirements.md:1157-1182)
- Local mode: no prompt, chat or file context should leave this device. (source: doc: apps/cli/src/platform/runtime/session.rs:283-285 (PrivacyMode description))

**Acceptance criteria**

1. `agi mcp add x --command echo` then `agi mcp list` shows `x` as enabled; `agi mcp disable x` shows disabled; `agi mcp remove x` removes it.
2. `/mcp` in the screen lists configured servers with a status and tool count.
3. In Local mode a remote MCP server is not connected and its tools are not offered.
4. `agi plugin install <unsigned plugin>` with `plugins.require_signed = true` fails with a message naming `--unsafe-allow-unsigned`.
5. `agi plugin install <src> --integrity sha256:<wrong>` is refused.
6. `agi background start "hello"` prints an id; `agi background list` shows running then finished; `agi background logs <id>` prints output.
7. `agi background stop <id>` marks it stopped; `agi background rm <id>` on a running run is refused.
8. `/tasks` shows running sub-agents and shell jobs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Background tool calls that need approval are refused in the child run because nobody is at the terminal, as the flag help says (apps/cli/src/lib.rs:2092-2095) [inferred for enforcement].
- A plugin's hooks and servers run with the user's permissions, so the install summary must say so [inferred from plugins.rs:530-536].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show `agi background` runs in `/tasks` so one list covers all background work.
- [proposed] Pass a spend cap to background runs, and show it in the start message.
- [proposed] Ask the user to confirm `agi background rm` and name that the log and record are lost, per the rule on irreversible actions (doc: AGENTS.md section 9).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | Command::Mcp and run_mcp_registry_command | `apps/cli/src/lib.rs` | Registry subcommands (lib.rs:2126-2213, 5095-5300). |
| store | McpRegistry (mcp.json) | `apps/cli/src/mcp/registry.rs` | Registry file load and rows (registry.rs:63-100). |
| service | McpManager | `apps/cli/src/mcp/mod.rs` | Connect, tools, privacy enforcement, policy refusal (mod.rs:2376-2461). |
| service | MCP consent for project configs | `apps/cli/src/mcp/consent.rs` | Project .mcp.json consent. |
| command | /mcp handler and mcp_for_display | `apps/cli/src/tui/tui_app.rs` | List and subcommands in the screen (tui_app.rs:6055-6125, 7718-7725). |
| command | Command::Plugin and install flow | `apps/cli/src/lib.rs` | Plugin subcommands (lib.rs:2017-2081, 6780-6905). |
| service | PluginsManager and signature policy | `apps/cli/src/features/plugins/plugins.rs` | Discovery, integrity, signature evaluation (plugins.rs:256-300, 530-580). |
| service | installs | `apps/cli/src/installs.rs` | install_plugin, add_mcp_server, plugin text commands (installs.rs:561-590). |
| service | plugin signature verification | `apps/cli/src/features/plugins/signature.rs` | Publisher signature check and trusted publishers. |
| command | /plugin overlay | `apps/cli/src/tui/tui_app.rs` | Tabbed Installed and Marketplaces view (tui_app.rs:6292-6330). |
| service | skills | `apps/cli/src/skills.rs` | Discover skills, disabled set, import, remove. |
| component | SkillsToggleView | `apps/cli/src/tui/widgets/skills_toggle.rs` | Enable and disable overlay. |
| service | background | `apps/cli/src/background.rs` | Run records, supervisor, state, stop, remove, hand off (background.rs:1-620). |
| command | run_background_command | `apps/cli/src/lib.rs` | start, list, logs, stop, rm, attach (lib.rs:1708-1812). |
| command | /background and /bg | `apps/cli/src/tui/tui_app.rs` | Hand the conversation to a background run (tui_app.rs:5960-5970). |
| service | tasks_for_display | `apps/cli/src/repl/registry.rs` | Sub-agent and shell job listing (registry.rs:484-560). |
| service | subagent manager and terminals | `apps/cli/src/subagent.rs` | Sub-agent task list; shell jobs in terminals.rs. |
| test | background tests | `apps/cli/src/background.rs` | Supervisor, stop, lost-run and ownership tests (background.rs:792-948). |
| test | plugin coverage tests | `apps/cli/tests/coverage_wave2_plugins.rs` | Plugin behaviour tests (contents not itemised). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| `agi mcp add` validates the target and writes the registry file in the config folder. | device | apps/cli/src/lib.rs:5101-5145, apps/cli/src/installs.rs |
| At session start the manager connects enabled servers: stdio servers start as local processes; remote servers are called over the network, with OAuth in a browser if needed. | outside service | apps/cli/src/tui/tui_app.rs:7021-7050, apps/cli/src/mcp/mod.rs |
| In Local mode remote servers are dropped at once. | device | apps/cli/src/mcp/mod.rs:2376-2391 |
| `agi plugin install` fetches the source (a git host or a folder), checks the integrity claim and the signature policy, copies the plugin into the plugins folder, reads its manifest and prints its contents. | outside service | apps/cli/src/lib.rs:6833-6905, apps/cli/src/features/plugins/plugins.rs:538-580 |
| `agi background start` writes a run record, launches a detached supervisor, which launches `agi --print ... -- <prompt>` in the same folder, with output to `output.log`. | device | apps/cli/src/background.rs:246-300, 474-520 |
| The background child talks to the model through the same route as any one-shot run (Local, own key or Cloud). | device and our servers | apps/cli/src/background.rs:252-262 (args are `--print`, optional `--model`, `--permission-mode`) |
| `/tasks` asks the in-process sub-agent manager and the shell job list; no files. | device | apps/cli/src/repl/registry.rs:484-520 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| MCP registry | mcp.json in the config folder (apps/cli/src/mcp/registry.rs:63-67) | No sync found in the code | `agi mcp remove` deletes the entry; `--force` replaces one on add. |
| MCP OAuth tokens | CLI credential storage (secure_store.rs, oauth.rs); exact location not read | No | `agi mcp logout` forgets the token. |
| Installed plugins and settings | Plugins folder under the config folder or the project (apps/cli/src/features/plugins/plugins.rs) | No sync found for plugins | `agi plugin remove` deletes the plugin folder. |
| Disabled skills set | Config folder file read by load_disabled_skills (apps/cli/src/skills.rs) | No | Overwritten when the overlay saves. |
| Background run record and log | <config>/background/<id>/run.json and output.log (apps/cli/src/background.rs:6-7, 65-75) | No | `agi background rm` removes the whole folder permanently; a running run is refused (apps/cli/src/background.rs:586-606). |
| Background conversation | A managed session under the config folder (session id in run.json) | Per session mode (see F072-03) | As any session. |

**Models and providers.** MCP, plugins and skills are model-agnostic; the tools they add are offered to whichever model the session uses. A background run uses the model passed by `--model` or the configured default, through that model's route (apps/cli/src/background.rs:252-262). Remote MCP servers are outside services and are blocked in Local mode. See SYS-connectors-plugins-and-skills.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | MCP, plugins, skills and background runs need no AGI account for Local and own-key use. A Cloud model in a background run needs sign-in. |
| Permissions | Per-server and per-tool allow, ask and block settings (`agi mcp allow/ask/block/unset`) (apps/cli/src/lib.rs:2175-2202). Project MCP configs need consent. Plugins run hooks and servers with the user's permissions, and the install summary says so (apps/cli/src/features/plugins/plugins.rs:530-536). Background runs refuse tools that need approval unless the permission mode allows them (apps/cli/src/lib.rs:2092-2095). |
| Subscription | None found for MCP, plugins, skills or background runs. A Cloud model in a run follows the plan rules in F072-04. |
| Limits and metering | None found in background.rs for count, time or spend. Cloud usage of the child run is metered like any one-shot run. |
| Feature flags | `plugins.require_signed`, `plugins.trusted_publishers`, `--unsafe-allow-unsigned`, `--unsafe-no-integrity`, `--integrity`, `--mcp-config`, `--permission-mode` for background start. |
| Model compatibility | MCP tools are offered to any model that supports tools; a Local model without tool support loses them for the turn and the user is told through a notice (apps/cli/src/tui/tui_app.rs:7232-7244). Detailed per-model support was not traced. |
| Provider restrictions | Remote MCP servers are refused in Local mode (apps/cli/src/mcp/mod.rs:2376-2391). Managed policy can block servers (apps/cli/src/tui/tui_app.rs:6103-6112). |
| Local mode | Stdio MCP servers, installed plugins, skills and background runs with a local model work with no account. Remote MCP servers and any account call are cut off in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| MCP still starting | `/mcp` shows Starting; turns run without MCP tools until attach finishes. | apps/cli/src/tui/tui_app.rs:7021-7050, 6098-6100 |
| MCP connect failure | A system line `MCP config/connect error: ...`; status Failed. | apps/cli/src/tui/tui_app.rs:7031-7040 |
| Remote server needs sign-in | Status NeedsAuth; hint `agi mcp login <name>`. | apps/cli/src/tui/tui_app.rs:6090-6118 |
| Empty registry | `No MCP servers registered in <path>.` | apps/cli/src/lib.rs:5149-5156 |
| Plugin install refused | `Refusing install: <reason>`, non-zero exit. | apps/cli/src/lib.rs:6833-6870 |
| No background runs | `No background runs. Start one with `agi background start <prompt>`.` | apps/cli/src/lib.rs:1750-1752 |
| Background run lost | State `ended without a result` after a 60 s launch grace; can be removed. | apps/cli/src/background.rs:8, 40-58, tests 846-864 |
| Stop | Process group terminated; waits up to 10 s; recorded as stopped. | apps/cli/src/background.rs:9, 523-585 |
| Attach to a running run | Prints the log so far and tells the user to attach again later. | apps/cli/src/lib.rs:1785-1797 |
| Attach with no saved conversation | Error saying the run ended before it saved one and pointing to the logs. | apps/cli/src/lib.rs:1799-1806 |
| Terminal closes | The run continues (detached supervisor). | apps/cli/src/background.rs:285-296, 635-656 |
| Interactive MCP question outside a turn | Queued and shown as a modal only when no other overlay is open. | apps/cli/src/tui/tui_app.rs:7222-7232 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/background.rs`: Starter returning late keeps pids, launcher that never writes the record leaves its pid, lost run after grace and removable, a live unrelated process is never signalled, stop signals its own supervisor, a supervisor that cannot launch leaves a failed record (lines 792-948).
- `apps/cli/tests/coverage_wave2_plugins.rs`: Plugin tests (wave 2 coverage); contents not itemised here.
- `apps/cli/src/features/plugins/plugins.rs`: Signature policy defaults, configured and managed require_signed, override rules (around lines 2283-2386).
- `apps/cli/src/installs.rs`: Dependency policy with require_signed (around line 606).
- `apps/cli/src/tui/tui_app.rs`: /mcp output tests (around lines 10002-10040).
- `apps/cli/src/lib.rs`: `agi mcp add` parsing tests (around lines 10245-10269).
- `apps/cli/src/mcp/consent.rs`: Project MCP consent tests (e.g. line 3896 area).

**Test scenarios**

- **MCP lifecycle**
  1. `agi mcp add demo --command echo`.
  2. `agi mcp list`.
  3. `agi mcp disable demo`; `agi mcp list`.
  4. `agi mcp remove demo`.
  - Expected: Entry shows enabled, then disabled, then gone; each command prints a confirmation.
- **Local blocks remote MCP**
  1. Register a remote server.
  2. Start `agi` in Local mode and type `/mcp`.
  - Expected: The remote server shows no tools and is not connected.
- **Signed-only plugins**
  1. Set `plugins.require_signed = true`.
  2. Install an unsigned plugin.
  - Expected: `Refusing install: ... pass --unsafe-allow-unsigned to override`.
- **Bad digest**
  1. `agi plugin digest <dir>` to get the digest.
  2. Install with a different `--integrity sha256:` value.
  - Expected: Refused.
- **Background run**
  1. `agi background start "print the date"`.
  2. `agi background list`.
  3. `agi background logs <id>`.
  4. `agi background attach <id>`.
  - Expected: Run id printed; state moves running to finished; log shows output; attach opens the conversation.
- **Stop and remove**
  1. Start a long run, `agi background rm <id>`, then `agi background stop <id>`, then `rm` again.
  - Expected: First `rm` refused as running; stop marks stopped; second `rm` removes.

**Where to look when it fails**

- `Refusing install:` text; plugin diagnostics lines starting `WARNING:` (plugins.rs:552-565).
- `MCP config/connect error:` system line.
- Background `output.log` and `run.json` under <config>/background/<id>.
- `agi doctor` for setup checks (apps/cli/src/doctor.rs).
- `agi mcp get <name>` for one entry.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **`/tasks` does not show `agi background` runs, while the brief describes one place to list, inspect and stop background tasks.** Affects: surface:cli users with several kinds of background work.. Evidence: apps/cli/src/repl/registry.rs:484-520 versus apps/cli/src/lib.rs:1731-1757. Work needed: Merge the two lists or point `/tasks` output to `agi background list`.
- **The decision log still says `/background` and `/bg` were cut.** Affects: Engineers reading docs/decisions/wire-or-cut.md.. Evidence: docs/decisions/wire-or-cut.md:55 versus apps/cli/src/tui/tui_app.rs:5960. Work needed: Update the decision log to the current code.
- **Background runs carry no spend or time cap from `agi background start`.** Affects: surface:cli users running Cloud models unattended.. Evidence: apps/cli/src/background.rs:246-262. Work needed: Pass `--max-budget-usd` or a plan-based cap and show it at start.
- **`agi background rm` and `agi plugin remove` delete data permanently with no confirmation that names the loss.** Affects: surface:cli users.. Evidence: apps/cli/src/background.rs:586-606, doc: AGENTS.md section 9. Work needed: Confirm with a consequence line, or move to Trash first.
- **The brief gives the registry as `~/.agiworkforce/mcp.json`; the path is the config folder, which AGIWORKFORCE_HOME can move.** Affects: Testers.. Evidence: apps/cli/src/mcp/registry.rs:63-67, apps/cli/src/config.rs:480-484. Work needed: State the default and the override in the brief.
- **`/skills` toggle exists only as `/skills-toggle`, which the brief does not name.** Affects: Testers following S72.21.. Evidence: apps/cli/src/tui/tui_app.rs:4503-4527, 6169-6215. Work needed: Update the brief.
- **The Marketplaces tab behaviour and `agi marketplace` were not verified here.** Affects: surface:cli plugin users.. Evidence: apps/cli/src/tui/tui_app.rs:6292-6325. Work needed: Trace and document the marketplace flow.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/background.rs
- file:apps/cli/src/mcp/mod.rs
- file:apps/cli/src/features/plugins/plugins.rs
- file:apps/cli/src/installs.rs
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- F072-04

## Unknown

- Where MCP OAuth tokens and plugin settings are stored (secure_store.rs was not read).
- What the Marketplaces tab lists and how install from it works.
- How an unattended background run refuses an approval-needing tool in practice; relied on the flag help text.
- Whether remote MCP and plugin features are subject to a plan or managed workspace policy beyond `prefetch_workspace_policy` (tui_app.rs:6955-6960).
- Whether `agi background` works on Windows (detach code has per-OS blocks, background.rs:635-660, but no run was made).
