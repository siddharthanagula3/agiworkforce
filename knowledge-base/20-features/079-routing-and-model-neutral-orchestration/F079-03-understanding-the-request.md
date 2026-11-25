---
id: "F079-03"
type: "feature"
title: "Understanding the request"
aliases: ["task classification", "classifyTaskLocally", "routing task type", "task family", "classifyTaskFamily", "classifier", "tool-aware task type", "resolveToolAwareTaskType", "complexity classification", "source freshness", "modality routing"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S79.09", "S79.10", "S79.11", "S79.12", "S79.13", "S79.30"]
depends_on: ["F079-01", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ai/routing/src/classify.ts", "file:packages/ai/routing/src/task-family.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-03 Understanding the request

Every message is labelled by kind (coding, research, agentic, image, long and so on) with fixed word patterns, attachments, length and the person's toggles. The label picks which models Auto may use. There is no model-based classifier. When nothing matches the default is general.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.09](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7909), [S79.10](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7910), [S79.11](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7911), [S79.12](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7912), [S79.13](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7913), [S79.30](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7930).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a message plus its history, attachments and switches into one routing task type and, separately, a structural task family. Admission and ranking in Auto read these labels. [inferred from classify.ts:137-205, task-family.ts:173]

**Why it exists.** Auto needs to know what the work is to pick a fit model: vision for images, large context for long chats, search-capable handling for current events (brief S79.09 to S79.13, S79.30).

**Who uses it.** Nobody calls it directly; every Auto and every named-model request passes through it on all six apps.

**Problems it solves**

- Sending images to a model that cannot read them.
- Sending a very long chat to a small context window.
- Using a weak model for code.
- Failing when the message type cannot be determined.

**Use cases**

- Attach a photo: the request is routed to a multimodal-capable model.
- Ask for 'the latest news today': treated as research.
- Turn on Research: the request is research whatever the words say.
- Paste a stack trace: treated as coding.

## 2. User experience

**Where to find it**

- No control. It runs on every send in Web, Desktop, Mobile, Chrome, VS Code and CLI.
- Toggles that override the text: Research, Work mode, office creation, code execution (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1032-1043).
- Response field x_agi_workforce.routing.task_type and task_confidence (response-builder.ts:409-413).

**Before you start**

- None.

**Screens and controls**

- Composer attachments and the Research, Work and code toggles (names as they appear per app were not collected).

**Journey**

1. Type, attach files or images, and optionally switch on Research or Work.
2. Send.
3. The label is computed and used to route.
4. The answer comes from a model that fits the label.

**What the person sees and gets**

- API response carries task_type and task_confidence; Web turn logs include the classification (request-processor.ts:4512-4548).
- CLI turn notice 'Auto route: <Task> -> <provider>/<model>' when an own-key session changes model (agent/chat.rs:725-729).

**Settings**

- Kill switch for the family stage: AGI_ROUTING_TASK_FAMILY_STAGE (task-family-routing.ts:71).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Priority-ordered classifier: separate-image-resource request gives agentic; image-generation intent gives image_generation; screenshot plus an action word gives computer-use; image or video attachment gives multimodal; over 50,000 estimated tokens gives long_context; browser action wording gives computer-use; code fence or code keywords give coding; reasoning verbs or arithmetic give reasoning; agent or tool wording gives agentic; research words give research; story or email drafting gives creative_writing; weak code words give coding; short text gives simple_chat; otherwise general at confidence 0.5 (packages/ai/routing/src/classify.ts:137-205).
- Research words: latest, today, 2026, current, recent news, search the web, cite sources (classify.ts:97).
- Conversation context: over 50,000 cumulative tokens forces long_context; a stable mode over the last 3 turns boosts confidence; a result at or above 0.85 may pivot (classify.ts:229-290).
- Tool toggles override: research true gives research; work mode agiwork or office creation gives agentic; code execution gives coding; otherwise the classified type if the Web runtime serves it, else agentic when tools exist, else general (request-processor.ts:1020-1043).
- Classification also switches tools on: research or search intent sets web_search; office and code-execution wording set their toggles (request-processor.ts:974-1010).
- Task family: twelve families from structural signals only, no prose; unclear signals return null and Auto runs unchanged (packages/ai/routing/src/task-family.ts:68-215).
- The family stage only reorders already admitted candidates and is on unless switched off (task-family-routing.ts:1-83, routing-stages.ts).
- Surfaces: Web, Desktop and API classify on the server (request-processor.ts:4512-4548); Mobile and Chrome import the TypeScript classifier (cloudDispatchRouting.ts:49-58, managedChatRouting.ts:38-41); VS Code calls it per turn on text and images (apps/extension-vscode/src/integrations/routingTask.ts:17-27); CLI uses a hand-kept Rust mirror (apps/cli/src/routing/classify.rs:1-9).

**Incomplete**

- VS Code classifies with no history, so long-context and sticky logic do not apply there (routingTask.ts:26-27).
- CLI mirror treats image attachments as images, never screenshots (routing/classify.rs:1-9).

**Present but disconnected or switched off**

- Confidence is advisory: nothing branches on it except the sticky pivot inside the classifier (classify.ts header 1-20).
- Indic script detection only logs a line for a future pool (request-processor.ts:4585-4596).

**Not available**

- No model-based classifier and no pluggable adapter; decided not to build (docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-07).
- Chrome: task family stage reached only through the server.

## 4. Required behaviour

**Established requirements**

- Each request's task intent is classified and used for routing. (source: brief S79.09)
- Which tools a request needs (research, agentic work, code execution) changes the routing task. (source: brief S79.10)
- Attached images or video route the request to a multimodal-capable model. (source: brief S79.11)
- Requests are classified by complexity so routing can set a quality floor or effort. (source: brief S79.12)
- Requests needing current information are detected and routed to search-capable handling. (source: brief S79.13)
- When classification fails or is ambiguous, routing falls back to a safe default. (source: brief S79.30)
- A classification adapter such as Jev is not built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-07))

