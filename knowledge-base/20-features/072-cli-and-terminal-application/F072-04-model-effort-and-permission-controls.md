---
id: "F072-04"
type: "feature"
title: "Model, effort and permission controls"
aliases: ["Model command", "S72.14", "Effort command", "S72.15", "Permission command", "S72.16", "/model", "/effort", "/permissions", "/perms", "/approvals", "--mode", "--permission-mode", "Shift+Tab mode cycle"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.14", "S72.15", "S72.16"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "plan:pro", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-04 Model, effort and permission controls

Controls in the CLI for which model answers, how hard it thinks, and what it may do without asking. `/model` picks or switches the model, `/effort` sets the reasoning level, `/permissions` edits allow, ask, deny and session rules, and `--mode` with `--allowedTools` set the mode for one run.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.14](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7214), [S72.15](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7215), [S72.16](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7216).

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

**What it does.** Lets the user switch the model mid-session (Local, own key or Managed), set a reasoning effort for the next request (and save it as the project default), see and edit permission rules, and choose a permission mode.

**Why it exists.** The requirements call for a model/mode selector and approval modes (doc: docs/product/requirements.md:1157-1178); the brief asks for model, effort and permission controls (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.14-S72.16).

**Who uses it.** Developers choosing between cheap and strong models, or between a careful and a hands-off agent.

**Problems it solves**

- Changing model without restarting.
- Spending less on easy tasks and more on hard ones.
- Stopping repeated approval prompts for safe commands, or blocking risky ones.
- Running unattended in CI with a fixed mode.

**Use cases**

- `/model` to move from a local model to the managed roster.
- `/effort high` before a hard debugging task.
- `/permissions allow npm test` so tests no longer prompt.
- `agi --mode plan` to have the agent only plan.

## 2. User experience

**Where to find it**

- surface:cli full-screen screen: `/model` (alias `/m`), `/effort` (alias `/e`), `/permissions` (aliases `/perms`, `/approvals`) (apps/cli/src/tui/tui_app.rs:5553, 6127, 6452).
- Keys: Alt+P cycles the model within the same trust mode; Shift+Tab cycles the permission mode (apps/cli/src/keybindings.rs:48-57).
- Shell flags: `--model`, `--provider`, `--auto`, `--mode`, `--permission-mode`, `--allowedTools`, `--disallowedTools` (apps/cli/src/lib.rs:366-402, 467-478). `agi approvals ...` and `agi approvals mode` manage rules from the shell (apps/cli/src/lib.rs:1898-1930).

**Before you start**

- For Managed models: a signed-in account on a plan that includes the model; Pro or higher for CLI Cloud models in the code (apps/cli/src/model_catalog.rs:938-970).
- For Local models: a local server such as Ollama or LM Studio (apps/cli/src/tui/tui_app.rs:7090-7108).
- For own-key models: the provider's API key configured.

**Screens and controls**

- Model picker overlay with sections Local, Your key and Managed, a filter box and an effort control (`Thinking`, `Effort ◀ ▶`) (apps/cli/src/tui/widgets/model_picker.rs:1-20). Locked Cloud rows stay listed and selectable but are annotated (apps/cli/src/tui/widgets/model_picker.rs:199-214).
- Effort picker with seven levels from Effort::ALL: None, Minimal, Low, Medium, High, xHigh, Max (apps/cli/src/design_system.rs:392-425, apps/cli/src/tui/widgets/effort_picker.rs:79-180).
- `/effort l|m|med|h` and any wire value: none, minimal, low, medium, high, xhigh, max (apps/cli/src/tui/tui_app.rs:6460-6465).
- `/permissions` shows one tab as text; tabs allow, ask, deny, session, workspace, recent; `/permissions allow|ask|deny|session <rule>` adds; `/permissions remove <scope> <rule>` removes; `/permissions reset` clears all (apps/cli/src/repl/registry.rs:803-840).
- Mode names shown in the status bar and by Shift+Tab: default, plan, auto, bypass permissions, full auto (apps/cli/src/tui/tui_app.rs:128-160).

