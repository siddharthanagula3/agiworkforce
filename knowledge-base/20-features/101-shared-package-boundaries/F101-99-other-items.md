---
id: "F101-99"
type: "feature"
title: "Other items in Shared package boundaries"
aliases: ["Shared source and citation model", "AgentEventSource", "source records", "Citation chips", "Sources list", "S101.18"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.18"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:vscode", "surface:cli", "surface:desktop", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "file:crates/agiworkforce-protocol/src/agent_events.rs", "file:packages/contracts/types/src/shared-ownership.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-99 Other items in Shared package boundaries

A source a turn used (link, title, optional snippet) has one shape defined in the Rust protocol and generated into TypeScript. Web, Mobile and the Chrome side panel build their source records from it. VS Code parses it. Citation marker handling is partly shared and partly copied.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.18](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10118).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives every surface the same record for a web page or document an answer drew on, so source lists and numbered citation markers like [1] show consistently. The record is AgentEventSource with url, title and optional snippet, generated from Rust (packages/contracts/types/src/generated/protocol/AgentEventSource.ts:3; crates/agiworkforce-protocol/src/agent_events.rs:628).

**Why it exists.** A client that declares its own url, title and snippet record drifts from what the server sends. The ownership registry says so under 'source records' (packages/contracts/types/src/shared-ownership.json:69-74). Showing sources is core to competing with Claude and ChatGPT research answers.

**Who uses it.** People reading cited answers on Web, Mobile, the Chrome side panel and VS Code; engineers building source and citation UI.

**Problems it solves**

- Private copies of the source record that lose or rename fields.
- Citation markers that link to the wrong source.
- Source lists that differ between apps.

**Use cases**

- A research answer shows numbered citations and a source list on Web and Mobile.
- The Chrome side panel shows source cards with the site host under an answer.
- A coding session in VS Code receives a source-list event from the local runtime.
- A reopened past chat on Mobile still shows its sources.

## 2. User experience

**Where to find it**

- Web chat: citation markers and sources under an answer (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx; exact visible labels not read).
- Mobile chat: citation chip and a collapsible sources control (apps/mobile/src/features/chat/components/CitationChip.tsx; test names CollapsibleSources and SourceControls exist; labels unknown).
- Chrome side panel: source links showing the site name (apps/extension/src/features/side-panel/sources.ts:17-30).
- VS Code: the panel receives a sourceList message; where it is drawn was not established.
- CLI: sources travel in the protocol (apps/cli/src/app_server/developer_host.rs:7-8); terminal display not read.

**Before you start**

- An answer that used web search, research or files and so produced sources. Cloud or own-key route with a search-capable path; Local availability unknown.

**Screens and controls**

- Numbered citation markers inside the answer.
- A sources list or cards under the answer.
- Mobile: collapsible sources and source controls.

**Journey**

1. 1. The person asks a question that needs sources.
2. 2. The turn pipeline emits a source-list event with url, title and snippet.
3. 3. The client stores the sources on the message.
4. 4. The renderer turns [n] markers into links to the matching source and lists the sources.
5. 5. The person taps a marker or source to open the page.

**What the person sees and gets**

- Numbered markers and source cards or chips.
- Site host shown on Chrome source links (apps/extension/src/features/side-panel/sources.ts:11-27).

**Settings**

- none found in the code for this item.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The source record is generated from Rust: AgentEventSource is { url, title, snippet? } and a source-list event carries an array of them (packages/contracts/types/src/generated/protocol/AgentEventSource.ts:3; packages/contracts/types/src/generated/protocol/AgentEvent.ts:57).
- Web extends the shared record rather than declaring its own: research-plan resume sources use Omit and Pick of AgentEventSource (apps/web/features/chat/utils/research-plan.ts:1,85-86); the shared message source type extends it (packages/ui/unified-chat/src/lib/message-sources.ts:1-8).
- Mobile extends it in three places: tool search results, message sources and citation chips (apps/mobile/types/chat.ts:1,41; apps/mobile/src/features/chat/utils/messageSources.ts:1,14; apps/mobile/src/features/chat/components/CitationChip.tsx:2,21), and its streaming client types incoming sources from the protocol (apps/mobile/services/streaming.ts:24,547).
- Chrome now adopts it: SidePanelSource extends AgentEventSource (apps/extension/src/features/side-panel/chat-state.ts:13,37). The brief says Chrome adoption is left; the code shows it done for the record type.
- VS Code parses a source-list event with a zod schema typed as AgentEventSource and forwards the sources to the sidebar state (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1211-1220,1344; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:56,664).
- The CLI uses the generated Rust types (apps/cli/src/app_server/developer_host.rs:7-8).
- The client-runtime agent activity state also types sources with the shared record (packages/client/client-runtime/src/agentActivity.ts:6,88,131).
- Citation marker parsing is shared in unified-chat (packages/ui/unified-chat/src/components/markdown/citationMarkers.ts) and used by Web and Mobile code (apps/web/features/chat/lib/citation-anchors.ts; apps/mobile/src/features/chat/utils/inlineCitationMarkers.ts, found by search).

