---
id: "F008-02"
type: "feature"
title: "Text links"
aliases: ["Links in answers", "Markdown links", "Hyperlinks", "Assistant links", "Citation links", "Path links (VS Code)"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.08"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "F008-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-02 Text links

Links inside chat answers. Web shows them in the primary colour with an underline and a small arrow and opens them in a new tab; mobile opens web links, in-app routes or system actions and offers Open, Copy and Share on long press. The CLI prints the address after the text and no opener was found.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.08](../../10-requirements/capabilities/008-basic-interactive-elements.md#s808).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns links the assistant writes into visible, tappable links, with safe handling of unsafe addresses. Web draws a link with underline, arrow icon and new-tab behaviour (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:345-390). Mobile underlines the text and opens it by type (apps/mobile/src/features/chat/components/MarkdownInline.tsx:94-155).

**Why it exists.** Answers cite sources and point to pages. People need to see what is clickable and reach it safely.

**Who uses it.** Anyone reading assistant answers in any app.

**Problems it solves**

- Readers can spot links.
- Unsafe links (script or protocol-relative addresses) are not shown as links.
- Same-page links stay on the page.

**Use cases**

- Click a source link in a web answer and it opens in a new tab.
- Long-press a link in AGI Mobile to copy or share it.
- Read a link in the CLI as 'text (address)'.
- Click a file path in VS Code chat (path-link).

## 2. User experience

**Where to find it**

- Web and Desktop: any assistant message with a markdown link (MarkdownContent.tsx:345).
- Mobile: assistant message text in chat (MarkdownInline.tsx:94-155).
- CLI: assistant text in the terminal chat (apps/cli/src/tui/markdown_renderer.rs:265-280).
- VS Code: assistant messages in the sidebar (apps/extension-vscode/src/webview/render.ts:81-103).
- Chrome: assistant bubbles in the side panel (apps/extension/src/side_panel.ts:2932).

**Before you start**

- An answer that contains a link.

**Screens and controls**

- Web: link text with underline and an arrow icon for external links (MarkdownContent.tsx:378-390).
- Mobile: underlined text; tap opens; long press shows Open, Copy Link, Share Link (MarkdownInline.tsx:117-152).
- CLI: accent colour plus underline, then ' (address)' in muted colour when the text differs from the address (markdown_renderer.rs:271-278, :369-372).
- VS Code: link colour variable from the editor theme (webviewContent.ts:211) and path-link spans for file paths (render.ts:158-185).
- Chrome: assistant links underlined in the accent text colour (side_panel.ts:2932).

**Journey**

1. 1. Assistant writes a link.
2. 2. The app draws it as a link.
3. 3. Person clicks, taps, or presses Enter on a focused link.
4. 4. Web opens a new tab (same-page fragments stay); mobile opens by kind; others per app.
5. 5. On failure mobile shows 'Could not open link'.

**What the person sees and gets**

- Web: new tab opens.
- Mobile: alert 'Could not open link' / 'Nothing on this device could open that link.' on failure (MarkdownInline.tsx:79-87); a toast on copy.
- Mobile: confirm alert with Cancel and Open before a system action (MarkdownInline.tsx:100-108).

**Settings**

- None found in the files read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: external links get target _blank and rel noopener noreferrer, same-page fragments stay in place, tracking parameters are stripped, protocol-relative hrefs and hrefs removed by the sanitizer render as plain text (MarkdownContent.tsx:345-390).
- Web: citation-shaped links become citation chips (MarkdownContent.tsx:370-371).
- Mobile: openAssistantLink resolves the link to web, in-app route or system action; each failure shows an alert (MarkdownInline.tsx:89-108).
- Mobile: link has accessibilityRole link (MarkdownInline.tsx:150).
- CLI: link text accent plus underline; address printed after the text (markdown_renderer.rs:271-278, :369-372).
- VS Code: sanitizer allows only http, https and mailto addresses and forces target _blank and rel noopener noreferrer (render.ts:100, :227-233).
- Chrome: markdown renderer sets rel noopener noreferrer and replaces unsafe hrefs with '#' (apps/extension/src/features/side-panel/markdown.ts:160-168).

**Incomplete**

- Mobile link colour is the primary text colour plus underline, not a distinct link colour (MarkdownInline.tsx:145-147).
- CLI: no code that opens the address was found; the address is only printed. Opening may depend on the terminal [inferred].

**Present but disconnected or switched off**

- None found.

**Not available**

- CLI link activation: not established in the code (searched markdown_renderer.rs link handling).
- Desktop-specific link behaviour: not verified; the public Desktop shows the web app (doc: AGENTS.md section 5) and an Electron handler opens addresses with shell.openExternal in a preview window (apps/desktop/electron/previewWindow.ts:30-39) and through an IPC handler (apps/desktop/electron/main.ts:542-556); how a new-tab link in the main window is routed was not traced.

## 4. Required behaviour

**Established requirements**

- Links in text are visibly styled as links and open their destination when activated. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.08)
- Security behaviour fails closed and untrusted content is validated at trust boundaries. (source: (doc: AGENTS.md section 6))

**Acceptance criteria**