**Journey**

1. Model: user types `/model`, the picker opens; the user picks a row; a banner line confirms (apps/cli/src/tui/tui_app.rs:5042-5109).
2. Direct: `/model <id>` switches at once and prints `Switched to <id> (<provider>)` or `Model switch failed: <reason>` (apps/cli/src/tui/tui_app.rs:5553-5573).
3. Effort: user types `/effort high`; the line `Effort set to High and saved as this project's default` appears; every later send uses it (apps/cli/src/tui/tui_app.rs:6452-6496, 8237-8238).
4. Permissions: user types `/permissions allow git status`; a line `Always allow: git status` appears and the rule is stored (apps/cli/src/repl/registry.rs:875-905).
5. Mode: user presses Shift+Tab; the banner names the mode with a warning for bypass and full-auto (apps/cli/src/tui/tui_app.rs:7330-7380).

**What the person sees and gets**

- `Switched to <id> (<provider>)`, `Model switch failed: <reason>` (tui_app.rs:5553-5573).
- For a switch that opens a new managed session: the notice NEW_MANAGED_SESSION_NOTICE is appended (tui_app.rs:5093-5097).
- `Effort set to <label>...` plus a note when the model takes no effort on this route (claude_parity.rs:1711).
- `Unknown effort level '<x>'. Use: none | minimal | low | ...` (tui_app.rs:6482-6495).
- `Always allow|ask|deny: <rule>`, `Allow this session: <rule>`, `Removed <scope> permission: <rule>`, `No <scope> permission rule matched: <rule>` (registry.rs:875-940).
- Warnings on bypass and full-auto: `All tool confirmations are bypassed!` (tui_app.rs:7340-7360).

**Settings**

- `[default] reasoning_effort` in the project config (config.rs:1144-1160).
- `[default] permission_mode` and managed policy pinning (lib.rs:5530-5560, permissions.rs:356-368).
- Permission rules stored by PermissionStore (apps/cli/src/permissions.rs).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- `/model` with no argument opens the picker from the catalog, OpenRouter cache, managed roster and discovered local models (apps/cli/src/tui/tui_app.rs:3367-3378).
- `/model <id>` calls switch_model_by_name: a Managed session stays on the account for a model its plan runs; otherwise provider detection is used; in a Local session an unknown id is looked up among the local servers (apps/cli/src/agent/mod.rs:1159-1200, apps/cli/src/tui/tui_app.rs:5559-5570).
- Established non-Local sessions refuse a model on another trust mode and say to start a new session (apps/cli/src/agent/mod.rs:1135-1151).
- Entering a managed model from Local or own-key needs a fresh session; otherwise it is refused (apps/cli/src/agent/mod.rs:1218-1231).
- Alt+P cycles only among models the session can run in the same trust mode (apps/cli/src/tui/tui_app.rs:5132-5200, test at 13181).
- `/effort` sets the level for later sends (the level is written to the session before each send) and also saves it to the project config (apps/cli/src/tui/tui_app.rs:6452-6470, 8237-8238, apps/cli/src/config.rs:1144-1160). The brief says it only changes the next request; the code does both.
- Whether the model takes the effort on this route is checked and a note is added if not (apps/cli/src/models/streaming.rs:668-675, apps/cli/src/tui/tui_app.rs:6470-6478).
- `/permissions` reads and writes the permission store; open-ended allow rules are rejected (apps/cli/src/repl/registry.rs:803-905).
- Permission modes: default, plan, auto (accept edits), bypassPermissions, dontAsk; bypass is never read from saved config (apps/cli/src/cli_options.rs:12-45).
- `--auto` is refused together with `--model` or `--provider` and applies only to managed-cloud sessions (apps/cli/src/lib.rs:467-478).
- `--allowedTools` and `--disallowedTools` are applied to the session (apps/cli/src/tui/tui_app.rs:6931-6940).

**Incomplete**

