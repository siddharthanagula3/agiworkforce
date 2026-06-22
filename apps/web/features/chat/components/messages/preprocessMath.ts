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
 */

// Matches, in order of priority:
//   1. Fenced code block  ```...```  (captured in group 1)
//   2. Inline code span   `...`      (captured in group 1)
//   3. Display math       \[...\]    (content in group 2)
//   4. Inline math        \(...\)    (content in group 3)
const MATH_DELIMITER_RE = /(```[\s\S]*?```|`[^`\n]*`)|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

export function preprocessMath(content: string): string {
  return content.replace(
    MATH_DELIMITER_RE,
    (match, code: string | undefined, display: string | undefined, inline: string | undefined) => {
      // Code span/fence: return unchanged.
      if (code != null) return code;
      // Display math: wrap in blank lines so remark-math treats it as a block
      // and react-markdown does not nest the katex-display div inside <p>.
      if (display != null) return '\n\n$$\n' + display + '\n$$\n\n';
      // Inline math: straight substitution.
      if (inline != null) return '$' + inline + '$';
      return match;
    },
  );
}
