---
id: "F072-07"
type: "feature"
title: "One-shot and scripted runs with output formats"
aliases: ["agi exec", "agi e", "one-shot run", "headless mode", "print mode (--print, --raw)", "--output-format", "--output", "--json", "--json-events", "stream-json", "NDJSON events", "S72.03", "S72.04", "S72.05", "S72.06", "S72.07", "S72.08"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.03", "S72.04", "S72.05", "S72.06", "S72.07", "S72.08"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/lib.rs", "file:apps/cli/src/sdk_io/protocol.rs", "file:apps/cli/src/agent_events.rs", "file:apps/cli/src/output.rs", "test:apps/cli/tests/json_events_jsonl.rs", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "F072-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-07 One-shot and scripted runs with output formats

The CLI (surface:cli only) can run one prompt to the end and exit. The prompt comes from the command line, from stdin or from a pipe. The reply prints as plain text, one JSON object, or a stream of JSON events. Two code paths exist: `agi "<prompt>"` and the `agi exec` subcommand. They do not behave the same.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.03](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7203), [S72.04](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7204), [S72.05](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7205), [S72.06](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7206), [S72.07](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7207), [S72.08](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7208).

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

**What it does.** Runs a single agent turn (including its tool loop) without opening the full-screen screen, writes the result to stdout in the chosen format and ends the process. `agi "<prompt>"` goes through run_oneshot (apps/cli/src/lib.rs:9146); `agi exec` has its own arm (apps/cli/src/lib.rs:6239-6490). Text for the prompt can come from an argument, `-`, `--stdin`, or a pipe, and `-f FILE` adds file context (apps/cli/src/lib.rs:8513-8548).

**Why it exists.** Scripts, CI jobs and shell pipelines need a non-interactive way to ask the agent something and read the answer in a machine-friendly form (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md, S72.03 to S72.08).

**Who uses it.** Developers who script the CLI, CI pipelines, and tools that embed the CLI and read its JSON or event stream.

**Problems it solves**

- Run the agent with no human at the keyboard.
- Feed command output (for example a diff) into a prompt.
- Get a reply that a program can parse: one JSON object or line-by-line events.
- Get only the reply text, with no spinner or cost line.

**Use cases**

- `git diff | agi "explain this change"` prints a text explanation.
- `agi --output-format json "summarise README.md" -f README.md` returns one JSON object a script parses.
- `agi --output-format stream-json "fix the failing test"` streams session, delta and tool events to a dashboard.
- `agi --json-events exec "hello"` streams typed lifecycle events for a CI log.

## 2. User experience

**Where to find it**

- surface:cli only: command line `agi [PROMPT]`, `agi exec <PROMPT>` (alias `e`). Flags: `--raw`, `--print`, `--json`, `--output-format text|json|stream-json` (alias `--output`), `--json-events`, `--stdin`, `-f/--file`, `-q/--quiet` (apps/cli/src/lib.rs:212-294, 767-780). Not on web, desktop, mobile, vscode or chrome.

**Before you start**

- Installed `agi` binary.
- A usable route: Local model, own provider key (`agi login <provider>`), or Cloud sign-in (`agi login`). Without one the run fails with an auth error (apps/cli/src/errors.rs:868-869).
- A trusted project folder: in headless use an untrusted folder stops the run with `Current project is not trusted...` (apps/cli/src/lib.rs:6160-6167).

**Screens and controls**

- No screen. Text mode shows a `Thinking...` spinner and rendered markdown, then a `cost:` line on stderr (apps/cli/src/lib.rs:9496-9530).
- `--raw`/`--print`: reply text only (apps/cli/src/lib.rs:9463-9490).
- `--output-format json` or `--json`: one pretty JSON object (apps/cli/src/lib.rs:9415-9462).
- `--output-format stream-json`: one JSON event per line (apps/cli/src/lib.rs:9299-9412).
- `--json-events`: a different, typed event stream (apps/cli/src/agent_events.rs:20-70).

**Journey**

1. 1. Type `agi "<prompt>"` or `agi exec "<prompt>"`; optionally pipe text in or pass `-f FILE`.
2. 2. The CLI loads config, checks folder trust and resolves the route (apps/cli/src/lib.rs:6159-6195).
3. 3. It reads stdin if requested or if stdin is not a terminal (apps/cli/src/lib.rs:8664-8671).
4. 4. It builds the final prompt: file context first, then `<stdin>...</stdin>` plus the prompt (apps/cli/src/lib.rs:8513-8548).
5. 5. It runs the turn and prints in the chosen format.
6. 6. The process exits; Ctrl+C cancels the turn and exits 130 (apps/cli/src/lib.rs:8633-8637).

