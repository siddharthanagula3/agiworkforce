---
id: "F020-04"
type: "feature"
title: "Footnotes"
aliases: ["Footnotes", "S20.14", "footnote reference [^1]", "Footnotes section"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S20.14"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx"]
basis: "code inspection"
second_reader: "9 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-04 Footnotes

Shows a reference like [^1] as a small raised marker tied to a note at the bottom of the answer. Web, desktop and Chrome link the marker to a footnotes list with a back-link. Mobile shows a numbered marker, a bottom list, and an alert on tap. VS Code and CLI have no footnote support.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.14](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2014).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Links a marker in the text to a note, so an answer can carry side comments without breaking the sentence.

**Why it exists.** Models sometimes use Markdown footnotes. Without support the reader sees literal [^1] text (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md S20.14).

**Who uses it.** Readers of answers that cite or annotate with footnotes.

**Problems it solves**

- Raw [^1] markers do not litter the text.
- Notes are reachable and the reader can return to the spot (web, Chrome).
- Two messages on one page do not clash ids (web).

**Use cases**

- Read an answer with a definition note.
- Jump from a marker to its note and back.
- Tap a marker on mobile to read the note.

## 2. User experience

**Where to find it**

- Web and Desktop (Tauri): markers and a footnotes section at the end of the message (remark-gfm output, MarkdownContent.tsx:339-343, 891-894).
- Mobile: marker in text, tap opens an alert titled 'Footnote <n>' unless the caller passes onFootnotePress, in which case that handler runs and no alert shows (MarkdownInline.tsx:49, 157-159, 410-430), and a 'Footnotes' list at the end of the message (MessageContentRenderer.tsx:876-925, 1672-1675).
- Chrome: raised number linking to a section labelled 'Footnotes' with a back-link (markdown.ts:217-246; test side-panel-markdown-parity.test.ts:216-260).

**Before you start**

- A reply with a footnote reference and a definition line like [^1]: text.

**Screens and controls**

- Web and Chrome: click the marker to jump; click the back arrow to return.
- Mobile: tap the marker (button role when a note exists).

**Journey**

1. Reply has [^1] and [^1]: text.
2. Marker is drawn raised.
3. Reader activates it.
4. Web and Chrome jump to the list item; mobile opens an alert, or runs the caller's onFootnotePress handler instead when one is supplied (MarkdownInline.tsx:49,413,424).

**What the person sees and gets**

- Raised numbered marker.
- Footnotes list at the bottom.
- Mobile alert with the note's plain text (default; replaced by the onFootnotePress handler when supplied).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: footnote links stay in the same tab and their target id gets the sanitiser prefix so the jump lands (MarkdownContent.tsx:335-343, 371-378). A per-message scope keeps ids unique (891-894; test MarkdownContent.render.test.tsx:329).
- Streaming: a settled block that uses a footnote label is not trusted until the definition arrives; the whole message folds into one unit (StreamingMarkdownContent.tsx:22-47, 89-103; test StreamingMarkdownContent.test.tsx:221-235).
- Mobile: footnote nodes parse, number and, on tap, open an alert titled 'Footnote <n>' via Alert.alert(`Footnote ${n}`, inlinePlainText(note)) as the fallback (MarkdownInline.tsx:157-159, 410-430). If context.options.onFootnotePress is supplied it is called with the label instead and no alert shows (MarkdownInline.tsx:49,413,424; test MarkdownInline.render.test.tsx:545 exercises it with a jump callback). A Footnotes section lists referenced notes (MessageContentRenderer.tsx:1634-1636, 1672-1675).
- Chrome: markdown-it-footnote with custom renderers, a labelled section, and a back-link labelled with the note number (markdown.ts:217-246).
- Web footnote parsing is not a footnote-specific plugin: REMARK_PLUGINS holds remarkGfm, remarkMath, remarkBreaks, remarkLosslessTables and remarkAssistantFenceIdentity (remarkPlugins.ts:71-77). Footnote ids use a clobberPrefix built from footnoteScope (MarkdownContent.tsx:891-894); unscoped callers get an empty prefix, so id uniqueness depends on the caller.

**Incomplete**

- Mobile list items have no back-link (renderFootnoteSection draws number and text only, MessageContentRenderer.tsx:876-925).

**Present but disconnected or switched off**

- The brief's status for mobile and Chrome says missing; the code shows both implemented. The brief status is stale.
- The brief page's front matter (implementation mobile/chrome: missing, available_on web+desktop) and its Status table (Mobile and Chrome 'not built') contradict its own body and gaps section, which say mobile and Chrome are built (MarkdownInline.tsx:410-430; markdown.ts:217-246). Section 10's 'Not built on: Mobile, ... Chrome' line repeats the stale claim.

**Not available**

