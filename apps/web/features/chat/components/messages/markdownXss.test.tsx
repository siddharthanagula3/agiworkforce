
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
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('keeps language classes for fenced code blocks', () => {
    const { container } = render(<MarkdownContent content={'```ts\nconst a = 1;\n```'} />);
    expect(container.innerHTML).toContain('language-ts');
  });
});

describe('MarkdownContent math rendering', () => {
  it('converts inline math to KaTeX spans, not language-math code elements', () => {
    const { container } = render(
      <MarkdownContent content="The area is $A = \\pi r^2$ for a circle." />,
    );
    const mathCode = container.querySelector('code.language-math');
    expect(mathCode).toBeNull();
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
    const mathCode = container.querySelector('code.language-math');
    expect(mathCode).toBeNull();
  });
});

describe('MarkdownContent bracket-delimiter math rendering', () => {
  it('renders \\[ a^2+b^2=c^2 \\] as KaTeX, not raw text', () => {
    const { container } = render(<MarkdownContent content={'\\[a^2+b^2=c^2\\]'} />);
    expect(container.textContent).not.toContain('\\[');
    expect(container.textContent).not.toContain('\\]');
    expect(container.innerHTML).toContain('katex');
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
    const code = container.querySelector('code');
    expect(code?.textContent).toContain('\\(');
  });
});
