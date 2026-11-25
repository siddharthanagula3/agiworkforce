---
id: "F015-10"
type: "feature"
title: "Sampling and provider route (developer controls)"
aliases: ["Sampling controls", "Temperature", "Top-p", "Provider route selection", "--temperature", "--provider", "Request parameters (public API)"]
area: "15 Model-selector interface"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S15.25", "S15.26"]
depends_on: ["SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-security-and-privacy", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/llm/v1/models", "api:POST /api/llm/v1/chat/completions", "file:apps/cli/src/lib.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-10 Sampling and provider route (developer controls)

Developer controls for temperature and for choosing which provider serves a model. Only the CLI exposes them: a --temperature flag, a --provider flag, and provider sections in its /model picker. The server and public API accept temperature and top-p, but Web, Desktop, Mobile, VS Code and Chrome show no control. Top-p is not available in the CLI.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.25](../../10-requirements/capabilities/015-model-selector-interface.md#s1525), [S15.26](../../10-requirements/capabilities/015-model-selector-interface.md#s1526).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a developer set how random the answers are (temperature) and pick the provider that serves a model, where an app exposes these.

**Why it exists.** Developers scripting or testing need repeatable or varied output and need to choose between direct providers. The brief lists them as 'where exposed' controls (brief S15.25, S15.26), so they are not required on consumer surfaces.

**Who uses it.** CLI users and developers calling the API.

**Problems it solves**

- Getting repeatable output for tests.
- Forcing a specific provider for a run.
- Knowing which request parameters a model accepts.

**Use cases**

- Run the CLI with --temperature 0.2 for steadier output.
- Run the CLI with --provider to force a provider for one session.
- In the CLI /model picker, jump between provider sections with Tab and choose a row under the wanted provider.
- A developer reads request_parameters from the public models list to see which sampling fields a model takes.

## 2. User experience

**Where to find it**

- CLI flags: -t/--temperature, -p/--provider, -m/--model, --auto (apps/cli/src/lib.rs:191-196,252-254,477).
- CLI /model picker: section headers 'Local', 'Bring your own key', 'Cloud subscription' with provider sub-headers; Tab jumps to the next provider (apps/cli/src/tui/widgets/model_picker.rs:109-170,693-740).
- CLI config key temperature (apps/cli/src/config.rs:1448,1503).
- Public API: field request_parameters in the models list and temperature and top_p in chat requests (apps/web/app/api/llm/v1/models/route.ts:60,118-120; chat/completions/lib/request-processor.ts:632-633).

**Before you start**

- CLI: a model that accepts sampling; otherwise the value is not sent and a notice shows (tui_app.rs:7089-7096).
- Provider route choice needs the provider to be reachable for the access mode (model_picker.rs:206-214).

**Screens and controls**

- Temperature accepts 0.0 to 1.0 in the CLI and is rejected outside that range (config.rs:1414-1418).
- Picker rows are grouped by access mode then provider; Enter selects the highlighted row and passes its provider (model_picker.rs:769-795).

**Journey**

1. Start the CLI with --temperature and/or --provider, or open /model.
2. Optionally press Tab to move between providers and Enter to choose.
3. The session uses the chosen model, provider and temperature; the banner reads 'Model changed to <id> (<tier>)' (model_picker.rs:780-790).

**What the person sees and gets**

- CLI system message 'Model changed to ...' after picking (model_picker.rs:787-790; tui_app.rs:5073-5100).
- CLI notice '<model> does not accept a temperature, so your configured <value> is not sent to it.' (tui_app.rs:7089-7096).
- Config print shows 'Temperature: <value>' when set (config.rs:1325-1327).

**Settings**

- CLI config file default temperature, default provider and model (config.rs:1320-1330,1448).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI --temperature is parsed and written into config (lib.rs:252-254,8750-8752) and validated 0.0 to 1.0 (config.rs:1414-1418).
- CLI forwards the temperature to requests and drops it for models the catalogue says reject sampling (apps/cli/src/models/streaming.rs:679-700,1109; apps/cli/src/model_catalog.rs:1528).
- CLI --provider and --model flags exist; --auto conflicts with both (lib.rs:191-196,477).
- CLI picker passes the selected provider id into the session switch; the Cloud provider enters a managed session (tui_app.rs:5073-5100).
- Server accepts temperature (0 to 2) and top_p (0 to 1), forwards temperature and passes other accepted fields through requestedParameters (request-processor.ts:632-633,6667; apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts:19-60).
- Public list publishes request_parameters per model from the harness and the model's rejections (route.ts:118-120; request-parameters.ts:44-60).

**Incomplete**

- Top-p is not available in the CLI: no top_p handling found in apps/cli/src (only a comment in model_catalog.rs:457).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Web, Desktop, Mobile, VS Code, Chrome: no temperature or top-p control found (files read: composer, settings, mobile streaming request type, extension types, VS Code package.json).
- No provider-route choice outside the CLI.

## 4. Required behaviour

**Established requirements**

- Where sampling settings are exposed, the user can set them (temperature, top-p). (source: brief S15.25 (cli done, api done; others missing))
- Where a model is offered by several providers, the user can choose which provider serves it. (source: brief S15.26 (cli done; api missing; others missing))
- Local, own-key and managed routes are separate trust boundaries and nothing may silently move between them. (source: AGENTS.md section 6)

**Acceptance criteria**

1. CLI with --temperature 1.5 fails with 'temperature must be between 0.0 and 1.0'.
2. CLI with --temperature 0.2 on a model that accepts sampling sends temperature 0.2; on a model flagged as rejecting sampling it sends none and prints the notice.
3. CLI --auto together with --model or --provider is refused by argument parsing.
4. In the CLI /model picker, choosing a row under a provider switches the session to that provider and prints the banner.
5. A chat request with top_p above 1 or temperature above 2 is rejected by validation.
6. The public models list returns a request_parameters array for every listed model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the CLI range is 0 to 1 and the server range is 0 to 2, a CLI value never exceeds the server limit [inferred].
- The brief's 'several providers per model' has a CLI form only if the same model appears under more than one provider section; this was not verified [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add --top-p to the CLI, validated like temperature, honouring the catalogue's rejection list.
- [proposed] Show request_parameters for the picked model in the CLI detail line.
- [proposed] If a developer panel is ever added to Web, read request_parameters from the catalogue rather than hard-coding fields.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | CLI argument definitions | `apps/cli/src/lib.rs` | --model, --provider, --temperature, --auto (191-196,252-254,477); overrides applied at 8722-8756. |
| config | CLI config temperature | `apps/cli/src/config.rs` | Validation 0.0-1.0, merge, get and set (905-906,1325,1414-1418,1448,1503). |
| service | CLI streaming temperature | `apps/cli/src/models/streaming.rs` | effective_temperature drops sampling for rejecting models (679-700,776,1109). |
| service | CLI sampling rejection list | `apps/cli/src/model_catalog.rs` | model_rejects_sampling_parameters (1528). |
| component | CLI model picker | `apps/cli/src/tui/widgets/model_picker.rs` | Access-mode and provider grouping, Tab jump, Enter select (109-170,693-795). |
| command | CLI finish_model_pick | `apps/cli/src/tui/tui_app.rs` | Switches provider and model, managed path for Cloud (5073-5100). |
| service | CLI provider display and access mode | `apps/cli/src/design_system.rs` | AccessMode and ProviderDisplay (100-196). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema with temperature and top_p (632-633), forwarding (6667). |
| service | request-parameters | `apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts` | Accepted and rejected parameters per model and harness (19-60). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes request_parameters (60,118-120). |
| test | CLI streaming tests | `apps/cli/src/models/streaming.rs` | Inline test effective_temperature_drops_sampling_for_models_the_catalog_flags (1629). |
| test | CLI config tests | `apps/cli/src/config.rs` | Inline tests for temperature bounds (2167-2190). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI parses flags and writes temperature and provider into the run config. | device | lib.rs:8722-8756 |
| Before each request the CLI removes temperature if the catalogue flags the model as rejecting sampling. | device | models/streaming.rs:688-700 |
| CLI sends the request directly to the chosen provider (own key, local) or through the managed gateway for Cloud. | device and our servers | tui_app.rs:5073-5100; AccessMode in design_system.rs:100-133 |
| Managed server validates and forwards accepted parameters to the provider. | our servers | request-processor.ts:632-633,6667; request-parameters.ts:19-60 |
| Provider generates the answer. | outside service | Provider call paths in packages/ai/providers (not read in detail) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Temperature and provider choice | CLI config file and in-memory session | No | Config values stay until edited; flag values last for the run |

**Models and providers.** Which parameters a model accepts comes from the catalogue reasoning block and harness definition. The provider route is chosen by the access mode and provider section in the CLI; on the server the route comes from the managed routing request builder.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local and own-key CLI use needs no AGI sign-in; Cloud rows need a signed-in plan tier (model_picker.rs:116-125,206-214). |
| Permissions | none found in the code for these flags. |
| Subscription | Cloud rows are plan-locked in the CLI picker; own-key and local rows are never gated (model_picker.rs:196-214). |
| Limits and metering | Temperature range 0.0-1.0 in the CLI, 0-2 on the server; no other limits found. |
| Feature flags | none found in the code for these controls. |
| Model compatibility | Models flagged rejectsSamplingParameters receive no temperature or top_p (model_catalog.rs:1528; request-parameters.ts:44-52). |
| Provider restrictions | A fast or switched model must stay inside the session's access mode; a different mode is refused (agent/mod.rs:2951-2958 for Fast; the picker switch path is switch_model, agent/mod.rs:1114). |
| Local mode | Local sessions send temperature to the local server unless the model is flagged; nothing leaves the device in Local mode (design_system.rs:116-133, privacy classification). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid temperature | Config validation error with the allowed range. | config.rs:1414-1418 |
| Model rejects sampling | Temperature dropped; TUI notice shown at start. | streaming.rs:688-700; tui_app.rs:7089-7096 |
| Conflicting flags | --auto with --model or --provider fails at parse time. | lib.rs:477 |
| Provider unknown or unreachable | Switch error 'Model switch failed: <reason>'. | tui_app.rs:5088-5094 |
| Accessibility, offline, retry | not handled in the code for these flags beyond the error message. | Searched model_picker.rs, lib.rs and config.rs for these flags; no offline or retry logic found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/models/streaming.rs`: Inline test that temperature is dropped for flagged models (line 1629).
- `apps/cli/src/config.rs`: Inline tests of temperature range and merge (2167-2260,2577).
- `apps/cli/src/tui/widgets/model_picker.rs`: Inline tests of rows and filtering (from line ~836).
- `apps/web/app/api/llm/v1/models/route.test.ts`: Public models list including request parameters (titles not read).

**Test scenarios**

- **Temperature bounds**
  1. Run the CLI with --temperature 1.5.
  - Expected: Error naming the 0.0 to 1.0 range.
- **Rejecting model**
  1. Set temperature in config.
  2. Start a session on a model the catalogue flags.
  - Expected: A system message says the temperature is not sent.
- **Provider grouping**
  1. Open /model.
  2. Press Tab repeatedly.
  - Expected: Cursor jumps to the first row of the next provider section.
- **Flag conflict**
  1. Run with --auto and --model <id>.
  - Expected: Argument error.
- **API parameters**
  1. Call the public models list.
  2. Send a chat request with top_p 2.
  - Expected: List shows request_parameters; request is rejected for top_p above 1.

**Where to look when it fails**

- CLI: 'Model switch failed:' system message; config validation text 'temperature must be between 0.0 and 1.0'.
- Server: validation error from the chat schema for temperature or top_p.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **Top-p cannot be set in the CLI.** Affects: CLI developers. Evidence: No top_p in apps/cli/src (only model_catalog.rs:457 comment). Work needed: Add a flag and config key if parity with the API is wanted.
- **No UI for sampling on Web, Desktop, Mobile, VS Code, Chrome.** Affects: Developers on those apps. Evidence: No control found in files read; brief marks missing. Work needed: Decide whether these surfaces need it; if so, drive it from request_parameters.
- **Provider-route choice is only implicit in the CLI (section under which a row sits); explicit choice among providers for one model was not verified.** Affects: CLI. Evidence: model_picker.rs:119-170. Work needed: Verify with a model served by two providers; add a route chooser if needed.
- **The brief marks the API as missing for provider-route selection; the models list gives no route choice.** Affects: API users. Evidence: route.ts:102-103 uses the default route only. Work needed: Decide the API contract; keep supplier names out of customer output per the catalogue rule.
- **CLI temperature help says 0.0-1.0 while the server allows up to 2.** Affects: CLI and API consistency. Evidence: lib.rs:252; request-processor.ts:632. Work needed: Align or document.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-security-and-privacy
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/llm/v1/models
- api:POST /api/llm/v1/chat/completions
- file:apps/cli/src/lib.rs

## Unknown

- Whether any model appears under more than one provider section in the CLI picker.
- Which provider names the --provider flag accepts beyond the four named in its help text.
- Whether top-p is handled by the managed gateway when sent by an API client (request-parameters.ts passes it; provider-level behaviour not read).
- Whether VS Code or Chrome expose sampling through settings not searched (package.json showed none).
- How unsupportedRequestParameter responds to a rejected parameter.
