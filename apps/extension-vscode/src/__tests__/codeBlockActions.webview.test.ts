/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import '../webview/render';
import { vscodeApiStub } from './vscodeApiStub';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderWebview(): string {
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
}

function parseRenderedMarkdown(markdown: string): Document {
  const html = window.agiRender?.(markdown);
  expect(html).toBeTypeOf('string');
  return new DOMParser().parseFromString(html ?? '', 'text/html');
}

function executeWebviewScript(postMessage: ReturnType<typeof vi.fn>): void {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
}

describe('rendered Markdown code-block actions', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it.each([
    ['fenced', ['```typescript', 'const answer = 42;', '```'].join('\n')],
    ['indented', '    const answer = 42;\n'],
  ])('adds keyboard-accessible Copy and Apply buttons to %s code blocks', (_kind, markdown) => {
    const doc = parseRenderedMarkdown(markdown);
    const wrapper = doc.querySelector('.code-block-wrapper');
    const copyButton = wrapper?.querySelector<HTMLButtonElement>('.copy-btn');
    const applyButton = wrapper?.querySelector<HTMLButtonElement>('.apply-btn');

    expect(wrapper?.querySelector('pre code')?.textContent).toBe('const answer = 42;\n');
    expect(copyButton?.tagName).toBe('BUTTON');
    expect(copyButton?.type).toBe('button');
    expect(copyButton?.tabIndex).toBe(0);
    expect(copyButton?.getAttribute('aria-label')).toBe('Copy code');
    expect(applyButton?.tagName).toBe('BUTTON');
    expect(applyButton?.type).toBe('button');
    expect(applyButton?.tabIndex).toBe(0);
    expect(applyButton?.getAttribute('aria-label')).toBe('Apply code changes');
  });

  it('keeps action markup sanitizable without inline handlers or data attributes', () => {
    const doc = parseRenderedMarkdown(
      ['```typescript', '<img src=x onerror="window.compromised = true">', '```'].join('\n'),
    );
    const wrapper = doc.querySelector('.code-block-wrapper');

    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelectorAll('[onclick], [onerror], [data-bound]').length).toBe(0);
    expect(wrapper?.innerHTML).not.toContain('<img');
  });

  it('copies code and posts an Apply proposal using the rendered code language', async () => {
    const postMessage = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    executeWebviewScript(postMessage);

    const markdown = ['```typescript', 'const answer = 42;', '```'].join('\n');
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'token', payload: { text: markdown } },
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'done', payload: {} },
      }),
    );

    const wrapper = document.querySelector('.code-block-wrapper');
    const copyButton = wrapper?.querySelector<HTMLButtonElement>('.copy-btn');
    const applyButton = wrapper?.querySelector<HTMLButtonElement>('.apply-btn');
    expect(wrapper?.querySelectorAll('[data-bound]').length).toBe(0);

    copyButton?.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('const answer = 42;\n');
    });

    applyButton?.click();
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'proposeDiff',
      payload: {
        code: 'const answer = 42;\n',
        language: 'typescript',
      },
    });
    expect(applyButton?.disabled).toBe(true);
    expect(applyButton?.textContent).toBe('Opening…');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'diffProposed',
          payload: { sessionId: 'diff-1', filePath: 'src/app.ts' },
        },
      }),
    );
    expect(applyButton?.disabled).toBe(false);
    expect(applyButton?.textContent).toBe('Review opened');

    applyButton?.click();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'diffProposalFailed',
          payload: { message: 'Open a file before applying this suggestion.' },
        },
      }),
    );
    expect(applyButton?.disabled).toBe(false);
    expect(applyButton?.textContent).toBe('Failed');
    expect(applyButton?.title).toBe('Open a file before applying this suggestion.');
  });

  it('explains a code block without touching the typed draft or the staged files', () => {
    const postMessage = vi.fn();
    executeWebviewScript(postMessage);
    const markdown = ['```typescript', 'const answer = 42;', '```'].join('\n');
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'token', payload: { text: markdown } } }),
    );
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'done', payload: {} } }));
    const composer = document.getElementById('userInput') as HTMLTextAreaElement;
    composer.value = 'my half-typed question';

    document.querySelector<HTMLButtonElement>('.code-block-wrapper .explain-btn')?.click();

    expect(composer.value).toBe('my half-typed question');
    const sent = postMessage.mock.calls
      .map(([message]) => message as { type: string; payload?: Record<string, unknown> })
      .find((message) => message.type === 'sendMessage');
    expect(sent?.payload).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Explain this code:'),
        standalone: true,
        browseWeb: false,
      }),
    );
    expect(sent?.payload?.text).not.toContain('my half-typed question');
  });

  it('keeps Review changes only on the latest reply, the one whose changes it can show', () => {
    executeWebviewScript(vi.fn());
    const reply = (turnId: string): void => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'turnResumed' } }));
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'token', payload: { text: 'Edited.' } } }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'done', payload: { turnId, changedFiles: 1 } },
        }),
      );
    };

    reply('turn-1');
    reply('turn-2');

    const reviews = document.querySelectorAll('.turn-changes__review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.closest('.turn-changes')?.getAttribute('data-turn-id')).toBe('turn-2');
    expect(document.querySelectorAll('.turn-changes')).toHaveLength(2);
  });
});
