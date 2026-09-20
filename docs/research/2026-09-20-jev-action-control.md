# Jev for browser, desktop and mobile action control

Status: Dated research; implementation proposal, not a shipped controller
Owner: AI platform maintainers
Last updated: 2026-09-20

## Finding

Jev can be the decision model inside a bounded action loop. The application observes the
interface, constructs executable candidates, asks Jev to select an ID, validates that ID
against the current observation and policy, executes through its existing driver, and
checks what actually happened. This is a stronger prospective replacement for repeated
LLM tool-call turns than adding Jev to the free intent heuristic.

Jev itself neither operates the mouse nor reads pixels. The current API accepts text and
structured text state, not screenshots. DOM or accessibility data supplies the observation;
CDP, accessibility APIs or a device driver performs input. Visual-only controls require a
separate perception system before Jev can select grounded regions.
[Model contract](https://docs.typesafe.ai/models).

The guarantee is a bounded output space, not universally correct behavior. A chosen button
can exist and still be wrong. Low confidence, missing candidates, poor observations and
adversarial labels need abstention or escalation. Precise numbers, dates, arbitrary text
and multi-step reasoning remain outside Jev's reliable role.
[Documented limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Working examples and strength of evidence

| Project                                                                                             | What it demonstrates                                                                    | Evidence limits                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Browser Use Jev Ultrafast](https://github.com/browser-use/jev-ultrafast)                           | Dynamic DOM candidates; parallel operation/target questions; optional text helper       | Small browser prototype, not a general reliability benchmark                                                                     |
| [Cua jev-use](https://cua.ai/docs/how-to-guides/driver/jev-use)                                     | Python/TypeScript bounded chooser; capture-bound targets; independent form-result check | Public preview; form offers only the next valid action plus abstention/reobservation, so it does not prove open-ended navigation |
| [Callstack mobile QA](https://www.callstack.com/blog/exploring-jev-for-mobile-qa-with-agent-device) | Accessibility snapshots become press/fill/scroll choices executed by agent-device       | Reports a 14-second, $0.0023 inference demo; not reproduced here and not broad mobile coverage                                   |
| [LangChain integration](https://www.langchain.com/blog/building-a-harness-with-jev)                 | Classifier nodes and middleware alongside generative agents                             | Integration evidence, not a UI-control benchmark                                                                                 |

Browser Use's [performance report](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md)
records a 7.073-second flight-search run: 17 Jev requests, median decision latency 178 ms,
and two text-helper calls. It searches; it does not book. Timing excludes startup, initial
navigation and independent post-run verification. The matched comparison is three runs
per arm of one task, both using Jev: 9.450 → 7.092 seconds median, not a comparison against
our existing agent. Browser protocol calls drop 1,092 → 101. This supports optimizing the
harness as well as inference; it does not support claiming universal speedups.

Its [measurement data](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/flights-measurement.json)
records 90,558 TypeSafe input tokens and $0.00006272 billed for the text helper. At the
[current published input rate](https://docs.typesafe.ai/models), the calculated inference
estimate is `90,558 × 0.042 / 1,000,000 + 0.00006272 = $0.003866156` per recorded task.
That is about $3.87 per 1,000 identical runs or $3,866 per million, excluding infrastructure,
retries beyond that trace and traffic variation. This is an estimate from third-party
usage, not our invoice, measured savings, or a production projection.

## Actions we can support

| Action                     | Candidate construction                                     | Execution and verification                                                               |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Click / tap / menu item    | Observed control ref, role, label, permitted operation     | Resolve original ref, validate current target and hit testing, invoke, reobserve         |
| Checkbox / switch / radio  | Current checked state plus requested target state          | Prefer setting a known state; avoid blind repeated toggles                               |
| Dropdown / autocomplete    | Observed option IDs and labels                             | Select exact offered option; verify selected value                                       |
| Scroll / back / wait       | Driver-supported bounded operations                        | Deterministic limits, transition-aware waits, no-progress detection                      |
| Fill supplied value        | Field ref plus exact user-provided or validated data value | Code copies the original string; validate the resulting field value                      |
| Generate new text          | Target field can be selected by Jev                        | Existing generative helper produces text only when needed                                |
| Connector / MCP action     | Connected, authorized tool and bounded enum arguments      | Existing dispatcher executes; IDs, credentials, permission and effects remain host-owned |
| Done / blocked / reobserve | Explicit reserved candidates                               | A done selection triggers an independent postcondition check                             |

“Cannot type” needs precision: it cannot generate arbitrary text, but can select an action
that types a supplied string. [TypeSafe's extraction pattern](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook)
uses code to find values, Jev to select one, and code to copy it exactly. Missing values must
produce abstention, not a forced choice. Credentials should remain in the host's credential
resolver; semantic selection does not require sending their contents to Jev.

The mobile sample [builds actions](https://github.com/grabbou/jevil/blob/070d79e33f1e5e37c91bcdb2f636f10c54e5523a/src/actions.mjs)
from observed refs, rejects incomplete snapshots and excludes explicitly unavailable
controls. Provided input strings become fill candidates. Its
[runner](https://github.com/grabbou/jevil/blob/070d79e33f1e5e37c91bcdb2f636f10c54e5523a/src/agent.mjs)
defaults its confidence gate to zero and accepts model QA verdicts as terminal outcomes;
we must not copy those defaults as production correctness evidence.

## Parallelism and dependency boundaries

For a shared observation, one Jev request can ask for the operation and conditional targets
for clicking, filling and selecting. Each target question says which operation it assumes;
only the target matching the selected operation is consumed. This is implemented in
[Browser Use's model adapter](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py)
and matches [TypeSafe's speculative fan-out](https://docs.typesafe.ai/patterns/fan-out).

A smaller initial action set can use one Choice over fully bound actions instead. That
removes invalid operation/target/value combinations by construction. Large sets can use
conditional target questions, with deterministic compatibility validation after selection.
Respect current API option/context bounds rather than silently truncating important targets.

Parallel questions cannot refer to each other's answers. A risk question about “the selected
target” has no resolved target during evaluation: either score concrete candidates in the
same call or run a genuinely dependent check after selection. Permissions never depend on
that risk score alone.

Independent reads and work in isolated sessions can overlap. Mutations of the same tab,
window, device, keyboard focus or shared application state must remain ordered. Observe after
an action before deciding against its new state. Do not parallel-click a guessed future
sequence. Precomputing field values is useful only when their inputs and destination are
already known; discard predictions if their observation binding changes.

## Fit with this repository

The strongest first pilot is the Chrome extension's existing managed browser loop:

- `apps/extension/src/features/computer-use/agentLoop.ts` invokes `callCloud` each iteration.
  It already prefers indexed targets and uses ownership, cancellation, site and approval gates.
- `apps/extension/src/features/computer-use/cdpDriver.ts` builds an element index and checks
  unique resolution plus element signatures before indexed actions. Extend this owner rather
  than add another DOM driver. The current summary is not a complete actionability contract:
  candidate extraction does not itself filter every hidden/disabled/covered control or attach
  all live field/checked states. Those gaps must be handled before a Jev controller depends on it.
- `apps/desktop/electron/runtime/computerUseService.ts` supplies screenshot-relative input,
  not the structured semantic candidate table this design needs. Do not assume Rust native
  accessibility code is wired into the shipping Electron path.
- `apps/desktop/src-tauri/src/automation/action_router/accessibility.rs` already exposes
  deterministic accessibility matching. Keep exact unambiguous matches in code; semantic
  fallback is useful only for ambiguity or choosing among different valid next actions.

The shared contracts and TypeSafe adapter from the [audit](../specs/semantic-decisions/audit.md)
can support the chooser. Drivers remain platform-native, action IDs resolve locally, and
TypeSafe credentials stay server-side. The existing skill-candidate helper is not a complete
UI controller. This research adds no production model calls or browser actions.

## Recommended pilot and measurement

Use a managed, explicitly eligible browser session and an isolated local test application.
Compare the existing agent, Jev-only bounded control, and Jev with generative/reasoning
fallback. Include navigation, menus, filters, form entry, autocomplete, repeated labels,
changed or detached nodes, overlays, incomplete snapshots, forbidden actions, prompt
injection, missing inputs, already-complete goals and uncertain action acknowledgements.

The controller must bind decisions to the observed document/session/target, consume each
mutation once, reobserve after uncertainty, and never retry an external write blindly. Keep
existing confirmations, site access, run ownership and trust boundaries authoritative.
Jev response syntax and confidence cannot substitute for those controls.

Score end-to-end task completion against independent DOM/server/app state. Report wrong
valid actions, premature done, fallback rate, all provider failures, stale decisions, model
and driver calls, input/output tokens, total inference cost, startup and execution p50/p95,
and cost per verified successful task. Include failed attempts in totals. Calibrate operation
and selected-target confidence together on held-out tasks; don't multiply marginal scores
and call that a proven joint success probability.

For repeatable known workflows, deterministic APIs or validated replay should precede Jev.
For ambiguous routine UI steps, Jev is promising. For visual perception, novel plans or hard
recovery, preserve the appropriate specialist/reasoning model. The target is fewer expensive
decision turns, not elimination of every generative or reasoning call.

## Retrieval record

Firecrawl search, developer search and page extraction were used. Browser Use and the mobile
sample were inspected at pinned Git commits; published measurements were read, not rerun.
Firecrawl's Callstack scrape omitted the article body, so web extraction supplied it. Tavily
search was attempted but returned `UNAUTHORIZED` with reauthentication required; no Tavily
results were available. GitHub issue proposals are leads, not proof of shipped functionality.
Source hashes and commit IDs are retained in the
[source manifest](evidence/2026-09-20-typesafe-sources.json).
