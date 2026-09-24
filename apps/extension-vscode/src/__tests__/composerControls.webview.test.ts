/**
 * composerControls.webview.test.ts, compact, persistent mode/effort controls.
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
    expect(controls?.textContent).toBe('Auto');
    expect(document.getElementById('modelPill')?.textContent).toBe('Auto · Med');
    expect(controls?.getAttribute('aria-label')).toBe('Controls: Auto mode, Medium effort');
    expect(document.getElementById('plusMenuActions')).toBeNull();

    postHostMessage('modeChanged', { mode: 'plan' });
    postHostMessage('effortChanged', { effort: 'high', supportsEffort: true });
    expect(controls?.textContent).toBe('Plan');
    expect(document.getElementById('modelPill')?.textContent).toBe('Auto · High');
    expect(controls?.getAttribute('aria-label')).toBe('Controls: Plan mode, High effort');

    postHostMessage('effortChanged', { effort: 'low', supportsEffort: false });
    expect(controls?.textContent).toBe('Plan');
    expect(controls?.getAttribute('aria-label')).toBe(
      'Controls: Plan mode, effort unavailable for this model',
    );
  });

  // Mode, effort and model are three sibling run controls. Model already opened
  // an inline popover while the other two left the webview for a native
  // QuickPick that relocated focus and showed the current value only as
  // placeholder text. One interaction model, and the active value is checked.
  it('opens mode and effort inline, with the live value checked', () => {
    bootWebview();
    const summary = document.getElementById('controlsSummary');
    const popover = document.getElementById('controlsPopover');

    expect(summary?.getAttribute('aria-haspopup')).toBe('menu');
    expect(popover?.classList.contains('open')).toBe(false);

    summary?.click();

    expect(popover?.classList.contains('open')).toBe(true);
    expect(summary?.getAttribute('aria-expanded')).toBe('true');

    const checked = Array.from(popover?.querySelectorAll('[aria-checked="true"]') ?? []).map(
      (node) => node.querySelector('.model-popover__label')?.textContent,
    );
    expect(checked).toEqual(['Auto safe operations', 'Medium']);
  });

  it('asks the host to change mode and effort rather than setting them itself', () => {
    const { postMessage } = bootWebview();
    document.getElementById('controlsSummary')?.click();
    postMessage.mockClear();

    const plan = Array.from(
      document.querySelectorAll('#controlsPopover .model-popover__option'),
    ).find((node) => node.textContent?.startsWith('Plan mode')) as HTMLElement | undefined;
    plan?.click();

    expect(postMessage).toHaveBeenLastCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'setMode',
      payload: { mode: 'plan' },
    });
    expect(document.getElementById('controlsPopover')?.classList.contains('open')).toBe(false);
  });

  it('follows the host back, not the click, when consent refuses the mode', () => {
    bootWebview();
    document.getElementById('controlsSummary')?.click();
    const bypass = Array.from(
      document.querySelectorAll('#controlsPopover .model-popover__option'),
    ).find((node) => node.textContent?.startsWith('Bypass permissions')) as HTMLElement | undefined;
    bypass?.click();

    postHostMessage('modeChanged', { mode: 'auto' });
    document.getElementById('controlsSummary')?.click();

    const checked = Array.from(
      document.querySelectorAll('#controlsPopover [aria-checked="true"] .model-popover__label'),
    ).map((node) => node.textContent);
    expect(checked).toContain('Auto safe operations');
    expect(checked).not.toContain('Bypass permissions');
  });

  it('offers no effort levels for a model that takes none', () => {
    bootWebview();
    postHostMessage('effortChanged', { effort: 'medium', supportsEffort: false });
    document.getElementById('controlsSummary')?.click();

    const popover = document.getElementById('controlsPopover');
    expect(popover?.textContent).toContain('This model does not take a reasoning effort.');
    expect(popover?.querySelectorAll('[data-control-key="effort"]').length).toBe(0);
    expect(popover?.querySelectorAll('[data-control-key="mode"]').length).toBe(4);
  });

  // Same contract the plus menu already honours: opening lands on the first
  // item, Escape closes and hands focus back to the opener.
  it('lands focus on the live value, then gives it back on Escape', () => {
    bootWebview();
    const summary = document.getElementById('controlsSummary');
    const popover = document.getElementById('controlsPopover');

    summary?.click();
    expect(document.activeElement).toBe(
      popover?.querySelector('#controlsPopover .model-popover__option'),
    );

    popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popover?.classList.contains('open')).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it('walks the levels with the arrow keys', () => {
    bootWebview();
    document.getElementById('controlsSummary')?.click();
    const popover = document.getElementById('controlsPopover');
    const items = Array.from(popover?.querySelectorAll('[role^="menuitem"]') ?? []);

    popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);

    popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('closes on a click outside it', () => {
    bootWebview();
    const summary = document.getElementById('controlsSummary');
    const popover = document.getElementById('controlsPopover');

    summary?.click();
    expect(popover?.classList.contains('open')).toBe(true);
    document.body.click();
    expect(popover?.classList.contains('open')).toBe(false);
  });
});
