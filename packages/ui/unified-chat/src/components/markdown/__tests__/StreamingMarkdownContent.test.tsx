import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, type ReactElement } from 'react';

const hoisted = vi.hoisted(() => ({
  mermaidRender: vi.fn<(id: string, source: string) => Promise<{ svg: string }>>(),
  highlightToLines: vi.fn<(code: string, language: string) => Promise<null>>(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: () => undefined,
    render: (id: string, source: string) => hoisted.mermaidRender(id, source),
  },
}));

// Shiki resolves after paint, so a real highlighter would rewrite the DOM at a
// moment no assertion here can pin down. Every call is recorded instead, which
// is also what the streaming budget below is asserted against.
vi.mock('../shikiHighlighter', () => ({
  readHighlightCache: () => null,
  highlightToLines: (code: string, language: string) => hoisted.highlightToLines(code, language),
}));

const { MarkdownContent } = await import('../MarkdownContent');
const { StreamingMarkdownContent } = await import('../StreamingMarkdownContent');
const { clearMermaidSvgCache } = await import('../MermaidDiagram');
const { MARKDOWN_STREAM_CORPUS, RENDER_STREAM_RUNS, lines, streamChunks } =
  await import('../__fixtures__/markdownStreamCorpus');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MERMAID_PARTIAL = lines('Diagram:', '', '```mermaid', 'graph TD', '  A[Sta');
const MERMAID_COMPLETE = lines(
  'Diagram:',
  '',
  '```mermaid',
  'graph TD',
  '  A[Start] --> B[End]',
  '```',
  '',
  'Explanation follows.',
);
const MERMAID_TRAILING_PROSE = lines('', 'A first follow-up paragraph.', '', 'A second one.');
const MERMAID_SVG = '<svg><g><text>Start</text></g></svg>';
const NEVER_SETTLES = () => new Promise<{ svg: string }>(() => undefined);
const NEVER_HIGHLIGHTS = () => new Promise<null>(() => undefined);
const ASYNC_SETTLE_MS = 20;

const BRACKET_OPENERS = /[[({]/g;
const BRACKET_CLOSERS = /[\])}]/g;

function bracketsBalance(source: string): boolean {
  return (
    (source.match(BRACKET_OPENERS) ?? []).length === (source.match(BRACKET_CLOSERS) ?? []).length
  );
}

function compileLikeMermaid(_id: string, source: string): Promise<{ svg: string }> {
  return bracketsBalance(source)
    ? Promise.resolve({ svg: MERMAID_SVG })
    : Promise.reject(new Error('Parse error on line 2'));
}

interface Mounted {
  readonly container: HTMLDivElement;
  readonly rerender: (next: ReactElement) => void;
  readonly unmount: () => void;
}

