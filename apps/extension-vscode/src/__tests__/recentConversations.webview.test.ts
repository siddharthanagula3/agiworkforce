/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
    false,
    'queue',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
  postMessage.mockClear();
  return postMessage;
}

function deliverRecents(
  conversations: Array<{ id: string; title: string; age: string }>,
  total: number,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'recentConversations', payload: { conversations, total } },
    }),
  );
}

const THREE_RECENTS = [
  { id: 'thread-a', title: 'Wire the usage meter', age: '4m ago' },
  { id: 'thread-b', title: 'Rename the runtime pool', age: '2h ago' },
  { id: 'thread-c', title: 'Fix the diff decorations', age: '3d ago' },
];

describe('VS Code sidebar recent-chats block', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('renders nothing until the host sends a list', () => {
    boot();
    expect(document.querySelector('.recent-chats')).toBeNull();
  });

  it('renders one row per conversation above the empty-state mark', () => {
    boot();
    deliverRecents(THREE_RECENTS, 9);

    const block = document.querySelector('.recent-chats');
    expect(block).not.toBeNull();
    expect(block?.previousElementSibling).toBeNull();
    expect(block?.nextElementSibling?.classList.contains('empty-state-mark')).toBe(true);

    const rows = Array.from(document.querySelectorAll('.recent-chat-row'));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector('.recent-chat-title')?.textContent)).toEqual([
      'Wire the usage meter',
      'Rename the runtime pool',
      'Fix the diff decorations',
    ]);
    expect(rows.map((row) => row.querySelector('.recent-chat-age')?.textContent)).toEqual([
      '4m ago',
      '2h ago',
      '3d ago',
    ]);
    expect(document.querySelector('.recent-chats-title')?.textContent).toBe('Sessions');
    expect(document.querySelector('.recent-chats-all')?.textContent).toBe('View all');
    expect(document.querySelector('.recent-chats-all')?.getAttribute('aria-label')).toBe(
      'View all 9 sessions',
    );
  });

  it('renders a conversation title as text rather than markup', () => {
    boot();
    deliverRecents([{ id: 'thread-a', title: '<img src=x onerror=alert(1)>', age: 'just now' }], 1);

    const title = document.querySelector('.recent-chat-title');
    expect(title?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(title?.querySelector('img')).toBeNull();
  });

  it('asks the host to open the clicked conversation', () => {
    const postMessage = boot();
    deliverRecents(THREE_RECENTS, 3);

    (document.querySelectorAll('.recent-chat-row')[1] as HTMLButtonElement).click();

    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'openRecentConversation',
      payload: { threadId: 'thread-b' },
    });
  });

  it('opens the sessions sheet from the More row', () => {
    const postMessage = boot();
    deliverRecents(THREE_RECENTS, 12);

    (document.querySelector('.recent-chats-all') as HTMLButtonElement).click();

    expect(document.getElementById('sessionsSheet')?.hidden).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'requestSessions',
      payload: { source: 'local' },
    });
  });

  it('removes the block when the host reports no conversations', () => {
    boot();
    deliverRecents(THREE_RECENTS, 3);
    deliverRecents([], 0);

    expect(document.querySelector('.recent-chats')).toBeNull();
    expect(document.querySelector('.empty-state-mark')).not.toBeNull();
  });

  it('restores the block onto the empty state rebuilt by New Chat', () => {
    boot();
    deliverRecents(THREE_RECENTS, 3);

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'conversationCleared' } }));

    expect(document.querySelectorAll('.recent-chat-row')).toHaveLength(3);
  });
});
