/**
 * editorUtilityDraft.webview.test.ts, a host-built prompt reaching the transcript.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function bootWebview() {
  const html = getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
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
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  return { postMessage };
}

function postHostMessage(type: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type, payload } }));
}

describe('editor utility draft', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('leaves a plain draft in the composer for the user to edit', () => {
    const { postMessage } = bootWebview();
    postMessage.mockClear();

    postHostMessage('composerDraft', { text: 'Explain @add.mjs', references: [] });

    expect((document.getElementById('userInput') as HTMLTextAreaElement).value).toBe(
      'Explain @add.mjs',
    );
    expect(postMessage.mock.calls.some((call) => call[0]?.type === 'sendMessage')).toBe(false);
  });

  it('sends a submitting draft as a turn and renders it as the user message', () => {
    const { postMessage } = bootWebview();
    postMessage.mockClear();

    postHostMessage('composerDraft', {
      text: 'Explain this typescript code from src/app.ts, lines 1-3.',
      references: [],
      submit: true,
    });

    const sent = postMessage.mock.calls
      .map((call) => call[0])
      .find((message) => message?.type === 'sendMessage');
    expect(sent?.payload?.text).toBe('Explain this typescript code from src/app.ts, lines 1-3.');
    expect((document.getElementById('userInput') as HTMLTextAreaElement).value).toBe('');
    expect(document.getElementById('messages')?.textContent).toContain(
      'Explain this typescript code from src/app.ts, lines 1-3.',
    );
  });
});
