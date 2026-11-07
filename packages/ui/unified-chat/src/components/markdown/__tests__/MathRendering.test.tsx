import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATH_DELIMITERS, MATH_RENDERING_CASES } from '../__fixtures__/mathRendering';
import { richBlocksAsPlainText } from '../richBlocks';

type MermaidDiagramModule = typeof import('../MermaidDiagram');
type HighlightedCodeModule = typeof import('../HighlightedCode');

vi.mock('../MermaidDiagram', async (importOriginal) => ({
  ...(await importOriginal<MermaidDiagramModule>()),
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('../HighlightedCode', async (importOriginal) => ({
  ...(await importOriginal<HighlightedCodeModule>()),
  HighlightedCode: ({ code }: { code: string }) => <>{code}</>,
}));

const { MarkdownContent } = await import('../MarkdownContent');
const { StreamingMarkdownContent } = await import('../StreamingMarkdownContent');

afterEach(cleanup);

function annotations(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
    (element) => element.textContent ?? '',
  );
}

describe.each(MATH_DELIMITERS)('math with $name delimiters', ({ open, close, display }) => {
  it.each(MATH_RENDERING_CASES)(
    'renders $name with trusted geometry and exact LaTeX',
    ({ source }) => {
      const content = `${open}${source}${close}`;
      const { container } = render(<MarkdownContent content={content} />);

      expect(container.querySelectorAll('.katex')).toHaveLength(1);
      expect(container.querySelector('.katex-error')).toBeNull();
      expect(container.querySelector('.katex-display') !== null).toBe(display);
      expect(container.querySelector('.katex-html')?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelectorAll('.katex-html [style]').length).toBeGreaterThan(0);
      expect(annotations(container)).toEqual([source]);
      expect(richBlocksAsPlainText(content)).toBe(content);
    },
  );

  it.each(MATH_RENDERING_CASES)(
    'keeps $name through stream completion and reopening',
    ({ source }) => {
      const content = `Before.\n\n${open}${source}${close}\n\nAfter.`;
      const { container, rerender, unmount } = render(
        <StreamingMarkdownContent content="" isStreaming announce={false} />,
      );

      for (let end = 1; end < content.length; end += 11) {
        rerender(
          <StreamingMarkdownContent content={content.slice(0, end)} isStreaming announce={false} />,
        );
      }
      rerender(<StreamingMarkdownContent content={content} isStreaming announce={false} />);
      expect(annotations(container)).toEqual([source]);
      expect(container.querySelector('.katex-error')).toBeNull();
      const streamedMath = container.querySelector('.katex')?.innerHTML;

      rerender(<MarkdownContent content={content} />);
      expect(container.querySelector('.katex')?.innerHTML).toBe(streamedMath);
      unmount();

      const reopened = render(<MarkdownContent content={content} />);
      expect(reopened.container.querySelector('.katex')?.innerHTML).toBe(streamedMath);
      expect(annotations(reopened.container)).toEqual([source]);
    },
  );
});

describe('math trust boundary', () => {
  it('removes untrusted markup styles while preserving generated math layout', () => {
    const { container } = render(
      <MarkdownContent
        content={String.raw`<span style="position:fixed;inset:0" onclick="alert(1)" class="katex">unsafe</span>

$\frac{1}{2}$

<script>alert(1)</script>`}
      />,
    );

    const untrusted = Array.from(container.querySelectorAll('span')).find(
      (element) => element.textContent === 'unsafe',
    );
    expect(untrusted?.hasAttribute('style')).toBe(false);
    expect(untrusted?.hasAttribute('onclick')).toBe(false);
    expect(untrusted?.classList.contains('katex')).toBe(false);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelectorAll('.katex-html [style]').length).toBeGreaterThan(0);
    expect(annotations(container)).toEqual([String.raw`\frac{1}{2}`]);
  });

  it('keeps KaTeX URL and HTML commands untrusted', () => {
    const { container } = render(
      <MarkdownContent
        content={String.raw`$\href{javascript:alert(1)}{unsafe}$ and $\htmlStyle{position:fixed}{unsafe}$`}
      />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[style*="fixed"]')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
  });
});

describe('adjacent math expressions', () => {
  it('keeps separate double-dollar formulas on the same line separate', () => {
    const { container } = render(<MarkdownContent content="$$E = mc^2$$ and $$x = 2$$" />);

    expect(container.querySelector('.katex-error')).toBeNull();
    expect(annotations(container)).toEqual(['E = mc^2', 'x = 2']);
  });
});

describe('streaming math errors', () => {
  it('holds incomplete formula errors until the tail becomes valid', () => {
    const { container, rerender } = render(
      <StreamingMarkdownContent content={'$$\n\\frac{1}{'} isStreaming announce={false} />,
    );

    expect(container.querySelector('.katex-error')).toBeNull();
    rerender(
      <StreamingMarkdownContent content={'$$\n\\frac{1}{2}\n$$'} isStreaming announce={false} />,
    );
    expect(annotations(container)).toEqual([String.raw`\frac{1}{2}`]);
  });

  it('shows invalid completed source instead of silently dropping it', () => {
    const { container } = render(<MarkdownContent content={'$$\n\\frac{1}{\n$$'} />);

    expect(container.querySelector('.katex-error')?.textContent).toContain(String.raw`\frac{1}{`);
  });
});
