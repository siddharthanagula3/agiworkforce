# In-answer interactive UI: ChatGPT Intelligent UI and the Claude equivalents

Status: Current research snapshot
Owner: Product research
Verified: 2026-10-25
Coverage: what ChatGPT and Claude render inside a chat answer (layouts, charts, diagrams, controls, generated tools, maps, galleries, checklists, questionnaires, citations), how each is triggered, where interaction state lives, persistence and sharing, accessibility, platforms and plans. Gemini and Perplexity are noted briefly. Pages read on 2026-10-25 unless a row says otherwise.

This extends the 2026-10-07 Intelligent UI line in `docs/research/competitor-surfaces-2026-10-24.md` and the Claude
"Visuals" settings observed in `docs/research/leader-settings-and-directory-reference-2026-09-07.md`. Product choices
follow `docs/product/competitive-guidance.md`: reopen the cited page before acting on a single claim. Model generations
are named only as "the October 2026 OpenAI generation"; no model IDs appear here.

## How to read this

Evidence labels, applied per claim or per row:

- **D (Documented):** an official vendor page fetched and read on 2026-10-25, URL given.
- **D-x (Documented, extract only):** an official page whose text reached this research only through search-engine
  extracts or a news article quoting it, because `help.openai.com` and `openai.com` returned HTTP 403 to every fetch
  (WebFetch and a browser-agent curl both). Treat as strong but unread.
- **O (Observed):** seen in the owner's ChatGPT desktop screenshot of 2026-10-25, chat titled "Rendering Types
  Comparison", or in a prior repository observation file named in the row. Not exercised by this research.
- **I (Inferred):** a conclusion drawn from D or O evidence, or a claim found only in press or third-party pages.
- **U (Unknown):** nothing authoritative found. Not proof of absence.

Instrument note: the fetch tool returns a small-model summary of each page, not raw HTML. Quoted phrases are from those
summaries. The owner's screenshot is one answer to one prompt that asked ChatGPT to demonstrate its rendering types, so it
shows what can render, not how often the model chooses to.

## 1. Sources