- VS Code: no footnote plugin in markdown-it setup (render.ts:16-24); the marker shows as literal text [inferred].
- CLI: ENABLE_FOOTNOTES is not in the parser options (markdown_renderer.rs:147-150); marker shows as literal text [inferred].

## 4. Required behaviour

**Established requirements**

- Footnote references ([^1]) render as superscript markers linked to a footnotes section. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.14)

**Acceptance criteria**

1. 'A[^1]' with '[^1]: note' shows a raised marker and a footnotes list on web and Chrome.
2. The marker link jumps to the note and the back-link returns.
3. Two messages each using [^1] on one web page keep separate ids (test line 329).
4. On mobile tapping the marker opens 'Footnote 1' with the note text, unless the caller passes onFootnotePress, in which case that handler runs instead (MarkdownInline.tsx:413,424).
5. A footnote whose definition streams in later still resolves on web (test StreamingMarkdownContent.test.tsx:221).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- VS Code and CLI should at least keep the note text readable; today they would show the marker and definition as plain text [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the footnote plugin to the VS Code renderer reusing the Chrome rules.
- [proposed] Print footnote notes at the end of CLI output.
- [proposed] Add a back-link on mobile or document that the alert replaces it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | remark-gfm (footnote parsing) | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | GFM plugin carries footnote support [inferred from remark-gfm]; REMARK_PLUGINS 71-77 holds remarkGfm, remarkMath, remarkBreaks, remarkLosslessTables and remarkAssistantFenceIdentity, not a footnote-specific plugin. |
| component | MarkdownLink footnote handling | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Same-tab footnote links and prefixed fragment (335-390). |
| hook | footnoteScope option | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Unique id prefix per message, passed as clobberPrefix; unscoped callers get an empty prefix so uniqueness depends on the caller (835, 891-894). |
| component | StreamingMarkdownContent | `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx` | Late-definition handling (22-47, 87-103). |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Passes footnoteScope per message (2884-2906). |
| component | footnote node | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Marker, alert fallback, onFootnotePress override, button role (49, 157-159, 410-430). |
| component | renderFootnoteSection | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Footnotes list at the end (876-925). |
| service | markdownInlineSyntax | `apps/mobile/src/features/chat/utils/markdownInlineSyntax.ts` | footnoteNumber and marker helpers (imported at MessageContentRenderer.tsx:64-69). |
| service | Chrome footnote rules | `apps/extension/src/features/side-panel/markdown.ts` | markdown-it-footnote and custom ref, block, item, anchor renderers (217-246). |
| test | Web footnote tests | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx` | Link and back-link ids, unique ids, sanitiser prefix (314-345). |
| test | Chrome footnote tests | `apps/extension/__tests__/side-panel-markdown-parity.test.ts` | Footnotes section label and unique ids (216-260). |
| test | Streaming footnote test | `packages/ui/unified-chat/src/components/markdown/__tests__/StreamingMarkdownContent.test.tsx` | Definition streams later (221-235). |
| test | Mobile footnote press test | `apps/mobile/src/features/chat/components/__tests__/MarkdownInline.render.test.tsx` | Exercises the onFootnotePress jump callback path (545). |
| service | CLI parser options | `apps/cli/src/tui/markdown_renderer.rs` | No footnote option (147-150). |
| service | VS Code markdown-it setup | `apps/extension-vscode/src/webview/render.ts` | No footnote plugin (16-24). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Parser finds references and definitions in the reply. | device | MarkdownContent.tsx:943-951; markdown.ts:217 |
| The renderer prefixes ids per message and builds a footnotes section. | device | MarkdownContent.tsx:891-894 |
| On mobile the marker press shows a native alert, or calls the onFootnotePress handler instead when the caller supplies one. | device | MarkdownInline.tsx:49,157-159,413,424 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rendered footnote DOM or views | In memory | No | Discarded with the view |

**Models and providers.** No model or provider involvement.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Any model that writes the footnote syntax. |
| Provider restrictions | none found in the code. |
| Local mode | Works offline and in Local mode; no network step. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reference without a definition | Mobile marker has no button role and does nothing on press when no note exists. | MarkdownInline.tsx:419-425 |
| Definition arrives later while streaming | Web re-renders the message as one unit so the reference resolves. | StreamingMarkdownContent.tsx:97-103 |
| Same label in two messages | Web ids differ by footnoteScope; callers that pass no scope get an empty prefix, so uniqueness depends on the caller. | MarkdownContent.tsx:891-894 |
| Mobile caller supplies onFootnotePress | The handler is called with the label and no alert shows. | MarkdownInline.tsx:49,413,424; test MarkdownInline.render.test.tsx:545 |
| Accessibility | Mobile marker has label 'Footnote <n>'; Chrome section has aria-label 'Footnotes' and back-link label. | MarkdownInline.tsx:418; markdown.ts:236-246 |
| Offline, error, retry | not handled in the code (nothing to fail). | Searched the footnote paths in MarkdownContent.tsx, MarkdownInline.tsx and markdown.ts; no network or retry code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Footnote links and back-links match by id; ids unique between messages; sanitiser prefix kept (314-345).
- `packages/ui/unified-chat/src/components/markdown/__tests__/StreamingMarkdownContent.test.tsx`: Footnote reference resolves against a definition that streams later (221-235).
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Chrome footnotes section label, back-link, unique ids (216-260).
- `apps/mobile/src/features/chat/components/__tests__/MarkdownInline.render.test.tsx`: Matched a search for footnote; line 545 exercises the onFootnotePress jump callback path; other cases not read.
- `apps/mobile/src/features/chat/utils/__tests__/markdownInlineSyntax.test.ts`: Matched a search for footnote; cases not read.

**Test scenarios**

- **Jump and return**
  1. Send reply 'Claim[^1]' and '[^1]: Source text'.
  2. Click the marker on web.
  3. Click the back arrow.
  - Expected: Page lands on the note, then back at the marker, with no new tab.
- **Mobile note**
  1. Render the same reply on mobile.
  2. Tap the marker.
  - Expected: Alert 'Footnote 1' with the note text (when no onFootnotePress is supplied); list at end shows '1.' and the note.
- **Unsupported apps**
  1. Render the reply in VS Code and CLI.
  - Expected: Observe how [^1] appears; record it (expected: literal text).
- **Two messages**
  1. Show two replies both using [^1] on one web page.
  2. Click each marker.
  - Expected: Each lands on its own note.

**Where to look when it fails**

- Web: inspect ids with the sanitiser prefix on footnote elements.
- No log lines found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **VS Code and CLI show no footnotes.** Affects: VS Code, CLI. Evidence: render.ts:16-24; markdown_renderer.rs:147-150. Work needed: Add support or decide not to.
- **Brief marks mobile and Chrome as missing though both are built; its front matter, Status table and Section 10 'Not built on' line repeat the stale claim.** Affects: Documentation, planning. Evidence: MarkdownInline.tsx:410-430; markdown.ts:217-246. Work needed: Update the brief.
- **Mobile has no back-link from the list.** Affects: Mobile users. Evidence: MessageContentRenderer.tsx:876-925. Work needed: Add a link or accept the alert.
- **No test found proving the mobile alert text (the test at MarkdownInline.render.test.tsx:545 covers the onFootnotePress path, not the alert).** Affects: Mobile. Evidence: Mobile tests matched 'footnote'; MarkdownInline.render.test.tsx:545. Work needed: Read or add a test.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx

## Unknown

- Whether VS Code and CLI really print raw markers (no run allowed).
- Exact HTML of the web footnotes section heading (library default assumed).
- Mobile footnote test case contents other than the onFootnotePress case at line 545.
- Whether the web footnote heading is visually hidden.

## Second reader's check

A second reader checked 10 statements of this page against the code: 9 correct, 1 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/2):** "Mobile: footnote nodes parse, number and open an alert; tap opens an alert titled 'Footnote <n>' (MarkdownInline.tsx:157-159, 410-430)" The code shows: showFootnote calls Alert.alert(`Footnote ${n}`, inlinePlainText(note)) (:157-159). That is only the fallback. If context.options.onFootnotePress is supplied, it is called with the label instead (:413, :424). The test MarkdownInline.render.test.tsx:545 exercises that path with a jump callback. (MarkdownInline.tsx:49,413,424). **Corrected:** Tapping a footnote marker on mobile opens an alert titled 'Footnote <n>' unless the caller passes onFootnotePress, in which case that handler runs and no alert shows.

**Facts the page missed**

- Mobile footnote taps can be overridden by an onFootnotePress option (MarkdownInline.tsx:49,413,424), and a test covers it (MarkdownInline.render.test.tsx:545). The page says the tap always opens an alert.
- The page's front matter (implementation mobile/chrome: missing, available_on web+desktop) and its Status table (Mobile and Chrome 'not built') contradict its own body and gaps section, which say mobile and Chrome are built (MarkdownInline.tsx:410-430; markdown.ts:217-246). Section 10's 'Not built on: Mobile, ... Chrome' line repeats the stale claim.
- Web footnote parsing is not a footnote-specific plugin: REMARK_PLUGINS (remarkPlugins.ts:71-77) holds remarkGfm, remarkMath, remarkBreaks, remarkLosslessTables and remarkAssistantFenceIdentity. Footnote ids use a clobberPrefix built from footnoteScope (MarkdownContent.tsx:891-894), and unscoped callers get an empty prefix, so uniqueness depends on the caller.
