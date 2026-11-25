---
id: "F072-05"
type: "feature"
title: "Context, usage and compaction"
aliases: ["Context command", "S72.17", "Usage command", "S72.18", "Compact-context command", "S72.19", "/context", "/ctx", "/usage", "/compact", "context meter"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.17", "S72.18", "S72.19"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/usage", "api:GET /api/usage/history", "file:apps/cli/src/usage_summary.rs", "file:apps/cli/src/compaction.rs", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-05 Context, usage and compaction

Three commands in the CLI chat screen: `/context` shows how full the model's window is and what is in it, `/usage` shows this session's tokens and estimated cost plus the account allowance (Cloud only), and `/compact [focus]` summarises the conversation and reports before and after size.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.17](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7217), [S72.18](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7218), [S72.19](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7219).

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

**What it does.** Shows window fill with a bar and a list of what is in context, shows session token and cost totals and the account's credit windows, and shrinks the conversation by summarising older turns.

**Why it exists.** Long agent sessions run out of context and cost money. The brief asks for a context report, a usage report from the shared ledger, and a compact command with focus text and a before/after report (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.17-S72.19).

**Who uses it.** Developers on long tasks and anyone watching spend or allowance.

**Problems it solves**

- Surprise context overflow.
- Not knowing what is eating the window.
- Not knowing the remaining allowance.
- Losing the thread when the chat is too long.

**Use cases**

- `/context` before a big paste to see if there is room.
- `/compact keep the API design decisions` to free space while keeping a topic.
- `/usage` to see the 5-hour, weekly and monthly credit windows on a Cloud plan.

## 2. User experience

**Where to find it**

- surface:cli full-screen screen and line mode: `/context` (alias `/ctx`), `/usage`, `/compact [focus]` (apps/cli/src/tui/tui_app.rs:5820, 5995, 6498).
- The header and footer also show a context meter and counts (apps/cli/src/tui/tui_app.rs:11971, 13055-13143).
- A shell usage command is cited by the brief (apps/cli/src/lib.rs:4049); not traced here.

**Before you start**

- None for `/context` and `/compact`.
- For account numbers in `/usage`: a Cloud (Managed) session and a signed-in account (apps/cli/src/usage_summary.rs:497-503).

**Screens and controls**

- `/context`: line `Context: [##### ] NN% (used K / limit K tokens)` then `In context:` rows: System prompt, Instructions, Rule, Attached file, Added directory, Conversation, MCP tools (apps/cli/src/compaction.rs:70-100, apps/cli/src/agent/history.rs:17-62).
- `/usage`: this session's input, output, cache read and write tokens, estimated cost, per-model breakdown, turn count, then `Account usage` lines (apps/cli/src/tui/tui_app.rs:6498-6512, apps/cli/src/usage_summary.rs:564-640).
- `/compact` and `/compact <focus text>` (apps/cli/src/tui/tui_app.rs:7755-7768).

**Journey**

1. 1. User types `/context`; the report appears as a system message.
2. 2. User types `/usage`; the CLI blocks briefly on a separate thread while it asks the server, then prints session and account lines.
3. 3. User types `/compact keep tests`; the CLI summarises earlier turns with the current model and prints a receipt such as `Compacted N earlier messages: ~A -> ~B tokens (P% of estimated model window).`

**What the person sees and gets**

- `/context` bar, percent and token counts.
- `/usage` lines: `Account usage`, `Plan: <label>`, `5-hour window: X of Y credits used, Z left, resets ...`, `Weekly`, `Monthly`, optional `Flagship weekly`, purchased credits and `Add credits: <link>`; or percentages when the server reports no credits; `No allowance remaining on this plan` when exhausted (apps/cli/src/usage_summary.rs:564-640).
- `/compact` receipt: `Compacted N earlier messages: ...`, `Trimmed long tool output: ...`, or `Nothing to compact: no earlier turn could be summarized ...` (apps/cli/src/compaction.rs:112-133).
- If the account cannot be read: `Account usage` then ` Unavailable: <reason>` (apps/cli/src/usage_summary.rs:557-562).