**What the person sees and gets**

- Text: streamed markdown on stdout, `cost:` and `billed:` lines on stderr (apps/cli/src/output.rs:817-841).
- JSON: keys type, model, response, input_tokens, output_tokens, via_subscription, cost, duration_ms, is_error, incomplete (apps/cli/src/lib.rs:601-632). On failure the error JSON (type, is_error, error, kind, hint, retry_after_seconds, reference) goes to stderr (apps/cli/src/lib.rs:9457-9460, apps/cli/src/errors.rs:459-475).
- Stream-json events carry a `type`: status_update (session_start, session_end, budget_exhausted), user_message, stream_event (subtype text_delta, tool_use_start), tool_result, assistant_message, error (apps/cli/src/sdk_io/protocol.rs:12-95).
- `--json-events` events carry an `event` tag: spawning, ready_for_prompt, running_tool, tool_result, message_delta, turn_usage, fallback_triggered, finished, budget_exhausted, error (apps/cli/src/agent_events.rs:20-90).

**Settings**

- `updates`, `ui` and default model/provider in config.toml and environment variables AGIWORKFORCE_MODEL, AGIWORKFORCE_PROVIDER, AGIWORKFORCE_MAX_TOKENS (apps/cli/src/config.rs:1634-1670).
- `--max-turns`, `--effort`, `--system-prompt` and related flags apply to one-shot runs (apps/cli/src/lib.rs:6258-6260).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Output mode is chosen by resolve_oneshot_output_mode: JsonPretty, RawText, JsonLine or Text (apps/cli/src/lib.rs:574-592).
- Stdin is read for `-`, `--stdin` or a non-terminal stdin (apps/cli/src/lib.rs:7983, 8664-8671); file context first, `<stdin>` block before the prompt (apps/cli/src/lib.rs:8513-8548).
- `--print` with no prompt exits 1 with `--print requires a prompt argument.`; empty piped stdin with no prompt exits 1 with `No input received from stdin.` (apps/cli/src/lib.rs:8216-8224).
- Stream-json writes session_start and user_message first, text deltas live, tool lifecycle, then assistant_message and session_end; on failure an `error` event then session_end, then exit with the failure's exit code (apps/cli/src/lib.rs:9299-9412).
- Stream-json carries the stop reason max_tokens or refusal when a turn was cut short (apps/cli/src/lib.rs:9368-9380).
- Terminal escape sequences in model text are stripped before printing (apps/cli/src/output.rs:492-496).
- `--json-events` plus `exec` yields strict JSONL (apps/cli/tests/json_events_jsonl.rs, doc comment at line 1-20).

**Incomplete**

- `agi exec` does not read the top-level --output-format, --raw or --print (apps/cli/src/lib.rs:6239-6490 uses only its own `--json` and the top-level `--json-events`). Its JSON object has only response, input_tokens, output_tokens, sources, incomplete (apps/cli/src/lib.rs:6438-6457): no model, cost, duration or error state. S72.07 asks for those (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.07).
- `-p` is the short flag of `--provider` (apps/cli/src/lib.rs:195), and `--print` has only a long form (apps/cli/src/lib.rs:292-294). The brief and the first draft say `agi -p "<prompt>"`; that is not what the code defines. No `-p` rewrite was found [inferred].
- `--json-events` is not an alias of stream-json. The two schemas differ and clap makes them conflict (apps/cli/src/lib.rs:280-286; test apps/cli/src/lib.rs:10586-10595).
- Top-level `--json-events` without `exec` sets session.json_events but still runs the Text branch of run_oneshot (apps/cli/src/lib.rs:9238-9250, 9496-9530); what lands on stdout is unknown.

**Present but disconnected or switched off**

- Bidirectional SDK stdin/control in sdk_io is intentionally inactive (apps/cli/src/lib.rs:150-153; test name apps/cli/src/lib.rs:10966).

**Not available**

- No one-shot mode on web, desktop, mobile, vscode or chrome; the surface:vscode extension reaches the CLI runtime through other commands (doc: docs/product/surface-feature-matrix.md:26).

## 4. Required behaviour

**Established requirements**

