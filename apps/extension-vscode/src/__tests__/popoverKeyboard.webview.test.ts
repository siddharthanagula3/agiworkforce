/**
 * popoverKeyboard.webview.test.ts — VSCX-14 / VSCX-15.
 *
 * Both composer popovers declare role="menu", which tells assistive tech that
 * arrow keys move between items and Escape dismisses. Neither was implemented:
 * there was no keydown handler at all, so the markup described navigation the
 * widget did not have and keyboard users could not reach the items.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function renderWebview(): string {
  return getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/, 'https://mock'),
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

function boot(): void {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage: vi.fn() }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((s) =>
    s.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
}

const press = (el: Element, key: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

describe('composer popover keyboard support', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('moves focus to the first item when the plus menu opens', () => {
    boot();
    const plusBtn = document.getElementById('plusBtn')!;
    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const items = document.querySelectorAll('#plusMenu [role^="menuitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(items[0]);
  });

  it('walks items with the arrow keys and wraps', () => {
    boot();
    const plusBtn = document.getElementById('plusBtn')!;
    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const menu = document.getElementById('plusMenu')!;
    const items = Array.from(menu.querySelectorAll('[role^="menuitem"]'));

    press(menu, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);

    press(menu, 'ArrowUp');
    expect(document.activeElement).toBe(items[0]);

    press(menu, 'ArrowUp');
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('closes on Escape and returns focus to the opener', () => {
    boot();
    const plusBtn = document.getElementById('plusBtn')!;
    const menu = document.getElementById('plusMenu')!;
    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('open')).toBe(true);

    press(menu, 'Escape');
    expect(menu.classList.contains('open')).toBe(false);
    expect(plusBtn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(plusBtn);
  });

  it('keeps exactly one item tabbable (roving tabindex)', () => {
    boot();
    document.getElementById('plusBtn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const items = Array.from(document.querySelectorAll('#plusMenu [role^="menuitem"]'));
    const tabbable = items.filter((i) => i.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('closes a menu when Tab moves on and keeps expanded state truthful', () => {
    boot();
    const plusBtn = document.getElementById('plusBtn')!;
    const menu = document.getElementById('plusMenu')!;
    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    press(menu, 'Tab');
    expect(menu.classList.contains('open')).toBe(false);
    expect(plusBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the model loading state from its opener with Escape', () => {
    boot();
    const modelPill = document.getElementById('modelPill')!;
    const popover = document.getElementById('modelPopover')!;
    modelPill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popover.classList.contains('open')).toBe(true);
    expect(modelPill.getAttribute('aria-expanded')).toBe('true');

    press(modelPill, 'Escape');
    expect(popover.classList.contains('open')).toBe(false);
    expect(modelPill.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the canonical close helper for file and plan actions', () => {
    boot();
    const plusBtn = document.getElementById('plusBtn')!;
    const menu = document.getElementById('plusMenu')!;

    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document
      .getElementById('plusMenuUpload')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('open')).toBe(false);
    expect(plusBtn.getAttribute('aria-expanded')).toBe('false');

    plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document
      .getElementById('plusMenuPlanMode')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('open')).toBe(false);
    expect(plusBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('inherits the editor font family and size', () => {
    const html = renderWebview();
    expect(html).toContain('font-family: var(--vscode-font-family');
    expect(html).toContain('font-size: var(--vscode-font-size');
  });

  it('keeps Tab focus inside the first-run modal dialog', () => {
    boot();
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'showOnboarding' } }));

    const modal = document.getElementById('onboarding')!;
    const first = document.getElementById('onboardingSkip')!;
    const last = document.getElementById('onboardingNext')!;

    last.focus();
    press(modal, 'Tab');
    expect(document.activeElement).toBe(first);

    first.focus();
    modal.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });
});
