---
id: "F021-01"
type: "feature"
title: "Language label and syntax colours"
aliases: ["Language label", "Code block header", "Syntax highlighting", "Syntax colours", "Code theme", "Shiki highlighter", "S21.01", "S21.02", "code-block-lang-label"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S21.01", "S21.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx", "file:packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts", "test:packages/ui/unified-chat/src/components/markdown/__tests__/HighlightedCode.test.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-01 Language label and syntax colours

Each fenced code block in a reply shows its language name in a header bar and, once the reply has finished streaming, coloured code. Web and the hosted Desktop use the shared Shiki highlighter. Mobile and CLI have their own colourers. Chrome side panel has label and colours. VS Code shows neither.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.01](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2101), [S21.02](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2102).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows the language of a fenced code block as a small label in the block header, and colours keywords, strings and comments so code is easier to read. On web the colour theme can be chosen from six named themes.

**Why it exists.** Brief items S21.01 and S21.02 require every block to name its language and be highlighted by language. It makes code in an AI answer readable and tells the reader what kind of code it is.

**Who uses it.** Anyone reading a model reply that contains code: end users on Web, Desktop, Mobile, CLI and the Chrome side panel; engineers and testers who check rendering.

**Problems it solves**

- Plain monochrome code is hard to scan.
- The reader cannot tell which language a snippet is without reading it.
- Highlighting very large or half-streamed code can freeze the page, so limits and streaming rules protect the main thread.

**Use cases**

- Read a Python snippet in a web chat reply with coloured keywords and a 'python' label.
- Switch the code theme in web Appearance settings and see all blocks recolour.
- Read a bash block in the CLI with a '┌─ bash ─' header line.
- Watch a long reply stream: the last block is plain text, then turns coloured when the block ends.

## 2. User experience

**Where to find it**

- Web (and Desktop, which shows the hosted web chat per AGENTS.md section 5): the header bar of every fenced code block in an assistant message. Label text comes from the fence (packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:178).
- Web theme choice: Settings, Appearance section, a code theme select listing GitHub, GitHub dimmed, GitHub high contrast, Catppuccin, Dracula soft, Everforest (apps/web/features/settings/sections/AppearanceSection.tsx:246-264; labels at packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:58-73).
- Mobile: header row of the code card, language name in lower case or 'Plain text' (apps/mobile/src/features/chat/components/CodeCard.tsx:385).
- CLI: header line '┌─ <language> ─' above the block, '┌─ code ─' when no language (apps/cli/src/tui/markdown_renderer.rs:185-193).
- Chrome side panel: small bar above the block with the language and a copy button (apps/extension/src/features/side-panel/markdown.ts:314-347).
- VS Code: no label and no colours.

**Before you start**

- A model reply that contains a fenced block (three backticks, optionally followed by a language word).
- Web colours need the highlighter chunk to load (dynamic imports in shikiHighlighter.ts:8-56); unknown whether this works offline in the hosted web app.

**Screens and controls**

- Header bar: language label (read only).
- Appearance select for the code theme on web (the visible select label text was not read; unknown).
- No control to switch highlighting off.

**Journey**

1. Ask a question whose answer has code.
2. While the reply streams, the last open block shows plain uncoloured text on web.
3. When the closing fence arrives, the block is coloured (web).
4. Optional: open Settings, Appearance, and pick another code theme; blocks recolour.

**What the person sees and gets**

- Language word in the header (lower-cased by CSS on web: codeBlock.css .code-block-lang-label text-transform lowercase).
- Coloured spans, or plain text if the language is unknown, the block is over 100,000 characters, or the highlighter failed.

**Settings**