**Settings**

- `[default] max_tokens` is the output reserve used for context and compaction (apps/cli/src/tui/tui_app.rs:5820-5823, apps/cli/src/agent/chat.rs:1030-1032).
- Context-meter items in the status line settings (`/statusline`) (apps/cli/src/tui/tui_app.rs:6512-6520).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Context is measured with the shared agent-core budget over the message list and the model window minus the reserved output (apps/cli/src/compaction.rs:35-67, agent/history.rs:17-20).
- If the catalog has no window for the model the CLI assumes 128,000 tokens (apps/cli/src/compaction.rs:9, 28-35).
- `/usage` combines session totals from the local cost ledger with account data from `GET /api/usage` and `/api/usage/history` (apps/cli/src/usage_summary.rs:15-17, 358-366, 520-536).
- Account usage is read only for Managed sessions; Local and own-key sessions get a boundary line instead (apps/cli/src/usage_summary.rs:497-503, test line 914).
- A BYOK-tier account in Managed mode gets `this account runs in BYOK mode, so provider spend is billed by the provider` (apps/cli/src/usage_summary.rs:343-356).
- No credential: `no AGI credential, so this session runs local or BYOK, run `agi login` to see account usage` (apps/cli/src/usage_summary.rs:343-356).
- The plan shown is taken from the server answer, replacing a stale cached tier (apps/cli/src/usage_summary.rs:358-366, test line 1130).
- `/compact` runs the shared compaction with a target of half the window and an optional focus phrase, using the session's own provider and model, and then refreshes the stats (apps/cli/src/agent/chat.rs:1018-1039, apps/cli/src/tui/tui_app.rs:7755-7768).
- The receipt distinguishes nothing-to-compact, trimmed tool output and summarised messages (apps/cli/src/compaction.rs:112-133, tests 354-376).
- Export after compaction still carries the summarised content (apps/cli/src/repl/registry.rs test line 689).

**Incomplete**

- `/usage` totals are an estimate from catalog prices; a test names the session estimate as an estimate (apps/cli/src/usage_summary.rs test line 1113). Local models are listed with zero prices in the picker catalog so their estimated cost is zero [inferred from apps/cli/src/tui/tui_app.rs:3384-3408].
- For discovered local models the context window is 0 in the picker catalog; `/context` falls back to 128,000 even if the real window differs [inferred from apps/cli/src/compaction.rs:28-35 and tui_app.rs:3395].

**Present but disconnected or switched off**

- `/usage` with the line REPL: whether it prints the same lines was not traced.

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: not part of this item.
- Per-turn billed credits come from `/api/usage/turns/<id>`, used after turns (apps/cli/src/usage_summary.rs:380-420); not a slash command.

## 4. Required behaviour

**Established requirements**

- A context command shows how much of the model context window the current conversation occupies. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.17)
- A usage command shows session tokens/cost and the account allowance from the shared usage ledger. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.18)
- A compact command summarises the conversation to free context, optionally with focus instructions, and reports before/after size. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.19)
- Every subscription capability connects to one AGI Subscription system (entitlements, usage accounting, quotas, limits); local inference is free of any paid subscription. (source: doc: task product context (established requirement for this knowledge base))

**Acceptance criteria**

