/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import '../webview/render';
import { enhance } from '../webview/enhance';

const mermaidRender = vi.hoisted(() => vi.fn());
const mermaidInitialize = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: { initialize: mermaidInitialize, render: mermaidRender },
}));

function mount(markdown: string): HTMLElement {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  const root = document.createElement('div');
  root.className = 'message assistant';
  root.innerHTML = html ?? '';
  document.body.replaceChildren(root);
  return root;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await settle();
  }
}

function webviewStyles(): string {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/, 'https://mock'),
      }),
    } as unknown as Parameters<typeof getWebviewContent>[0],
    {
      toString: () => 'file:///mock/extension',
      fsPath: '/mock/extension',
    } as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
  return (
    new DOMParser().parseFromString(html, 'text/html').querySelector('style')?.textContent ?? ''
  );
}

describe('rich markdown in the sidebar', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:vscode-webview://mock/diagram'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    mermaidRender.mockReset();
  });

  it('typesets display and inline math instead of showing the dollar fences', () => {
    const root = mount(
      'Euler: $$e^{i\\pi} + 1 = 0$$ and inline $a^2 + b^2$ too.\n\n$$\n\\int_0^1 x\\,dx\n$$',
    );
    enhance(root);

    expect(root.querySelectorAll('.katex').length).toBe(3);
    expect(root.querySelectorAll('.katex-display').length).toBe(2);
    expect(root.textContent).not.toContain('$$');
  });

  it('highlights a labelled code block without changing its text', async () => {
    const source = 'const total = items.reduce((sum, item) => sum + item.price, 0);';
    const root = mount(['```ts', source, '```'].join('\n'));
    enhance(root);

    await waitFor(() => root.querySelector('.shiki-token') !== null);
    expect(root.querySelector('pre code')?.textContent).toBe(`${source}\n`);
    const token = root.querySelector<HTMLElement>('.shiki-token');
    expect(token?.style.getPropertyValue('--shiki-light')).not.toBe('');
    expect(token?.style.getPropertyValue('--shiki-dark')).not.toBe('');
  });

  it('draws a finished mermaid block as a diagram and keeps its source one click away', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" id="d" viewBox="0 0 120 40" width="100%"><text>A</text></svg>',
    });
    const root = mount(['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n'));
    enhance(root);

    await waitFor(() => root.querySelector('.mermaid-diagram img') !== null);
    const image = root.querySelector<HTMLImageElement>('.mermaid-diagram img');
    const block = root.querySelector<HTMLElement>('.code-block-wrapper--mermaid');
    expect(image?.getAttribute('src')).toBe('blob:vscode-webview://mock/diagram');
    expect(block?.hidden).toBe(true);
    expect(mermaidRender).toHaveBeenCalledWith(
      expect.stringMatching(/^agi-mermaid-/u),
      'flowchart TD\n  A --> B\n',
      expect.any(HTMLElement),
    );

    root.querySelector<HTMLButtonElement>('.mermaid-diagram__toggle')?.click();
    expect(block?.hidden).toBe(false);
  });

  it('leaves a mermaid block that is still streaming as source', async () => {
    const root = mount(['```mermaid', 'flowchart TD', '  A --> '].join('\n'));
    enhance(root);
    await settle();

    expect(mermaidRender).not.toHaveBeenCalled();
    expect(root.querySelector('.mermaid-diagram')).toBeNull();
  });

  it('renders answer prose without the pre-wrap gaps and wraps table cells between words', () => {
    const styles = webviewStyles();
    const assistantRule = /\.message\.assistant \{([^}]*)\}/u.exec(styles)?.[1] ?? '';
    const cellRule = /\.message th, \.message td \{([^}]*)\}/u.exec(styles)?.[1] ?? '';
    const tableRule = /\.message table \{([^}]*)\}/u.exec(styles)?.[1] ?? '';

    expect(assistantRule).toMatch(/white-space: normal;/u);
    expect(assistantRule).toMatch(/word-break: normal;/u);
    expect(cellRule).toMatch(/word-break: normal;/u);
    expect(cellRule).toMatch(/overflow-wrap: normal;/u);
    expect(tableRule).toMatch(/overflow-x: auto;/u);
  });
});
