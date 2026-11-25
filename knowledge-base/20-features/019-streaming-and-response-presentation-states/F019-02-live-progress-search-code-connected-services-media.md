---
id: "F019-02"
type: "feature"
title: "Live progress: search, code, connected services, media and files"
aliases: ["Searching sources", "Running code", "Calling a connected service", "Building an artifact", "Generating media", "Agent activity timeline", "Activity steps", "Creating row"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.04", "S19.05", "S19.06", "S19.12", "S19.13"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-02 Live progress: search, code, connected services, media and files

While the assistant works in steps, each step shows its own label: searching the web, running code, calling a connector, writing a file or artifact, generating an image or video. Web has the fullest set; mobile, VS Code, Chrome and CLI show most of them in their own style.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.04](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1904), [S19.05](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1905), [S19.06](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1906), [S19.12](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1912), [S19.13](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1913).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns the assistant's tool calls into readable live labels and a final summary, with detail on expand.

**Why it exists.** Progress is data: tool calls, files and failures are meant to be typed events the person can read (doc: docs/product/experience-contract.md:80).

**Who uses it.** Anyone watching an answer that uses search, code, connectors or file creation.

**Problems it solves**

- The person can tell the assistant is working and on what.
- A failed or stopped step stays visible instead of vanishing.
- A connector call names the service in plain words, not a raw tool id (packages/ui/unified-chat/src/components/connector-step-sentence.ts:60-94).

**Use cases**

- Ask a question needing the web: see 'Searching the web for <query>', then 'Searched the web · 4 sources'.
- Ask for a spreadsheet script: see 'Running code'.
- Ask for a document in an artifact: see 'Creating <file name>' with a line count and seconds, click to open the panel.
- Generate an image: see a Generating image card; generate a video: see a still-being-generated card with percent.

## 2. User experience

**Where to find it**

- Web and Desktop: the 'Agent activity' timeline above the answer (AgentActivityTimeline.tsx:869), the Creating row (ArtifactCreatingRow.tsx), the image card 'Generating image' and the video card.
- Mobile: the activity timeline in the assistant bubble (AgentActivityTimeline.tsx), the web search card, the Writing card for artifacts, Generating image and Generating video cards.
- CLI: tool cells in the transcript (glyph, icon, tool name, summary) and the '/image' line 'Generating the image. Esc stops it.'
- VS Code: the activity group above the answer with running, completed and error counts.
- Chrome: the agent activity block with step rows, and the Preparing/thinking row.

**Before you start**

- A route and model that can call tools; tools such as web search depend on the provider route or AGI harness, not on the model itself (doc: AGENTS.md section 4).
- Connectors need to be connected for connector steps.

**Screens and controls**

- Web timeline summary line, collapsed by default, expandable; step rows with status; web search rows show sources.
- Web Creating row is a button with aria-label '<label>. Show the code being written' (ArtifactCreatingRow.tsx:71).
- Mobile image card has Stop and Retry (MessageBubble.tsx:2512-2530).
- CLI Esc stops an image generation (tui_app.rs:7586).
- Video: 'Resume checking' button on web when status checking paused (MessageBubble.tsx:3318-3330).

**Journey**

1. 1. Send a request that needs a tool.
2. 2. For the first second the web summary says 'Working' (AgentActivityTimeline.tsx:51,357-367).
3. 3. A step starts: the live label shows that step (for example 'Searching the web for <query>', 'Running code', 'Reading <file>', 'Reading from <Service>').
4. 4. Web search with sources shows 'Reading N sources' while running (AgentActivityTimeline.tsx:203-206).
5. 5. The step finishes: label becomes done form ('Searched the web · N sources', 'Read from <Service>').
6. 6. A file or artifact being written shows 'Creating <name>' with lines and seconds; the raw code is kept out of the chat body (MessageBubble.tsx:2057-2060, 2980-2987).
7. 7. When all is done the summary becomes 'Worked for Ns' or the search summary.

**What the person sees and gets**

