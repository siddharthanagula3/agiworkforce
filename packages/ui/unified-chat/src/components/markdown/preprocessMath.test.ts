import { describe, it, expect } from 'vitest';
import { preprocessMath } from './preprocessMath';

describe('preprocessMath', () => {
  // ── Inline math \( ... \) ────────────────────────────────────────────────

  it('converts \\( ... \\) to $ ... $', () => {
    expect(preprocessMath('The value is \\(x^2\\) here.')).toBe('The value is $x^2$ here.');
  });

  it('converts multiple inline spans in one string', () => {
    const result = preprocessMath('\\(a\\) and \\(b\\)');
    expect(result).toBe('$a$ and $b$');
  });

  // ── Display math \[ ... \] ───────────────────────────────────────────────

  it('converts \\[ ... \\] to $$-block wrapped in blank lines', () => {
    const result = preprocessMath('\\[a^2+b^2=c^2\\]');
    expect(result).toBe('\n\n$$\na^2+b^2=c^2\n$$\n\n');
  });

  it('preserves multiline display math content', () => {
    const result = preprocessMath('\\[\n  x = \\frac{-b}{2a}\n\\]');
    expect(result).toContain('$$');
    expect(result).toContain('x = \\frac{-b}{2a}');
    // must not contain literal \[ or \] in the output
    expect(result).not.toContain('\\[');
    expect(result).not.toContain('\\]');
  });

  it('wraps display math in blank lines to prevent div-in-p hydration error', () => {
    // When display math appears mid-sentence, the blank-line wrap ensures
    // remark-math sees it as a block node, not inline inside a <p>.
    const result = preprocessMath('Before \\[E=mc^2\\] after.');
    // blank lines separate the $$ block from surrounding text
    expect(result).toMatch(/\n\n\$\$/);
    expect(result).toMatch(/\$\$\n\n/);
  });

  // ── Code protection ──────────────────────────────────────────────────────

  it('does not convert \\( inside an inline code span', () => {
    const input = 'Use `re.compile("\\(")` in Python.';
    expect(preprocessMath(input)).toBe(input);
  });

  it('does not convert \\[ inside a fenced code block', () => {
    const input = '```\n\\[x\\]\n```';
    expect(preprocessMath(input)).toBe(input);
  });

  it('does not convert \\[ inside a fenced code block with language tag', () => {
    const input = '```latex\n\\[E=mc^2\\]\n```';
    expect(preprocessMath(input)).toBe(input);
  });

  it('converts math outside code blocks but leaves code blocks alone', () => {
    const input = '\\(a\\) and ```\n\\(b\\)\n``` and \\(c\\)';
    const result = preprocessMath(input);
    expect(result).toContain('$a$');
    expect(result).toContain('$c$');
    // the fenced block content is unchanged
    expect(result).toContain('```\n\\(b\\)\n```');
    // \(b\) inside the fence must NOT have been converted
    expect(result).not.toContain('$b$');
  });

  // ── No false positives ───────────────────────────────────────────────────

  it('leaves plain text with no math delimiters unchanged', () => {
    const input = 'Hello world. No math here.';
    expect(preprocessMath(input)).toBe(input);
  });

  it('leaves $...$ dollar-sign math unchanged (already remark-math syntax)', () => {
    const input = 'The formula $x^2$ is already correct.';
    expect(preprocessMath(input)).toBe(input);
  });

  it('leaves standalone backslash-bracket text that is not a delimiter pair unchanged', () => {
    // A single \[ with no closing \] should not be transformed
    const input = 'Unmatched \\[ bracket only.';
    expect(preprocessMath(input)).toBe(input);
  });
});

describe('preprocessMath — scanner parity with the expression it replaced', () => {
  /**
   * The exact regex implementation that shipped before, kept here as the
   * oracle. Parity is checked against what ran in production, not against a
   * description of what it was supposed to do.
   */
  const LEGACY_RE = /(```[\s\S]*?```|`[^`\n]*`)|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  function legacy(content: string): string {
    return content.replace(
      LEGACY_RE,
      (
        match,
        code: string | undefined,
        display: string | undefined,
        inline: string | undefined,
      ) => {
        if (code != null) return code;
        if (display != null) return '\n\n$$\n' + display + '\n$$\n\n';
        if (inline != null) return '$' + inline + '$';
        return match;
      },
    );
  }

  it.each([
    ['empty display math is not math', '\\[\\]'],
    ['minimum-one-char lazy match', '\\[\\]x\\]'],
    ['unterminated fence falls through to a code span', '```'],
    ['fence with an immediate closer', '``````'],
    ['code span protects a bracket', '`\\[not math\\]`'],
    ['fence protects a bracket', '```\n\\[not math\\]\n```'],
    ['display then inline', '\\[a\\] and \\(b\\)'],
    ['backtick then newline is not a span', '`\nx`'],
    ['unterminated display math', '\\[unclosed'],
    ['unterminated inline math', '\\(unclosed'],
    ['bare backslash', 'a \\ b'],
    ['nothing to do', 'plain text'],
  ])('matches the legacy output: %s', (_label, input) => {
    expect(preprocessMath(input)).toBe(legacy(input));
  });

  it('matches the legacy output across generated delimiter soup', () => {
    // The same differential fuzz that validated the rewrite, shrunk to a size
    // that belongs in a unit suite and seeded so a failure reproduces exactly.
    const atoms = ['`', '```', '\\[', '\\]', '\\(', '\\)', 'a', ' ', '\n', 'x^2', '$', '\\'];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let n = 0; n < 20_000; n += 1) {
      const len = 1 + Math.floor(rnd() * 9);
      let input = '';
      for (let k = 0; k < len; k += 1) input += atoms[Math.floor(rnd() * atoms.length)];
      expect(preprocessMath(input), `input: ${JSON.stringify(input)}`).toBe(legacy(input));
    }
  });

  it('stays linear on the unterminated fence a streaming message produces', () => {
    // This is the ordinary case, not an attack: every render before the
    // closing fence arrives looks exactly like this.
    const streaming = '```' + 'a'.repeat(200_000);
    expect(preprocessMath(streaming)).toBe(streaming);
  });

  it('stays linear on unterminated math delimiters', () => {
    const display = '\\[' + 'a'.repeat(200_000);
    const inline = '\\(' + 'a'.repeat(200_000);
    expect(preprocessMath(display)).toBe(display);
    expect(preprocessMath(inline)).toBe(inline);
  });
});
