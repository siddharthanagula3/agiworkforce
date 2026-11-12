/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';
import {
  MAX_SEND_MESSAGE_CHARS,
  MAX_SIDE_QUESTION_CHARS,
  type ComposerBinding,
} from '../protocol/webviewMessages';

const registeredWindowListeners: Array<() => void> = [];
function clearWindowListeners(): void {
  for (const remove of registeredWindowListeners.splice(0)) remove();
}

function boot(mode: 'ask' | 'auto' | 'plan' | 'bypass' = 'ask'): ReturnType<typeof vi.fn> {
  clearWindowListeners();
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
  const addEventListener = window.addEventListener.bind(window);
  const listenerSpy = vi
    .spyOn(window, 'addEventListener')
    .mockImplementation((type, listener, options) => {
      addEventListener(type, listener, options);
      registeredWindowListeners.push(() => window.removeEventListener(type, listener, options));
    });
  try {
    // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
    new Function(inline?.textContent ?? '')();
  } finally {
    listenerSpy.mockRestore();
  }
  return postMessage;
}
const send = () => document.getElementById('sendBtn') as HTMLButtonElement;
const input = () => document.getElementById('userInput') as HTMLTextAreaElement;
const type = (v: string) => {
  input().value = v;
  input().dispatchEvent(new Event('input'));
};
const deliver = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
const composer = (post: ReturnType<typeof vi.fn>): ComposerBinding =>
  post.mock.calls.filter(([message]) => message.type === 'composerState').at(-1)![0].payload;

describe('composer send state and controls', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    clearWindowListeners();
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
  it('applies an unchanged action draft with the exact composer and session binding', () => {
    const post = boot();
    const expectedComposer = { ...composer(post), epoch: 0 };

    deliver({
      type: 'composerDraft',
      payload: { text: 'retry this prompt', references: [], expectedComposer },
    });

    expect(input().value).toBe('retry this prompt');
    expect(composer(post).revision).toBeGreaterThan(expectedComposer.revision);
  });
  it('does not overwrite or submit typing that replaced a delayed action draft', () => {
    const post = boot();
    const expectedComposer = { ...composer(post), epoch: 0 };
    type('Keep my newer draft');

    deliver({
      type: 'composerDraft',
      payload: { text: 'old prompt', references: [], submit: true, expectedComposer },
    });

    expect(input().value).toBe('Keep my newer draft');
    expect(post.mock.calls.some(([message]) => message.type === 'sendMessage')).toBe(false);
  });
  it.each(['instance', 'epoch'] as const)('rejects a delayed action with a stale %s', (field) => {
    const post = boot();
    const expectedComposer = { ...composer(post), epoch: 0 };
    if (field === 'instance') expectedComposer.instance = 'replaced-webview';
    else expectedComposer.epoch = 1;

    deliver({
      type: 'composerDraft',
      payload: { text: 'stale prompt', references: [], submit: true, expectedComposer },
    });

    expect(input().value).toBe('');
    expect(post.mock.calls.some(([message]) => message.type === 'sendMessage')).toBe(false);
  });
  it('preserves a newer draft when a first-message branch clears the transcript', () => {
    const post = boot();
    const expectedComposer = { ...composer(post), epoch: 1 };
    type('Keep this after the branch');
    deliver({ type: 'sessionBinding', payload: { epoch: 1 } });
    deliver({ type: 'conversationCleared' });
    deliver({
      type: 'composerDraft',
      payload: { text: 'first prompt', references: [], expectedComposer },
    });

    expect(input().value).toBe('Keep this after the branch');
  });
  it('publishes staged attachment ownership and rejects an older automatic resend', () => {
    const post = boot();
    const expectedComposer = { ...composer(post), epoch: 0 };
    deliver({ type: 'contextAttached', payload: { id: 'new-file', name: 'keep.ts' } });

    expect(composer(post).attachments).toBe(1);
    deliver({
      type: 'composerDraft',
      payload: { text: 'old prompt', references: [], submit: true, expectedComposer },
    });

    expect(document.querySelector('[data-attachment-id="new-file"]')).not.toBeNull();
    expect(post.mock.calls.some(([message]) => message.type === 'sendMessage')).toBe(false);
    (document.querySelector('#attachmentStrip .attachment-chip__remove') as HTMLElement).click();
    expect(composer(post).attachments).toBe(0);
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
  it('refuses an over-long message visibly, keeps its text and never starts sending', () => {
    const post = boot();
    const long = 'x'.repeat(MAX_SEND_MESSAGE_CHARS + 1);
    type(long);

    send().click();

    expect(post.mock.calls.some((c) => c[0]?.type === 'sendMessage')).toBe(false);
    expect(input().value).toBe(long);
    expect(document.querySelector('.message.user')).toBeNull();
    expect(send().getAttribute('aria-label')).toBe('Send');
    const status = document.getElementById('followUpStatus')!;
    expect(status.classList.contains('error')).toBe(true);
    expect(status.textContent).toContain('100,001 / 100,000 characters');

    type('short');
    expect(status.textContent).toBe('');
  });
  it('refuses an over-long side question and keeps it in the composer', () => {
    const post = boot();
    const question = `/btw ${'y'.repeat(MAX_SIDE_QUESTION_CHARS + 1)}`;
    type(question);

    send().click();

    expect(post.mock.calls.some((c) => c[0]?.type === 'sideQuestion')).toBe(false);
    expect(input().value).toBe(question);
    expect(document.getElementById('followUpStatus')!.textContent).toContain(
      'Side question too long to send',
    );
  });
});
