/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  return postMessage;
}

describe('VS Code sidebar file mentions', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('keeps the selected line range when an autocomplete result is sent', () => {
    const postMessage = boot();
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = 'Review @app';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'fileSearch',
      payload: { query: 'app' },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'fileSearchResults',
          payload: {
            files: [
              {
                path: 'src/app.ts',
                label: 'src/app.ts · lines 5-7',
                range: { startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 8 },
              },
            ],
          },
        },
      }),
    );
    (document.querySelector('.mention-item') as HTMLElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    expect(input.value).toBe('Review @src/app.ts#L5-L7 ');

    (document.getElementById('sendBtn') as HTMLButtonElement).click();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'sendMessage',
      payload: {
        text: 'Review @src/app.ts#L5-L7',
        browseWeb: false,
        clientMessageId: expect.stringMatching(/^msg-/),
        references: [
          {
            path: 'src/app.ts',
            range: { startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 8 },
          },
        ],
      },
    });
  });

  it('accepts a host-prefilled fallback draft with the same structured reference', () => {
    const postMessage = boot();
    const reference = {
      path: 'src/fallback.ts',
      range: { startLine: 2, startCharacter: 0, endLine: 4, endCharacter: 5 },
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'composerDraft',
          payload: { text: '@src/fallback.ts#L3-L5 ', references: [reference] },
        },
      }),
    );

    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    expect(input.value).toBe('@src/fallback.ts#L3-L5 ');
    (document.getElementById('sendBtn') as HTMLButtonElement).click();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'sendMessage',
      payload: {
        text: '@src/fallback.ts#L3-L5',
        browseWeb: false,
        clientMessageId: expect.stringMatching(/^msg-/),
        references: [reference],
      },
    });
  });
});