- `/permissions` in the screen is a text listing of one tab at a time; there is no interactive tab control (apps/cli/src/tui/tui_app.rs:6127-6129, apps/cli/src/repl/registry.rs:845-860).
- The effort picker shows seven levels, while the brief and the draft name four (apps/cli/src/design_system.rs:404-412).
- A Local session's `switch_model` does not itself refuse a model whose provider is another mode (apps/cli/src/agent/mod.rs:1144); how the later send is gated was not traced (see unknowns).

**Present but disconnected or switched off**

- Bypass mode is only reachable when the launch allowed it (`bypass_permissions_available`) (apps/cli/src/tui/tui_app.rs:6925-6930).
- Locked Cloud rows (plan too low) remain selectable but the switch is refused later; the exact refusal text was not traced (apps/cli/src/tui/widgets/model_picker.rs:199-214).

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: not part of this item (brief status n/a).
- `--auto` for Local or own-key sessions: not available by design (apps/cli/src/lib.rs:467-478).

## 4. Required behaviour

**Established requirements**

- The user can view and switch the model mid-session from the terminal (`/model` picker or `/model <id>`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.14)
- The user can set reasoning effort (low/medium/high/max) and it changes the next request. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.15)
- The user can change the permission mode and allow/deny rules from the terminal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.16)
- Local, own-key and Cloud are separate trust boundaries; nothing silently routes a Local chat to own key or cloud; a Local-to-own-key move is an explicit fork with consent and a visible provider label. (source: doc: AGENTS.md section 6)
- The CLI includes a model/mode selector and approval modes. (source: doc: docs/product/requirements.md:1157-1178)

**Acceptance criteria**