- A prompt can run to completion without an interactive session and the process exits (`agi exec` / `-p`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.03)
- Prompt text can be supplied on stdin via `--stdin`, `-`, or auto-detected when stdin is not a TTY. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.04)
- Piped content is combined with the positional prompt and any --file context. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.05)
- A one-shot run can print bare response text with no spinner, cost line or formatting (`--raw`, `--print`, `--output-format text`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.06)
- A one-shot run can emit a single JSON result with response, tokens, cost, duration and error state. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.07)
- A one-shot run can stream NDJSON events: session start, user message, text deltas, tool lifecycle, final message, end or error. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.08)
- stdout carries payload only; diagnostics go to stderr. (source: apps/cli/src/lib.rs:226-232 init_tracing comment)

**Acceptance criteria**

1. `agi --output-format json "hi"` prints exactly one JSON object whose keys include type, model, response, input_tokens, output_tokens, via_subscription, cost, duration_ms, is_error.
2. `agi --raw "hi"` prints only the reply on stdout, with no spinner or ANSI colour.
3. `echo data | agi "summarise"` sends `<stdin>` content before the prompt.
4. `agi --output-format stream-json "hi"` prints one valid JSON object per line, starting with a status_update of reason session_start and ending with session_end.
5. `agi --print` with no prompt exits 1 and prints a message.
6. A failing JSON run prints error JSON on stderr and exits with the failure's class code.
7. `agi --output-format stream-json --json-events x` is rejected by the argument parser.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A script should treat an empty stdout plus a non-zero exit as failure in `--output-format json` mode because the error JSON goes to stderr [inferred from apps/cli/src/lib.rs:9457-9460].
- `agi exec` should accept the same output flags as the top-level path [inferred from S72.07 applying to `exec`].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give `agi exec` the same output-format handling and JSON shape as the top-level path, or document the difference in `--help`.
- [proposed] Make `-p` mean `--print` as in other coding CLIs, or remove `-p` from the brief.
- [proposed] Print the error JSON on stdout as well in json mode, matching stream-json's error event.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | Cli struct (flags) | `apps/cli/src/lib.rs` | Defines prompt, --raw, --print, --json, --output-format, --stdin, -f, --json-events (lines 168-494). |
| command | Command::Exec | `apps/cli/src/lib.rs` | `agi exec` subcommand and its separate run arm (767-780, 6239-6490). |
| service | run_oneshot | `apps/cli/src/lib.rs` | Top-level one-shot runner with four output branches (9146-9531). |
| service | resolve_oneshot_output_mode | `apps/cli/src/lib.rs` | Maps flags to Text, RawText, JsonPretty, JsonLine (574-592). |
| service | oneshot_result_json_value | `apps/cli/src/lib.rs` | Builds the JSON result object (601-632). |
| service | read_piped_stdin / build_final_prompt | `apps/cli/src/lib.rs` | Reads stdin and composes the prompt (8513-8548, 8664-8671). |
| service | launch_file_context | `apps/cli/src/lib.rs` | Reads -f files and the context URL into prompt text and images (8672-8690). |
| service | send_until_interrupted | `apps/cli/src/lib.rs` | Runs the turn and handles Ctrl+C (8583). |
| schema | SdkEvent / StreamEvent / StatusUpdateReason | `apps/cli/src/sdk_io/protocol.rs` | Stream-json event types with a `type` tag (12-95). |
| service | NdjsonWriter | `apps/cli/src/sdk_io/ndjson.rs` | Writes flushed NDJSON lines to stdout. |
| schema | AgentEvent | `apps/cli/src/agent_events.rs` | `--json-events` event type with an `event` tag; claim_machine_stream and emit_terminal_error (20-130). |
| service | result_error_json | `apps/cli/src/errors.rs` | Error JSON for failed json runs (459-475). |
| service | output print functions | `apps/cli/src/output.rs` | print_assistant_chunk, cost and billed lines, escape stripping (492-520, 773-841). |
| service | agent turn loop | `crates/agiworkforce-agent-core/src/engine.rs` | Tool loop with budget guard used by every one-shot run (79-87, 282-290). |
| test | json_events_jsonl | `apps/cli/tests/json_events_jsonl.rs` | Integration test of strict JSONL with --json-events exec. |
| test | lib.rs unit tests | `apps/cli/src/lib.rs` | Prompt composition, output mode, stream-json envelope tests (10505-10600, 11021). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Parse flags, enter --repo folder, set plain mode, check folder trust, load merged config. | device | apps/cli/src/lib.rs:5902-6195 |
| Read stdin and file context; build the final prompt. | device | apps/cli/src/lib.rs:7983, 8093-8097, 8513-8548 |
| Resolve the route (Local, own key or Cloud) and create the agent session. | device | apps/cli/src/lib.rs:9146-9180; apps/cli/src/models/provider_dispatch.rs:395-440 |
| Send the model request. Local models run on the user's machine; own-key calls go to the vendor; Cloud calls go to AGI's managed service. | outside service | apps/cli/src/models/provider_dispatch.rs:395-440 [inferred for the Local vs vendor split] |
| Managed turns are recorded against the account allowance on our servers; `billed:` line reads it back. | our servers | apps/cli/src/output.rs:833-841; apps/cli/src/usage_summary.rs (billed_turn) |
| Print the result in the chosen format and exit with the mapped status. | device | apps/cli/src/lib.rs:9299-9531, 8797-8821 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Managed session record of the turn | Device session store under the config folder (~/.agiworkforce or AGIWORKFORCE_HOME) | Not synced by this feature; persistence can be turned off with --no-session-persistence (apps/cli/src/lib.rs:433) | Kept until the user deletes it; deletion rules unknown |
| Prompt, stdin text, file contents | Sent to the chosen route only; not otherwise stored by this feature | Goes to the model route in use | Vendor or AGI retention is outside this page (unknown) |

