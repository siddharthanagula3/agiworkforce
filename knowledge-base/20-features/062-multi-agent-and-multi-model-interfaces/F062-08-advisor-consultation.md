---
id: "F062-08"
type: "feature"
title: "Advisor consultation"
aliases: ["/advisor", "Advisor tool", "Advisor consultation", "advisor model", "[advisor model: ...] label", "S62.18"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.18"]
depends_on: ["surface:cli", "mode:own-key", "mode:cloud", "mode:local", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "file:apps/cli/src/platform/runtime/advisor.rs", "provider:anthropic", "provider:openai", "provider:google", "provider:xai", "provider:deepseek", "provider:qwen", "provider:minimax", "provider:openrouter", "provider:nvidia"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-08 Advisor consultation

In the command-line app, /advisor <question> sends one question to a stronger catalog-chosen model and prints the answer with the label '[advisor model: <name>]'. It is a side query: the conversation history is not sent and not changed. It is refused in Local mode. No other app has it.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.18](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6218).

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

**What it does.** Gives a second opinion on a side question from a separate model, without adding the question or answer to the main conversation. The agent can also call it as a tool named advisor.

**Why it exists.** Brief item S62.18 asks that the user or agent can consult an advisor model on a side question and see its answer. A one-shot call keeps the main context clean (apps/cli/src/platform/runtime/advisor.rs:1-5).

**Who uses it.** Developers using the CLI who want a second opinion mid-task.

**Problems it solves**

- Getting a stronger model's view without switching the session model.
- Keeping a side question out of the main transcript and context size.

**Use cases**

- Ask which of two designs is safer.
- Check a tricky regex with a stronger model.
- The agent itself calls the advisor tool for a hard decision.

## 2. User experience

**Where to find it**

- CLI full-screen view and line-based view: type /advisor <question> (apps/cli/src/tui/tui_app.rs:6671-6680; apps/cli/src/repl/slash_commands.rs:360-368).
- No control in web, desktop, mobile, VS Code or Chrome (no code found).

**Before you start**

- A session that is not Local (own key or Managed Cloud) (apps/cli/src/platform/runtime/advisor.rs:113-125).
- Own key: a provider key in the environment for a catalog provider (apps/cli/src/platform/runtime/advisor.rs:25-59). Cloud: signed in with a plan model available (apps/cli/src/platform/runtime/advisor.rs:127-148).

**Screens and controls**

- Text command only. Without a question the line is 'Usage: /advisor <question>, consult a catalog-selected advisor model'.

**Journey**

1. Type /advisor followed by the question.
2. Line view shows a spinner 'Advisor...'; full-screen view runs the call and adds a system message.
3. The answer appears, then the label '[advisor model: <id>]'.
4. Line view then prints '(advisor side query, not added to conversation)'.
5. Continue the main conversation; nothing from the advisor is in the history.

**What the person sees and gets**

- Answer text plus '[advisor model: <model>]' (apps/cli/src/repl/mod.rs:1033-1043; apps/cli/src/tui/tui_app.rs:6841-6851).
- Failure: 'Advisor failed: <reason>' (apps/cli/src/repl/mod.rs:529; apps/cli/src/tui/tui_app.rs:7858-7859).
- Local mode: 'advisor is unavailable in Local privacy mode: context must not leave this device. Switch to BYOK or Managed mode to use the advisor tool.' (apps/cli/src/features/exec/tools/task_registry/mod.rs:443-458).

**Settings**

- Provider keys through environment variables (names listed in apps/cli/src/platform/runtime/advisor.rs:61-75).
- Session privacy mode (Local, own key, Managed).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Both views parse /advisor and show a usage line when empty (apps/cli/src/tui/tui_app.rs:6671; apps/cli/src/repl/slash_commands.rs:360).
- The advisor builds a two-message prompt (system and the question only) and streams a reply with a 1024-token cap (apps/cli/src/platform/runtime/advisor.rs:197-221).
- The model is picked from the shared catalog: best active model by quality tier then context size, among providers with a key; for Managed it picks the best model the plan runs (apps/cli/src/platform/runtime/advisor.rs:77-108).
- The answer carries the model used and the label is printed (apps/cli/src/features/exec/tools/task_registry/mod.rs:476-490).
- The side request cost is recorded in the cost ledger (apps/cli/src/platform/runtime/advisor.rs:222).
- Not added to conversation: in the line view the result is printed to stderr only; in the full-screen view it is pushed to the display list, not the session (apps/cli/src/repl/mod.rs:515-533; apps/cli/src/tui/tui_app.rs:7831-7866).
- The advisor is also an agent tool in the tool catalog (apps/cli/src/platform/runtime/tool_catalog.rs:266, :302).

**Incomplete**

- The tool accepts an optional model argument; /advisor does not expose it (apps/cli/src/features/exec/tools/task_registry/mod.rs:469).
- Full-screen view does not print the 'not added to conversation' note; only the line view does (apps/cli/src/repl/mod.rs:521-525).

**Present but disconnected or switched off**

- claude_parity.rs returns NotHandled for /advisor so the command is handled by the CLI's own view code (apps/cli/src/claude_parity.rs:213).

**Not available**

- Web, desktop, mobile, VS Code, Chrome: no code found.
- Local inference as an advisor: refused by design in Local sessions.

## 4. Required behaviour

**Established requirements**

- No question shows a usage line. (source: S62.18 brief; apps/cli/src/tui/tui_app.rs:6672-6675)
- The answer is shown with a label naming the advisor model used. (source: S62.18; apps/cli/src/tui/tui_app.rs:6848)
- The question is a side query and is not added to conversation history. (source: S62.18; apps/cli/src/repl/mod.rs:521-525)
- The advisor model comes from the model catalog, not a name in screen code. (source: S62.18; AGENTS.md section 4; apps/cli/src/platform/runtime/advisor.rs:77-93)
- Nothing silently routes a Local chat to own key or Cloud. (source: doc: AGENTS.md section 6; apps/cli/src/platform/runtime/advisor.rs:119-125)

**Acceptance criteria**

1. /advisor with no text prints the usage line in both views.
2. In a Local session /advisor returns the Local-mode refusal and makes no network call.
3. In an own-key session with one provider key, the answer ends with '[advisor model: X]' where X is a catalog model of that provider.
4. After /advisor the session message count is unchanged.
5. In a Managed session the model is one the plan runs; with no such model the error says so.
6. With no key set, the error says no API key is configured.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The label should name the model that actually answered; the code uses the resolved model for cost but the requested one for the label [inferred from advisor.rs:222-241, a difference may exist].
- The advisor should not include session context; the code sends only the question [inferred from advisor.rs:197-204].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add /advisor to the VS Code chat as a slash entry using the same app-server tool.
- [proposed] Show the 'not added to conversation' note in the full-screen view too.
- [proposed] Offer an optional model argument on the command.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /advisor (TUI) | `apps/cli/src/tui/tui_app.rs:6671` | Parses the command and returns RunAdvisor. |
| command | RunAdvisor handler | `apps/cli/src/tui/tui_app.rs:7831` | Calls the advisor tool and pushes the result as a system message. |
| service | format_advisor_tool_output (TUI) | `apps/cli/src/tui/tui_app.rs:6841` | Appends '[advisor model: ...]'. |
| command | /advisor (line view) | `apps/cli/src/repl/slash_commands.rs:360` | Parses the command and returns Advisor. |
| service | run_advisor_question + format_advisor_tool_output | `apps/cli/src/repl/mod.rs:1004` | Runs the tool and formats output in the line view. |
| service | execute_advisor | `apps/cli/src/features/exec/tools/task_registry/mod.rs:443` | Tool wrapper: Local refusal, argument check, JSON result. |
| service | advisor::consult / advisor_route | `apps/cli/src/platform/runtime/advisor.rs:113` | Chooses model and route inside the session's trust boundary and streams the answer. |
| service | pick_default_advisor_model / best_managed_model | `apps/cli/src/platform/runtime/advisor.rs:25` | Catalog-based choice by quality tier and context size. |
| service | model_catalog::models_for / cloud_models | `apps/cli/src/model_catalog.rs` | Catalog source for the picker. |
| config | Local-mode guard for network tools | `apps/cli/src/features/exec/tools/mod.rs:725` | Blocks advisor, web search and fetch in Local sessions. |
| service | cost_ledger::record_side_request | `apps/cli/src/cost_ledger.rs` | Counts the advisor spend in the session budget. |
| config | Tool catalog entry 'Advisor' | `apps/cli/src/platform/runtime/tool_catalog.rs:266` | Names the tool for agent use and permissions. |
| test | advisor tests | `apps/cli/src/platform/runtime/advisor.rs (tests module)` | Route and key checks. |
| test | Local-mode advisor tests | `apps/cli/src/features/exec/tools/task_registry/mod.rs:1140` | Local refusal and not-blocked-outside-Local. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Command text is parsed; empty text shows usage. | device | apps/cli/src/tui/tui_app.rs:6671-6680 |
| The tool layer blocks the call in Local sessions before any network use. | device | apps/cli/src/features/exec/tools/mod.rs:725-735 |
| The route is chosen: Managed uses the account's plan models; own key picks a provider that has a key. | device | apps/cli/src/platform/runtime/advisor.rs:113-166 |
| The one-shot question is streamed to the chosen model. | outside service | apps/cli/src/platform/runtime/advisor.rs:206-221 (own key: provider API) |
| For Managed the request goes to the AGI Cloud service. | our servers | apps/cli/src/platform/runtime/advisor.rs:140 (Provider::ManagedCloud) |
| Usage is written to the cost ledger and the answer is printed with the model label. | device | apps/cli/src/platform/runtime/advisor.rs:222; apps/cli/src/repl/mod.rs:1033 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Question text and answer | terminal display only; not in the session messages | no | gone when the terminal view is cleared [unknown whether the full-screen display list is persisted] |
| Side-request cost row | CLI cost ledger | unknown | unknown |

**Models and providers.** The model comes from the catalog filtered to active models of providers with a key, ranked by quality tier, context window and output cap. The provider order is anthropic, openai, google, xai, deepseek, qwen, minimax, openrouter, nvidia (apps/cli/src/platform/runtime/advisor.rs:42-54). Managed picks from cloud models the account can run.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Managed sessions need a sign-in token (apps/cli/src/platform/runtime/advisor.rs:176-178). Own key needs no account. |
| Permissions | Runs through execute_tool_with_opts with auto_approve_safe true and no confirmation prompt (apps/cli/src/tui/tui_app.rs:7838-7851). |
| Subscription | Managed: the model must be one the account's plan runs, else the call is refused (apps/cli/src/platform/runtime/advisor.rs:131-139). Usage counts as subscription-included when the result says so (apps/cli/src/platform/runtime/advisor.rs:245-246). |
| Limits and metering | Max output 1024 tokens; usage recorded in the cost ledger. No separate advisor quota found. |
| Feature flags | none found in the code. |
| Model compatibility | Any catalog model with a supported provider mapping; unknown provider mapping errors with 'no supported provider mapping'. |
| Provider restrictions | Own key: provider list above. A model whose route mode differs from the session's trust boundary is refused (apps/cli/src/platform/runtime/advisor.rs:155-163). |
| Local mode | Refused with a message; no local model is used as advisor and no network call is made. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Usage line. | apps/cli/src/repl/slash_commands.rs:361-364 |
| Loading | Line view spinner 'Advisor...'; full-screen view shows no spinner for this call [not handled in the code, not found]. | apps/cli/src/repl/mod.rs:516 |
| Error | 'Advisor failed: ...' for no key, unrecognized model, no plan model, provider failure. | apps/cli/src/platform/runtime/advisor.rs:49-52, :186-191 |
| Local | Refusal text naming Local privacy mode. | apps/cli/src/features/exec/tools/task_registry/mod.rs:447-457 |
| Cancel / timeout / retry | Not handled in the code for /advisor specifically; no cancel key or retry was found. | apps/cli/src/repl/mod.rs:515-533 |
| Offline | Provider error shown as 'Advisor failed'. | apps/cli/src/repl/mod.rs:529 |
| Terminal text safety | Line view sanitizes the text before printing. | apps/cli/src/repl/mod.rs:518 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/platform/runtime/advisor.rs (tests module)`: Default model pick either names a keyed model or explains; no-key error; Managed never routes to a provider key.
- `apps/cli/src/features/exec/tools/task_registry/mod.rs:1140-1190`: Local-mode refusal and not blocked outside Local.
- `apps/cli/src/app_server/developer_host.rs:11612-11700`: Advisor privacy guard under the developer host.
- `apps/cli/src/tui/tui_app.rs:11413`: advisor is a registered runtime command.

**Test scenarios**

- **Usage line**
  1. Start the CLI.
  2. Type /advisor with nothing after it.
  - Expected: Usage line is shown; no network request.
- **Local refusal**
  1. Start a Local session.
  2. Type /advisor is this safe?
  - Expected: Refusal that context must not leave the device.
- **Own-key answer and label**
  1. Set one provider key, start an own-key session.
  2. Type /advisor name one risk of retries.
  - Expected: Answer then '[advisor model: <id>]'; /session message count unchanged.
- **Managed plan model**
  1. Sign in on a plan, start a Managed session.
  2. Type /advisor with a question.
  - Expected: Model label names a model the plan runs.
- **No key**
  1. Remove all provider keys, own-key session.
  2. Type /advisor hi.
  - Expected: 'no catalog-backed advisor model' or 'no API key configured' error.

**Where to look when it fails**

- Error prefixes 'advisor:' and 'Advisor failed:' / 'Advisor error:'.
- Cost ledger entry for the side request.
- Tool name advisor in tool-call logs.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **Advisor exists only in the CLI.** Affects: Web, desktop, mobile, VS Code, Chrome.. Evidence: No code found in those apps.. Work needed: Decide if the advisor belongs on other apps, and expose the tool through the app server for VS Code.
- **Full-screen view lacks the 'not added to conversation' note; the answer is shown as a system message.** Affects: CLI full-screen users.. Evidence: apps/cli/src/tui/tui_app.rs:7863-7866 vs apps/cli/src/repl/mod.rs:521-525. Work needed: Add the same note.
- **The label uses the requested model, which may differ from the model the provider resolved.** Affects: CLI.. Evidence: apps/cli/src/platform/runtime/advisor.rs:225-241. Work needed: Label with the resolved model.
- **No end-to-end test of /advisor output formatting found.** Affects: CLI.. Evidence: Only registration test at tui_app.rs:11413.. Work needed: Add a test for the label and the unchanged history.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- mode:own-key
- mode:cloud
- mode:local
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- file:apps/cli/src/platform/runtime/advisor.rs
- provider:anthropic
- provider:openai
- provider:google
- provider:xai
- provider:deepseek
- provider:qwen
- provider:minimax
- provider:openrouter
- provider:nvidia

## Unknown

- Whether the TUI advisor display messages are saved with the session.
- Whether the cost ledger syncs to the server.
- Which provider folder names map to every provider in the CLI's own list (the CLI uses its own provider names).
