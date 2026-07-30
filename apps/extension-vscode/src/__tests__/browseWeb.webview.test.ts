/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function renderWebview(): string {
  return getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/u, 'https://mock'),
      }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
}

function boot(): ReturnType<typeof vi.fn> {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
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

describe('VS Code Browse the web context', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('shows an explicit one-turn context chip and sends a validated browse flag', () => {
    const postMessage = boot();
    const browseButton = document.getElementById('plusMenuBrowse') as HTMLButtonElement;
    const contextStrip = document.getElementById('browseContextStrip') as HTMLElement;

    browseButton.click();
    expect(browseButton.getAttribute('aria-checked')).toBe('true');
    expect(contextStrip.hidden).toBe(false);
    expect(contextStrip.textContent).toContain('Browse the web for current sources');

    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = 'What changed in the latest Rust release?';
    (document.getElementById('sendBtn') as HTMLButtonElement).click();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'sendMessage',
      payload: {
        text: 'What changed in the latest Rust release?',
        browseWeb: true,
      },
    });
    expect(document.querySelector('.message.user')?.textContent).toBe(
      'What changed in the latest Rust release?',
    );
    expect(browseButton.getAttribute('aria-checked')).toBe('false');
    expect(contextStrip.hidden).toBe(true);
  });

  it('can remove browsing before sending and names the Local-mode limitation', () => {
    const postMessage = boot();
    (document.getElementById('plusMenuBrowse') as HTMLButtonElement).click();
    (document.getElementById('browseContextRemove') as HTMLButtonElement).click();

    expect((document.getElementById('browseContextStrip') as HTMLElement).hidden).toBe(true);
    expect(document.getElementById('plusMenuBrowse')?.textContent).toContain(
      'Local privacy mode refuses network',
    );
    expect(
      postMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === 'sendMessage',
      ),
    ).toBe(false);
  });
});
