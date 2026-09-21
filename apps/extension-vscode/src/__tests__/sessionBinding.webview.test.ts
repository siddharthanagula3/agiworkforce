/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(origin: string, epoch: number): ReturnType<typeof vi.fn> {
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
    false,
    'queue',
    { origin, epoch },
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage, getState: () => undefined, setState: () => undefined }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  return postMessage;
}

function clickNewChat(): void {
  document.getElementById('newChatBtn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('what the chat webview says about itself', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('names its panel and its conversation on what it sends', () => {
    const postMessage = boot('chatPanel-2', 7);

    clickNewChat();

    for (const [message] of postMessage.mock.calls) {
      expect(message).toMatchObject({ origin: 'chatPanel-2', epoch: 7 });
    }
    expect(postMessage.mock.calls.length).toBeGreaterThan(0);
  });

  it('follows the host to the conversation that replaced the one it was showing', () => {
    const postMessage = boot('agi-workforce-sidebar', 3);

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'sessionBinding', payload: { epoch: 4 } } }),
    );
    postMessage.mockClear();
    clickNewChat();

    expect(postMessage.mock.calls.length).toBeGreaterThan(0);
    for (const [message] of postMessage.mock.calls) {
      expect(message).toMatchObject({ origin: 'agi-workforce-sidebar', epoch: 4 });
    }
  });
});