- Web code theme (apps/web/shared/stores/web-settings-store.ts:77,132,174), applied by apps/web/shared/components/AppearancePreferences.tsx:30 and included in the settings sync (apps/web/features/settings/components/CloudSettingsSync.tsx:72,131).
- Mobile: a code font and a 'Wrap long lines' preference exist (apps/mobile/src/features/settings/code/useCodeAppearance and apps/mobile/__tests__/CodeWrapLongLines.test.tsx); not read in detail.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/shared: CodeBlock reads the language from the class name with pattern language-<token> and lower-cases it (CodeBlock.tsx:30,290-291); the header shows it (CodeBlock.tsx:178).
- Web/shared: HighlightedCode paints plain text first, then replaces it with coloured token spans when the highlighter resolves (HighlightedCode.tsx:29-72). It is disabled for the stream tail (CodeBlock.tsx:166-173) and drops back to plain text if a block starts streaming again (HighlightedCode.tsx:33-37; test HighlightedCode.test.tsx:98).
- Web/shared: 47 language ids plus aliases such as js, py, sh, yml (packages/ui/unified-chat/src/components/markdown/highlightLanguages.ts:1-113). Unknown languages stay plain text (HighlightedCode.test.tsx:152).
- Web/shared: six dark themes with default 'github' (shikiHighlighter.ts:58-75) and one fixed light theme (shikiHighlighter.ts:56). setCodeTheme notifies subscribers (shikiHighlighter.ts:92-96).
- Web/shared: limits: code over 100,000 characters is not highlighted, lines over 1,000 characters are not tokenised, cache holds 32 entries (shikiHighlighter.ts:107,118-119,245).
- Web: a fence with no language word still gets a header reading 'text' (MarkdownContent.tsx:733-735; test MarkdownContent.render.test.tsx:276-280). Inline code gets no header (CodeBlock.tsx:318-324). This corrects the first draft, which said an unlabelled block shows no name.
- Failure to load the highlighter reports a client failure of class markdown_render and leaves plain text (HighlightedCode.tsx:48-50).
- Mobile: label plus own tokenizer limited to 50,000 characters (apps/mobile/src/features/chat/utils/syntaxHighlight.ts:22,350); unlabelled fence shows 'Plain text' (CodeCard.tsx:385-387; test apps/mobile/__tests__/CodeBlockHeader.test.tsx:28). Highlighting is off while the message streams (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1627-1628).
- CLI: syntect highlighting with a theme built from the terminal palette; unknown language falls back to plain text (markdown_renderer.rs:592-604).
- Chrome side panel: label, copy button and the same Shiki highlighter via highlightToLines (apps/extension/src/features/side-panel/markdown.ts:373-386,459-464). The brief marks Chrome 'missing'; the code shows it is present.

**Incomplete**

- A mobile or CLI language outside their own lists falls back to plain text; the lists differ from the web list (not compared line by line; unknown).
- Brief citations for mobile (MessageContentRenderer.tsx:494/496) and CLI (tui_app.rs:1530) do not point at the code block code; the real code is CodeCard.tsx and markdown_renderer.rs.

**Present but disconnected or switched off**

- reportClientFailure does nothing unless a sink is installed (packages/ui/unified-chat/src/lib/client-failures.ts:19-32). A sink is installed by the Tauri desktop (apps/desktop/src/services/clientFailureReporting.ts:45). No web install was found by search; unknown.

**Not available**

- VS Code webview: renderCodeBlock emits only a language-<x> class, no visible label and no colouring (apps/extension-vscode/src/webview/render.ts:44-58).
- Line numbers, wrap toggle on web, collapse on web are not in CodeBlock.tsx (brief S21.05-S21.07 'missing').

## 4. Required behaviour

**Established requirements**

- Each code block shows its language name in a header. (source: S21.01 brief)
- Code is syntax-highlighted according to its language. (source: S21.02 brief)
- Colours appear only when a block is complete; the stream tail stays plain. (source: packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:170)
- Never describe highlighting or other capabilities as model abilities; availability depends on the app harness. (source: AGENTS.md section 4)

**Acceptance criteria**

