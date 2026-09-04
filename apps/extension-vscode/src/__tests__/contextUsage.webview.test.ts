/**
 * contextUsage.webview.test.ts, composer context-window readout.
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