| Ref | Source                                                                                                                                                         | Status on 2026-10-25                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| O1  | [Intelligent UI in ChatGPT](https://help.openai.com/en/articles/20001598)                                                                                      | 403; text via search extracts (D-x)                               |
| O2  | [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)                                                                     | 403; text via search extracts (D-x)                               |
| O3  | OpenAI help article on the October 2026 models in ChatGPT, [article 20001354](https://help.openai.com/en/articles/20001354)                                    | 403; text via search extracts (D-x)                               |
| O4  | OpenAI launch post of 2026-10-07 for the new generation and Intelligent UI (openai.com, index path)                                                            | 403; text via search extracts and O5 (D-x)                        |
| O5  | Search Engine Journal launch report, 2026-10-07, quoting O1 to O4 (searchenginejournal.com article 592249; full URL omitted because its slug names a model ID) | Read (I, D-x where it quotes OpenAI)                              |
| O6  | [ChatGPT Visualizations docs](https://learn.chatgpt.com/docs/visualizations.md)                                                                                | Read (D)                                                          |
| O7  | [Apps SDK UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)                                                                        | Read (D)                                                          |
| O8  | [Apps SDK: build ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)                                                                          | Read (D)                                                          |
| O9  | [Apps SDK reference](https://developers.openai.com/apps-sdk/reference)                                                                                         | Read (D)                                                          |
| A1  | [Claude builds visuals (announcement)](https://claude.com/resources/articles/claude-builds-visuals)                                                            | Read (D); dated 2026-03-12, Cowork note 2026-04-22                |
| A2  | [Custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539)                                                                           | Read (D); page says updated 2026-04-22                            |
| A3  | [What are artifacts and how do I use them](https://support.claude.com/en/articles/17153992)                                                                    | Read (D); "Updated this week"                                     |
| A4  | [Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)                                   | Read (D); "Updated this week"                                     |
| A5  | [Interactive connectors announcement](https://claude.com/resources/articles/interactive-tools-in-claude)                                                       | Search extract (D-x); dated 2026-01-26                            |
| A6  | [Enabling and using web search](https://support.claude.com/en/articles/10684626-enabling-and-using-web-search)                                                 | Read (D)                                                          |
| A7  | [Agent SDK: user input and approvals](https://code.claude.com/docs/en/agent-sdk/approvals)                                                                     | Search extract (D-x)                                              |
| A8  | [Publishing and sharing artifacts](https://support.claude.com/en/articles/9547008)                                                                             | Search extract (D-x)                                              |
| G1  | [Google Research: Generative UI](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)                  | Read (D); dated 2025-11-18                                        |
| G2  | [Use visual layout or dynamic view in Gemini Apps](https://support.google.com/gemini/answer/16741341)                                                          | Fetched page returned general Gemini web help, not this topic (U) |
| P1  | [Perplexity changelog](https://www.perplexity.ai/changelog)                                                                                                    | Read (D); entry 2026-10-05                                        |
| S1  | Press on ChatGPT maps: [BGR](https://bgr.com/tech/chatgpt-just-got-new-mapping-features-but-they-dont-work-very-well-yet/)                                     | Search extract (I)                                                |
| S2  | Press on June 2026 interactive charts: [Tony Reviews Things](https://www.tonyreviewsthings.com/chatgpt-interactive-charts/), quoting O2                        | Search extract (I)                                                |

## 2. The two products in one paragraph each

**ChatGPT Intelligent UI** launched 2026-10-07 with the October 2026 OpenAI generation: the model "decides how each
response is laid out" and may combine text with "graphics, tappable buttons, forms, charts, and interactive experiences"
in the answer, or stay with plain text when that fits best (D-x, O1, O4, O5). OpenAI's demos were a savings calculator, a
bill splitter and a game played in the chat, and a user "can also ask ChatGPT to create a tool for the task at hand"
(D-x, O4 via O5). It sits on top of two earlier layers: interactive charts (June 2026) and interactive math and science
modules for 70+ topics (March 2026) (D-x, O2 via O5), and the separate Visualizations preview reachable as the
"Visualize" plugin (D, O6). Third-party apps render through the Apps SDK, a different, documented contract (D, O7 to O9).

**Claude's equivalent is split three ways.** Custom visuals (beta, 2026-03-12) are HTML diagrams, charts and interactive
visuals rendered inline and ephemeral (D, A1, A2). Artifacts are the persistent, shareable deliverables that open beside
the chat and live in an Artifacts tab (D, A3). Interactive connectors (MCP Apps, 2026-01-26) render third-party UI as
inline cards or fullscreen (D, A4, A5). No Anthropic page found describes Claude composing native form controls,
galleries or maps as first-class answer components outside those three (U).

## 3. Per-category comparison

Columns: **Leader renders** = what the product draws. **Trigger** = model-composed answer component, tool or plugin,
or third-party app. **Interaction** = where state lives and whether a control can send a follow-up to the model.

| Category                               | ChatGPT renders                                                                                                                                                                                                          | ChatGPT trigger                        | ChatGPT interaction                                                                                                                                                                                                                      | Claude renders                                                                                                                                                   | Claude trigger                                           | Claude interaction                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Text and rich text, markdown tables    | Markdown, tables (O). Defect: a "Comparison table" inside a card rendered as raw pipe markdown (O)                                                                                                                       | Model (O)                              | Static                                                                                                                                                                                                                                   | Markdown and tables (baseline, not re-verified here)                                                                                                             | Model                                                    | Static                                                                                                      |
| Cards and structured layouts           | Cards and sectioned layouts inside the answer (O); "layout" chosen per response (D-x, O1)                                                                                                                                | Model-composed (D-x, O1)               | Static containers (O)                                                                                                                                                                                                                    | No documented card layout for model answers (U). Connector inline cards: "compact components embedded directly in the conversation" (D, A4)                      | Connector tool call (D, A4)                              | Connector card actions act on the connected service; refinement is typed in the composer (D, A4)            |
| Charts and data viz                    | Bar chart "Requests per month" with a data table (O). Interactive bar, line, pie, scatter; other types static images; PNG export (I, S2). Charts in Visualizations (D, O6)                                               | Model chooses, or "@Visualize" (D, O6) | Hover and explore in place (I). Follow-ups "can create a replacement visualization instead of editing the original" (D, O6)                                                                                                              | Inline HTML charts, e.g. compound interest curves (D, A1, A2)                                                                                                    | Model decides, or user asks (D, A1, A2)                  | Buttons, sliders, fullscreen; in chat "clicking inside a visual sends a follow-up prompt to Claude" (D, A2) |
| Diagrams and visual explanations       | Diagrams, simulations, interactive explainers, e.g. wave interference lab, tokenizer explainer (D, O6); 70+ math and science modules (D-x, O2)                                                                           | Model or "@Visualize" (D, O6)          | Controls such as shifting curves on request (D, O6)                                                                                                                                                                                      | Diagrams; interactive periodic table that you "click around for more details" (D, A1)                                                                            | Model or "draw this as a diagram" (D, A1)                | As above (D, A2)                                                                                            |
| Interactive controls                   | Radio plan selector with "Selected plan: Pro" readout; budget slider $0 to $500 with live value; checkboxes feeding "Your configuration"; dropdown "Selected frequency: weekly" (O). "Tappable buttons, forms" (D-x, O1) | Model-composed (D-x, O1)               | Readouts update instantly with no new message, so state is held client side (I from O). Whether a control can post to the model: U for Intelligent UI. Apps SDK widgets can: `sendFollowUpMessage`, `callTool`, `setWidgetState` (D, O9) | Buttons and sliders inside custom visuals (D, A2)                                                                                                                | Model (D, A2)                                            | Click sends a follow-up prompt in chat, not in Cowork (D, A2)                                               |
| Generated tools and mini-apps          | Savings calculator, bill splitter, in-chat game; "ask ChatGPT to create a tool" (D-x, O4). Calculators and simulations (D, O6). Durable hosted apps point to Sites (D, O6)                                               | Model or user request (D-x, O4)        | Snapshot of data at creation; no live refresh (D, O6)                                                                                                                                                                                    | Inline interactive visuals (D, A2); persistent "small interactive tool" artifacts with storage up to 20 MB and Claude calls billed to each viewer's plan (D, A3) | Model, or "save as artifact" from a visual (D, A2, A3)   | Artifacts keep state in personal or shared storage (D, A3)                                                  |
| Maps and location                      | Live map with pins and a fullscreen control (O). Maps in Visualizations (D, O6). Local-search map with clickable pins (I, S1)                                                                                            | Model; local queries (I, S1)           | Pan, zoom, pin detail, fullscreen (O, I)                                                                                                                                                                                                 | No documented native map (U). A custom visual could draw one in HTML (I)                                                                                         | U                                                        | U                                                                                                           |
| Images, galleries, carousels           | Image gallery with captions (O). Apps SDK inline carousel, 3 to 8 items, one optional CTA each (D, O7)                                                                                                                   | Model (O); apps via tool (D, O7)       | Browse in place (O)                                                                                                                                                                                                                      | U for a model-composed gallery                                                                                                                                   | U                                                        | U                                                                                                           |
| Checklists, task lists, progress       | "Website QA workflow" checklist with % progress, Reset and "Copy checklist" (O)                                                                                                                                          | Model-composed (O)                     | Ticks update progress locally (I from O). Survival across reload: U                                                                                                                                                                      | U as a native component; achievable as a custom visual or artifact (I)                                                                                           | U                                                        | U                                                                                                           |
| Questionnaires and adaptive follow-ups | "Forms" (D-x, O1); the observed controls form a configurator (O)                                                                                                                                                         | Model-composed (D-x, O1)               | Submit-to-model path for Intelligent UI forms: U. Apps SDK card actions "perform either a conversation turn or a tool call" (D, O7)                                                                                                      | Claude Code shows multiple-choice questions with an "Other" free-text option (D-x, A7). Chat app equivalent: third-party reports only (I)                        | Tool (D-x, A7)                                           | Answer returns to the model as tool result (D-x, A7)                                                        |
| Expandable sections                    | "Advanced settings" disclosure (O)                                                                                                                                                                                       | Model-composed (O)                     | Local toggle (I)                                                                                                                                                                                                                         | U                                                                                                                                                                | U                                                        | U                                                                                                           |
| Citations and linked entities          | Source chips such as "OpenAI Help +1" (O); a Sources button on search answers (D-x, O1 via O5)                                                                                                                           | Search tool (D-x)                      | Open source list (O)                                                                                                                                                                                                                     | "Direct citations to sources", source links, relevant quotes (D, A6); visual format not stated (U)                                                               | Web search tool, automatic in the new experience (D, A6) | Links out (D, A6)                                                                                           |
| Third-party app UI                     | Apps SDK: inline card, inline carousel, fullscreen with composer overlaid, picture-in-picture pinned on scroll (D, O7)                                                                                                   | App tool call (D, O7, O8)              | `requestDisplayMode`; "On mobile, picture-in-picture may be presented as fullscreen" (D, O9). Widget state "belongs to one rendered UI instance" (D, O8). Model-visible context via ui/update-model-context (D, O8)                      | MCP Apps inline cards and fullscreen view, composer stays available (D, A4)                                                                                      | Connector tool call (D, A4)                              | JSON-RPC between UI and Claude, payload undocumented (D, A4)                                                |

## 4. Persistence, sharing, accessibility

**ChatGPT.**

- Persistence: a visualization "is generally a snapshot of the information available when ChatGPT created it" and does not
  update from connected sources (D, O6). Apps SDK widget state is per rendered instance, not durable storage, and apps
  should avoid `localStorage` for core state (D, O8). Whether Intelligent UI control state (slider value, ticked
  checklist) survives reload or reopening the chat: U.
- Sharing: use the chat's standard Share action; review source data first; export options vary, fallback is asking for
  the data or converting to a Site (D, O6). Whether shared links keep Intelligent UI interactivity: U.
- Accessibility: "Generated visualizations aim to use semantic controls, visible focus, readable contrast, and reduced
  motion, but the result can vary"; users are told to ask for text summaries, data tables, labeled axes, non-color cues
  and keyboard-accessible controls (D, O6). Apps SDK requires WCAG AA contrast, alt text on all images and text resizing
  without layout breakage (D, O7). For Intelligent UI components specifically: U.
- Failure handling: generation "can take a minute or longer"; if blank, wait, reload once, retry (D, O6). The observed
  raw-pipe table inside a card (O) shows nested markdown inside a composed component can fail to render.

**Claude.**

- Persistence: custom visuals are "ephemeral by default" and "change or disappear as the conversation evolves" (D, A1, A2).
  Keep one by copying as image, downloading .svg or .html, or saving as an artifact (D, A2). Artifacts save to the
  Artifacts tab and start private (D, A3).
- Sharing: a shared chat renders the visual for logged-in recipients on web and desktop; Cowork visuals cannot be shared
  by link (D, A2). Artifacts publish to a public link on Free, Pro and Max, and share inside the org on Team and
  Enterprise (D-x, A8).
- Accessibility: not covered by A1 to A4 (U).
- Controls: a settings toggle "Inline visualizations" sat under Capabilities > Visuals beside Artifacts and AI-powered
  artifacts (O, 2026-09-07 observation file). A2 does not mention an off switch.

## 5. Platforms, plans and rollout

| Feature                           | Web                         | Desktop                                                                                          | iOS / Android                                             | Plans                                                                                                                                  | Rollout and limits                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT Intelligent UI            | Yes (D-x, O1)               | Updated apps yes; legacy macOS and Windows apps no (D-x, O1 via O5); owner saw it on desktop (O) | "Supported, updated apps" (D-x, O1 via O5)                | All: Plus, Pro, Business, Enterprise from 2026-10-07; Free and Go from 2026-10-08 (D-x, O2). Enterprise by admin configuration (I, O5) | Chat tab only, not Work; not in Voice (D-x, O1). Instant through Extra High reasoning; the Pro reasoning option does not support it (D-x, O1, O3). Reduce with Personalization > Layout and Visuals > Simple on web; "some may still appear"; no full off switch (D-x, O1) |
| ChatGPT Visualizations preview    | Chat and Work (D, O6)       | "Rolling out in preview" (D, O6)                                                                 | Rolling out to eligible accounts (D, O6)                  | Depends on plan, platform, account, workspace (D, O6)                                                                                  | Not rendered in Codex CLI or IDE extension (D, O6)                                                                                                                                                                                                                         |
| ChatGPT interactive charts (June) | Yes (I, S2)                 | macOS excluded at release (I, S2)                                                                | Yes (I, S2)                                               | U                                                                                                                                      | Interactive for bar, line, pie, scatter only (I, S2)                                                                                                                                                                                                                       |
| ChatGPT Apps SDK display modes    | Yes (D, O7)                 | U                                                                                                | Yes; PiP may become fullscreen on mobile (D, O9)          | U                                                                                                                                      | Card: two actions max, no internal scroll; carousel 3 to 8 items (D, O7)                                                                                                                                                                                                   |
| Claude custom visuals             | Yes (D, A2)                 | Yes (D, A2)                                                                                      | Not rendered (D, A2)                                      | All users (D, A2); Cowork on paid plans since 2026-04-22 (D, A1)                                                                       | Beta; Cowork lacks click-to-follow-up and link sharing (D, A2)                                                                                                                                                                                                             |
| Claude artifacts                  | Create, edit, share (D, A3) | Same (D, A3)                                                                                     | View and edit; sharing settings on web or desktop (D, A3) | Free, Pro, Max, Team, Enterprise; Dashboards beta on paid; Motion beta on Team and Enterprise (D, A3)                                  | Requires "Cloud code execution and file creation" on; legacy chat artifacts before 2026-09-16 cannot be created anew (D, A3)                                                                                                                                               |
| Claude interactive connectors     | Yes (D, A4)                 | Yes (D, A4)                                                                                      | Yes (D, A4)                                               | All users (D, A4)                                                                                                                      | Team and Enterprise owners can disable the rendering tool calls (D, A4)                                                                                                                                                                                                    |

## 6. Mechanism: how the answer becomes UI

- **Claude custom visuals are model-written HTML** (D, A2). The fetched pages do not say which libraries are loaded; press
  reports CDN chart libraries (I).
- **Gemini dynamic view is model-written HTML, CSS and JS** produced with agentic coding, tool access, detailed system
  instructions and post-processing (D, G1).
- **ChatGPT Intelligent UI mechanism: U.** No fetched page says whether the model emits a fixed component vocabulary or
  free code. Indirect signs point both ways: the observed controls share one consistent visual system across categories
  (O), which fits a host-owned component set (I); the Visualizations preview's minute-long generation and "replacement
  visualization" on follow-up (D, O6) fit generated code (I). The two may be different paths.
- **Third-party UI on both leaders is the MCP Apps contract**: ChatGPT documents shared names (ui/message, tools/call,
  ui/update-model-context) with `window.openai` aliases (D, O8); Claude renders MCP Apps as inline cards and fullscreen
  (D, A4, A5).

## 7. Other vendors (brief)

- **Gemini:** dynamic view and visual layout, Labs experiments rolling out in the Gemini app from 2025-11-18, users may
  see only one; generative UI in Search AI Mode for US Google AI Pro and Ultra subscribers (D, G1). Current Gemini app
  availability and plans: U (G2 did not return the topic page).
- **Perplexity:** changelog 2026-10-05 "explore interactive visualizations in your thread"; types, plans and platforms not
  stated (D, P1). Labs builds hosted dashboards and apps (I, third-party guides).

## 8. What matching would require (inferred, not a decision)

Derived from sections 3 to 6; each line is I.

- A host-owned component set for the observed vocabulary (cards, chart plus data table, radio, slider, checkbox,
  dropdown with live readouts, checklist with progress, Reset and Copy, gallery, disclosure, map with fullscreen,
  citation chips) gives the consistent look seen in ChatGPT; free model-written HTML (the Claude and Gemini path) covers
  long-tail tools and simulations. The leaders run both.
- Each component needs a declared answer to: does state live only in the client, and can it post a follow-up turn to the
  model. Claude documents click-to-follow-up for visuals; ChatGPT documents it for apps only.
- Nested markdown inside a component must render through the same markdown pipeline as the answer body; the observed
  ChatGPT raw-pipe table is the failure to avoid.
- Leaders gate by surface: Claude visuals do not render on mobile; ChatGPT excludes Work, Voice, one reasoning option and
  legacy desktop builds. A plain-text fallback is part of the contract, plus a user setting to reduce visuals (ChatGPT
  "Simple", Claude "Inline visualizations").
- Persistence differs by tier: ephemeral inline visual, then save as artifact for durable, shareable, stateful output.

## 9. Owner screenshot, items 9 to 30

The same owner chat, captured 2026-10-25 between 21:03 and 21:07 on ChatGPT desktop, continued with a reply headed
"More UI/UX rendering examples". Every row is O (Observed) from that screenshot and records what rendered, not how often
the model chooses it.

| Item | Rendering                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 9    | Email draft block: subject, Recipients field, editable body with a "Start writing" prompt, Copy, open-in-mail, "Connect email" |
| 10   | Editable chat message block labelled "Writing", with undo, copy and expand                                                     |
| 11   | Editable document or report block with headings and lists the user can type into; undo, copy, expand                           |
| 12   | Editable social post block                                                                                                     |
| 13   | Editable code block with a language label, copy and expand                                                                     |
| 14   | HTML or React code with a live preview, download and view source                                                               |
| 15   | Copy-ready prompt block: title, "Copy-ready" badge, monospace panel, full-width "Copy full prompt" button                      |
| 16   | Terminal commands card: "Shell" label, bash block, "Copy commands", a note that the commands were not executed                 |
| 17   | JSON with syntax colours                                                                                                       |
| 18   | Diff with red and green minus and plus lines                                                                                   |
| 19   | Console output and error output panels, each with an "Example" badge                                                           |
| 20   | SQL block                                                                                                                      |
| 21   | Markdown inside a card with a "Completed" status badge, a list, a blockquote and inline code                                   |
| 22   | Math: a display equation and a fraction                                                                                        |
| 23   | Source citation card: title, "OpenAI Help Center · Documentation", summary, "Read documentation" link                          |
| 24   | Status label list: Passed in green, Failed in red, Pending in amber, Not tested in neutral                                     |
| 25   | Inline action panel: title, note, a primary "Copy review note" and a secondary "Inspect confirmation UI" button                |
| 26   | Follow-up suggestion links ("Show more code block types" and others) that send their text as the next message                  |
| 27   | File and attachment cards: a PDF item with icon, type and description; config.json with a "JSON" badge                         |
| 28   | Audio transcript with timestamps and speakers                                                                                  |
| 29   | Timeline of numbered steps with descriptions and Complete, In progress and Not started badges                                  |
| 30   | Display-mode cards (inline, picture-in-picture, fullscreen) and a "Complete rendering inventory" table                         |

## 10. Open questions

- Intelligent UI official text (O1 to O4) was not read directly; reopen when `help.openai.com` is reachable from an
  authorized browser and confirm the D-x rows.
- Whether ChatGPT Intelligent UI controls can send a message to the model, persist across reload, or survive a shared link.
- Whether Claude's chat app renders multiple-choice question widgets outside Claude Code.
- Accessibility guarantees for model-composed components on either leader.