1. A python fence on web shows a header reading 'python' and coloured tokens after the reply completes.
2. A fence with no language shows 'text' on web, 'Plain text' on mobile, 'code' in the CLI.
3. The block being streamed shows no colours until its closing fence arrives (web).
4. A fence in an unlisted language shows its label but plain text.
5. A block over 100,000 characters stays readable as plain text on web.
6. Choosing another code theme in web Appearance recolours existing blocks without reload.
7. Chrome side panel shows the label and a copy button; VS Code shows neither (current state).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The hosted Electron Desktop shows the same web rendering because it loads the hosted web app (AGENTS.md section 5; apps/desktop/electron/main.ts:345) [inferred].
- The Tauri desktop under apps/desktop/src renders chat with its own code path; not read; unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the label and colours to the VS Code webview by reusing the shared highlighter, as Chrome does.
- [proposed] Show the same label word for an unlabelled fence on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeBlock / FencedCodeBlock | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Reads the language, draws the header bar and body, passes enabled=!isStreamTail. |
| component | HighlightedCode | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Plain text first, coloured spans after async highlight, failure report. |
| service | shikiHighlighter | `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts` | Loads grammars and themes lazily, tokenises, caches, holds the active theme. |
| config | highlightLanguages | `packages/ui/unified-chat/src/components/markdown/highlightLanguages.ts` | List of 47 language ids and aliases; resolveHighlightLanguage. |
| config | codeBlock.css | `packages/ui/unified-chat/src/components/markdown/codeBlock.css` | Header height, label style, light and dark token colour variables. |
| component | MarkdownContent / MarkdownPre | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Maps fences to CodeBlock; gives unlabelled fences language-text. |
| hook | useIsStreamTail / StreamTailContext | `packages/ui/unified-chat/src/components/markdown/streamTailContext.ts` | Tells a block whether it is the still-streaming tail. |
| service | client-failures | `packages/ui/unified-chat/src/lib/client-failures.ts` | Sink-based failure reporting used by HighlightedCode. |
| component | AppearanceSection code theme select | `apps/web/features/settings/sections/AppearanceSection.tsx` | Lets the user pick the code theme. |
| store | web settings store codeTheme | `apps/web/shared/stores/web-settings-store.ts` | Holds the chosen theme. |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Calls setCodeTheme when the setting changes. |
| service | CloudSettingsSync / appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Includes codeTheme in synced appearance settings. |
| component | CodeCard | `apps/mobile/src/features/chat/components/CodeCard.tsx` | Mobile header label and highlighted body. |
| service | syntaxHighlight | `apps/mobile/src/features/chat/utils/syntaxHighlight.ts` | Mobile tokenizer, tab expansion, token colours. |
| component | markdown_renderer | `apps/cli/src/tui/markdown_renderer.rs` | CLI header line and syntect highlighting. |
| component | side-panel markdown | `apps/extension/src/features/side-panel/markdown.ts` | Chrome code bar with label and highlight pass. |
| component | VS Code renderCodeBlock | `apps/extension-vscode/src/webview/render.ts` | Emits code block markup with no label or colours. |
| service | desktop client failure reporting | `apps/desktop/src/services/clientFailureReporting.ts` | Installs the failure sink in the Tauri desktop. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The reply text is parsed as Markdown; fences become code elements with a language class. | device | packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:772 |
| CodeBlock lower-cases the language, draws the header, and renders HighlightedCode with enabled=false for the stream tail. | device | CodeBlock.tsx:289-292,166-173 |
| HighlightedCode checks the 32-entry cache, else loads the highlighter, the chosen theme and the language grammar through dynamic imports, tokenises, stores the result. | device | shikiHighlighter.ts:240-271; HighlightedCode.tsx:33-55 |
| The loaded grammar and theme modules are fetched as bundle chunks from wherever the app is served (hosted web origin for web and Electron). | our servers | [inferred] dynamic imports at shikiHighlighter.ts:8-56; Electron loads the hosted renderer (apps/desktop/electron/main.ts:345) |
| On failure a client-failure report is sent to whatever sink the app installed. | device and our servers | HighlightedCode.tsx:48-50; apps/desktop/src/services/clientFailureReporting.ts:45 (destination not read; unknown) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Highlight cache (tokens per code, language and theme) | in-memory Map, 32 entries (shikiHighlighter.ts:107,130-140) | no | lost on reload |
| Chosen code theme | web settings store; included in cloud settings sync (CloudSettingsSync.tsx:131) | yes through settings sync when that sync runs; conditions unknown | kept until changed; deletion rules unknown |

