/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

let postedMessages: unknown[] = [];

function renderWebview(): string {
  return getWebviewContent(
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
    'max',
  );
}

function executeWebviewScript(): void {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  postedMessages = [];
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({
      postMessage: (message: unknown) => {
        postedMessages.push(message);
      },
    }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
}

function openPlusMenu(): void {
  document.getElementById('plusBtn')?.click();
}

function contextItem(kind: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-context-kind="${kind}"]`);
}

function postContextMenuState(
  items: Array<{ kind: string; available: boolean; detail: string }>,
): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: 'contextMenuState', payload: { items } } }),
  );
}

const EVERY_KIND = ['selection', 'open-files', 'problems', 'git-diff'] as const;

describe('composer context menu', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('offers one item per runtime context the host supports', () => {
    executeWebviewScript();

    for (const kind of EVERY_KIND) expect(contextItem(kind)).not.toBeNull();
  });

  it('asks the host for current availability each time the menu opens', () => {
    executeWebviewScript();

    openPlusMenu();
    expect(postedMessages).toContainEqual({ type: 'requestContextMenuState' });

    postedMessages = [];
    openPlusMenu();
    openPlusMenu();
    expect(postedMessages.filter((m) => m !== null)).toContainEqual({
      type: 'requestContextMenuState',
    });
  });

  it('disables an item and shows its reason when the state says it is unavailable', () => {
    executeWebviewScript();
    openPlusMenu();
    postContextMenuState([
      { kind: 'selection', available: false, detail: 'Select code in an editor first' },
      { kind: 'open-files', available: true, detail: '3 open editors' },
      { kind: 'problems', available: false, detail: 'No errors or warnings in src/app.ts' },
      { kind: 'git-diff', available: false, detail: 'Trust this workspace to read git' },
    ]);

    const selection = contextItem('selection');
    expect(selection?.disabled).toBe(true);
    expect(selection?.getAttribute('aria-disabled')).toBe('true');
    expect(selection?.querySelector('.plus-menu-description')?.textContent).toBe(
      'Select code in an editor first',
    );
    expect(contextItem('open-files')?.disabled).toBe(false);
    expect(contextItem('open-files')?.querySelector('.plus-menu-description')?.textContent).toBe(
      '3 open editors',
    );
  });

  it('sends nothing when a disabled item is clicked', () => {
    executeWebviewScript();
    openPlusMenu();
    postContextMenuState([
      { kind: 'selection', available: false, detail: 'Select code in an editor first' },
    ]);

    postedMessages = [];
    contextItem('selection')?.click();

    expect(postedMessages).toEqual([]);
  });

  it('asks the host to attach when an available item is clicked', () => {
    executeWebviewScript();
    openPlusMenu();
    postContextMenuState([{ kind: 'problems', available: true, detail: '2 problems in app.ts' }]);

    postedMessages = [];
    contextItem('problems')?.click();

    expect(postedMessages).toContainEqual({
      type: 'attachContext',
      payload: { kind: 'problems' },
    });
    expect(document.getElementById('plusMenu')?.classList.contains('open')).toBe(false);
  });

  it('renders a removable chip once the host reports the attachment', () => {
    executeWebviewScript();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'contextAttached', payload: { id: 'att-4', name: 'src/app.ts:12-20' } },
      }),
    );

    const chip = document.querySelector('#attachmentStrip .attachment-chip');
    expect(chip?.getAttribute('data-attachment-id')).toBe('att-4');
    expect(chip?.querySelector('.attachment-chip__name')?.textContent).toBe('src/app.ts:12-20');

    postedMessages = [];
    chip?.querySelector<HTMLButtonElement>('.attachment-chip__remove')?.click();

    expect(postedMessages).toContainEqual({
      type: 'removePendingAttachment',
      payload: { id: 'att-4' },
    });
    expect(document.querySelector('#attachmentStrip .attachment-chip')).toBeNull();
  });

  it('keeps a disabled item out of arrow-key navigation', () => {
    executeWebviewScript();
    openPlusMenu();
    postContextMenuState([
      { kind: 'selection', available: false, detail: 'Select code in an editor first' },
      { kind: 'open-files', available: true, detail: '3 open editors' },
      { kind: 'problems', available: true, detail: '2 problems' },
      { kind: 'git-diff', available: false, detail: 'No uncommitted changes' },
    ]);

    const reachable = document.querySelectorAll('#plusMenu [role="menuitem"]:not([disabled])');
    const kinds = [...reachable]
      .map((item) => item.getAttribute('data-context-kind'))
      .filter((kind) => kind !== null);

    expect(kinds).toEqual(['open-files', 'problems']);
  });
});