**Incomplete**

- Chrome keeps its own marker pattern in sources.ts (a CITATION_MARKER regular expression) instead of the shared citation helper (apps/extension/src/features/side-panel/sources.ts:6; compare packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:4). The two patterns are written differently; whether they behave the same was not tested.
- VS Code: the source record is parsed and forwarded, but no code was found that renders citations in its webview (search of apps/extension-vscode/src/webview and sidebar-webview for citation returned nothing).

**Present but disconnected or switched off**

- none found.

**Not available**

- Brief's own note: Chrome and VS Code adoption patches were pending (brief S101.18). The Chrome record is adopted per the code above; VS Code rendering is unknown.

## 4. Required behaviour

**Established requirements**

- Sources and citations use one shared model on every surface that shows them. (source: S101.18)
- A source a turn drew on reaches every surface as the protocol's AgentEventSource; a client must not declare its own url, title and snippet record. (source: packages/contracts/types/src/shared-ownership.json:69-74)
- Rust protocol types flow one way into TypeScript; regenerate with pnpm generate:protocol-types. (source: doc: AGENTS.md section 5)
- unified-chat is shared by desktop, web, Chrome and VS Code, so nothing in it may assume one surface's routing, billing or account model. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. The same turn produces the same url and title for each source on Web, Mobile and the Chrome side panel.
2. A marker [2] opens the second source on each surface that renders citations.
3. Markers inside code blocks are not turned into links (fence-aware handling in citationMarkers.ts and Chrome UNDECORATED_ANCESTORS).
4. A reopened past chat shows its stored sources on Mobile.
5. pnpm check:client-inference does not report a private source record type.
6. pnpm check:protocol-types passes after a change to AgentEventSource.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because Chrome and Web both interpret [n] markers, the two marker patterns must agree on edge cases such as [1](url), [1]: and nested brackets; this is not guaranteed while two copies exist.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Export the shared marker pattern and have Chrome import it, with a shared fixture test.
- [proposed] Decide whether VS Code should show sources, and if so add rendering and a test.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | AgentEventSource (Rust) | `crates/agiworkforce-protocol/src/agent_events.rs` | Owner of the source record and source-list event. |
| schema | AgentEventSource (generated) | `packages/contracts/types/src/generated/protocol/AgentEventSource.ts` | Generated TypeScript shape: url, title, optional snippet. |
| config | shared-ownership registry | `packages/contracts/types/src/shared-ownership.json` | Declares AgentEventSource as the owner of 'source records'. |
| command | check:client-inference | `scripts/check-client-inference.mjs` | Reads the ownership registry and flags private copies of owned shapes. |
| service | Message research source | `packages/ui/unified-chat/src/lib/message-sources.ts` | Extends the record with favicon, dates and citation index. |
| service | Citation markers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Marker runs, href patterns and URL normalisation. |
| component | Web CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Chip shown for a citation on Web. |
| service | Web citation anchors | `apps/web/features/chat/lib/citation-anchors.ts` | Web handling of citation anchors. |
| service | Web research plan | `apps/web/features/chat/utils/research-plan.ts` | Builds resume sources from the shared record. |
| service | Mobile message sources | `apps/mobile/src/features/chat/utils/messageSources.ts` | Mobile source record extending the shared one. |
| component | Mobile CitationChip | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Chip drawn for a citation on Mobile. |
| service | Mobile streaming client | `apps/mobile/services/streaming.ts` | Receives source events from the stream. |
| service | Mobile inline citation markers | `apps/mobile/src/features/chat/utils/inlineCitationMarkers.ts` | Turns markers into links in the Mobile renderer. |
| service | Chrome side-panel chat state | `apps/extension/src/features/side-panel/chat-state.ts` | SidePanelSource extends the shared record and merges sources. |
| component | Chrome sources renderer | `apps/extension/src/features/side-panel/sources.ts` | Source links and its own citation marker pattern. |
| service | VS Code local runtime client | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | zod schema for source-list events. |
| store | VS Code chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts sourceList to the panel. |
| service | Client runtime agent activity | `packages/client/client-runtime/src/agentActivity.ts` | Activity state typed with the shared source record. |
| service | CLI developer host | `apps/cli/src/app_server/developer_host.rs` | Emits protocol source-list events. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The turn pipeline (our servers for Cloud, local runtime for coding sessions) emits a source-list event with sources. | our servers | packages/contracts/types/src/generated/protocol/AgentEvent.ts:57; apps/cli/src/app_server/developer_host.rs:7-8 |
| The client reads the stream. Mobile types the sources from the protocol; VS Code validates them with zod. | device | apps/mobile/services/streaming.ts:547; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1211-1220 |
| The client stores sources on the message or activity entry and merges duplicates. | device | apps/extension/src/features/side-panel/chat-state.ts:318,391-399; packages/ui/unified-chat/src/lib/message-sources.ts |
| The renderer replaces [n] markers with links and draws the source list. | device | apps/extension/src/features/side-panel/sources.ts:6-30; packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:4-12 |
| The person opens a source URL in the browser. | outside service | apps/extension/src/features/side-panel/sources.ts:22-27 (target _blank, rel noopener noreferrer) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sources attached to a message | Message state on the device; persisted with the chat on Mobile (test cloud-chat-sources-persistence exists) and for Cloud chats on our servers (table not established) | Conversation sync exists (SYS-sync-and-continuity); whether sources are included on every surface is unknown | With the chat; deletion rules unknown |

