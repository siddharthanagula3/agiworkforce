/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

function boot(mode: 'ask' | 'auto' | 'plan' | 'bypass' = 'ask'): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/u, 'https://mock'),
      }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    mode,
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
    value: () => vscodeApiStub({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((s) =>
    s.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  return postMessage;
}
const send = () => document.getElementById('sendBtn') as HTMLButtonElement;
const input = () => document.getElementById('userInput') as HTMLTextAreaElement;
const type = (v: string) => {
  input().value = v;
  input().dispatchEvent(new Event('input'));
};
const deliver = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));

describe('composer send state and controls', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  });

  it('disables send until the trimmed input has text and re-disables it after sending', () => {
    const post = boot();
    expect(send().disabled).toBe(true);
    type('   ');
    expect(send().disabled).toBe(true);
    type('hi');
    expect(send().disabled).toBe(false);
    send().click();
    expect(post.mock.calls.some((c) => c[0]?.type === 'sendMessage')).toBe(true);
    expect(input().value).toBe('');
    expect(send().disabled).toBe(true);
  });
  it('enables send for a pending attachment and disables it when the attachment is removed', () => {
    boot();
    deliver({ type: 'contextAttached', payload: { id: 'a1', name: 'x.ts' } });
    expect(send().disabled).toBe(false);
    (document.querySelector('#attachmentStrip .attachment-chip__remove') as HTMLElement).click();
    expect(send().disabled).toBe(true);
  });
  it('enables send for a host draft and disables an empty follow-up while streaming', () => {
    boot();
    deliver({ type: 'composerDraft', payload: { text: 'draft', references: [] } });
    expect(send().disabled).toBe(false);
    send().click();
    expect(send().getAttribute('aria-label')).toBe('Queue follow-up');
    expect(send().disabled).toBe(true);
    type('more');
    expect(send().disabled).toBe(false);
  });
  it('leads the mode chip with a codicon per mode and shows the mode name only', () => {
    for (const [m, icon] of [
      ['ask', 'shield'],
      ['auto', 'zap'],
      ['plan', 'checklist'],
      ['bypass', 'warning'],
    ] as const) {
      boot(m);
      const chip = document.getElementById('controlsSummary')!;
      expect(chip.querySelector('.codicon')?.classList.contains(`codicon-${icon}`)).toBe(true);
      expect(chip.querySelector('.controls-summary__label')?.textContent).not.toMatch(/·/);
    }
  });
  it('shares one popover surface and an expanded tile across the composer popovers', () => {
    boot();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('\n');
    expect(css).toMatch(/\.plus-btn\[aria-expanded="true"\]/);
    expect(css).toMatch(/\.plus-menu \{[^}]*var\(--bg-popover\)/);
    expect(css).toMatch(/\.slash-menu \{[^}]*var\(--bg-popover\)/);
  });
});