1. A web answer with an external link shows an underlined link that opens a new tab with rel noopener noreferrer.
2. A web link to a heading on the same page does not open a new tab.
3. A link with a javascript: address is not shown as a link in web or VS Code.
4. On mobile, tapping a web link opens it and long press offers Open, Copy Link, Share Link.
5. On mobile, a link nothing can open shows 'Could not open link'.
6. In the CLI, a link whose text differs from its address shows the address in brackets.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should offer a way to open a link, or say plainly that it cannot [inferred from brief wording 'open their destination'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give mobile links a distinct link colour.
- [proposed] Add terminal hyperlink escape codes in the CLI where the terminal supports them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MarkdownLink | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Web and desktop link rendering and safety |
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Pill for citation links |
| component | AssistantLink and openAssistantLink | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Mobile link press, long press menu, opening |
| component | MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile message body (brief item S8.08) |
| component | markdown renderer (CLI) | `apps/cli/src/tui/markdown_renderer.rs` | Link styling and address suffix in the terminal |
| service | render and PURIFY_CONFIG | `apps/extension-vscode/src/webview/render.ts` | VS Code markdown sanitising, link attributes, path links |
| component | VS Code sidebar styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Link colour variables and path-link styles |
| service | side panel markdown | `apps/extension/src/features/side-panel/markdown.ts` | Chrome markdown rendering and href safety |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Link style for assistant bubbles |
| integration | Electron openExternal handler | `apps/desktop/electron/main.ts` | Opens approved addresses in the system browser |
| integration | Electron preview window handler | `apps/desktop/electron/previewWindow.ts` | Routes new-window web addresses to the system browser |
| test | MarkdownContent links test | `packages/ui/unified-chat/src/components/__tests__/MarkdownContent.links.test.tsx` | New tab for external, fragment stays |
| test | AssistantLinkOpening test | `apps/mobile/__tests__/AssistantLinkOpening.test.tsx` | Geo links and open failure |
| test | side panel markdown tests | `apps/extension/__tests__/sidePanelMarkdown.test.ts` | Chrome markdown rendering (contents not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The answer markdown is parsed and links are replaced by link components or sanitised anchors. | device | MarkdownContent.tsx:345-390; render.ts:219-224 |
| Activation opens the destination: browser new tab, mobile Linking or router, or an Electron external open. | device | MarkdownInline.tsx:79-108; main.ts:542-556 |
| The destination page loads from the outside site. | outside service | link target is any web address (MarkdownContent.tsx:378) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Copied link text (mobile) | system clipboard | no | controlled by the system |

**Models and providers.** The assistant model writes the link text; the link component does not call a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for link rendering. |
| Permissions | Mobile asks to confirm before a system-intent link (MarkdownInline.tsx:100-108). Image loading from a link needs consent on mobile (MarkdownInline.tsx:128-135). |
| Subscription | none found in the code (searched MarkdownContent.tsx and MarkdownInline.tsx). |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | any model; rendering is independent of the model. |
| Provider restrictions | none found in the code. |
| Local mode | Links in answers from mode:local render the same way; opening a link needs the device's own network or app, not our servers [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsafe or empty href (web) | Shown as plain text | MarkdownContent.tsx:361-363 |
| Same-page fragment | No new tab, no arrow icon | MarkdownContent.tsx:381-390 |
| Link cannot be opened (mobile) | Alert 'Could not open link' | MarkdownInline.tsx:79-87 |
| Unsafe href (Chrome) | Replaced by '#' | apps/extension/src/features/side-panel/markdown.ts:165 |
| Offline | not handled in the link code; the browser or system decides | not handled in the code (looked in MarkdownContent.tsx and MarkdownInline.tsx) |
| Keyboard (web) | Real anchor element, so it is focusable and Enter follows it [inferred] | MarkdownContent.tsx:376 |
| CLI | No activation; address is printed | markdown_renderer.rs:271-278 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/MarkdownContent.links.test.tsx`: External link goes to a new tab; same-document fragment stays; inline citation markers (it names at lines 9, 16, 33)
- `apps/mobile/__tests__/AssistantLinkOpening.test.tsx`: Geo link in Apple Maps on iOS, unchanged on Android, failure message, missing place
- `apps/extension/__tests__/sidePanelMarkdown.test.ts`: Chrome side panel markdown; contents not opened
- `apps/cli/src/tui/markdown_renderer.rs`: In-file test module at line 643; link cases not confirmed

**Test scenarios**

- **Web external link**
  1. Ask for an answer with a source link.
  2. Click the link.
  - Expected: New tab opens, link underlined with arrow.
- **Unsafe link**
  1. Send an answer containing [x](javascript:alert(1)).
  2. Look at the rendered text.
  - Expected: No clickable link.
- **Mobile long press**
  1. Long-press a link in AGI Mobile.
  2. Choose Copy Link.
  - Expected: Menu shows Open, Copy Link, Share Link; copied toast shows.
- **CLI link**
  1. Run the CLI and get an answer with [docs](https://example.com).
  2. Read the line.
  - Expected: 'docs' underlined, then (https://example.com).
- **VS Code link**
  1. Open the VS Code sidebar chat with an answer containing a web link.
  2. Click it.
  - Expected: Opens outside the webview; behaviour is unverified here.

**Where to look when it fails**

- Web: DOM inspect for target and rel.
- Mobile: alert text 'Could not open link'.
- Not found: log line names for link failures.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **CLI links cannot be activated in code** Affects: CLI. Evidence: markdown_renderer.rs:265-278 only styles and prints. Work needed: Decide whether to add terminal hyperlinks and test.
- **Mobile link colour equals text colour** Affects: Mobile. Evidence: MarkdownInline.tsx:145-147. Work needed: Use a link colour token with contrast check.
- **Desktop, VS Code and Chrome opening not verified** Affects: Desktop, VS Code, Chrome. Evidence: No click handler for links found in render.ts; reliance on host not confirmed. Work needed: Verify by running each app.

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- F008-01

## Unknown

- Whether VS Code opens a clicked web link (no click handler found in render.ts; host behaviour assumed).
- How Desktop routes a new-tab link from the main window.
- Whether the CLI opens links in any way.
- Whether web links are keyboard-focus styled (no focus style read).
- Contents of apps/extension/__tests__/sidePanelMarkdown.test.ts.
