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

function boot(
  mode: 'ask' | 'auto' | 'plan' | 'bypass' = 'ask',
  storage?: { state: unknown },
): ReturnType<typeof vi.fn> {
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
    value: () =>
      storage
        ? {
            postMessage,
            getState: () => storage.state,
            setState: (value: unknown) => (storage.state = value),
          }
        : vscodeApiStub({ postMessage }),
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
const loadConversation = (threadId: string) =>
  deliver({
    type: 'conversationLoaded',
    payload: { threadId, trustMode: 'local', title: threadId, messages: [] },
  });

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

  it('restores only the draft owned by the conversation selected in the same pane', () => {
    const storage = { state: undefined as unknown };
    boot('ask', storage);
    loadConversation('first');
    type('First conversation draft');
    loadConversation('second');
    expect(input().value).toBe('');
    expect(send().disabled).toBe(true);
    type('Second conversation draft');
    loadConversation('first');
    expect(input().value).toBe('First conversation draft');
    deliver({ type: 'sessionBinding', payload: { epoch: 1, composerThreadId: null } });
    expect(input().value).toBe('');
    loadConversation('second');
    expect(input().value).toBe('Second conversation draft');

    boot('ask', storage);
    expect(input().value).toBe('');
    loadConversation('first');
    expect(input().value).toBe('First conversation draft');
    loadConversation('second');
    expect(input().value).toBe('Second conversation draft');
  });

  it('binds typing during initial session creation to the newly opened conversation', () => {
    boot();
    type('A follow-up while the first send starts');
    deliver({ type: 'composerThreadStarted', payload: { threadId: 'new-thread' } });
    expect(input().value).toBe('A follow-up while the first send starts');
    loadConversation('another-thread');
    expect(input().value).toBe('');
    loadConversation('new-thread');
    expect(input().value).toBe('A follow-up while the first send starts');
  });

  it('keeps an older unscoped draft in New chat during migration', () => {
    const storage = { state: { composerDraft: 'A draft before upgrading' } as unknown };
    boot('ask', storage);
    loadConversation('existing');
    expect(input().value).toBe('');
    deliver({ type: 'sessionBinding', payload: { epoch: 1, composerThreadId: null } });
    expect(input().value).toBe('A draft before upgrading');
  });

  it('resizes a wrapped draft when the pane changes width without another edit', () => {
    const post = boot();
    const textarea = input();
    let contentHeight = 39;
    vi.spyOn(textarea, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    type('Keep this draft while resizing the pane.');
    expect(textarea.style.height).toBe('39px');
    post.mockClear();

    contentHeight = 92;
    window.dispatchEvent(new Event('resize'));
    expect(textarea.style.height).toBe('92px');

    contentHeight = 240;
    window.dispatchEvent(new Event('resize'));
    expect(textarea.style.height).toBe('140px');

    contentHeight = 39;
    window.dispatchEvent(new Event('resize'));
    expect(textarea.style.height).toBe('39px');
    expect(textarea.value).toBe('Keep this draft while resizing the pane.');
    expect(post).not.toHaveBeenCalled();
  });

  it('opens the output-style picker from the chat menu', () => {
    const post = boot();
    document.querySelector<HTMLButtonElement>('#actionsBtn')!.click();
    document.querySelector<HTMLButtonElement>('#openOutputStyles')!.click();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'openOutputStyles' }));
    expect(document.querySelector('#actionsBtn')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders saved replies as bookmarked and applies acknowledgement only to the matching reply', () => {
    const post = boot();
    const messages = [
      { role: 'assistant', text: 'Identical reply', index: 1, bookmarked: true },
      { role: 'assistant', text: 'Identical reply', index: 3 },
    ];
    deliver({
      type: 'conversationLoaded',
      payload: { threadId: 'bookmarks', title: 'Bookmarks', trustMode: 'local', messages },
    });
    const buttons = document.querySelectorAll<HTMLButtonElement>('.message-action--bookmark');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
    buttons[1]!.click();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'messageAction',
        payload: expect.objectContaining({ action: 'bookmarkAnswer', messageIndex: 3 }),
      }),
    );
    deliver({ type: 'sessionBinding', payload: { epoch: 4 } });
    deliver({
      type: 'replyBookmarkChanged',
      payload: { epoch: 3, index: 3, bookmarked: true },
    });
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
    deliver({
      type: 'replyBookmarkChanged',
      payload: { epoch: 4, index: 3, bookmarked: true },
    });
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.title).toBe('Remove reply bookmark');
  });

  it('returns dictation to an editable draft and ignores stale results', () => {
    const post = boot();
    const mic = document.querySelector<HTMLButtonElement>('#dictationBtn')!;
    expect(mic.hidden).toBe(true);
    expect(getComputedStyle(mic).display).toBe('none');
    deliver({ type: 'dictationAvailability', payload: { enabled: true } });
    expect(mic.hidden).toBe(false);
    type('Existing draft');
    mic.click();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'startDictation', payload: { id: 1 } }),
    );
    deliver({ type: 'dictationResult', payload: { id: 1, text: 'with speech' } });
    expect(input().value).toBe('Existing draft with speech');
    mic.click();
    type('Keep my edits');
    deliver({ type: 'dictationResult', payload: { id: 2, text: 'stale' } });
    expect(input().value).toBe('Keep my edits');
    expect(post.mock.calls.some(([message]) => message.type === 'sendMessage')).toBe(false);
  });

  it('opens the active plan without submitting a chat turn or consuming attachments', () => {
    const post = boot();
    deliver({ type: 'contextAttached', payload: { id: 'keep-file', name: 'notes.ts' } });
    type('/plan open');
    send().click();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'openPlanDocument' }));
    expect(post.mock.calls.some(([message]) => message.type === 'sendMessage')).toBe(false);
    expect(composer(post).attachments).toBe(1);
    expect(input().value).toBe('');
  });

  it('stops a streaming turn on Escape only when enabled', () => {
    const post = boot();
    type('Start a turn');
    send().click();
    const escape = () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    escape();
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel' }));
    deliver({ type: 'followUpBehavior', payload: { behavior: 'queue', escapeStops: true } });
    escape();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel' }));
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