1. `/model` opens a picker with Local, Your key and Managed sections; picking a row switches and prints a banner.
2. `/model unknown-id` prints `Model switch failed: Unknown model ...` and the model does not change.
3. In a Managed session `/model` to a model on another trust mode is refused with a message to start a new session.
4. `/effort high` prints `Effort set to High and saved as this project's default`, and `.agiworkforce/config.toml` holds `reasoning_effort = "high"`.
5. `/effort bogus` lists the valid levels.
6. `/permissions allow npm test` then `/permissions allow` shows the rule; `/permissions remove allow npm test` removes it.
7. `/permissions allow *` or another open-ended rule is refused.
8. `agi --auto --model x` fails with a conflict; `agi --mode plan` starts in plan mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A model that does not take effort should still switch, with the note shown [inferred from tui_app.rs:6470-6478].
- Mode cycling should skip modes the session cannot use [inferred from next_available, tui_app.rs:128-134].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the `/permissions` view tabbed so the four lists are visible without retyping.
- [proposed] Show on the locked row which plan unlocks it and offer the upgrade link.
- [proposed] Update the brief to the seven effort levels and to the project-default save.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /model handler | `apps/cli/src/tui/tui_app.rs` | Picker or direct switch (tui_app.rs:5553-5573). |
| service | handle_model_picker_key / finish_model_pick / cycle_model | `apps/cli/src/tui/tui_app.rs` | Picker selection, managed entry, Alt+P cycling (tui_app.rs:5042-5200). |
| service | available_picker_models | `apps/cli/src/tui/tui_app.rs` | Catalog + OpenRouter cache + managed roster + discovered local models (tui_app.rs:3367-3378). |
| component | ModelPickerState and PickerRow | `apps/cli/src/tui/widgets/model_picker.rs` | Sections, lock rule, effort control (model_picker.rs:1-230). |
| service | AgentSession::switch_model, switch_model_by_name, enter_managed_model | `apps/cli/src/agent/mod.rs` | Model switch rules across trust modes (agent/mod.rs:1114-1250). |
| service | can_access_model_for_tier | `apps/cli/src/model_catalog.rs` | Plan tier gate for Cloud models in the CLI (model_catalog.rs:938-970). |
| service | AccountRoute and decide_turn_route | `apps/cli/src/models` | Which route a model can run on for this account. |
| service | gateway_models | `apps/cli/src/models/gateway_models.rs` | Managed model roster discovery and availability. |
| service | local_models | `apps/cli/src/local_models.rs` | Probes Ollama and LM Studio and lists discovered models. |
| command | /effort handler and effort picker | `apps/cli/src/tui/tui_app.rs` | Parse, apply and save the effort (tui_app.rs:5202-5230, 6452-6496). |
| config | Effort ladder | `apps/cli/src/design_system.rs` | Seven levels, labels, wire values, parse (design_system.rs:392-452). |
| service | effort_reaches_model | `apps/cli/src/models/streaming.rs` | Tells whether a route takes the effort (streaming.rs:668-675). |
| config | persist_effort_project | `apps/cli/src/config.rs` | Writes [default] reasoning_effort to the project config (config.rs:1144-1160). |
| command | permissions_for_display and rule mutators | `apps/cli/src/repl/registry.rs` | Tabs, add, remove, reset (registry.rs:803-940). |
| store | PermissionStore | `apps/cli/src/permissions.rs` | Persistent allow, ask, deny rules; session rules kept in the process (permissions.rs). |
| config | PermissionMode and launch resolution | `apps/cli/src/cli_options.rs` | Modes, aliases, persisted-mode safety (cli_options.rs:12-60). |
| service | InteractionMode | `apps/cli/src/tui/tui_app.rs` | Modes shown and cycled in the screen (tui_app.rs:88-160). |
| command | Cli flags --mode, --permission-mode, --allowedTools, --auto | `apps/cli/src/lib.rs` | Launch-time options (lib.rs:366-402, 467-478). |
| service | managed_permission_mode | `apps/cli/src/permissions.rs` | Managed policy can pin the mode (permissions.rs:356-368). |
| test | effort and cycling tests | `apps/cli/src/tui/tui_app.rs` | Lines 10147-10229 (effort), 13181 (cycling). |
| test | permission mode tests | `apps/cli/src/cli_options.rs` | Lines 276-768 (mode resolution and shell approval). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| `/model` builds the list: catalog entries, cached OpenRouter models, the managed roster fetched at startup, and local models found by probing the machine. | device and our servers | apps/cli/src/tui/tui_app.rs:3367-3378, 7035-7108 |
| A pick calls switch_model or enter_managed_model; trust-boundary rules decide whether it is allowed. | device | apps/cli/src/agent/mod.rs:1114-1250 |
| For a Managed model the roster must list it as available; otherwise ModelUnavailable. | our servers | apps/cli/src/agent/mod.rs:1232-1237 |
| `/effort` stores the level on the app, writes it to the project config file, and before every send copies it to the session with its thinking budget. | device | apps/cli/src/tui/tui_app.rs:6452-6470, 8237-8238 |
| The request builder includes the effort only if the route takes it; the provider then applies it. | outside service | apps/cli/src/models/streaming.rs:668-675 |
| `/permissions` loads the permission store file, changes it and saves; session rules live only in the process. | device | apps/cli/src/repl/registry.rs:875-940 |
| On each tool call the session mode and rules decide whether to run, ask or refuse. | device | apps/cli/src/cli_options.rs:12-60 and tests at 582-768 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Effort default | .agiworkforce/config.toml [default] reasoning_effort (apps/cli/src/config.rs:1144-1160) | No | Until edited. |
| Permission rules | Permission store file in the config folder (apps/cli/src/permissions.rs) | Not found to sync | `/permissions reset` clears all rules; remove clears one. |
| Session permission rules | Process memory | No | Gone at exit. |
| Chosen model | The managed session file (model and routing authority) (apps/cli/src/platform/runtime/session.rs) | Managed sessions push the model name to the account (apps/cli/src/agent/mod.rs:2714-2726) | With the session. |