**Models and providers.** The model is chosen by -m, AGIWORKFORCE_MODEL or config default (apps/cli/src/lib.rs:8030-8046). Comma-separated -m lists form a fallback chain. `--auto` routes only within Cloud (apps/cli/src/lib.rs:8007-8057). Any provider the CLI supports can answer; the output format does not depend on the model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for Local or own-key runs. Cloud needs `agi login`; signed out fails with an account-signed-out error mapped to exit 77 (apps/cli/src/errors.rs:868-869). |
| Permissions | Tool approvals follow --mode, -y, --full-auto, --dangerously-skip-permissions; headless refuses file changes that need approval (apps/cli/src/lib.rs:6258-6285; apps/cli/src/features/exec/tools/file_ops/mod.rs:96-118). |
| Subscription | Managed developer surfaces including the CLI are listed for Premium and above (doc: docs/product/definition.md:294-301). Plan-excluded models map to exit 78 (apps/cli/src/errors.rs:891-894). Server-side enforcement for the CLI turn path was not found: unknown. |
| Limits and metering | Managed turns report via_subscription and cost in credits in the JSON (apps/cli/src/output.rs:807-814). --max-budget-usd caps spend (apps/cli/src/lib.rs:492). Plan quotas: usage-limit and paywall errors exit 78 (apps/cli/src/errors.rs:891-894). |
| Feature flags | The CLI shows `Coming soon` on the web surface list (apps/web/lib/surface-status.ts:9); no feature flag gates one-shot runs in the code read: none found in the code. |
| Model compatibility | No format depends on a model. via_subscription is true only for managed turns [inferred from apps/cli/src/lib.rs:9437-9442]. |
| Provider restrictions | none found in the code for the output formats. `--auto` is Cloud only (apps/cli/src/lib.rs:372-373 flag doc near 470-480). |
| Local mode | One-shot runs work with a Local model and no sign-in; nothing is sent to our servers by this feature except what the route needs. The `billed:` lookup is for managed turns only [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty piped stdin, no prompt | Prints `No input received from stdin.` and exits 1. | apps/cli/src/lib.rs:8222-8224 |
| --print without prompt | Prints error and exits 1. | apps/cli/src/lib.rs:8216-8219 |
| Error in json mode | Error JSON on stderr, stdout empty, exit code of the failure class. | apps/cli/src/lib.rs:9455-9461 |
| Error in stream-json | An `error` event with code turn_failed, then session_end, then exit. | apps/cli/src/lib.rs:9385-9411 |
| Cut-off answer | JSON carries `incomplete` kind, message, hint; stream-json stop_reason max_tokens or refusal. | apps/cli/src/lib.rs:601-632, 9368-9380 |
| Ctrl+C | Cancels the turn, kills tool processes, exits 130. | apps/cli/src/lib.rs:8633-8637 |
| Reader closes the pipe | Exits quietly with status 141. | apps/cli/src/broken_pipe.rs:7; apps/cli/src/lib.rs:8814-8816 |
| Stdin that never closes (non-terminal) | The read waits for end of input [inferred]; no timeout found: not handled in the code. | apps/cli/src/lib.rs:8664-8671 |
| Offline / network failure | Network error maps to 69 (connection) or 75 (timeout); no automatic retry at this layer is shown here. | apps/cli/src/lib.rs:8829-8845 |
| Screen reader and plain | Plain mode removes the spinner (announced once) but labels appear only in the interactive line mode. | apps/cli/src/output.rs:245-262; apps/cli/src/lib.rs:5974-5980 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/lib.rs`: Unit tests: `-` prompt uses stdin, file context before stdin prompt, output-format selects JSONL, stream-json text delta envelope and tool lifecycle, stream-json conflicts with --json-events, JSON result states a cut-off answer, exec takes run limits (lines 10505-10600, 10908-10930, 11021).
- `apps/cli/tests/json_events_jsonl.rs`: Runs the real binary with --json-events exec and checks every stdout line is JSON and carries message_delta and a matching session id.
- `apps/cli/tests/broken_pipe.rs`: A reader that stops early ends the CLI quietly with the SIGPIPE status (test name).
- `apps/cli/src/errors.rs`: Error JSON and incomplete-turn kinds (tests near lines 2205-2300).

**Test scenarios**

- **JSON one-shot**
  1. Run `agi --output-format json "say hi"` with a working route.
  2. Pipe stdout to `jq .`
  - Expected: One object with type result, response, token counts, cost string, duration_ms, is_error false.
- **Piped input**
  1. Run `printf 'a\nb' | agi --raw "count the lines"`.
  - Expected: Only reply text on stdout; the model saw a `<stdin>` block before the prompt.
- **Stream-json order**
  1. Run `agi --output-format stream-json "hi" | head -3`.
  - Expected: First line status_update/session_start, second user_message, then stream_event text_delta lines.
- **exec vs top-level**
  1. Run `agi exec "hi" --json` and `agi --json "hi"`.
  2. Compare keys.
  - Expected: Different keys: exec lacks model, cost, duration_ms, is_error (current behaviour, a gap).
- **Failure in json mode**
  1. Sign out, pick a Cloud-only model, run `agi --json "hi" >out 2>err; echo $?`.
  - Expected: out empty, err holds error JSON with kind, exit status 77.
- **Empty pipe**
  1. Run `true | agi`.
  - Expected: `No input received from stdin.` and exit 1.

**Where to look when it fails**

- stderr lines `Error: ...` (apps/cli/src/lib.rs:8823-8827).
- `--debug` or `-v` for tracing on stderr (apps/cli/src/lib.rs:226-290).
- JSON field `kind` and `reference` (apps/cli/src/errors.rs:459-475).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **`agi exec` ignores --output-format, --raw, --print and returns a thinner JSON object.** Affects: surface:cli scripts using exec. Evidence: apps/cli/src/lib.rs:6239-6490, 6438-6457. Work needed: Route exec through run_oneshot or share the result builder.
- **`-p` is --provider, not print; the brief and draft say `agi -p "..."`.** Affects: surface:cli users coming from other coding CLIs. Evidence: apps/cli/src/lib.rs:195, 292-294. Work needed: Decide the meaning of -p and update docs or the flag.
- **JSON mode failure goes to stderr only, stream-json on stdout; inconsistent error contract.** Affects: surface:cli CI users. Evidence: apps/cli/src/lib.rs:9385-9411, 9455-9461. Work needed: Pick and document one rule.
- **Two event schemas (--json-events and stream-json) with no shared documentation.** Affects: surface:cli integrators. Evidence: apps/cli/src/agent_events.rs:20-90; apps/cli/src/sdk_io/protocol.rs:12-95. Work needed: Document both; consider retiring one.
- **Top-level --json-events without exec is undefined.** Affects: surface:cli. Evidence: apps/cli/src/lib.rs:9238-9250. Work needed: Trace and either support or reject it.
- **No integration test exercises run_oneshot json or stream-json against a real binary.** Affects: surface:cli. Evidence: apps/cli/tests/ lists only json_events_jsonl.rs for events. Work needed: Add binary-level tests with a local fake route.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/lib.rs
- file:apps/cli/src/sdk_io/protocol.rs
- file:apps/cli/src/agent_events.rs
- file:apps/cli/src/output.rs
- test:apps/cli/tests/json_events_jsonl.rs
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- F072-08

## Unknown

- What a top-level `--json-events` run without `exec` prints on stdout.
- Whether any test runs the binary in json or stream-json mode end to end.
- Whether `agi exec x --output-format json` is refused by clap, since --output-format is not marked global (apps/cli/src/lib.rs:280-286) [inferred].
- How long a non-closing stdin blocks a run.
- Server-side plan enforcement for managed CLI turns.
