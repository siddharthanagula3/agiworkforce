---
id: "F020-06"
type: "feature"
title: "Math formulas"
aliases: ["Math formulas", "Maths", "LaTeX", "KaTeX", "Inline math", "Display math", "S20.19", "S20.20", "MathBlock"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "seen working", chrome: "not seen by a person"}
requirement_items: ["S20.19", "S20.20"]
depends_on: ["SYS-shared-ui-and-design", "SYS-security-and-privacy", "file:packages/platform/utils/src/markdownSource.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-06 Math formulas

Draws formulas written as $...$ or \( \) inline and $$...$$ or \[ \] as blocks. Web and desktop use remark-math with KaTeX; mobile draws KaTeX in a locked web view; VS Code and Chrome use a shared markdown-it math plugin. The CLI has no math support and shows the source text. Money amounts are not read as maths.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.19](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2019), [S20.20](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2020).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | built | built | seen working |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns LaTeX in an answer into typeset formulas, and keeps dollar prices as plain text.

**Why it exists.** Science, finance and maths answers are written in LaTeX. Raw TeX is unreadable (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md S20.19, S20.20).

**Who uses it.** Students, engineers and analysts reading maths answers.

**Problems it solves**

- Formulas read as maths, not code.
- Models use several delimiter styles; all are accepted.
- A price like $5 and $10 is not turned into a formula.
- A formula that cannot be drawn still shows its source.

**Use cases**

- Read a quadratic formula as a centred block.
- Read an inline variable in a sentence.
- See 'costs $5 or $10' stay as text.
- Read a formula in the VS Code sidebar.

## 2. User experience

**Where to find it**

- Web and Desktop (Tauri): inside messages (rehypeKatex at MarkdownContent.tsx:819-823).
- Mobile: formula views drawn by MathBlock inside text (MessageContentRenderer.tsx:1395-1412; MathBlock.tsx).
- VS Code: sidebar chat (render.ts:199-214).
- Chrome: side panel bubble (markdown.ts:258-312).
- CLI: not available.

**Before you start**

- A reply with LaTeX delimiters.

**Screens and controls**

- No control. Reading only. Mobile imports a speech helper for formulas (MathBlock.tsx:11); the control that uses it was not read.

**Journey**

1. Reply contains a formula.
2. The app rewrites delimiters to one form.
3. The formula is typeset; a block is on its own line.
4. While streaming, a half-written block shows a placeholder (mobile 'Equation in progress'; web hides a KaTeX error until complete).

**What the person sees and gets**

- Typeset formula; block formulas scroll sideways if wider than the column (math-layout.css:1-11).
- Source text as fallback when drawing fails.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: preprocessMath converts \( \) to $...$ and \[ \] to a $$ fenced block, escapes currency dollars, skips code ranges, and lifts one-line $$x$$ onto its own lines (preprocessMath.ts:6-22; markdownSource.ts:153-228). remark-math parses; rehypeKatex draws (remarkPlugins.ts:71-77; MarkdownContent.tsx:819-823).
- Currency rule on web: a dollar followed by a digit is escaped when its pair is missing, followed by a digit, or the span reads as prose (markdownSource.ts:24-31, 216-220).
- Streaming: a KaTeX error span is hidden on the live tail (MarkdownContent.tsx:748).
- Mobile: display math blocks are collected (MessageContentRenderer.tsx:1395-1412) and drawn by MathBlock in a web view with a locked content policy (MathBlock.tsx:22-23); renderMathMarkup uses throwOnError true so failure falls back to the source text in a tinted box (MathBlock.tsx:283-291; packages/ui/unified-chat/src/lib/math-markup.ts:26).
- VS Code: markdownItMath makes data-math nodes; renderMath turns them into sanitised MathML, and on failure writes the source back with its delimiters (render.ts:199-214; markdownItMath.ts:85-98).
- Chrome: KaTeX loads lazily; throwOnError false; if loading fails the source shows with a title spMathUnavailable (markdown.ts:258-312).
- In markdownItMath an inline dollar must not sit next to a word or digit before it or after the closing dollar, and must not have spaces inside (markdownItMath.ts:21-27); this rule applies to VS Code and Chrome only.

**Incomplete**

- Web non-streaming failure appearance is the library default error span; its look was not read.

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no math option in the parser (markdown_renderer.rs:147-150); formulas appear as raw text [inferred]. Brief status missing is correct.