**Models and providers.** No model or provider takes part. Highlighting is a local text job on the reader's device. The model only produced the text that contains the fence.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for CodeBlock, HighlightedCode or the highlighter. |
| Permissions | none found in the code. |
| Subscription | none found in the code. No plan check exists in the files read. |
| Limits and metering | Only technical limits: 100,000 characters, 1,000 characters per line, 32 cached blocks on web (shikiHighlighter.ts:107,118-119); 50,000 characters on mobile (syntaxHighlight.ts:22). Nothing is metered. |
| Feature flags | none found in the code for web highlighting. |
| Model compatibility | Not model dependent; any reply text with a fence is rendered the same way. |
| Provider restrictions | none found in the code. |
| Local mode | Works the same in Local, own key and Cloud: rendering is on the device and needs no account or subscription. Only the first load of highlighter chunks may need the network on hosted web; unknown for offline use. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming tail block | Plain text, no colours until the block is complete. | CodeBlock.tsx:170; HighlightedCode.test.tsx:98 |
| Unknown language | Label shows the raw word; code stays plain. | shikiHighlighter.ts:245; HighlightedCode.test.tsx:152 |
| Highlighter load rejects | Plain text stays; markdown_render failure reported if a sink exists. | HighlightedCode.tsx:48-50; HighlightedCode.test.tsx:166 |
| Oversized code (over 100,000 characters) | Returns no tokens; plain text. | shikiHighlighter.ts:245 |
| No language word | Web shows 'text'; mobile 'Plain text'; CLI 'code'. | MarkdownContent.tsx:733-735; CodeCard.tsx:385-387; markdown_renderer.rs:185-189 |
| Theme changed while open | HighlightedCode re-runs because codeTheme is an effect dependency. | HighlightedCode.tsx:28,55; test HighlightedCode.test.tsx:200 |
| Accessibility | Code pre has tabIndex 0 and an aria-label '<language> code block' on web. | CodeBlock.tsx:132,224 |
| Offline or timeout | not handled in the code beyond the failure path above. | searched HighlightedCode.tsx and shikiHighlighter.ts; no offline or timeout branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx`: Header with label and copy control, label text, inline code without header, hyphenated language token.
- `packages/ui/unified-chat/src/components/markdown/__tests__/HighlightedCode.test.tsx`: Disabled path never calls the highlighter, plain first then coloured, no grammar, rejection, one tokenise per block, theme change, cache hit.
- `packages/ui/unified-chat/src/components/markdown/__tests__/shikiCodeTheme.test.ts`: Theme validation, subscriber notification, separate cache per theme.
- `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.test.ts`: Cache key returns only the exact source.
- `packages/ui/unified-chat/src/components/markdown/shikiThemeContrast.test.ts`: Theme contrast (title only; details not read).
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Unlabelled fence shows 'text'; inline code stays inline.
- `apps/mobile/__tests__/CodeBlockHeader.test.tsx`: Mobile label, 'Plain text', header layout.
- `apps/mobile/__tests__/syntax-highlight.test.ts`: Mobile tokenizer languages, oversize fallback, contrast, tabs.
- `apps/extension/__tests__/side-panel-markdown-fence.test.ts`: Chrome fence rendering (streaming fence, info string kept out of body).
- `apps/web/shared/components/AppearancePreferences.test.tsx`: Appearance preferences application (title only; code theme coverage not confirmed).

**Test scenarios**

- **Label and colours on web**
  1. Ask for a Python function.
  2. Wait for the reply to finish.
  - Expected: Header reads 'python'; keywords are coloured; during streaming the last block was plain.
- **Unlabelled fence**
  1. Ask for a block with no language word, on web, mobile and CLI.
  - Expected: 'text', 'Plain text' and 'code' labels respectively; no colours.
- **Theme switch**
  1. Open web Settings, Appearance.
  2. Choose Catppuccin.
  3. Return to a chat with code.
  - Expected: Block colours change without reload; reload keeps the choice.
- **Huge block**
  1. Paste a reply with a code block over 100,000 characters.
  - Expected: Page stays responsive; block is plain text.
- **VS Code and Chrome**
  1. Show a code reply in VS Code sidebar and in the Chrome side panel.
  - Expected: VS Code: no label, no colours. Chrome: label, copy button, colours.

**Where to look when it fails**

- Client failure class markdown_render, detail render (HighlightedCode.tsx:49).
- Browser console errors from failed dynamic imports of highlighter chunks.
- No log lines or tables are tied to this feature.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- Chrome: [70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **VS Code has no language label and no colours.** Affects: VS Code users. Evidence: apps/extension-vscode/src/webview/render.ts:44-58. Work needed: Reuse the shared highlighter and add a label in the VS Code renderer.
- **Unlabelled-fence wording differs by app (text, Plain text, code).** Affects: All apps. Evidence: MarkdownContent.tsx:734; CodeCard.tsx:387; markdown_renderer.rs:185. Work needed: Pick one wording; owner decision.
- **Brief marks Chrome missing but code exists; brief code citations for mobile and CLI are stale.** Affects: Documentation and testers. Evidence: apps/extension/src/features/side-panel/markdown.ts:314-386. Work needed: Update the brief rows.
- **No web install of a client failure sink was found, so highlight failures may go unreported on web.** Affects: Web. Evidence: search found setClientFailureSink only in unified-chat and apps/desktop/src/services/clientFailureReporting.ts. Work needed: Confirm and install a sink on web if absent.
- **Three separate highlighters (Shiki, syntect, hand-written mobile tokenizer) give different colours and language coverage.** Affects: Mobile, CLI. Evidence: syntaxHighlight.ts; markdown_renderer.rs. Work needed: Decide whether parity of language lists is required.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx
- file:packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts
- test:packages/ui/unified-chat/src/components/markdown/__tests__/HighlightedCode.test.tsx

## Unknown

- Whether web installs a client failure sink.
- Whether highlighting works offline on hosted web.
- How the Tauri desktop (apps/desktop/src) renders code blocks.
- The visible label of the web code theme select.
- Exact language coverage differences between mobile tokenizer and the web list.
- Cloud settings sync conditions for codeTheme.
