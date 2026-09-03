import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, type ReactElement } from 'react';

const hoisted = vi.hoisted(() => ({
  readHighlightCache: vi.fn<(code: string, language: string) => unknown>(),
  highlightToLines: vi.fn<(code: string, language: string) => Promise<unknown>>(),
}));

vi.mock('../shikiHighlighter', () => ({
  readHighlightCache: (code: string, language: string) =>
    hoisted.readHighlightCache(code, language),
  highlightToLines: (code: string, language: string) => hoisted.highlightToLines(code, language),
}));

const { HighlightedCode } = await import('../HighlightedCode');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = 'const answer = 41 + 1;';
const LANGUAGE = 'ts';
const CLASS_NAME = 'language-ts';
const TOKEN_STYLE = { color: 'rgb(225, 228, 232)', '--shiki-light': '#24292e' };
const TOKENS = [
  [
    { content: 'const', style: TOKEN_STYLE },
    { content: ' answer = 41 + 1;', style: TOKEN_STYLE },
  ],
];

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

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  hoisted.readHighlightCache.mockReset();
  hoisted.readHighlightCache.mockReturnValue(null);
  hoisted.highlightToLines.mockReset();
  hoisted.highlightToLines.mockResolvedValue(null);
});

describe('HighlightedCode, the disabled path never reaches the highlighter', () => {
  it('renders plain text and calls nothing when highlighting is disabled', async () => {
    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled={false} className={CLASS_NAME} />,
    );
    await settle();

    expect(hoisted.highlightToLines).not.toHaveBeenCalled();
    expect(hoisted.readHighlightCache).not.toHaveBeenCalled();

    const element = view.container.querySelector('code');
    expect(element?.textContent).toBe(CODE);
    expect(element?.querySelector('span')).toBeNull();
    expect(element?.className).toBe(CLASS_NAME);

    view.unmount();
  });

  it('drops back to plain text when a highlighted block starts streaming again', async () => {
    hoisted.highlightToLines.mockResolvedValue(TOKENS);

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();
    expect(view.container.querySelectorAll('code span')).toHaveLength(TOKENS[0]!.length);

    view.rerender(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled={false} className={CLASS_NAME} />,
    );
    await settle();

    expect(view.container.querySelectorAll('code span')).toHaveLength(0);
    expect(view.container.querySelector('code')?.textContent).toBe(CODE);

    view.unmount();
  });
});

describe('HighlightedCode, enhancing after first paint', () => {
  it('paints the unhighlighted code before the highlighter resolves', () => {
    hoisted.highlightToLines.mockReturnValue(new Promise(() => undefined));

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );

    expect(view.container.querySelector('code')?.textContent).toBe(CODE);
    expect(view.container.querySelector('code span')).toBeNull();

    view.unmount();
  });

  it('replaces the plain text with token spans once the highlighter resolves', async () => {
    hoisted.highlightToLines.mockResolvedValue(TOKENS);

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();

    const spans = view.container.querySelectorAll<HTMLElement>('code span');
    expect(spans).toHaveLength(TOKENS[0]!.length);
    expect(view.container.querySelector('code')?.textContent).toBe(CODE);

    const style = spans[0]!.style;
    expect(style.color).toBe(TOKEN_STYLE.color);
    expect(style.getPropertyValue('--shiki-light')).toBe(TOKEN_STYLE['--shiki-light']);

    view.unmount();
  });

  it('keeps the plain text when the language has no grammar', async () => {
    hoisted.highlightToLines.mockResolvedValue(null);

    const view = mountClient(
      <HighlightedCode code={CODE} language="not-a-language" enabled className={CLASS_NAME} />,
    );
    await settle();

    expect(view.container.querySelector('code')?.textContent).toBe(CODE);
    expect(view.container.querySelector('code span')).toBeNull();

    view.unmount();
  });

  it('keeps the plain text when the highlighter rejects', async () => {
    hoisted.highlightToLines.mockRejectedValue(new Error('grammar chunk failed to load'));

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();

    expect(view.container.querySelector('code')?.textContent).toBe(CODE);
    expect(view.container.querySelector('code span')).toBeNull();

    view.unmount();
  });
});

describe('HighlightedCode, one tokenise per distinct block', () => {
  it('does not tokenise again when re-rendered with the same code', async () => {
    hoisted.highlightToLines.mockResolvedValue(TOKENS);

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();

    view.rerender(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();

    expect(hoisted.highlightToLines).toHaveBeenCalledExactlyOnceWith(CODE, LANGUAGE);

    view.unmount();
  });

  it('takes a cache hit without calling the highlighter at all', async () => {
    hoisted.readHighlightCache.mockReturnValue(TOKENS);

    const view = mountClient(
      <HighlightedCode code={CODE} language={LANGUAGE} enabled className={CLASS_NAME} />,
    );
    await settle();

    expect(hoisted.highlightToLines).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('code span')).toHaveLength(TOKENS[0]!.length);

    view.unmount();
  });
});
