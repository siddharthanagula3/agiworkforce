/**
 * preprocessMath
 *
 * Converts LaTeX bracket delimiters to the dollar-sign syntax that
 * remark-math (and therefore rehype-katex) understands:
 *
 *   \[ ... \]  ->  $$\n...\n$$   (display / block math)
 *   \( ... \)  ->  $ ... $        (inline math)
 *
 * Code spans (backtick) and fenced code blocks (triple-backtick) are
 * passed through unchanged so regex and shell snippets are never mangled.
 *
 * Limitations (best-effort):
 * - 4-space-indented code blocks are not protected (uncommon in chat output).
 * - Nested backticks (e.g. `` ` `` inside `` ` ``) are not handled.
 *
 * Display math is always wrapped in blank lines (\n\n...\n\n) so
 * remark-math parses it as a block node rather than inline, preventing
 * the div.katex-display-inside-<p> hydration error.
 *
 * WHY THIS IS A SCANNER AND NOT A REGEX. It used to be one expression:
 *
 *   /(```[\s\S]*?```|`[^`\n]*`)|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g
 *
 * Every lazy quantifier there scans to a closing delimiter, which is quadratic
 * when that delimiter never arrives (js/polynomial-redos). This runs on every
 * assistant message as it STREAMS, so an unterminated fence or bracket is not
 * an edge case — it is the state of the text on almost every render before the
 * closer arrives. The cost was paid continuously, not just on malicious input.
 *
 * The scanner below walks the string once, and each delimiter lookup is a
 * single indexOf. Behaviour is preserved exactly, including three details that
 * are easy to get wrong and are pinned by tests:
 *
 *  - Alternation ORDER is priority at each position: fence, then code span,
 *    then display math, then inline math.
 *  - `+?` requires at least one character, so `\[\]` is NOT display math and
 *    the search for the closer starts one position later than for `*?`.
 *    `\[\]x\]` therefore matches with content `\]x`, exactly as the lazy
 *    quantifier did.
 *  - An unterminated ``` falls through to the code-span alternative and
 *    matches the first two backticks as an empty span, which is what the
 *    regex did.
 */

/** Index of the closing backtick of `` `[^`\n]*` `` starting at `open`, or -1. */
function inlineCodeSpanEnd(content: string, open: number): number {
  for (let i = open + 1; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '`') return i;
    if (ch === '\n') return -1;
  }
  return -1;
}

export function preprocessMath(content: string): string {
  let out = '';
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === '`') {
      // 1. Fenced code block — `*?` so the closer may sit immediately after.
      if (content.startsWith('```', i)) {
        const end = content.indexOf('```', i + 3);
        if (end !== -1) {
          out += content.slice(i, end + 3);
          i = end + 3;
          continue;
        }
      }
      // 2. Inline code span.
      const spanEnd = inlineCodeSpanEnd(content, i);
      if (spanEnd !== -1) {
        out += content.slice(i, spanEnd + 1);
        i = spanEnd + 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      // 3. Display math. `+?` needs >= 1 char, so start the search at i + 3.
      if (content.startsWith('\\[', i)) {
        const end = content.indexOf('\\]', i + 3);
        if (end !== -1) {
          out += `\n\n$$\n${content.slice(i + 2, end)}\n$$\n\n`;
          i = end + 2;
          continue;
        }
      }
      // 4. Inline math, same minimum-one-character rule.
      if (content.startsWith('\\(', i)) {
        const end = content.indexOf('\\)', i + 3);
        if (end !== -1) {
          out += `$${content.slice(i + 2, end)}$`;
          i = end + 2;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}
