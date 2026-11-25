---
id: "F009-09"
type: "feature"
title: "Source inspector and model warning"
aliases: ["Source inspector", "Sources panel", "Citation chip", "View sources", "Capability-warning card", "Model compatibility notice", "Model warning", "S9.28 S9.34"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S9.28", "S9.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "mode:own-key", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-shared-ui-and-design", "file:apps/web/features/chat/components/Composer/model-compatibility.ts", "file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-09 Source inspector and model warning

Two checks around an answer. The source inspector shows each source's site, title and excerpt and opens it. The model warning checks the chosen model against the conversation and tells the person, inside the model picker, that images, tools, files or history will not fit, before they switch or send.

Area: [9. Compound interface components](README.md). Requirement items: [S9.28](../../10-requirements/capabilities/009-compound-interface-components.md#s928), [S9.34](../../10-requirements/capabilities/009-compound-interface-components.md#s934).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person open the sources behind an answer through a 'Sources' button or a citation chip (apps/web/features/chat/components/research/ResearchPanel.tsx:596-632; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:85-150). Before a model is used, it compares the request with the model's catalogue limits and shows plain warnings (apps/web/features/chat/components/Composer/model-compatibility.ts:97-207).

**Why it exists.** People must be able to check where an answer came from, and must not lose images, tools or older messages silently when a model cannot handle them (doc: knowledge-base/data/area-briefs/009-compound-interface-components.md S9.28, S9.34).

**Who uses it.** Anyone reading cited answers or choosing between models on Web, the desktop window and Mobile (Chrome for sources).

**Problems it solves**

- Trusting an answer without seeing the source (CitationChip.tsx:85-116).
- A model that cannot read images ignoring them without notice (model-compatibility.ts:187-192).
- A smaller context model dropping older messages (model-compatibility.ts:181-186).

**Use cases**

- Click 'Sources' under an answer and read each site, title and excerpt.
- Hover a citation chip to see the excerpt, click to open the page.
- Switch to a model that cannot call tools while web search is on: see 'cannot call tools' and choose Switch anyway or keep the current model.
- Attach a PDF while a free quota model is selected: see that Free Auto will answer.

## 2. User experience

**Where to find it**

- Web: a pill button under answers, text 'Sources' (with ' · N' above three) and aria label 'View N sources' (ResearchPanel.tsx:618-630); panel labelled 'Research panel' with tab 'Sources' and close 'Close sources panel' (ResearchPanel.tsx:392-416, 466).
- Inline: citation chips in answer text (CitationChip.tsx:126-150).
- Mobile: a pill 'View N sources' opening a page sheet (apps/mobile/src/features/chat/components/CollapsibleSources.tsx:175-215).
- Chrome side panel: citation chip with hover card (apps/extension/src/features/side-panel/sources.ts:42-70).
- Warning on Web: inside the model picker popover in the composer footer, region 'Model compatibility' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1755-1760; ModelCompatibilityNotice.tsx:3, 20-22).
- Warning on Mobile: a warning line above the input about images only (apps/mobile/src/features/chat/components/ChatInput.tsx:1750-1768).

**Before you start**

- An answer that carries sources (SourcesControl returns nothing if there are none, ResearchPanel.tsx:608).
- A model chosen in the picker; Auto shows no findings (model-compatibility.ts:147-155).

**Screens and controls**

- Sources list rows with site, title, snippet and a link (ResearchPanel.tsx:84-142).
- Memory section 'Memory' with excerpts when memory was used (ResearchPanel.tsx:156-170).
- Empty state SourcesEmptyState (ResearchPanel.tsx:198).
- Switch card 'Switch to <model>?' with buttons 'Switch anyway' and 'Keep <current model>' (ComposerFooter.tsx:1533-1568).
- Notice lines in warning colour, one per code (ModelCompatibilityNotice.tsx:25-33).

**Journey**

1. Read an answer and click 'Sources' or a citation chip.
2. The panel opens with the cited sources, then more sources (SourcesControl passes cited and more, ResearchPanel.tsx:610-614).
3. Click a source to open it in a new page.
4. For the warning: open the model picker and look at the footer note, or pick another model.
5. If findings exist, the switch card appears; choose Switch anyway or Keep.

**What the person sees and gets**

- Notice texts: 'This model is not in the catalogue, so its limits cannot be checked.'; '... will be left out of the next reply.'; 'cannot read images, so the images in this conversation will be ignored.'; 'cannot call tools, so <tools> will be off for this turn.' (model-compatibility.ts:166, 184, 190, 196).
- Free model texts that name Free Auto (model-compatibility.ts:108-141).
- A separate muted line when the last reply came from a different model than selected (ModelCompatibilityNotice.tsx:34-38; ComposerFooter.tsx:1112-1125).

**Settings**

- none found in the code for either part.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sources control, panel, memory section and snippets (ResearchPanel.tsx:84-170, 596-632).
- Citation chip shows host, title, snippet capped by CITATION_SNIPPET_MAX_CHARS, publisher and retrieved date (CitationChip.tsx:85-116; citationPublisher.ts:89-95).
- Mobile sources pill and page sheet with stacked marks (CollapsibleSources.tsx:175-215).
- Chrome citation chip and card with host, title, snippet, date; link opens in a new tab with noopener (sources.ts:21-62).
- Web compatibility evaluation: five codes unknown_model, context_overflow, no_vision, no_tools, no_attachments (model-compatibility.ts:55-56).
- Check reads the catalogue (context window, max output, vision, tools) and never a provider name (model-compatibility.ts:91-96, 156-198).
- Token estimate uses a router estimator, adds 800 per multimodal part and 4 per message (model-compatibility.ts:12-31).
- Budget is window minus reply allowance minus 2,048 reserve, at least 1,024 (model-compatibility.ts:10-11, 47-53).
- Free quota offerings have their own wording and name Free Auto (model-compatibility.ts:102-146).
- Auto mode returns no findings (model-compatibility.ts:147-155).
- Notice is role status with label 'Model compatibility' (ModelCompatibilityNotice.tsx:20-22).
- Pre-switch card blocks on every code except unknown_model (ComposerFooter.tsx:1181-1186).

**Incomplete**

- The warning sits in the model picker popover, not under the chat box as the first draft said (ComposerFooter.tsx:1755-1760).
- Mobile warns only about unreadable images, not context, tools or attachments (apps/mobile/src/features/chat/utils/unreadableImagesNotice.ts:15-34).
- The compatibility check is a web file; the desktop window shows the web app; no copy exists in apps/desktop/src (grep for evaluateModelCompatibility over apps found only web).

**Present but disconnected or switched off**

- none found.

**Not available**

- Source inspector on CLI and VS Code (brief S9.28).
- Capability warning on CLI, VS Code and Chrome (brief S9.34); no vision or capability check was found in apps/extension/src.

## 4. Required behaviour

**Established requirements**

- The user can open an answer's sources and see each one's title, origin and excerpt, then open it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.28)
- Before sending, a visible notice warns when the chosen model cannot handle images, tools, attachments or context size. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.34)
- Capability and limits come from the model catalogue, never a provider name. (source: doc: AGENTS.md section 4; code model-compatibility.ts:91-96)
- Which model ids exist is owned by the generated catalogue and consumers resolve through it. (source: doc: AGENTS.md section 4)
- Free models with limits name Free Auto as the fallback. (source: apps/web/features/chat/components/Composer/model-compatibility.ts:108-141)
- Documentation availability stays separate from account and route availability. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. An answer with sources shows the Sources button; clicking opens a panel listing title, site and excerpt for each, and a click opens the page.
2. An answer without sources shows no Sources button.
3. Select a model without vision after attaching an image: a warning names the model and says images will be ignored.
4. Select a model without tools while a tool is on: the warning names the tool control.
5. Select a model with a small window with a long chat: the warning says older messages will be left out.
6. Select Auto: no warning shows.
7. With the notice visible, a screen reader announces it as a status region.
8. Choose 'Switch anyway': the model changes; 'Keep <model>': it does not.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The source list should show where each excerpt came from by publisher domain [inferred from citationPublisherDomain].
- The mobile warning should cover the same five codes [inferred from S9.34 and mobile being 'done'].
- The notice should be reachable without opening the picker [inferred from 'under the box' in the brief use text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the warning as a small note in the composer itself when the selected model has a finding, not only inside the popover.
- [proposed] Move the compatibility rules into a shared package so Mobile, Chrome and the CLI can use the same codes.
- [proposed] Add a sources view to the CLI as a numbered list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | evaluateModelCompatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | Rules, codes, token estimate and budget. |
| component | ModelCompatibilityNotice | `apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx` | Status region with warning lines. |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Builds the request, evaluates, shows switch card and notice (lines 1082-1125, 1181, 1533-1568, 1755-1760). |
| service | free-model-handoff | `apps/web/features/chat/lib/free-model-handoff.ts` | freeQuotaChatOffering used for the free model wording (import at model-compatibility.ts:8). |
| service | model catalogue lookups | `packages/contracts/types/src/model-catalog.ts` | getModelMetadataById, isAutoModeModelId and offering lookups (named in AGENTS.md section 4; imported at model-compatibility.ts:2-7). |
| service | estimateTokens | `packages/ai/routing` | Token estimator imported from @agiworkforce/routing (model-compatibility.ts:1); exact file not read. |
| component | SourcesControl and ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources button and panel. |
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Inline chip with hover card. |
| service | citationPublisher | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Domain, snippet and date helpers. |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Places the sources control under answers (brief line 2739). |
| component | CollapsibleSources | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Mobile sources pill and sheet. |
| service | unreadableImagesNotice | `apps/mobile/src/features/chat/utils/unreadableImagesNotice.ts` | Mobile image warning text and cloud handover wording. |
| component | ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Shows the mobile warning (lines 1750-1768). |
| component | Chrome sources | `apps/extension/src/features/side-panel/sources.ts` | Citation chip and source cards in the side panel. |
| test | model-compatibility tests | `apps/web/features/chat/components/Composer/model-compatibility.test.ts` | Covers codes and free model wording. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer builds a request from the conversation, pending attachments and armed tools. | device | ComposerFooter.tsx:1082-1105 |
| The evaluator looks the chosen model up in the shipped catalogue and estimates tokens locally; no network call is made. | device | model-compatibility.ts:97-207 |
| Findings render in the picker popover; choosing another model runs the same check first and may show the switch card. | device | ComposerFooter.tsx:1181-1186, 1533-1568 |
| For sources, the answer's citation data (already received with the reply) is passed to the panel store; opening a source follows its URL in a new page. | device | ResearchPanel.tsx:604-632; CitationChip.tsx:148-151 |
| The favicon is loaded from an outside favicon service by the source's domain. | outside service | CitationChip.tsx:48-51 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source list (url, title, snippet, dates) | With the message data in the chat store and the research panel store | Stored with the conversation (cloud-chat-sources-persistence test exists at apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts); web persistence not read | Follows the conversation |
| Compatibility findings | Computed on demand, not stored | No | Not kept |

**Models and providers.** Entirely catalogue driven: context window, max output, vision and tools flags per model, plus a quota-probe offering flag for free models (model-compatibility.ts:101-103, 175-198). No provider name is read. Provider routing is not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sources are shown to the person who can read the answer; a shared page uses the same chips [inferred]. The warning needs no account beyond the composer. |
| Permissions | none found in the code. |
| Subscription | Free quota offerings get wording that points to Free Auto; the plan's model list decides which models show but not the check itself (model-compatibility.ts:102-146). |
| Limits and metering | none found in the code. The token total is an estimate. |
| Feature flags | none found in the code. |
| Model compatibility | Applies to every catalogued model; an uncatalogued id gives 'unknown_model' and is not blocking in the switch card (ComposerFooter.tsx:1182). |
| Provider restrictions | none found in the code; wording for free quota models depends on the offering, not the provider. |
| Local mode | Local models selected in the picker skip the switch check (leaveLocalModel path, ComposerFooter.tsx:1173-1176). How the notice treats a local model was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No sources | The sources control renders nothing. | ResearchPanel.tsx:608 |
| Empty panel | SourcesEmptyState shows. | ResearchPanel.tsx:198, 499 |
| Source without excerpt | The snippet line is omitted. | CitationChip.tsx:114-117 |
| Unknown model | Finding unknown_model, not blocking on switch. | model-compatibility.ts:158-172; ComposerFooter.tsx:1182 |
| No findings and no substitution | Notice renders nothing. | ModelCompatibilityNotice.tsx:18 |
| Switch pending | Notice hidden while the switch card shows. | ComposerFooter.tsx:1755 |
| Accessibility | Notice is role status; mobile warning has accessibilityRole alert; Chrome chip uses aria-describedby. | ModelCompatibilityNotice.tsx:20; ChatInput.tsx:1751; sources.ts:51 |
| Offline | The check works offline because it is local; opening a source needs network. | model-compatibility.ts:97-207 [inferred] |
| Touch | Chrome chip opens on first touch before navigating. | sources.ts:63-69 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Free model wording, no findings for short chats, overflow, vision, tools, unknown model, model naming.
- `apps/mobile/src/features/chat/utils/__tests__/unreadableImagesNotice.test.ts`: Mobile image notice and handover wording.
- `apps/mobile/__tests__/CollapsibleSources.test.tsx`: Mobile sources pill and sheet.
- `apps/mobile/__tests__/CloudStreamInlineCitations.test.tsx`: Inline citations on mobile cloud streams.

**Test scenarios**

- **Vision warning**
  1. Attach an image in a chat.
  2. Open the model picker and select a model without image reading.
  - Expected: Switch card names the model and says images will be ignored; Keep leaves the model unchanged.
- **Context overflow**
  1. Open a very long chat.
  2. Select a model with a smaller window.
  - Expected: Warning gives estimated and held token counts and says older messages will be left out.
- **Auto**
  1. Select Auto.
  - Expected: No finding appears.
- **Free model with file**
  1. Select a free quota model.
  2. Attach a non-image file.
  - Expected: Warning says Free Auto answers a message that carries other files.
- **Source open**
  1. Ask a question that searches the web.
  2. Click Sources, then a source.
  - Expected: Panel lists site, title, excerpt; the page opens in a new tab.
- **Status region**
  1. Turn on a screen reader.
  2. Trigger a finding.
  - Expected: The notice is read as a status.

**Where to look when it fails**

- data-compatibility-code attribute on each warning line (ModelCompatibilityNotice.tsx:28).
- Evaluate result fields estimatedTokens and budgetTokens (model-compatibility.ts:77-83).
- data-citation-snippet attribute on excerpts (CitationChip.tsx:115).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Warning lives only in the picker popover on Web.** Affects: Web and desktop window.. Evidence: ComposerFooter.tsx:1755-1760.. Work needed: Decide if a note must show in the composer; update the brief wording.
- **Mobile covers only the image case.** Affects: Mobile.. Evidence: unreadableImagesNotice.ts:15-34; no other codes found in apps/mobile/src.. Work needed: Add context, tools and attachments checks or mark them not applicable.
- **No capability warning on CLI, VS Code or Chrome.** Affects: Those apps.. Evidence: Brief S9.34; no hit in apps/extension/src.. Work needed: Share the rules and add the notice.
- **No source inspector on CLI or VS Code.** Affects: CLI, VS Code.. Evidence: Brief S9.28.. Work needed: Add a source list view.
- **The check is a web-only file, not a shared package.** Affects: Consistency across apps.. Evidence: File path under apps/web; AGENTS.md section 3 on shared domain behaviour.. Work needed: Move rules to a shared package.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- mode:own-key
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-shared-ui-and-design
- file:apps/web/features/chat/components/Composer/model-compatibility.ts
- file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx

## Unknown

- Whether Local-mode models show any compatibility note in the web picker.
- Where the estimateTokens implementation lives and how accurate it is for each model.
- Whether the Tauri desktop build has its own warning; none found in apps/desktop/src.
- Whether Chrome has any capability notice beyond the brief's 'missing'.
- How source data is persisted for web conversations.
- Which docs/product files describe source display or model warnings; none were read.