**Acceptance criteria**

1. A message with an image attachment resolves to task type multimodal unless it is an image-generation request or a screenshot with an action word.
2. A conversation whose estimated tokens exceed 50,000 resolves to long_context.
3. With the Research toggle on, the task type is research whatever the text says.
4. With Work mode agiwork, the task type is agentic.
5. A message that matches nothing resolves to general (or simple_chat if under 80 characters and 15 words).
6. When the structural signals are unclear, no task family is set and the Auto result is the same as with the stage off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Prompts in languages other than English get few keyword matches, so most fall to general. [inferred from the English-only patterns in classify.ts:20-100]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Replace the hard-coded year in the research pattern with a rule that does not expire.
- [proposed] Fix the header comment that says 5-turn while the code uses 3 (classify.ts:229).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | classifyTaskLocally | `packages/ai/routing/src/classify.ts` | Heuristic classifier (line 137). |
| service | applyConversationContext | `packages/ai/routing/src/classify.ts` | Long-context guard and sticky pivot (line 247). |
| service | estimateTokens | `packages/ai/routing/src/classify.ts` | Characters to tokens by provider baseline. |
| service | classifyTaskFamily | `packages/ai/routing/src/task-family.ts` | Twelve structural families (line 173). |
| service | task-family ordering stage | `packages/ai/routing/src/task-family-routing.ts` | Floor then cost permutation of candidates. |
| service | output-intent | `packages/ai/routing/src/output-intent.ts` | Image-output intent used by the classifier. |
| service | resolveToolAwareTaskType | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Toggle overrides (line 1032). |
| service | applyImplicitManagedToolIntent | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Turns prompt wording into tool toggles (line 974). |
| service | web classification call site | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Builds attachments, history and calls classifier (4500-4548); builds family signals (4621). |
| service | mobile dispatch classification | `apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts` | Classifies on the device with history (lines 46-95). |
| service | chrome routing classification | `apps/extension/src/features/cloud-bridge/managedChatRouting.ts` | Classifies text, history and attachments (line 41). |
| service | VS Code classifyDeveloperTurn | `apps/extension-vscode/src/integrations/routingTask.ts` | Per-turn task type from text and images. |
| service | Rust classifier mirror | `apps/cli/src/routing/classify.rs` | classify_turn_task and type mapping for the CLI. |
| service | CLI per-turn use | `apps/cli/src/agent/chat.rs` | re_resolve_auto_route_for_turn (line 660). |
| config | auto policy tasks | `packages/ai/model-registry/catalog/routing-policies.json` | Per-task required capabilities, preferred slots, minimum context (tasks block). |
| service | indic detection | `packages/ai/routing/src/indic.ts` | Script detection logged by the Web route. |
| test | classify and family tests | `packages/ai/routing/src/__tests__/classify.test.ts` | Classifier behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends text, attachments (image parts) and history with toggle fields. | device | apps/web/lib/hooks/useChatStream.ts:4646 |
| Server classifies the last user text with history and attachments, applies conversation context, then toggle overrides. | our servers | request-processor.ts:4512-4548 |
| Server builds structural signals and, if the stage is on, classifies a task family. | our servers | request-processor.ts:4621-4631 |
| Task type feeds admission (required capabilities, context floor) and slot order; family reorders admitted candidates by cost above a floor. | our servers | auto.ts:1198-1240; task-family-routing.ts:1-60 |
| Mobile and Chrome classify on the device before their own resolve call; CLI own-key sessions classify with the Rust mirror each turn. | device | cloudDispatchRouting.ts:49; managedChatRouting.ts:41; agent/chat.rs:660-680 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Task type and confidence for a turn | Response x_agi_workforce.routing and logs; routing trace (packages/ai/routing/src/routing-trace.ts) | Server side | Trace retention days set by AGI_ROUTING_TRACE_RETENTION_DAYS (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:26) |

