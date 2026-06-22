/**
 * AUDIT-FIX regression tests (CRITICAL #31 / HIGH #30).
 *
 * MarkdownContent (live assistant render path via MessageBubble) and
 * EnhancedMarkdownRenderer previously ran rehype-raw with NO sanitizer:
 * raw HTML in model/tool output became live DOM (`<img onerror>`,
 * `<script>`, javascript: links). Both must now strip executable content
 * while keeping legitimate markdown rendering intact.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import MarkdownContent from './MarkdownContent';
import { EnhancedMarkdownRenderer } from './EnhancedMarkdownRenderer';

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

describe('EnhancedMarkdownRenderer XSS hardening', () => {
  it('strips executable HTML (base plugins)', () => {
    const { container } = render(<EnhancedMarkdownRenderer content={HOSTILE_CONTENT} />);
    expectSanitized(container.innerHTML);
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('strips executable HTML (math plugins)', () => {
    const { container } = render(<EnhancedMarkdownRenderer content={HOSTILE_CONTENT} enableMath />);
    expectSanitized(container.innerHTML);
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