function mountClient(node: ReactElement): Mounted {
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

function streamThrough(source: string, chunks: readonly string[]): Mounted {
  const view = mountClient(<StreamingMarkdownContent content="" isStreaming />);
  let content = '';
  for (const chunk of chunks) {
    content += chunk;
    view.rerender(<StreamingMarkdownContent content={content} isStreaming />);
  }
  expect(content).toBe(source);
  return view;
}

// A KaTeX span that failed to parse mid-stream carries an inline colour, and
// React clears it in place once the expression closes - leaving style="" on an
// element a first render would never have given one. It is the only residue of
// updating a live subtree, it is invisible, and the finished message is
// re-rendered by the canonical path anyway.
const IN_PLACE_UPDATE_RESIDUE = / style=""/g;

function markup(container: HTMLElement): string {
  return container.innerHTML.replace(IN_PLACE_UPDATE_RESIDUE, '');
}

function renderedOnce(source: string): string {
  const view = mountClient(<MarkdownContent content={source} isStreaming />);
  const html = markup(view.container);
  view.unmount();
  return html;
}

beforeEach(() => {
  hoisted.mermaidRender.mockReset();
  hoisted.mermaidRender.mockImplementation(NEVER_SETTLES);
  hoisted.highlightToLines.mockReset();
  hoisted.highlightToLines.mockImplementation(NEVER_HIGHLIGHTS);
  clearMermaidSvgCache();
});

describe('StreamingMarkdownContent — streamed markup equals one full parse', () => {
  it.each(MARKDOWN_STREAM_CORPUS)('$name', ({ name, source }) => {
    const canonical = renderedOnce(source);

    for (const run of RENDER_STREAM_RUNS) {
      const view = streamThrough(source, streamChunks(source, run));
      expect(markup(view.container), `doc=${name} seed=${run.seed}`).toBe(canonical);
      view.unmount();
    }
  });
});

describe('StreamingMarkdownContent — document-scoped definitions', () => {
  const REFERENCE_DOC = lines(
    'Claim with a [reference link][spec].',
    '',
    'Body paragraph before the definition.',
    '',
    'Another body paragraph.',
    '',
    '[spec]: https://example.com/spec',
    '',
    'Trailing paragraph.',
  );

  it('resolves a reference link whose definition arrives after the block would have settled', () => {
    const view = streamThrough(REFERENCE_DOC, streamChunks(REFERENCE_DOC, RENDER_STREAM_RUNS[0]!));

    const link = view.container.querySelector('a[href="https://example.com/spec"]');
    expect(link?.textContent).toBe('reference link');
    expect(view.container.textContent).not.toContain('[reference link][spec]');

    view.unmount();
  });

  it('resolves a footnote reference against a definition that streams later', () => {
    const source = lines(
      'Claim with a footnote[^note].',
      '',
      'Body paragraph.',
      '',
      'Another body paragraph.',
      '',
      '[^note]: The footnote body.',
      '',
      'Trailing paragraph.',
    );
    const view = streamThrough(source, streamChunks(source, RENDER_STREAM_RUNS[0]!));

    expect(view.container.querySelector('section.footnotes')).not.toBeNull();
    expect(view.container.textContent).not.toContain('[^note]');

    view.unmount();
  });

  it('returns to incremental splitting when the definition is no longer in the content', () => {
    const view = streamThrough(REFERENCE_DOC, streamChunks(REFERENCE_DOC, RENDER_STREAM_RUNS[0]!));

    const withoutDefinition = lines('Alpha.', '', 'Beta.', '', 'Gamma.', '', 'Delta.');
    view.rerender(<StreamingMarkdownContent content={withoutDefinition} isStreaming />);
    expect(markup(view.container)).toBe(renderedOnce(withoutDefinition));

    view.unmount();
  });
});

describe('StreamingMarkdownContent — mermaid never flashes its failure state', () => {
  function assertNoFailure(container: HTMLElement, label: string) {
    expect(container.querySelector('[data-mermaid="failed"]'), label).toBeNull();
    expect(container.textContent, label).not.toContain('could not be drawn');
  }

  it('holds a mid-bracket diagram at pending instead of compiling it', async () => {
    const view = mountClient(<StreamingMarkdownContent content={MERMAID_PARTIAL} isStreaming />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.mermaidRender).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-mermaid="pending"]')).not.toBeNull();
    expect(view.container.querySelector('.mermaid-source')?.textContent).toContain('A[Sta');

    view.unmount();
  });

  it('never reaches the failure state at any point in the stream', async () => {
    hoisted.mermaidRender.mockImplementation(compileLikeMermaid);

    const view = mountClient(<StreamingMarkdownContent content="" isStreaming />);
    let content = '';

    for (const chunk of streamChunks(MERMAID_COMPLETE, RENDER_STREAM_RUNS[0]!)) {
      content += chunk;
      view.rerender(<StreamingMarkdownContent content={content} isStreaming />);
      await act(async () => {
        await Promise.resolve();
      });
      assertNoFailure(view.container, `after ${JSON.stringify(content)}`);
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    assertNoFailure(view.container, 'at the end of the stream');
    expect(view.container.querySelector('[data-mermaid="ready"] svg')).not.toBeNull();
    for (const [, source] of hoisted.mermaidRender.mock.calls) {
      expect(bracketsBalance(source), `compiled ${JSON.stringify(source)}`).toBe(true);
    }

    view.unmount();
  });

  it('does not recompile a settled diagram as the rest of the answer streams', async () => {
    hoisted.mermaidRender.mockImplementation(compileLikeMermaid);

    const view = mountClient(<StreamingMarkdownContent content={MERMAID_COMPLETE} isStreaming />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });
    const compilesWhenSettled = hoisted.mermaidRender.mock.calls.length;
    expect(view.container.querySelector('[data-mermaid="ready"]')).not.toBeNull();

    let content = MERMAID_COMPLETE;
    for (const chunk of streamChunks(MERMAID_TRAILING_PROSE, RENDER_STREAM_RUNS[0]!)) {
      content += chunk;
      view.rerender(<StreamingMarkdownContent content={content} isStreaming />);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.mermaidRender.mock.calls.length).toBe(compilesWhenSettled);
    expect(view.container.querySelector('[data-mermaid="ready"] svg')).not.toBeNull();

    view.unmount();
  });

  it('reuses the cached drawing so a remount does not blank the diagram', async () => {
    hoisted.mermaidRender.mockResolvedValue({ svg: MERMAID_SVG });

    const first = mountClient(<MarkdownContent content={MERMAID_COMPLETE} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });
    expect(first.container.querySelector('[data-mermaid="ready"] svg')).not.toBeNull();
    first.unmount();

    const second = mountClient(<MarkdownContent content={MERMAID_COMPLETE} />);
    expect(second.container.querySelector('[data-mermaid="ready"] svg')).not.toBeNull();
    expect(hoisted.mermaidRender).toHaveBeenCalledOnce();

    second.unmount();
  });
});

