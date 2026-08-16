/**
 * composerControls.webview.test.ts — compact, persistent mode/effort controls.
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

  new Function(inlineScript?.textContent ?? '')();
  return { postMessage };
}

function postHostMessage(type: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type, payload } }));
}

describe('compact composer controls', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('keeps the live mode and effort legible in one narrow control', () => {
    bootWebview();

    const controls = document.getElementById('controlsSummary');
    expect(controls?.textContent).toBe('Auto · Med');
    expect(controls?.getAttribute('aria-label')).toBe('Controls: Auto mode, Medium effort');
    expect(document.getElementById('plusMenuActions')).toBeNull();

    postHostMessage('modeChanged', { mode: 'plan' });
    postHostMessage('effortChanged', { effort: 'high', supportsEffort: true });
    expect(controls?.textContent).toBe('Plan · High');
    expect(controls?.getAttribute('aria-label')).toBe('Controls: Plan mode, High effort');

    postHostMessage('effortChanged', { effort: 'low', supportsEffort: false });
    expect(controls?.textContent).toBe('Plan');
    expect(controls?.getAttribute('aria-label')).toBe(
      'Controls: Plan mode, effort unavailable for this model',
    );
  });

  it('opens the controls and actions sheet from the single direct composer control', () => {
    const { postMessage } = bootWebview();
    postMessage.mockClear();

    document.getElementById('controlsSummary')?.click();
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'openActionSheet',
      payload: { scope: 'composer' },
    });

    expect(document.getElementById('plusMenuActions')).toBeNull();
  });
});