## 4. Required behaviour

**Established requirements**

- Inline LaTeX ($...$ or \(...\)) renders as typeset math inside the sentence. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.19)
- Display LaTeX ($$...$$ or \[...\]) renders as a centred typeset block. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.20)
- Single-line $$...$$ is lifted onto its own lines so it renders as a block. (source: packages/ui/unified-chat/src/components/markdown/preprocessMath.ts:6-22)

**Acceptance criteria**

1. '$x^2$' inside a sentence shows a typeset square inline on web, desktop, mobile, VS Code and Chrome.
2. '$$x^2$$' on one line shows a block formula on web (test RenderingMatrix 'renders one-line block math as display math').
3. '\[ x \]' shows a block formula (test 'renders bracket-delimited block math').
4. 'costs $5 and $10' shows as text with dollars.
5. A formula inside a code fence is left as code.
6. On mobile a formula that cannot be drawn shows its source.
7. The CLI shows the raw text (known gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Display maths is centred because KaTeX's own stylesheet centres it; the repository adds max-content and scroll rules (math-layout.css:1-11) [inferred].
- If a formula cannot be drawn the source should show; established for mobile, VS Code and Chrome, not read for web.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the TeX source in the CLI inside a clearly marked line so it is at least readable.
- [proposed] Use one inline-dollar rule across apps and test it with the same fixtures.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | preprocessMath | `packages/ui/unified-chat/src/components/markdown/preprocessMath.ts` | One-line display lift on web (6-22). |
| service | normalizeMathDelimiters | `packages/platform/utils/src/markdownSource.ts` | Delimiter rewriting and currency escape (24-31, 153-228). |
| config | remark-math and rehype-katex | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Pipeline order raw, sanitise, KaTeX (819-823); KaTeX CSS imports (57-58). |
| config | math-layout.css | `packages/ui/unified-chat/src/components/markdown/math-layout.css` | Block formulas scroll within the column (1-11). |
| component | MarkdownSpan | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Hides KaTeX error spans while streaming (741-769). |
| service | markdownItMath | `packages/ui/unified-chat/src/components/markdown/markdownItMath.ts` | markdown-it inline and block math for VS Code and Chrome (14-98). |
| service | renderMathMarkup | `packages/ui/unified-chat/src/lib/math-markup.ts` | Shared KaTeX to MathML helper with throwOnError (17-30). |
| component | MathBlock | `apps/mobile/src/features/chat/components/MathBlock.tsx` | Mobile web view, size messages, source fallback (1-331). |
| service | mathKatexStyles | `apps/mobile/src/features/chat/components/mathKatexStyles.ts` | KaTeX styles for the mobile web view (imported at MathBlock.tsx:12). |
| component | Mobile math collection | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | collectDisplayMath and the in-progress placeholder (1395-1412). |
| service | VS Code renderMath | `apps/extension-vscode/src/webview/render.ts` | MathML output and source fallback (199-214). |
| service | Chrome renderMath and loadKatex | `apps/extension/src/features/side-panel/markdown.ts` | Lazy KaTeX, source fallback (258-312). |
| service | normalizeMarkdownSource | `packages/platform/utils/src/markdownSource.ts` | Used by VS Code and Chrome before markdown-it (250-252). |
| test | MathRendering tests | `packages/ui/unified-chat/src/components/markdown/__tests__/MathRendering.test.tsx` | Web math rendering with shared fixtures. |
| test | preprocessMath tests | `packages/ui/unified-chat/src/components/markdown/preprocessMath.test.ts` | Delimiter and one-line lift cases. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Text delimiters are normalised outside code. | device | markdownSource.ts:153-228 |
| KaTeX typesets the formula in the page (web) or in a local web view (mobile). | device | MarkdownContent.tsx:819-823; MathBlock.tsx:22-23, 235-239 |
| VS Code and Chrome typeset after the markdown-it pass and sanitise. | device | render.ts:199-225; markdown.ts:291-312 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Measured formula sizes | In-memory cache of up to 256 entries on mobile | No | Lost when the app closes |

**Models and providers.** No model or provider involvement. The mobile web view policy is default-src none (MathBlock.tsx:22-23), so it should make no network requests [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code; no plan limit. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Any model that writes LaTeX. |
| Provider restrictions | none found in the code. |
| Local mode | Works offline and in Local mode. A test named MathBlockOffline.test.tsx exists for mobile (name only). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming block unfinished | Mobile shows an empty box labelled 'Equation in progress'; web hides the KaTeX error span. | MessageContentRenderer.tsx:1395-1410; MarkdownContent.tsx:748 |
| Invalid formula | Mobile, VS Code and Chrome show the source; web non-streaming not read. | MathBlock.tsx:283-291; render.ts:209-212; markdown.ts:305-310 |
| Web view fails (mobile) | Warning logged and fallback shown. | MathBlock.tsx:207-209 |
| Currency text | Dollar signs escaped to plain text. | markdownSource.ts:24-31, 216-220 |
| Formula in code | Left untouched. | markdownSource.ts:64-94, 169-187 |
| Accessibility | Web test says the source expression is carried for assistive technology; mobile web view sizes are announced by message. | RenderingMatrix.test.tsx:250 |
| Offline, timeout, retry | Mobile has recovery and offline tests (MathBlockRecovery.test.tsx, MathBlockOffline.test.tsx, names only); web, VS Code, CLI: not handled in the code. | No retry code found in render.ts or MarkdownContent math path; Chrome only handles a KaTeX load failure (markdown.ts:305-310). |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/preprocessMath.test.ts`: Delimiter rewriting and one-line display lift.
- `packages/ui/unified-chat/src/components/markdown/__tests__/MathRendering.test.tsx`: Web math rendering using fixtures in __fixtures__/mathRendering.ts.
- `packages/ui/unified-chat/src/components/markdown/__tests__/RenderingMatrix.test.tsx`: Inline math inline, fenced block, one-line block, bracket block, source for assistive tech, price left alone (221-260).
- `packages/ui/unified-chat/src/lib/__tests__/math-markup.test.ts`: Shared KaTeX helper (name only).
- `apps/mobile/__tests__/MathBlockKatexHtml.test.tsx`: Mobile math (name only). Siblings: MathBlockLayout, MathBlockRecovery, MathBlockTheme, MathBlockOffline, math-block-tokens, MessageContentRenderer.math.test.
- `apps/extension-vscode/src/__tests__/sanitizer.webview.test.ts`: Inline and display math typeset, math examples inside code untouched, invalid math readable (78-99).
- `packages/platform/utils/src/__tests__/markdownSource.test.ts`: Source helpers (name only).

**Test scenarios**

- **Inline and block**
  1. Reply: 'Let $a^2+b^2=c^2$.' and a $$ block.
  2. View on web, mobile, VS Code, Chrome.
  - Expected: Inline formula in the sentence; block on its own line.
- **Currency**
  1. Reply: 'It costs $5 and later $10.'
  - Expected: Plain text with both dollar signs.
- **One-line display**
  1. Reply: '$$E=mc^2$$' alone on a line.
  - Expected: Block formula, not inline.
- **Bad formula**
  1. Reply with '$\frac{$'.
  - Expected: Source text appears on mobile, VS Code and Chrome; record web.
- **CLI**
  1. Render '$x^2$' in the CLI.
  - Expected: Raw text (documented gap).

**Where to look when it fails**

- Mobile: console warning '[MathBlock] WebView render failed'.
- Chrome: element title spMathUnavailable when KaTeX cannot load.
- Web: reportClientFailure class markdown_render exists but math failure reporting not found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **CLI has no math rendering.** Affects: CLI users. Evidence: markdown_renderer.rs:147-150. Work needed: Show readable source or a Unicode approximation.
- **The brief's 'next to a word or digit' rule is not applied on web or mobile; they use the currency check instead.** Affects: Web, Desktop, Mobile. Evidence: markdownSource.ts:24-31 versus markdownItMath.ts:21-27. Work needed: Unify rules or document the difference.
- **Web fallback for an undrawable formula is unverified.** Affects: Web, Desktop. Evidence: No failure test found in MathRendering tests (file read by name only). Work needed: Add a test for non-streaming errors.
- **Centering of display math not established in repository CSS.** Affects: All. Evidence: math-layout.css:1-11 sets width and scroll only. Work needed: Check visually.
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-shared-ui-and-design
- SYS-security-and-privacy
- file:packages/platform/utils/src/markdownSource.ts

## Unknown

- Visible look of a web KaTeX error when not streaming.
- Whether math is centred on every app.
- Content of the six mobile math test files beyond names.
- What the mobile speech feature does with a formula.
- Whether KaTeX fonts load offline on web.