- Web: 'Searching the web for <arg>' / 'Searching the web', 'Running code', 'Reading <path>', 'Creating image', 'Editing image' (agentActivityLabel.ts:24-34,53-82).
- Web: 'Searched the web' with '· N source(s)'; 'Search stopped' when cancelled (AgentActivityTimeline.tsx:141-165).
- Mobile web search card: 'Searching for “<query>”', 'The search stopped early, these sources are incomplete.', 'Search canceled before it returned sources.', 'The search failed. Try sending the message again.' (WebSearchToolCard.tsx:74-95).
- Mobile artifact card state: 'Writing…', 'Failed' or 'Stopped' (StreamingArtifactCard.tsx:65).
- Web image: 'Generating image' and 'Generating with <model label>' (ImageGenerationCard.tsx:222-231). Video: 'Your video is still being generated' and 'N% complete.'

**Settings**

- Web composer toggles for tools (code execution, Office creation, web search) feed which steps can occur (ChatComposerNew.tsx:362-365); exact setting names for web search not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: label derivation for web search, code, files, pages, image, maps, itineraries (agentActivityLabel.ts:53-82).
- Web: timeline summary with live label, source counts, Searched the web and Search stopped (AgentActivityTimeline.tsx:141-165,330-385).
- Web and shared UI: connector step sentences with verb forms like Reading from, Creating an item in, Sending with (connector-step-sentence.ts:60-94). The brief marked connector naming as unverified; it is now verified.
- Web: Creating row with file name, lines and seconds opening the artifact panel (ArtifactCreatingRow.tsx:55-81).
- Web: image generating card and video queued/processing card with progress percent (ImageGenerationCard.tsx:184-231; MessageBubble.tsx:3306-3340).
- Mobile: timeline, web search card statuses, Writing artifact card, image and video generation cards (AgentActivityTimeline.tsx; WebSearchToolCard.tsx:74-95; StreamingArtifactCard.tsx:65; MessageBubble.tsx:2512-2553). The brief says mobile artifact building is missing; StreamingArtifactCard exists and is mounted (MessageBubble.tsx:2816).
- CLI: tool cell states Running (spinner), Complete, Failed, Cancelled (tui_app.rs:333-343); '/image' progress line (7586).
- VS Code: activity group with running, completed, error counts and a working, done or error icon (webviewContent.ts:9005-9012).
- Chrome: activity step rows show sources, created artifacts and statuses (bubbles.ts:840-860,1085-1130).

**Incomplete**

- VS Code: no image or video generation display was found (brief marks it missing; not contradicted).
- Chrome: brief marks artifact building and media missing; the side panel has a video mode (side_panel.ts: startVideoTurn) whose progress display was not opened, so the real state is unknown.
- CLI: no per-step label beyond tool name and summary; no web-search-specific wording was found in tui_app.rs.

**Present but disconnected or switched off**

- Web search tool names list includes 'gemini_grounding' and 'search_maps' (agentActivityLabel.ts:36-37); whether a given route emits them was not traced.

**Not available**

- No step labels for web search or connectors exist in a Local-only CLI route that has no tools [inferred; not verified].

## 4. Required behaviour

**Established requirements**

- While the assistant searches, show a searching state, ideally with the query. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.04)
- While code runs, show a running-code state for that step. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.05)
- While a connected service is called, name the service and show the call in progress. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.06)
- While an artifact or file is produced, show it is being built. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.12)
- While an image or video is generated, show generation progress. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.13)
- Progress is typed data: tool calls, files, failures are events. (source: docs/product/experience-contract.md:80)

**Acceptance criteria**