**Models and providers.** The model or the search provider supplies the source URLs and titles. Which models can produce sources depends on the route and the search tool, not on this model definition. The shared record is the same for any provider; web search is a route or harness capability, not an intrinsic model one (doc: AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the source record itself. Producing sources through Cloud search needs an account (SYS-authentication-and-identity). |
| Permissions | none found in the code. |
| Subscription | none found in the code in the record or marker helpers. Whether web search is limited by plan is owned by the cloud contract web-search-allowance (packages/contracts/cloud-contracts/src/web-search-allowance.ts, not read). |
| Limits and metering | VS Code accepts at most 500 sources per event (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1220). Others not found. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent for rendering. Whether a given model returns sources depends on the route. |
| Provider restrictions | none found in the code for the record. |
| Local mode | The rendering code runs on the device in every mode and needs no payment. Whether Local inference produces sources is unknown; web search needs an outside service. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No sources | Chrome and Web show no list; marker links need a matching source. Exact empty UI not read. | apps/extension/src/features/side-panel/sources.ts |
| Invalid URL | Chrome falls back to showing the raw string as the host. | apps/extension/src/features/side-panel/sources.ts:11-17 |
| Marker inside code, link or math | Chrome excludes code, pre, a, math and existing citations from decoration. | apps/extension/src/features/side-panel/sources.ts:7 |
| Tracking parameters in URLs | Shared citation URL normalisation strips utm and click-id parameters before comparing. | packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:19-25 |
| Too many sources in one event | VS Code rejects events over 500. | apps/extension-vscode/src/integrations/localRuntimeClient.ts:1220 |
| Offline or reopened chat | Mobile persists sources and has tests for past chats; other surfaces unknown. | apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts; PastChatCitations.test.tsx |
| Retry, cancel, timeout | not handled in the code at the source-record level. | packages/contracts/types/src/generated/protocol/AgentEventSource.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `scripts/check-client-inference.test.mjs`: The ownership guard, including a 'source records' shape case at line 360.
- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: Shared citation marker helpers.
- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: Web citation chip card.
- `apps/web/features/chat/lib/citation-anchors.test.ts`: Web citation anchors.
- `apps/web/features/chat/lib/citation-links.test.ts`: Web citation links.
- `apps/mobile/__tests__/streaming-reference-sources.test.ts`: Mobile streaming sources (name only; contents not read).
- `apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts`: Mobile source persistence.
- `apps/mobile/__tests__/CloudStreamInlineCitations.test.tsx`: Mobile inline citations in a cloud stream.
- `apps/mobile/__tests__/PastChatCitations.test.tsx`: Mobile citations in a reopened chat.
- `apps/mobile/__tests__/CollapsibleSources.test.tsx`: Mobile collapsible sources.
- `apps/extension/__tests__/side-panel-chat-state.test.ts`: Chrome side-panel state (sources not confirmed).
- `apps/desktop/src/runtime/__tests__/LocalChatTurn.reopenedSources.test.tsx`: Tauri renderer reopened sources.

**Test scenarios**

- **Same sources everywhere**
  1. Ask a research question that returns three sources.
  2. Open the same chat on Web, Mobile and the Chrome side panel.
  - Expected: Each shows three sources with the same urls and titles.
- **Marker mapping**
  1. Find an answer with [1] and [3].
  2. Tap each marker on Web, Mobile and Chrome.
  - Expected: Marker n opens source n.
- **Marker in code**
  1. Ask for a code sample with an array index like a[1].
  2. View it on Web and Chrome.
  - Expected: The index is not turned into a citation link.
- **Reopen chat**
  1. Close and reopen a chat with sources on Mobile.
  - Expected: Sources and chips are still present.
- **Private copy rejected**
  1. Add interface Src { url: string; title: string; snippet?: string } in a client file.
  2. Run pnpm check:client-inference.
  - Expected: The guard reports a private copy of an owned shape (behaviour implied by shared-ownership.json; confirm by running).
- **VS Code source event**
  1. Run a VS Code local coding session that emits a source-list event.
  2. Look at the panel.
  - Expected: Unknown: confirm whether sources are shown; at minimum the event is accepted and posted as sourceList.

**Where to look when it fails**

- Zod parse failures in apps/extension-vscode/src/integrations/localRuntimeClient.ts for source-list events.
- pnpm check:protocol-types output after changing the Rust record.
- check-client-inference baseline entries in scripts/check-client-inference.baseline.json.
- No recorded test results were found; nothing is claimed as passing.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Chrome carries its own citation marker pattern instead of the shared helper.** Affects: Chrome side panel users; consistency with Web and Mobile. Evidence: apps/extension/src/features/side-panel/sources.ts:6 versus packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:4. Work needed: Import the shared pattern, or add a shared fixture test proving equal behaviour.
- **VS Code rendering of sources was not found.** Affects: VS Code users. Evidence: No citation or source rendering in apps/extension-vscode/src/webview or sidebar-webview; only schema and message posting. Work needed: Confirm in the running panel; if absent, add rendering.
- **The brief still lists Chrome and VS Code adoption as left, but Chrome's record type already extends the shared one.** Affects: Readers of the brief. Evidence: apps/extension/src/features/side-panel/chat-state.ts:13,37. Work needed: Update the brief row.
- **The brief's evidence cites apps/web/shared/types/common.ts:203, which is a research-plan helper, not a source model.** Affects: Reviewers following the brief. Evidence: apps/web/shared/types/common.ts:203-216. Work needed: Correct the code references for S101.18.
- **Desktop (Tauri renderer) and CLI terminal display of sources were not verified.** Affects: Desktop, CLI. Evidence: apps/desktop/src/runtime/__tests__/LocalChatTurn.reopenedSources.test.tsx exists; CLI display not read. Work needed: Read and run.

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:vscode
- surface:cli
- surface:desktop
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- file:crates/agiworkforce-protocol/src/agent_events.rs
- file:packages/contracts/types/src/shared-ownership.json

## Unknown

- Whether VS Code draws sources anywhere in its panel.
- Whether the Chrome and shared marker patterns behave the same on edge cases.
- Whether Local-mode inference can emit source-list events and on which apps.
- Whether sources are included in conversation sync on every surface, and the table that stores them.
- Visible labels of the source and citation controls on each surface.
- How the CLI terminal and the Tauri renderer display sources.