1. `/context` on a new session shows a low percent and lists System prompt and Conversation rows.
2. After a long paste, `/context` shows a higher percent.
3. `/usage` in a Cloud session shows the plan and the credit windows from the server.
4. `/usage` in a Local or own-key session still shows session tokens and a boundary line instead of account numbers.
5. `/usage` with no account says to run `agi login`.
6. `/compact` on a long chat prints a receipt with before and after tokens, and `/context` afterwards shows a lower percent.
7. `/compact` on a one-exchange chat says `Nothing to compact`.
8. `/compact keep the schema` adds the focus to the summary instruction.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Account numbers shown by `/usage` must be the same ones the web app shows, since both read `/api/usage` [inferred from apps/web/app/api/usage/route.ts existing and usage_summary.rs:15].
- Compaction in a Cloud session should bill like any other turn, because it uses the session's provider [inferred from agent/chat.rs:1057-1060].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the real window for discovered local models, or say the window is assumed.
- [proposed] State in `/usage` that Local usage is free of charge instead of showing a zero estimate.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | compaction (CLI adapter) | `apps/cli/src/compaction.rs` | Window lookup, usage, report format, receipt (compaction.rs:1-133). |
| service | AgentSession::context_report | `apps/cli/src/agent/history.rs` | Builds the `/context` text (history.rs:17-62). |
| service | AgentSession::compact_now | `apps/cli/src/agent/chat.rs` | Runs compaction with focus and half-window target (chat.rs:1018-1039). |
| service | agiworkforce_agent_core::context | `crates/agiworkforce-agent-core` | Shared token estimate, budget and compaction engine; not opened here. |
| command | /context, /usage, /compact handlers | `apps/cli/src/tui/tui_app.rs` | Dispatch (tui_app.rs:5820, 5995, 6498, 7755). |
| service | usage_summary | `apps/cli/src/usage_summary.rs` | Fetch and render account usage; local-only modes (usage_summary.rs:1-640). |
| endpoint | api:GET /api/usage | `apps/web/app/api/usage/route.ts` | Account allowance and plan; the CLI reads it (usage_summary.rs:15). |
| endpoint | api:GET /api/usage/history | `apps/web/app/api/usage/history/route.ts` | Usage history shown under account usage (usage_summary.rs:16, 444). |
| endpoint | api:GET /api/usage/turns/{id} | `apps/cli/src/usage_summary.rs` | Per-turn settlement polling (usage_summary.rs:17, 380-420); web route file not checked. |
| service | cost_ledger | `apps/cli/src/cost_ledger.rs` | Session token and cost totals with per-model breakdown. |
| service | tier_cache | `apps/cli/src/tier_cache.rs` | JWT, cached tier, API base and request context (tier_cache.rs:184-198). |
| component | render_usage | `apps/cli/src/tui/widgets/screen_renderers.rs` | Formats the `/usage` screen text. |
| service | model_catalog::context_window | `apps/cli/src/model_catalog.rs` | Window size per model from the generated catalog. |
| service | CloudClient::admit | `apps/cli/src/cloud/client.rs` | Boundary check used before any account request (client.rs:368-373). |
| component | Header and footer context meter | `apps/cli/src/tui/tui_app.rs` | Percent meter in the chrome (tui_app.rs:1104-1118, 13055-13143). |
| test | compaction tests | `apps/cli/src/compaction.rs` | Receipt and window tests (compaction.rs:324-410). |
| test | usage_summary tests | `apps/cli/src/usage_summary.rs` | Parsing, rendering, boundary tests (usage_summary.rs:914-1210). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| `/context` counts tokens of the in-memory messages with the shared estimate and prints the report; no network. | device | apps/cli/src/compaction.rs:35-67, apps/cli/src/agent/history.rs:17-20 |
| `/usage` prints local ledger totals, then spawns a thread with its own runtime to ask the account. | device | apps/cli/src/usage_summary.rs:540-555, apps/cli/src/tui/tui_app.rs:6498-6512 |
| The account call is allowed only for a Managed session, then sends the saved account token to `/api/usage` and `/api/usage/history` in parallel. | our servers | apps/cli/src/usage_summary.rs:497-503, 520-536 |
| A 401/403-type answer clears the cached tier and the CLI prints the server's reason. | our servers | apps/cli/src/usage_summary.rs:480-490 |
| `/compact` sends the older messages to the session's model to write a summary, then replaces them in memory and in the session file. The route is the session's own: device for Local, outside service for own key, our servers for Cloud. | device and our servers | apps/cli/src/agent/chat.rs:1018-1039 (route is the session's provider) |
| After compaction the stats and meter refresh. | device | apps/cli/src/tui/tui_app.rs:7755-7768 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session token and cost totals | In memory in the cost ledger and the session file (apps/cli/src/cost_ledger.rs) | Not synced by this feature; the server keeps its own usage record for Cloud turns | With the session. |
| Account allowance | Server; the CLI reads it on demand and may cache the plan tier (apps/cli/src/usage_summary.rs:358-366, tier_cache.rs) | Server is the source of truth | Not stored by `/usage` beyond the tier cache. |
| Compacted conversation | Session messages, with the summary replacing older turns; shown history keeps what was summarised (apps/cli/src/agent/history.rs:74-80, registry.rs test 689) | Managed sessions push to the account at exit | With the session. |

**Models and providers.** Window size comes from the generated model catalog; unknown models use 128,000. The summary is written by the session's current model and provider (apps/cli/src/agent/chat.rs:1044-1066 for the sibling compact_from uses the same summarizer on self.provider). Provider-reported usage anchors the token count when available (apps/cli/src/compaction.rs:48-67). See SYS-subscriptions-entitlements-and-usage for the allowance model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | `/context` and `/compact` need none. `/usage` account lines need sign-in and a Managed session. |
| Permissions | `/usage` account call uses the saved account token only; the boundary check refuses Local and own-key sessions (apps/cli/src/cloud/client.rs:366-373). |
| Subscription | The plan label and credit windows come from the server for the signed-in account (apps/cli/src/usage_summary.rs:564-640). The CLI does not decide entitlements itself in this feature. |
| Limits and metering | 5-hour, weekly, monthly and flagship-weekly credit windows, purchased credits, and an `exhausted` line are shown from `/api/usage`; the CLI has no limit of its own here (apps/cli/src/usage_summary.rs:564-640). |
| Feature flags | None found. |
| Model compatibility | Works with any model; accuracy of the window depends on the catalog entry. Models with no window use 128,000 (apps/cli/src/compaction.rs:28-35). |
| Provider restrictions | Account usage is Cloud only; Local and own-key show a boundary or provider-billed note (apps/cli/src/usage_summary.rs:343-356, 497-503). |
| Local mode | `/context` and `/compact` work fully on the device with a local model. `/usage` shows session totals and `Account usage / Unavailable: Local: nothing is sent to your AGI cloud account in this mode. Switch to Cloud mode with /model to use this.` (apps/cli/src/cloud/client.rs:49-54, apps/cli/src/usage_summary.rs:497-518). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | `/usage` blocks the screen while it waits on the account thread; no spinner was found. | apps/cli/src/usage_summary.rs:540-555 |
| Empty conversation | `/context` reports a near-zero fill; `/compact` says nothing to compact. | apps/cli/src/compaction.rs:112-133 |
| Signed out | `no AGI credential ... run `agi login``. | apps/cli/src/usage_summary.rs:343-356 |
| Server error or malformed body | `Unavailable: usage API returned HTTP <n>` or a parse error; a malformed summary is an error, not a zero allowance. | apps/cli/src/usage_summary.rs:492-497, test 1107 |
| Entitlement changed | Cached tier invalidated and the server's reason shown. | apps/cli/src/usage_summary.rs:480-490, test 1164 |
| Allocation pending | `Allowance: not provisioned yet`, not shown as spent. | apps/cli/src/usage_summary.rs:572-574, test 1095 |
| Compaction failure | The result reports nothing compacted; whether a model error is surfaced separately was not traced. | apps/cli/src/compaction.rs:112-133 |
| Offline | `/usage` prints `Unavailable: <transport error>`; `/context` still works. | apps/cli/src/usage_summary.rs:557-562 |
| Retry, timeout | Not handled in the code for `/usage`: one attempt per call; turn settlement uses a polling schedule (TURN_SETTLEMENT_POLL_DELAYS_MS) after turns. | apps/cli/src/usage_summary.rs:380-420 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/compaction.rs`: Token estimate delegation, receipt wording for nothing changed, pruned only, summarised, single exchange, catalog limit use (lines 324-410).
- `apps/cli/src/usage_summary.rs`: Local or BYOK never reads account usage (914); contract fields parsed (989); meters with remaining and reset (1020); percentage fallback (1048); exhausted plan (1073); pending allocation (1095); malformed summary (1107); estimate label (1113); server plan overrides stale tier (1130); null five-hour window (1143); entitlement answers (1164, 1177).
- `apps/cli/src/tui/tui_app.rs`: Header and footer context meter and window label tests (lines 11971-12002, 13055-13143).
- `apps/cli/src/repl/registry.rs`: Export after compaction carries what was summarised; restoring a checkpoint from before compaction keeps the whole conversation (lines 689-705).
- `apps/web/app/api/usage`: Web route for /api/usage exists; its tests were not listed here.

**Test scenarios**

- **Context grows**
  1. New session: `/context`.
  2. Paste a large file, send, `/context` again.
  - Expected: Percent and token numbers rise; Conversation row grows.
- **Compact with focus**
  1. After a long chat type `/compact keep the failing test names`.
  2. Type `/context`.
  - Expected: A receipt line with before and after tokens; fill percent is lower; the summary mentions the focus.
- **Cloud usage**
  1. Sign in, Cloud mode, `/usage`.
  - Expected: Plan and credit windows match the web usage page.
- **Local usage**
  1. Local model, `/usage`.
  - Expected: Session totals and the Local boundary line, no account numbers.
- **Signed out**
  1. Remove credentials, Managed default, `/usage`.
  - Expected: A message to run `agi login`.
- **Nothing to compact**
  1. Fresh session with one exchange, `/compact`.
  - Expected: `Nothing to compact: no earlier turn could be summarized ...`.

**Where to look when it fails**

- Lines starting `Unavailable:` under `Account usage`.
- `usage API returned HTTP <status>`.
- `Managed account changed; retry usage`.
- `AGIWORKFORCE_API_BASE must be an https agiworkforce.com host or a loopback dev server` for a bad API base (cloud/client.rs:55-59).
- Server route files apps/web/app/api/usage/route.ts for the other side.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **The brief says the usage numbers come from the shared usage ledger; the CLI reads `/api/usage` and does not show Local or own-key spend beyond a catalog-price estimate.** Affects: surface:cli users in Local or own-key mode.. Evidence: apps/cli/src/usage_summary.rs:343-356, 497-503. Work needed: State in the brief that account numbers are Cloud only, and decide what Local usage should show.
- **Discovered local models have window 0 in the picker catalog, so context percent uses a 128,000 assumption.** Affects: surface:cli users with local models.. Evidence: apps/cli/src/tui/tui_app.rs:3395, apps/cli/src/compaction.rs:28-35. Work needed: Read the real window from the local server or label the number as assumed.
- **`/usage` has no loading indicator while it waits.** Affects: surface:cli users on slow networks.. Evidence: apps/cli/src/usage_summary.rs:540-555. Work needed: Show a working line or time-bound the call.
- **No test found that `/compact` surfaces a model failure or a Local model that cannot summarise.** Affects: surface:cli users in Local mode.. Evidence: apps/cli/src/compaction.rs:354-376 tests cover receipts only. Work needed: Add failure-path tests.
- **The brief's line numbers for these items no longer match the file; the real handlers are at different lines.** Affects: Engineers following the brief.. Evidence: brief S72.17-S72.19 versus apps/cli/src/tui/tui_app.rs:5820, 5995, 6498. Work needed: Refresh the brief's code references.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/usage
- api:GET /api/usage/history
- file:apps/cli/src/usage_summary.rs
- file:apps/cli/src/compaction.rs
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-authentication-and-identity

## Unknown

- The crate that holds the shared compaction engine (agiworkforce_agent_core::context) was not opened; its exact algorithm is unknown here.
- Whether `/usage` in the line REPL prints the same account lines.
- What the shell command cited by the brief at lib.rs:4049 prints.
- Whether the server's allowance numbers include Local usage (they should not).
- Plan labels and amounts: only read from the server, not defined in the CLI.
