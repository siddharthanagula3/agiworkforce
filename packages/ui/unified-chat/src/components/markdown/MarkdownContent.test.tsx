import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, useState, type ReactElement, type ReactNode } from 'react';

const hoisted = vi.hoisted(() => ({
  preprocessMathCalls: [] as string[],
  markdownRenders: [] as Array<{ remarkPlugins: unknown; rehypePlugins: unknown; text: unknown }>,
}));

vi.mock('./preprocessMath', () => ({
  preprocessMath: (content: string) => {
    hoisted.preprocessMathCalls.push(content);
    return content;
  },
}));

vi.mock('react-markdown', async () => {
  const { createElement } = await import('react');
  return {
    default: (props: {
      children?: ReactNode;
      remarkPlugins?: unknown;
      rehypePlugins?: unknown;
    }) => {
      hoisted.markdownRenders.push({
        remarkPlugins: props.remarkPlugins,
        rehypePlugins: props.rehypePlugins,
        text: props.children,
      });
      return createElement('div', { 'data-testid': 'markdown' }, props.children);
    },
  };
});

const { MarkdownContent } = await import('./MarkdownContent');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountClient(node: ReactElement): {
  container: HTMLDivElement;
  rerender: (next: ReactElement) => void;
  unmount: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const ANSWER = 'A finished answer above the streaming one.\n\n$x^2$';

describe('MarkdownContent streaming re-render budget', () => {
  beforeEach(() => {
    hoisted.preprocessMathCalls.length = 0;
    hoisted.markdownRenders.length = 0;
  });

  it('does not re-render when an ancestor re-renders with identical props', () => {
    let bump = () => {};

    function StreamingParent() {
      const [tokens, setTokens] = useState(0);
      bump = () => setTokens((n) => n + 1);
      return (
        <>
          <span data-testid="tokens">{tokens}</span>
          <MarkdownContent content={ANSWER} />
        </>
      );
    }

    const view = mountClient(<StreamingParent />);
    expect(hoisted.markdownRenders).toHaveLength(1);

    act(() => bump());
    act(() => bump());
    act(() => bump());

    expect(view.container.querySelector('[data-testid="tokens"]')?.textContent).toBe('3');
    expect(hoisted.markdownRenders).toHaveLength(1);

    view.unmount();
  });

  it('does not re-run preprocessMath when only the streaming caret changes', () => {
    const view = mountClient(<MarkdownContent content={ANSWER} isStreaming />);
    expect(hoisted.preprocessMathCalls).toEqual([ANSWER]);

    view.rerender(<MarkdownContent content={ANSWER} isStreaming={false} />);

    expect(hoisted.markdownRenders).toHaveLength(2);
    expect(view.container.querySelector('.animate-pulse')).toBeNull();
    expect(hoisted.preprocessMathCalls).toEqual([ANSWER]);

    view.unmount();
  });

  it('allocates the plugin arrays once, not per render (allocation only)', () => {
    const view = mountClient(<MarkdownContent content={ANSWER} isStreaming />);
    view.rerender(<MarkdownContent content={`${ANSWER} more`} isStreaming />);

    expect(hoisted.markdownRenders).toHaveLength(2);
    expect(hoisted.markdownRenders[0]!.remarkPlugins).toBe(
      hoisted.markdownRenders[1]!.remarkPlugins,
    );
    expect(hoisted.markdownRenders[0]!.rehypePlugins).toBe(
      hoisted.markdownRenders[1]!.rehypePlugins,
    );

    view.unmount();
  });

  it('still re-parses when the content grows', () => {
    const view = mountClient(<MarkdownContent content="Half an ans" isStreaming />);
    view.rerender(<MarkdownContent content="Half an answer" isStreaming />);

    expect(hoisted.preprocessMathCalls).toEqual(['Half an ans', 'Half an answer']);
    expect(view.container.querySelector('[data-testid="markdown"]')?.textContent).toBe(
      'Half an answer',
    );

    view.unmount();
  });
});
