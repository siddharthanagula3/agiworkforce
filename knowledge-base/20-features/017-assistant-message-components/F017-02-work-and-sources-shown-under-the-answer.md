---
id: "F017-02"
type: "feature"
title: "Work and sources shown under the answer"
aliases: ["Work and sources shown under the answer", "Reasoning summary", "Thinking process", "Activity timeline", "Tool activity", "Source citations", "Sources footer", "Show sources", "S17.04", "S17.05", "S17.06", "S17.07"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S17.04", "S17.05", "S17.06", "S17.07"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills", "file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-02 Work and sources shown under the answer

Shows the steps and tools used for an answer in a collapsible activity timeline, numbered citation markers in the text, and a sources list after the answer. Complete on web and mobile; the CLI prints a sources footer but no inline markers; VS Code shows a collapsed sources list.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.04](../../10-requirements/capabilities/017-assistant-message-components.md#s1704), [S17.05](../../10-requirements/capabilities/017-assistant-message-components.md#s1705), [S17.06](../../10-requirements/capabilities/017-assistant-message-components.md#s1706), [S17.07](../../10-requirements/capabilities/017-assistant-message-components.md#s1707).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person open the work behind an answer (reasoning steps, each tool with name, status and result) and check the web pages or files the answer used.

**Why it exists.** People need to trust and check answers, and agent turns do real work (searching, running tools) that the final text hides.

**Who uses it.** Anyone using web search, research, connectors or agent tools; testers checking tool results.

**Problems it solves**

- Cannot see what tools ran or why a turn failed
- Cannot tell where a claim came from
- Tool approvals need to be visible in the answer

**Use cases**

- Expand the thinking process on a web answer to read numbered steps.
- Press Show sources on the action row and follow a link.
- Read the Sources block the CLI prints after a search turn.
- Open the Sources details under a VS Code answer.

## 2. User experience

**Where to find it**

- Web and Desktop: Thinking process (N steps) toggle (MessageBubble.tsx:3476-3491); AgentActivityTimeline above the prose (MessageBubble.tsx:2664); ToolTimeline for legacy tools (2557, 2740); Show sources button in the action row (3846-3860); sources control after the answer (3590-3602).
- Mobile: activity timelines and collapsible sources inside the bubble (files AgentActivityTimeline.tsx, ToolCallTimeline.tsx, CollapsibleSources.tsx, CitationChip.tsx in apps/mobile/src/features/chat/components).
- CLI: Sources block printed after the turn (apps/cli/src/sources.rs:91-105; repl/mod.rs:833; tui_app.rs:8665).
- VS Code: Sources details under the answer (webviewContent.ts:4755-4783).
- Chrome: Sources footer details and citation chips (apps/extension/src/features/side-panel/sources.ts:136).

**Before you start**

- A turn that used reasoning steps, tools or web search.
- Sources only exist when the turn searched or cited.

**Screens and controls**

- Web thinking toggle starts closed (useState(false), MessageBubble.tsx:848). Activity timeline opens by default only when the no-search-results notice applies (MessageBubble.tsx:2677).
- Web sources button is shown only when the turn has sources and readable text (3846).
- VS Code: details element titled with a source count; links are opened only for http and https (webviewContent.ts:4746-4783, 4727).
- Chrome: details with an ordered list of source links, labelled by a list label (sources.ts:139-150).

**Journey**

1. Person sends a prompt that triggers search or tools.
2. While streaming, tool steps appear in the timeline with status.
3. When finished, citation markers in the text link to sources (web numeric markers when linkable, MessageBubble.tsx:3231).
4. Person presses Show sources or opens the footer and follows a link.

**What the person sees and gets**

- Web notices for no search results, memory-grounded answers and model-only answers with a Retry or Search the web action (MessageBubble.tsx:3650-3677).
- Web notice when tool steps were not saved (MessageBubble.tsx:3638-3648).
- CLI footer lines look like [1] title url (sources.rs:96-102).

**Settings**

- none found in the code for turning the activity timeline or sources off.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: thinking disclosure, canonical activity timeline, legacy tool timeline, citation maps and sources control (MessageBubble.tsx:2557, 2664, 3231, 3590).
- Mobile: activity, tool and sources components exist and are wired from MessageBubble (component files listed; exact lines for CollapsibleSources not printed).
- CLI: sources collected per turn and printed as footer in REPL and TUI (sources.rs:91; repl/mod.rs:833; tui_app.rs:8665).
- VS Code: collapsed Sources list (webviewContent.ts:4755-4783).
- Chrome: citation chips and a sources footer (sources.ts:136; decorateCitations imported at bubbles.ts:74).

**Incomplete**

- CLI has no inline citation markers; only the footer (sources.rs:91-105).
- VS Code citation markers inside the answer text were not found; only the list (webviewContent.ts:4755).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- CLI and VS Code have no per-answer Show sources button (not found in the code).

## 4. Required behaviour

**Established requirements**

- An answer offers a collapsible summary of reasoning or work, expandable on demand. (source: brief S17.04)
- Tool calls appear in a tool activity section with name, status and result. (source: brief S17.05)
- Claims that used sources carry citation markers linking to the sources. (source: brief S17.06)
- A finished answer that used sources ends with a sources list the person can open. (source: brief S17.07)
- Reference project files and sources is a chat requirement. (source: doc: docs/product/requirements.md)

**Acceptance criteria**

1. On web, a turn with steps shows a Thinking process (N steps) toggle that is closed on first render and opens on click.
2. On web, a searched turn shows Show sources in the action row and the sources list opens.
3. On mobile, a searched cloud turn shows sources under the answer.
4. On CLI, a searched turn prints a Sources block with numbered lines after the answer.
5. A failed tool entry is visible in the activity timeline with a reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The activity timeline should start open while streaming [inferred from the brief draft; code shows it defaults closed except for the no-results case, MessageBubble.tsx:2677].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add numbered inline markers to the CLI answer text so CLI matches web.
- [proposed] Add a Show sources control to VS Code and CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentActivityTimeline | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Shared canonical activity disclosure used by web. |
| component | ToolTimeline (web) | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Legacy tool list with status and result. |
| component | MessageBubble thinking and sources (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Thinking toggle (3476), timeline (2664), sources control (3590), Show sources button (3846). |
| component | SourcesControl | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Opens the sources panel (imported MessageBubble.tsx:244); file not opened. |
| service | message-sources | `packages/ui/unified-chat/src/lib/message-sources.ts` | collectMessageResearchSources used by web and by the follow-ups route. |
| service | turnCitations | `packages/ui/unified-chat/src/lib/turnCitations.ts` | Shared citation helper; contents not opened. |
| component | Mobile activity and sources components | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Mobile activity timeline; sibling files ToolCallTimeline.tsx, CollapsibleSources.tsx, CitationChip.tsx. |
| service | CLI sources | `apps/cli/src/sources.rs` | Collects web sources per turn (collect, record) and renders the footer (91). |
| component | CLI REPL footer | `apps/cli/src/repl/mod.rs` | Prints footer after the turn (833). |
| component | TUI footer | `apps/cli/src/tui/tui_app.rs` | Adds footer as a system message (8665). |
| component | VS Code appendSources | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Collapsed sources list (4755). |
| component | Chrome sources footer | `apps/extension/src/features/side-panel/sources.ts` | buildSourcesFooter (136) and decorateCitations. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The turn streams events; search results and tool results are attached to the message metadata. | our servers | apps/web/lib/hooks/useChatStream.ts; metadata fields tools, agentActivity, searchResults read at MessageBubble.tsx:2425-2431 |
| The bubble builds the cited and more-sources lists from metadata and links numeric markers when they can be matched. | device | MessageBubble.tsx:3231; packages/ui/unified-chat/src/lib/message-sources.ts |
| Person opens the disclosure or sources control; the research panel opens with the list. | device | MessageBubble.tsx:3595-3601 |
| CLI: tool code records sources into a per-turn store, and the footer prints after the answer. | device | apps/cli/src/sources.rs:12-17, 91; repl/mod.rs:833 |
| Following a source opens the external web page. | outside service | VS Code accepts only http and https (webviewContent.ts:4727-4731) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tool entries, activity state and search sources per assistant message | Message metadata (web MessageBubble.tsx:602 agentActivity); saved for cloud chats, with a notice when not saved (3638-3648) | Cloud chats yes; Local chats stay on the device [inferred] | With the message |

**Models and providers.** Reasoning steps only exist when the chosen model or route produced them; web search needs a provider route or harness, not the model alone (AGENTS.md section 4). Which providers supply search was not studied.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing follows chat access. Web search itself needs the signed-in chat path; not studied. |
| Permissions | Tool approvals are shown in the timeline with Approve and Reject handlers (MessageBubble.tsx:2679-2686). |
| Subscription | none found in the code for showing steps or sources; a search budget module exists at apps/web/lib/web-search/search-budget.ts (file name only, not opened). |
| Limits and metering | unknown for search usage; the display itself has none. |
| Feature flags | none found in the code |
| Model compatibility | Reasoning steps depend on the model producing them; not studied per model. |
| Provider restrictions | none found in the code |
| Local mode | Web: Local messages can have tools and a Local badge in the action row (MessageBubble.tsx:3686). Whether web search runs in Local mode is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No search results | Notice says web search returned nothing; Retry action re-runs. | MessageBubble.tsx:3650-3665 |
| Sources arrive before approval finishes | Label Sources so far. | MessageBubble.tsx:3592-3594 |
| Tool steps not saved | Notice explains steps and reasoning will not survive reload. | MessageBubble.tsx:3638-3648 |
| Voice mode active | A compact affordance replaces the timeline. | MessageBubble.tsx:2656-2662 |
| Unsafe source URL (VS Code) | Non-http links are not turned into links. | webviewContent.ts:4727-4731 |
| No sources | Chrome footer returns null; CLI footer returns None. | sources.ts:137; apps/cli/src/sources.rs:92-94 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/ToolTimeline.test.tsx`: Tool timeline (from file name).
- `apps/web/features/chat/components/messages/MessageBubble.sources.test.tsx`: Sources on the bubble (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.thinking.test.tsx`: Thinking disclosure (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.metadataNotSaved.test.tsx`: Not-saved notice (from file name).
- `apps/mobile/__tests__/CloudStreamInlineCitations.test.tsx`: Inline citations from the cloud stream (from file name).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.inlineCitations.test.tsx`: Inline citation rendering (from file name).
- `apps/web/features/chat/components/research/ResearchPanel.sourcesNumbering.test.tsx`: Sources numbering (from file name).

**Test scenarios**

- **Open reasoning**
  1. On web send a prompt that uses thinking.
  2. Find Thinking process (N steps).
  3. Click it.
  - Expected: Closed at first; opens to numbered steps.
- **Sources from a search**
  1. Ask a current-events question with web search on.
  2. After it finishes press Show sources.
  - Expected: A list of source links opens; citation numbers match.
- **CLI footer**
  1. Run a CLI turn that searches the web.
  - Expected: A Sources block lists [1], [2] with title and URL.
- **Failed tool**
  1. Trigger a tool that fails.
  - Expected: The failed step shows in the timeline with its reason.
- **VS Code sources**
  1. In VS Code ask a question that cites sources.
  - Expected: A collapsed Sources details sits under the answer; non-http links are not clickable.

**Where to look when it fails**

- Web metadata keys tools, agentActivity, searchResults, projectSources, pastChatSources (MessageBubble.tsx:3575-3590).
- CLI: x_search_results event name in sources.rs:6.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **No inline citation markers in CLI.** Affects: CLI users. Evidence: apps/cli/src/sources.rs:91-105 footer only; brief S17.06 missing. Work needed: Number claims in output or document footer-only behaviour.
- **VS Code inline markers not confirmed and no Show sources control.** Affects: VS Code users. Evidence: webviewContent.ts:4755-4783. Work needed: Check the render path then add markers.
- **Brief says timeline is open while streaming; web code defaults closed except no-results.** Affects: Web users and testers. Evidence: MessageBubble.tsx:2677. Work needed: Decide the intended default and align the doc or code.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills
- file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx

## Unknown

- How mobile builds its citation chips (CitationChip.tsx and CollapsibleSources.tsx not opened).
- Whether VS Code puts citation markers in answer text.
- Search quota and plan rules for web search.
- Whether the Chrome activity timeline matches the brief (not opened).
