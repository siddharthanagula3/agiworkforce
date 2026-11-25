---
id: "REQ-AREA-020"
type: "requirements"
title: "Requirement items: Markdown and text rendering"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 20. Markdown and text rendering

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S20.01

**Paragraphs.** Assistant text separated by blank lines renders as distinct paragraphs with spacing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.02

**Headings.** ATX headings (# to ######) render as styled headings, not literal hash marks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.03

**Bold, italic, and strikethrough.** **bold**, *italic* and ~~strikethrough~~ render with the matching text styles.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PARTIAL
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.04

**Ordered lists.** Numbered lists render with their numbers (respecting the start value) and list indentation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.05

**Unordered lists.** Bulleted lists render with bullet markers and indentation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.06

**Nested lists.** Indented sub-lists render nested under their parent item with deeper indentation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.07

**Task lists.** GFM task items (- [ ] / - [x]) render as checkboxes reflecting their state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: CLI PASS, Chrome PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.08

**Blockquotes.** Lines starting with > render as an indented, visually distinct quotation block.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.09

**Horizontal rules.** A thematic break (---, ***) renders as a horizontal divider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.10

**Inline code.** `inline code` renders in a monospace style distinct from prose.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.11

**Fenced code blocks.** Fenced code blocks render as a monospace block preserving whitespace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-02 Code blocks](../../20-features/020-markdown-and-text-rendering/F020-02-code-blocks.md)

## S20.12

**Links.** [text](url) renders as a link the reader can see and follow.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-03 Links, images and link safety](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.13

**Autolinks.** A bare URL in the answer (https://…, www.…) becomes a clickable link.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI unverified, VS Code done, Chrome done
- Feature: [F020-03 Links, images and link safety](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.14

**Footnotes where supported.** Footnote references ([^1]) render as superscript markers linked to a footnotes section.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F020-04 Footnotes](../../20-features/020-markdown-and-text-rendering/F020-04-footnotes.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.15

**Tables.** GFM pipe tables render as a grid with a header row and aligned cells.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F020-05 Tables and table actions](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Competitor trace: CAP-rich-content-rendering-04

## S20.16

**Wide-table scrolling.** A table wider than the answer column scrolls horizontally instead of overflowing or being cut off.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: VS Code PASS, Chrome PASS
- Feature: [F020-05 Tables and table actions](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Competitor trace: CAP-rich-content-rendering-04

## S20.17

**Copy-table action.** A rendered table offers a one-click action that copies the table (e.g. as TSV/CSV/Markdown).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F020-05 Tables and table actions](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Competitor trace: CAP-rich-content-rendering-05

## S20.18

**Download-table action.** A rendered table offers a download (CSV/XLSX) of its contents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F020-05 Tables and table actions](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md)
- Competitor trace: CAP-rich-content-rendering-05

## S20.19

**Inline mathematical notation.** Inline LaTeX ($…$ or \(…\)) renders as typeset math inside the sentence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Seen in a real run: Web PASS, VS Code PASS
- Feature: [F020-06 Math formulas](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Competitor trace: CAP-rich-content-rendering-10, CAP-rich-content-rendering-25

## S20.20

**Block mathematical notation.** Display LaTeX ($$…$$ or \[…\]) renders as a centred typeset block.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Seen in a real run: VS Code PASS
- Feature: [F020-06 Math formulas](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md)
- Competitor trace: CAP-rich-content-rendering-10, CAP-rich-content-rendering-25

## S20.21

**Escaped delimiters.** Backslash-escaped Markdown/math delimiters (\*, \$, \_) display as the literal character without the backslash.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-01 Text formatting](../../20-features/020-markdown-and-text-rendering/F020-01-text-formatting.md)
- Competitor trace: CAP-rich-content-rendering-10

## S20.22

**Partially streamed Markdown.** While a reply streams, the partial text renders as formatted Markdown progressively rather than raw syntax until completion.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-07 Live rendering while the answer streams in](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Competitor trace: CAP-rich-content-rendering-02

## S20.23

**Incomplete code-fence handling.** An unclosed ``` fence mid-stream renders as a code block (not prose) until the closing fence arrives.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-07 Live rendering while the answer streams in](../../20-features/020-markdown-and-text-rendering/F020-07-live-rendering-while-the-answer-streams-in.md)
- Competitor trace: CAP-rich-content-rendering-02

## S20.24

**Sanitized embedded markup.** Raw HTML/script embedded in model output is sanitized or shown inertly; nothing executes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-03 Links, images and link safety](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Competitor trace: CAP-rich-content-rendering-03

## S20.25

**Safe external-link handling.** External links open outside the app with safe attributes and unsafe schemes (javascript:, data:) are refused.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F020-03 Links, images and link safety](../../20-features/020-markdown-and-text-rendering/F020-03-links-images-and-link-safety.md)
- Competitor trace: CAP-rich-content-rendering-03

## S20.26

**Text selection across rendered blocks.** A reader can drag-select text continuously across paragraphs, lists and code in one answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI unverified, VS Code done, Chrome done
- Feature: [F020-08 Select, find and export](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)
- Competitor trace: CAP-rich-content-rendering-01

## S20.27

**Find-in-answer highlighting.** Searching finds text inside an answer and highlights the matching words in the rendered answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F020-08 Select, find and export](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)

## S20.28

**Print and export rendering.** Printing or exporting an answer/conversation keeps the rendered formatting (headings, lists, tables, code, math).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F020-08 Select, find and export](../../20-features/020-markdown-and-text-rendering/F020-08-select-find-and-export.md)

## S20.29

**Right-to-left content.** Right-to-left text (Arabic, Hebrew) renders right-aligned in the correct direction.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, CLI missing, VS Code missing, Chrome missing
- Feature: [F020-09 Right-to-left text and fallback blocks](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)

## S20.30

**Fallback rendering for unsupported blocks.** A block the renderer cannot draw (unknown card, failed diagram, unknown language) degrades to a readable fallback instead of vanishing or breaking the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F020-09 Right-to-left text and fallback blocks](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md)
- Competitor trace: CAP-rich-content-rendering-11, CAP-rich-content-rendering-15, CAP-rich-content-rendering-26
