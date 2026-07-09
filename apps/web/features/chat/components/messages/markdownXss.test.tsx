/**
 * AUDIT-FIX regression tests (CRITICAL #31 / HIGH #30).
 *
 * MarkdownContent (live assistant render path via MessageBubble) previously
 * ran rehype-raw with NO sanitizer: raw HTML in model/tool output became
 * live DOM (`<img onerror>`, `<script>`, javascript: links). It must strip
 * executable content while keeping legitimate markdown rendering intact.
 * (EnhancedMarkdownRenderer was removed in restructure Wave 1 — dead code.)
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownContent } from '@agiworkforce/unified-chat';

const HOSTILE_CONTENT = [
  'Hello **world**',
  '<img src="x" onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '<a href="javascript:window.__xss=1">click</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<div onclick="window.__xss=1">div</div>',
].join('\n\n');

function expectSanitized(html: string) {
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('onclick');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('javascript:');
}

describe('MarkdownContent XSS hardening', () => {
  it('strips executable HTML from assistant content', () => {
    const { container } = render(<MarkdownContent content={HOSTILE_CONTENT} />);
    expectSanitized(container.innerHTML);
    // Legitimate markdown still renders
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('keeps language classes for fenced code blocks', () => {
    const { container } = render(<MarkdownContent content={'```ts\nconst a = 1;\n```'} />);
    expect(container.innerHTML).toContain('language-ts');
  });
});

// Regression: inline math must not produce a language-math <code> block
// (div/pre inside <p>) which triggers a React hydration error.
describe('MarkdownContent math rendering', () => {
  it('converts inline math to KaTeX spans, not language-math code elements', () => {
    const { container } = render(
      <MarkdownContent content="The area is $A = \\pi r^2$ for a circle." />,
    );
    // rehype-katex renders math as <span class="katex">...</span>, NOT code.language-math
    const mathCode = container.querySelector('code.language-math');
    expect(mathCode).toBeNull();
    // KaTeX output should be present (span.katex or similar)
    expect(container.innerHTML).toContain('katex');
  });

  it('converts block math to KaTeX, not language-math code blocks', () => {
    const { container } = render(<MarkdownContent content={'$$\nE = mc^2\n$$'} />);
    const mathCode = container.querySelector('code.language-math');
    expect(mathCode).toBeNull();
    expect(container.innerHTML).toContain('katex');
  });

  it('still syntax-highlights regular fenced code blocks after math plugin addition', () => {
    const { container } = render(<MarkdownContent content={'```python\nx = 1\n```'} />);
    expect(container.innerHTML).toContain('language-python');
    // math pipeline must not interfere with code highlighting
    const mathCode = container.querySelector('code.language-math');
    expect(mathCode).toBeNull();
  });
});

// Regression: \[...\] and \(...\) bracket delimiters must render as KaTeX,
// not as raw backslash-bracket text. Models commonly emit these instead of $...$.
describe('MarkdownContent bracket-delimiter math rendering', () => {
  it('renders \\[ a^2+b^2=c^2 \\] as KaTeX, not raw text', () => {
    const { container } = render(<MarkdownContent content={'\\[a^2+b^2=c^2\\]'} />);
    // Must not contain literal backslash-bracket in the rendered output
    expect(container.textContent).not.toContain('\\[');
    expect(container.textContent).not.toContain('\\]');
    // KaTeX should have rendered it
    expect(container.innerHTML).toContain('katex');
    // No language-math code block (which would cause hydration errors)
    expect(container.querySelector('code.language-math')).toBeNull();
  });

  it('renders \\( x^2 \\) inline math as KaTeX, not raw text', () => {
    const { container } = render(<MarkdownContent content={'The answer is \\(x^2\\) here.'} />);
    expect(container.textContent).not.toContain('\\(');
    expect(container.textContent).not.toContain('\\)');
    expect(container.innerHTML).toContain('katex');
  });

  it('does not mangle \\( inside inline code when rendering', () => {
    const { container } = render(
      <MarkdownContent content={'Use `re.compile("\\(")` in Python.'} />,
    );
    // The inline code element must still contain the raw text
    const code = container.querySelector('code');
    expect(code?.textContent).toContain('\\(');
  });
});