1. Run a web search prompt on web: a label with the query appears while running and 'Searched the web · N sources' after.
2. Stop the run during the search: the row reads 'Search stopped', not removed.
3. Run code on web: the label reads 'Running code'.
4. Call a connected service: the label names the service (for example 'Reading from <Name>').
5. Ask for an artifact: a Creating row shows file name, lines and seconds; clicking opens the panel.
6. Generate an image on mobile and web: a generating card shows until the image arrives; mobile offers Stop.
7. Fail a step: the step shows failed status and the run summary reads Finished with errors or Failed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that can run a tool should show a step label for it [inferred from S19.04-S19.06].
- VS Code and Chrome should show media progress if they can start media generation [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give CLI search steps a distinct 'Searching the web for <query>' label like web.
- [proposed] Show video progress percent on mobile as web does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentActivityTimeline (shared) | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Web and desktop timeline: summaries, search labels, source counts, step list. |
| service | connector step sentences | `packages/ui/unified-chat/src/components/connector-step-sentence.ts` | Turns connector tool names into running, finished, failed and stopped sentences. |
| service | activity status helpers | `packages/ui/unified-chat/src/lib/activity-status.ts` | settledActivityStatus, connectorStepPhase, connectorSentence. |
| service | deriveAgentActivityLabel | `apps/web/lib/hooks/agentActivityLabel.ts` | Per-tool label text on web. |
| hook | useChatStream tool and search handlers | `apps/web/lib/hooks/useChatStream.ts` | Builds web search entries (2325-2345), tool timeline (2565-2590). |
| component | ArtifactCreatingRow | `apps/web/features/chat/components/artifacts/ArtifactCreatingRow.tsx` | Creating and Created rows. |
| hook | useStreamingArtifactSync | `apps/web/features/chat/hooks/use-streaming-artifact.ts` | Syncs the streaming artifact block to the artifact store (MessageBubble.tsx:1512). |
| component | ImageGenerationCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Generating image card. |
| component | web video progress card | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Video queued or processing card with percent and Resume checking (3306-3340). |
| component | mobile AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Mobile summary and step rows. |
| component | WebSearchToolCard | `apps/mobile/src/features/chat/components/WebSearchToolCard.tsx` | Mobile search status lines. |
| component | StreamingArtifactCard | `apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx` | Mobile Writing card for artifacts. |
| component | CLI tool cells | `apps/cli/src/tui/tui_app.rs` | tool_cell_lines glyphs and states (333-343), image progress line (7586). |
| component | VS Code activity group | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Counts and icon states (9005-9012). |
| component | Chrome activity steps | `apps/extension/src/features/side-panel/bubbles.ts` | activityEntrySummary and step rows (840-860,1085-1130). |
| service | agent activity state model | `packages/client/client-runtime/src/agentActivity.ts` | Run and step statuses and entry kinds. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server stream sends typed agent events (tool started, finished, approval, artifact) for a Cloud turn. | our servers | apps/web/lib/hooks/useChatStream.ts:1670 (appliedAgentEvents ledger); packages/client/client-runtime/src/agentActivity.ts:485-535 |
| The client applies each event to an activity state and builds labels from it. | device | packages/client/client-runtime/src/agentActivity.ts:485-535; AgentActivityTimeline.tsx:330-385 |
| Web search, code execution and connector tools run in the managed harness for Cloud turns. | our servers | [inferred] the client only receives events (useChatStream.ts:2325-2345); execution side is in SYS-agents-tools-and-automation |
| Connector calls reach outside services through connectors. | outside service | packages/ui/unified-chat/src/components/connector-step-sentence.ts names the connector; call path in SYS-connectors-plugins-and-skills |
| The artifact block is detected in the streaming text and shown as a Creating row; the raw fence is hidden. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:1495-1517,2057-2060 |
| Image or video generation is requested; video status is checked until a URL arrives. | our servers | MessageBubble.tsx:3306-3340 reads videoStatus, videoTaskId, videoProgress from metadata; polling code not opened (unknown) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| agentActivity state on the message metadata (entries, status, sources, approvals) | Message metadata in the chat store and saved with the message (useChatStream.ts:6142-6165 shows it saved on stop) | Yes for saved Cloud chats [inferred from saveMessageToDb use] | Kept with the message; details on exact retention are in SYS-data-model-and-migrations |
| Generated files and artifacts | Artifact store on the client and file storage on the server (SYS-files-artifacts-and-storage) | unknown | unknown |

**Models and providers.** Step labels do not name a model. Whether a search is native to the provider or run by the AGI harness decides which events exist: web has a native web search entry path (useChatStream.ts:2325-2345). Tool use needs a model that supports tools; Chrome checks capabilities.tools (side_panel.ts: selectedModelSupportsChatTools).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud turns with tools need sign-in (see SYS-authentication-and-identity). Labels themselves need no account. |
| Permissions | Approval-gated tools pause the step (see F019-03). |
| Subscription | None found in the code for the labels. Whether a given tool is allowed on a given plan is decided on the server (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | The timeline pages 40 entries at a time on web and 20 on mobile (AgentActivityTimeline.tsx:46; mobile AgentActivityTimeline.tsx:121). Tool metering: not read. |
| Feature flags | None found in the code opened. |
| Model compatibility | Tool steps appear only for models and routes that call tools. |
| Provider restrictions | Native web search is a provider route feature; the harness search is AGI's (doc: AGENTS.md section 4). |
| Local mode | A Local model turn on web runs on the device with no server tool events; web search and connectors are not provided by the local route in the code opened [inferred]. Exact local tool support: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| First second of a turn | Summary shows 'Working' for under 1 second. | AgentActivityTimeline.tsx:51,357-367 |
| Search cancelled | Label 'Search stopped' (web); 'Search canceled before it returned sources.' (mobile). | AgentActivityTimeline.tsx:142,161; WebSearchToolCard.tsx:80 |
| Search failed | Step marked failed; mobile shows tool output or 'The search failed. Try sending the message again.'; web uses the step summary for failed searches. | WebSearchToolCard.tsx:82-86; AgentActivityTimeline.tsx:158-166 |
| Stopped turn placeholder | The Preparing placeholder is marked cancelled and ignored when naming a stopped run. | AgentActivityTimeline.tsx:303-312 |
| Unavailable connector | connectorSentence returns nothing for an unavailable step so the raw summary shows. | activity-status.ts:95-104 |
| Artifact stream fails or stops | Mobile card shows Failed or Stopped. | StreamingArtifactCard.tsx:65; MessageBubble.tsx:2822 |
| Reduced motion or screen reader | Timeline region has aria-label 'Agent activity' and an announcement string built per status. | AgentActivityTimeline.tsx:869,368-385 |
| Offline or reconnect during a tool step | See F019-05 and the reconnect notice; not handled by labels themselves. | No label-level handling found in the files opened. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.test.tsx`: Timeline labels [inferred from file name; titles not read].
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.sourceCount.test.ts`: Source count in the search summary [inferred].
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.connectorLabel.test.tsx`: Connector label [inferred].
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.stopped.test.tsx`: Stopped run summary [inferred].
- `apps/web/lib/hooks/agentActivityLabel.test.ts`: Label table with cases such as idle without a known model giving 'Connecting to the model' (line 10).
- `apps/web/features/chat/components/artifacts/ArtifactCreatingRow.test.tsx`: Creating row [inferred from file name].
- `apps/web/features/chat/hooks/use-streaming-artifact.test.ts`: Streaming artifact sync [inferred].

**Test scenarios**

- **Web search labels**
  1. On web send a prompt that needs fresh facts.
  2. Expand the activity timeline.
  - Expected: Running label with query, then 'Searched the web · N sources'.
- **Stop a search**
  1. Start a search prompt.
  2. Press Stop before it returns.
  - Expected: Row reads Search stopped; summary reads Stopped or the last real step.
- **Artifact build**
  1. Ask for a long HTML file.
  2. Watch the chat body.
  - Expected: A Creating row with growing line count; raw code not in the message body; click opens the panel.
- **Mobile image generation**
  1. Ask for an image on mobile.
  2. Tap Stop in the card.
  - Expected: Generating image card, then stopped or failed state with Retry.
- **CLI image**
  1. Run /image with a prompt.
  2. Press Esc.
  - Expected: Line 'Generating the image. Esc stops it.' then the run stops.

**Where to look when it fails**

- Web: inspect message.metadata.agentActivity.entries and status.
- Mobile: data-test ids and the ToolCallTimeline sheet.
- CLI: transcript cell state glyphs (spinner, check, cross, circle-slash).
- Server: agent event stream; see SYS-observability-and-operations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **Brief says mobile cannot show artifact building; code has StreamingArtifactCard.** Affects: Mobile; brief accuracy. Evidence: MessageBubble.tsx:2816; StreamingArtifactCard.tsx:65. Work needed: Correct brief; verify visually.
- **Image or video progress is not shown on VS Code.** Affects: VS Code. Evidence: No match in webviewContent.ts for generating media. Work needed: Decide whether VS Code offers media generation; if so add progress.
- **Chrome media and artifact building progress unknown.** Affects: Chrome. Evidence: startVideoTurn exists in side_panel.ts; display not opened. Work needed: Read startVideoTurn and artifactPanel.ts, then verify in the browser.
- **CLI has no search-specific label.** Affects: CLI. Evidence: tool_cell_lines uses tool name and summary only (tui_app.rs:333-350). Work needed: Add a labelled summary for search tools.
- **Web failed web search shows the raw step summary, not the 'Search failed' wording the brief expects.** Affects: Web, desktop. Evidence: AgentActivityTimeline.tsx:158-166 handles only cancelled specially. Work needed: Add a failed search label.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- How video status polling works and which app starts it.
- Whether Chrome media or artifact progress is shown.
- Exact web composer setting names for turning web search on.
- Whether the CLI web search tool has its own label.