**Models and providers.** No model or provider is used to classify. It is pure code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Runs for any caller of the chat route; no separate account rule. |
| Permissions | none found in the code. |
| Subscription | none directly; the label then meets tier slot rules in F079-01. |
| Limits and metering | none found; classification costs no credits. |
| Feature flags | AGI_ROUTING_TASK_FAMILY_STAGE kill switch (default on). |
| Model compatibility | The label sets required capabilities and minimum context for the candidates (auto.ts:1415-1435). |
| Provider restrictions | none from classification itself. |
| Local mode | The same classifier code runs on the device for Mobile, Chrome, VS Code and CLI; in a Local CLI session it chooses no route because Auto is Cloud only (lib.rs:8073). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty or ambiguous message | Falls to simple_chat (short) or general at confidence 0.5. | classify.ts:200-205 |
| No structural signals | Family null with reason ambiguous_no_signals; Auto unchanged. | task-family.ts:174-176 |
| Unknown length | Family null with ambiguous_unknown_length. | task-family.ts:206-208 |
| Task type the Web runtime cannot serve | Becomes agentic when tools are declared, otherwise general. | request-processor.ts:1020-1030 |
| Negated agent wording | A clause such as 'do not use agents' is stripped before the agent test. | classify.ts:52-56, 181-190 |
| Year-based research word | The pattern contains the literal 2026. | classify.ts:97 |
| Offline, retry, cancel | not applicable; pure function. | classify.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/classify.test.ts`: Image-generation phrases and slash commands, and the other classifier branches (first 100 lines read).
- `packages/ai/routing/src/__tests__/task-family.test.ts`: All twelve families, distinct reason codes, ambiguous fall-through, negative toggles not decisive.
- `packages/ai/routing/src/__tests__/routing-profiles.test.ts`: Named profile weights and one profile per task family.
- `apps/extension-vscode/src/__tests__/routingTask.test.ts`: Each developer turn is classified, image inputs count.
- `apps/extension/__tests__/managed-chat-routing.test.ts`: Chrome routes image attachments only to a multimodal-admitted model and browser-task prompts to a model that can drive the browser.
- `apps/cli/src/agent/chat.rs`: In-file tests: interactive Auto turn classifies and feeds the resolver; coding turns respected (lines 4229-4285).

**Test scenarios**

- **Image attachment**
  1. Web paid plan, Auto; attach a photo and ask what it shows.
  - Expected: x_agi_workforce.routing.task_type is multimodal and the chosen model reads images.
- **Research toggle**
  1. Turn Research on; send 'hello'.
  - Expected: Task type research regardless of the word.
- **Long chat**
  1. Send a conversation whose history exceeds about 50,000 estimated tokens.
  - Expected: Task type long_context and a model with a large enough context.
- **Ambiguous text**
  1. Send 'ok'.
  - Expected: simple_chat and no family beyond the plain-turn family.
- **CLI parity**
  1. Run the Rust and TypeScript classifiers on the same sentence list.
  - Expected: Same task type for each; the source parity tests named in classify.rs header are the place to look.

**Where to look when it fails**

- Response routing.task_type and task_confidence.
- Server logs '[indic-detect]' for Indic scripts (request-processor.ts:4585).
- Error code unknown_task from the router (auto.ts:1735-1745).
- Routing trace records (packages/ai/routing/src/routing-trace.ts:153).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **The research pattern contains the year 2026.** Affects: All apps from 2027. Evidence: packages/ai/routing/src/classify.ts:97. Work needed: Drop the year or compute it, and add a test.
- **Classification is English keywords only.** Affects: Non-English prompts on all apps. Evidence: classify.ts:20-100; indic.ts only logs.. Work needed: Measure misroutes on a multilingual set before changing.
- **Header comment says 5-turn sticky logic; code uses 3.** Affects: Engineers. Evidence: classify.ts:229 versus the doc block above it.. Work needed: Correct the comment.
- **VS Code classifies without history.** Affects: VS Code. Evidence: routingTask.ts:26-27. Work needed: Pass recent turns if long-context routing is wanted there.
- **Heuristics are weaker than their older claim.** Affects: All apps. Evidence: classify.ts header says measured held-out accuracy is far below the old 75 to 85 percent claim.. Work needed: Use the semantic-decisions spec to decide on any change.
- **Source parity tests between the Rust and TypeScript classifiers were not located.** Affects: CLI. Evidence: routing/classify.rs header says tests check parity.. Work needed: Name the test and run it.

**Depends on**

- F079-01
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ai/routing/src/classify.ts
- file:packages/ai/routing/src/task-family.ts

## Unknown

- Classifier accuracy today: only a comment says it is weak; no measurement file was read.
- Exact names of the Research, Work and code toggles on each app.
- Where the Rust and TypeScript parity tests live.
- Whether the Desktop shows the task label anywhere.
- Which task types the Chrome and Mobile runtime profiles each serve.
