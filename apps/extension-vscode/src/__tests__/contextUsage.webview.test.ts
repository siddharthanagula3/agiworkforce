/**
 * contextUsage.webview.test.ts, composer context-window readout.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
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

function bootWebview() {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  const postMessage = vi.fn();
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
  return { postMessage };
}

function postHostMessage(type: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type, payload } }));
}

function chip(): HTMLElement {
  const el = document.getElementById('contextUsage');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('composer context usage chip', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('shows nothing until a turn has actually reported its tokens', () => {
    bootWebview();

    expect(chip().className).toBe('context-usage');
    expect(chip().textContent).toBe('');
    expect(chip().hasAttribute('title')).toBe(false);
  });

  it('shows cache usage only on the reply for which it was reported', () => {
    bootWebview();
    postHostMessage('token', { text: 'First reply' });
    postHostMessage('done', { cacheReadTokens: 1, cacheWriteTokens: 512 });
    postHostMessage('token', { text: 'Second reply' });
    postHostMessage('done', {});

    const replies = document.querySelectorAll('.message.assistant');
    expect(replies).toHaveLength(2);
    expect(replies[0]?.querySelector('.message-cache')?.textContent).toBe(
      'Prompt cache · 1 token reused · 512 tokens written',
    );
    expect(replies[1]?.querySelector('.message-cache')).toBeNull();
  });

  it('renders the measured tokens against a known context window', () => {
    bootWebview();

    postHostMessage('contextUsage', { usedTokens: 43_000, contextWindow: 200_000 });

    expect(chip().textContent).toBe('43k / 200k');
    expect(chip().classList.contains('visible')).toBe(true);
    expect(chip().classList.contains('is-high')).toBe(false);
    expect(chip().title).toBe('Context after the last turn: 43,000 of 200,000 tokens (22%)');
  });

  it('warns as the measured usage approaches the window', () => {
    bootWebview();

    postHostMessage('contextUsage', { usedTokens: 160_000, contextWindow: 200_000 });
    expect(chip().classList.contains('is-high')).toBe(true);
    expect(chip().classList.contains('is-critical')).toBe(false);

    postHostMessage('contextUsage', { usedTokens: 190_000, contextWindow: 200_000 });
    expect(chip().classList.contains('is-critical')).toBe(true);
  });

  it('applies changes to the warning threshold to the current measurement immediately', () => {
    bootWebview();
    const notice = document.getElementById('contextLimitNotice') as HTMLElement;
    postHostMessage('contextUsage', { usedTokens: 159_999, contextWindow: 200_000 });
    postHostMessage('contextWarningPreference', { percent: 80 });
    expect(notice.hidden).toBe(true);

    postHostMessage('contextUsage', { usedTokens: 160_000, contextWindow: 200_000 });
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('80%');
    expect(chip().classList.contains('is-critical')).toBe(true);

    postHostMessage('contextWarningPreference', { percent: 0 });
    expect(notice.hidden).toBe(true);
    expect(chip().classList.contains('is-critical')).toBe(false);
    expect(chip().textContent).toBe('160k / 200k');

    postHostMessage('contextWarningPreference', { percent: 75 });
    expect(notice.hidden).toBe(false);
    postHostMessage('contextUsage', { usedTokens: 160_000 });
    expect(notice.hidden).toBe(true);
    postHostMessage('contextWarningPreference', { percent: 10 });
    expect(notice.hidden).toBe(true);
  });

  it('drops the denominator instead of inventing a window it was not given', () => {
    bootWebview();

    postHostMessage('contextUsage', { usedTokens: 1_000 });

    expect(chip().textContent).toBe('1.0k tok');
    expect(chip().classList.contains('visible')).toBe(true);
    expect(chip().title).toContain('not known here');
  });

  it('hides rather than showing a zero when a turn reported no tokens', () => {
    bootWebview();

    postHostMessage('contextUsage', { usedTokens: 43_000, contextWindow: 200_000 });
    postHostMessage('contextUsage', { usedTokens: 0, contextWindow: 200_000 });

    expect(chip().className).toBe('context-usage');
    expect(chip().textContent).toBe('');
  });

  it('clears the readout when the conversation it measured is replaced', () => {
    bootWebview();

    postHostMessage('contextUsage', { usedTokens: 43_000, contextWindow: 200_000 });
    expect(chip().classList.contains('visible')).toBe(true);

    postHostMessage('conversationCleared', {});
    expect(chip().className).toBe('context-usage');
    expect(chip().textContent).toBe('');
  });
});
