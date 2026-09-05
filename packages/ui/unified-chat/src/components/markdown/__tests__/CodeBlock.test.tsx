import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, type ReactElement } from 'react';

vi.mock('../HighlightedCode', () => ({
  HighlightedCode: ({ code }: { code: string }) => code,
}));

vi.mock('../MermaidDiagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => source,
}));

const { CodeBlock } = await import('../MarkdownContent');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  readonly container: HTMLDivElement;
  readonly unmount: () => void;
}

function mountClient(node: ReactElement): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const PYTHON_SOURCE = 'print("hello")\n';
const PYTHON_LANGUAGE_CLASS = 'language-python';

function findCopyButton(container: HTMLDivElement): HTMLButtonElement {
  const button = container.querySelector('button');
  if (!button) throw new Error('copy button not found');
  return button;
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('CodeBlock header', () => {
  it('renders a header bar holding the language label and the copy control', () => {
    const view = mountClient(
      <CodeBlock className={PYTHON_LANGUAGE_CLASS}>{PYTHON_SOURCE}</CodeBlock>,
    );

    const header = view.container.querySelector('.code-block-header-bar');
    expect(header).not.toBeNull();
    expect(header?.querySelector('.code-block-lang-label')).not.toBeNull();
    expect(header?.querySelector('button')).not.toBeNull();

    view.unmount();
  });

  it('shows the fence language as the label text, lowercased by the header stylesheet', () => {
    const view = mountClient(
      <CodeBlock className={PYTHON_LANGUAGE_CLASS}>{PYTHON_SOURCE}</CodeBlock>,
    );

    const label = view.container.querySelector('.code-block-lang-label');
    expect(label?.textContent).toBe('python');
    expect(label?.classList.contains('code-block-lang-label')).toBe(true);

    view.unmount();
  });
});

describe('CodeBlock copy control', () => {
  it('starts as a labeled 32px-tall control', () => {
    const view = mountClient(
      <CodeBlock className={PYTHON_LANGUAGE_CLASS}>{PYTHON_SOURCE}</CodeBlock>,
    );

    const button = findCopyButton(view.container);
    expect(button.textContent).toBe('Copy');
    expect(button.getAttribute('aria-label')).toBe('Copy code');
    expect(button.className.split(/\s+/)).toContain('h-8');

    view.unmount();
  });

  it('writes the fenced source to the clipboard and reports success', async () => {
    const view = mountClient(
      <CodeBlock className={PYTHON_LANGUAGE_CLASS}>{PYTHON_SOURCE}</CodeBlock>,
    );

    const button = findCopyButton(view.container);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('print("hello")');
    expect(button.textContent).toBe('Copied');
    expect(button.getAttribute('aria-label')).toBe('Code copied');

    view.unmount();
  });

  it('reports failure when the clipboard write rejects', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));

    const view = mountClient(
      <CodeBlock className={PYTHON_LANGUAGE_CLASS}>{PYTHON_SOURCE}</CodeBlock>,
    );

    const button = findCopyButton(view.container);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(button.textContent).toBe('Copy failed');
    expect(button.getAttribute('aria-label')).toBe('Copying code failed');

    view.unmount();
  });
});

describe('CodeBlock non-fenced and mermaid branches', () => {
  it('renders inline code without a header when the fence has no language', () => {
    const view = mountClient(<CodeBlock>{'x = 1'}</CodeBlock>);

    expect(view.container.querySelector('.code-block-header-bar')).toBeNull();
    expect(view.container.querySelector('code')?.textContent).toBe('x = 1');

    view.unmount();
  });

  it('delegates a mermaid fence to MermaidDiagram instead of the header/body layout', () => {
    const source = 'graph TD; A-->B;';
    const view = mountClient(<CodeBlock className="language-mermaid">{source}</CodeBlock>);

    expect(view.container.querySelector('.code-block-header-bar')).toBeNull();
    expect(view.container.textContent).toBe(source);

    view.unmount();
  });
});