**Models and providers.** The model list is not hard-coded in the screen: it comes from the shared catalog, the OpenRouter cache, the managed roster and local discovery. Cloud rows are gated by plan tier. Local and own-key rows are never gated by plan (apps/cli/src/tui/widgets/model_picker.rs:199-214). Provider names shown come from the design system (apps/cli/src/design_system.rs). See SYS-model-catalog-and-routing and SYS-inference-providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local and own-key models need no AGI account. Managed models need sign-in (apps/cli/src/cloud/client.rs:375-379). |
| Permissions | Rule edits go through the permission store; open-ended allow rules are refused; managed policy can pin the mode; bypass is never read from saved settings (apps/cli/src/repl/registry.rs:875-880, apps/cli/src/permissions.rs:356-368, apps/cli/src/cli_options.rs:29-45). |
| Subscription | For Cloud models the CLI requires a tier of Pro or higher; Free, Basic and Byok tiers are refused for Cloud models in the CLI; flagship additions need Max, Max15x, TeamPremium or Enterprise (apps/cli/src/model_catalog.rs:938-970). Plan names are as in the code (UserTier, apps/cli/src/tier_cache.rs:184-198). |
| Limits and metering | Usage of Cloud models is metered by the server (see F072-05). None found for switching or effort. |
| Feature flags | --model, --provider, --auto, --mode, --permission-mode, --allowedTools, --disallowedTools, --max-budget-usd (apps/cli/src/lib.rs:366-402, 467-478, 8188-8195). |
| Model compatibility | Effort applies only where the route supports it; otherwise a note is added (apps/cli/src/models/streaming.rs:668-675, apps/cli/src/claude_parity.rs:1711). Some models reject a configured temperature and a notice is shown at startup (apps/cli/src/tui/tui_app.rs:7068-7078). |
| Provider restrictions | A session fixed to Managed or own-key cannot switch to another trust mode; a fresh session is needed (apps/cli/src/agent/mod.rs:1135-1151, 1218-1231). |
| Local mode | Local models need no account or plan. In a Local session an id not in the catalog is checked against what the local servers report (apps/cli/src/agent/mod.rs:1179-1200). Switching a Local session to a keyed or managed model is not refused in switch_model (agent/mod.rs:1144); the later send gate was not traced. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown model id | `Model switch failed: Unknown model '<id>'. Run `agi models scan` ...`. | apps/cli/src/agent/mod.rs:1129-1133, apps/cli/src/tui/tui_app.rs:5571-5572 |
| Cross-boundary switch in an established session | Refused with text to start a new session. | apps/cli/src/agent/mod.rs:1144-1151 |
| Managed model not on the roster | ModelUnavailable error. | apps/cli/src/agent/mod.rs:1232-1237 |
| No other model to cycle to | Status notice `no other model to cycle to · /model lists them all`. | apps/cli/src/tui/tui_app.rs:5161-5167 |
| Effort not taken by route | Level set, note appended. | apps/cli/src/tui/tui_app.rs:6470-6478 |
| Project config cannot be written | Effort still applies for the session; the `saved as` text is dropped silently. | apps/cli/src/tui/tui_app.rs:6466-6470 (unwrap_or("")) |
| Permission rule already absent | Warning `No <scope> permission rule matched`. | apps/cli/src/repl/registry.rs:930-935 |
| Mode pinned by policy | Cycling reports a pinned-mode notice. | apps/cli/src/tui/tui_app.rs:7330-7340 (pinned_mode_notice) |
| Local discovery slow or offline | Local section fills when the 2.5 s probe completes; the picker still opens without it. | apps/cli/src/tui/tui_app.rs:7090-7108 |
| Accessibility | Line REPL has its own slash commands; the full-screen pickers are not available in plain mode. | apps/cli/src/lib.rs:8290-8300 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/tui/tui_app.rs`: Model picker selection applies effort only on success (10147); picker starts from the effort in force (10187); review uses TUI effort (10196); `/effort` takes every level and lists them on error (10222); cycling skips models the session cannot run (13181); mode kept on resume (8877); provider access mode classification (9446).
- `apps/cli/src/cli_options.rs`: Bypass never persisted, saved session never loosens the launch mode, repository or agent narrowing, auto mode and classifier-gated approvals, dangerous command asks (lines 276-768).
- `apps/cli/src/agent/mod.rs`: Session load and rejected routing authority tests (around line 3215).
- `apps/cli/src/tui/widgets/effort_picker.rs`: Effort picker snapshot (line 238).
- `apps/cli/src/tui/widgets/snapshots`: Model picker and effort picker baselines.
- `apps/cli/src/permissions.rs`: Permission store rules (tests inside the module; not itemised here).

**Test scenarios**

- **Switch within Managed**
  1. Sign in, start `agi` in Cloud mode.
  2. Type `/model`, pick another Managed model.
  - Expected: Banner confirms; the header shows the new model; next reply comes from it.
- **Refuse cross-boundary**
  1. Start a Managed session, send a message.
  2. Type `/model <an own-key model id>`.
  - Expected: Refusal that names the trust modes and asks for a new session.
- **Effort saved**
  1. Type `/effort high`.
  2. Read .agiworkforce/config.toml.
  3. Restart `agi`.
  - Expected: File has reasoning_effort high; the footer shows High after restart.
- **Permission round trip**
  1. `/permissions allow git status`.
  2. `/permissions allow`.
  3. `/permissions remove allow git status`.
  - Expected: Rule appears in the list, then disappears.
- **Mode flags**
  1. Run `agi --auto --model x`.
  2. Run `agi --mode plan`.
  - Expected: First errors on conflict; second starts in plan mode.
- **Plan too low**
  1. Use an account on a plan below Pro and open `/model`.
  - Expected: Cloud rows are annotated as locked; picking one does not run it.

**Where to look when it fails**

- Messages starting `Model switch failed:` or `Cannot switch models while the session's ... privacy authority conflicts`.
- `CliError::ModelUnavailable` text.
- `agi models list` and `agi models scan` output.
- `/status` prints session status lines (tui_app.rs:5815).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **The brief says /effort only changes the next request; the code also saves it as the project default.** Affects: surface:cli users who expect a one-off change.. Evidence: apps/cli/src/tui/tui_app.rs:6452-6470, apps/cli/src/config.rs:1144-1160. Work needed: Decide the intended behaviour and update the brief or add a session-only form.
- **The brief lists four effort levels; the code has seven.** Affects: Testers using the brief.. Evidence: apps/cli/src/design_system.rs:404-412. Work needed: Correct the brief.
- **If the project config cannot be written, `/effort` hides the failure.** Affects: surface:cli users in read-only folders.. Evidence: apps/cli/src/tui/tui_app.rs:6466-6470. Work needed: Report the save failure the way /theme does.
- **`/permissions` is not tabbed in the screen.** Affects: surface:cli full-screen users.. Evidence: apps/cli/src/repl/registry.rs:803-860. Work needed: Add tabs or document the sub-commands.
- **A Local session's switch_model has no trust check, unlike established Managed and own-key sessions.** Affects: surface:cli users in Local mode.. Evidence: apps/cli/src/agent/mod.rs:1144. Work needed: Confirm that a Local-to-own-key or Local-to-cloud switch is blocked or consent-gated at send time (see AGENTS.md section 6), and add a test.
- **No test found for the tier lock on model picker rows or for `--auto` conflicts.** Affects: Cloud users below the required tier.. Evidence: apps/cli/src/tui/widgets/model_picker.rs:206-214. Work needed: Add tests for locked rows and the CLI flag conflict.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- plan:pro
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- SYS-agents-tools-and-automation

## Unknown

- Whether provider:ollama is the exact folder name under packages/ai/providers; the folder list was not read.
- How a send is refused or consent-gated after a Local session switches to a keyed or managed model.
- The exact text and behaviour when a locked Cloud row is chosen.
- Whether `--max-budget-usd` applies to the interactive screen or only one-shot runs.
- Whether the effort value is honoured by every own-key provider; only Anthropic's thinking budget is named in code comments (tui_app.rs:8232-8236).