describe('MarkdownContent — the streaming gate reaches the diagram', () => {
  it('does not compile a partial diagram when the caller says it is streaming', async () => {
    const view = mountClient(<MarkdownContent content={MERMAID_PARTIAL} isStreaming />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.mermaidRender).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-mermaid="pending"]')).not.toBeNull();

    view.unmount();
  });

  it('compiles the same partial diagram once the caller is no longer streaming', async () => {
    hoisted.mermaidRender.mockRejectedValue(new Error('Parse error on line 2'));

    const view = mountClient(<MarkdownContent content={MERMAID_PARTIAL} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.mermaidRender).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-mermaid="failed"]')).not.toBeNull();

    view.unmount();
  });
});

describe('MarkdownContent — the streaming gate reaches the highlighter', () => {
  const FENCE = lines('```ts', 'const answer = 41 + 1;', '```');
  const FENCE_BODY = 'const answer = 41 + 1;';

  it('does not tokenise a fence the caller says is still streaming', async () => {
    const view = mountClient(<MarkdownContent content={FENCE} isStreaming />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.highlightToLines).not.toHaveBeenCalled();
    expect(view.container.querySelector('code')?.textContent).toBe(FENCE_BODY);

    view.unmount();
  });

  it('tokenises the same fence once the caller is no longer streaming', async () => {
    const view = mountClient(<MarkdownContent content={FENCE} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_SETTLE_MS));
    });

    expect(hoisted.highlightToLines).toHaveBeenCalledExactlyOnceWith(FENCE_BODY, 'ts');

    view.unmount();
  });
});

describe('StreamingMarkdownContent — per-token cost stays off the highlighter', () => {
  const SETTLED_BODY = 'const first = 1;';
  const OPEN_BODY = 'const second = 2;';
  const TWO_FENCES = lines(
    'First:',
    '',
    '```ts',
    SETTLED_BODY,
    '```',
    '',
    'Second:',
    '',
    '```ts',
    OPEN_BODY,
  );

  it('tokenises only the fence that settled, never the one still open', () => {
    for (const run of RENDER_STREAM_RUNS) {
      hoisted.highlightToLines.mockClear();
      const view = streamThrough(TWO_FENCES, streamChunks(TWO_FENCES, run));

      const highlighted = hoisted.highlightToLines.mock.calls.map(([code]) => code);
      expect(new Set(highlighted), `seed=${run.seed}`).toEqual(new Set([SETTLED_BODY]));

      view.unmount();
    }
  });

  it('does not tokenise once per flush while a fence is still arriving', () => {
    const source = lines('```ts', SETTLED_BODY, '```', '', 'Trailing prose.', '', 'And more.');
    const view = streamThrough(source, streamChunks(source, RENDER_STREAM_RUNS[0]!));

    expect(hoisted.highlightToLines).toHaveBeenCalledExactlyOnceWith(SETTLED_BODY, 'ts');

    view.unmount();
  });
});
