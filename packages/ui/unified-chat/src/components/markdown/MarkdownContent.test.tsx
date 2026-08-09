/**
 * Streaming re-render budget for MarkdownContent.
 *
 * A live turn writes a token into the store several times a second. On the
 * desktop chain (MessageList -> MessageBubble -> ThinkingBlock) nothing has a
 * memo boundary, so each of those writes used to re-parse the finished
 * reasoning body sitting above the answer. The memo boundary (test 1) is the
 * thing that stops that; the memoized preprocess (test 2) covers the one
 * remaining unchanged-content render, the end-of-turn caret flip. Test 4 pins
 * that neither of them swallows real new content.
 *
 * Test 3 is deliberately weaker than the other three: hoisting the plugin
 * arrays saves the per-render allocations only. react-markdown 10.1.0
 * (lib/index.js:176) calls createProcessor(options) unconditionally per render,
 * so stable array identity does not prevent a parse and must not be read as
 * part of the re-render budget.
 *
 * `react-markdown` is stubbed here so a render is countable and the plugin
 * props are inspectable. Pipeline correctness (sanitization, math, highlight)
 * is covered by markdownSanitizeSchema.test.ts and apps/web's markdownXss.
 */
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

// React's act() only suppresses "not wrapped in act" warnings when this flag
// is set; this package has no RTL dependency to set it automatically.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders `node` and returns a setter that re-renders the same root. */
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

    // The caret must actually have been re-rendered away...
    expect(hoisted.markdownRenders).toHaveLength(2);
    expect(view.container.querySelector('.animate-pulse')).toBeNull();
    // ...without rescanning the whole answer for math delimiters.
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
