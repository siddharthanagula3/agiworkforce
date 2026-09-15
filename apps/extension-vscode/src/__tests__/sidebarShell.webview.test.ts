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

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function click(selector: string): void {
  (document.querySelector(selector) as HTMLButtonElement | null)?.click();
}

describe('the sidebar overflow menu', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('opens on the ellipsis and asks the host for the chosen surface', () => {
    const postMessage = boot();

    click('#actionsBtn');
    expect(document.getElementById('actionsMenu')?.classList.contains('open')).toBe(true);
    expect(document.getElementById('actionsBtn')?.getAttribute('aria-expanded')).toBe('true');

    click('[data-surface="projects"]');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openSurface',
      payload: { surfaceId: 'projects' },
    });
    expect(document.getElementById('actionsMenu')?.classList.contains('open')).toBe(false);
  });

  it('opens the in-webview sheet for Sessions rather than a host pick', () => {
    const postMessage = boot();

    click('#actionsBtn');
    click('[data-surface="sessions"]');

    expect(document.getElementById('sessionsSheet')?.hidden).toBe(false);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'requestSessions',
      payload: { source: 'local' },
    });
    expect(postMessage).not.toHaveBeenCalledWith({
      type: 'openSurface',
      payload: { surfaceId: 'sessions' },
    });
  });

  it('names the signed-in account and offers sign out', () => {
    boot();

    deliver({
      type: 'accountStatus',
      payload: {
        status: 'signed-in',
        identity: { displayName: 'Dev', email: 'dev@example.com', planName: 'Max', tier: 'max' },
      },
    });

    expect(document.getElementById('menuAccountName')?.textContent).toBe('dev@example.com');
    expect(document.getElementById('menuAccountPlan')?.textContent).toBe('Max plan');
    expect(document.getElementById('menuAccountActionLabel')?.textContent).toBe('Sign out');
    expect((document.getElementById('composerStatusSignIn') as HTMLElement).hidden).toBe(true);
  });

  it('keeps sign-in a quiet link in the status line, never a primary empty-state button', () => {
    const postMessage = boot();

    deliver({ type: 'accountStatus', payload: { status: 'signed-out' } });
    expect(document.querySelector('.empty-state-signin')).toBeNull();
    expect((document.getElementById('composerStatusSignIn') as HTMLElement).hidden).toBe(false);

    click('#composerStatusSignIn');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openSurface',
      payload: { surfaceId: 'signIn' },
    });
  });
});

describe('the sessions sheet', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('renders each row with its age and source label', () => {
    boot();
    click('#sessionsBtn');

    deliver({
      type: 'sessionsList',
      payload: {
        source: 'local',
        rows: [
          {
            id: 'thread-a',
            title: 'Wire the usage meter',
            age: '4m ago',
            source: 'local',
            sourceLabel: 'Local',
          },
        ],
      },
    });

    const row = document.querySelector('.sessions-sheet-row');
    expect(row?.querySelector('.sessions-sheet-row-title')?.textContent).toBe(
      'Wire the usage meter',
    );
    expect(
      Array.from(row?.querySelectorAll('.sessions-sheet-row-age') ?? []).map(
        (node) => node.textContent,
      ),
    ).toEqual(['4m ago', 'Local']);
  });

  it('asks the host for cloud chats when the Cloud tab is chosen', () => {
    const postMessage = boot();
    click('#sessionsBtn');
    postMessage.mockClear();

    click('#sessionsTabCloud');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'requestSessions',
      payload: { source: 'cloud' },
    });
    expect(document.getElementById('sessionsTabCloud')?.getAttribute('aria-selected')).toBe('true');
  });

  it('states why cloud chats are missing instead of showing an empty list', () => {
    boot();
    click('#sessionsBtn');
    click('#sessionsTabCloud');

    deliver({
      type: 'sessionsList',
      payload: {
        source: 'cloud',
        rows: [],
        unavailable: 'Sign in to AGI Cloud to see cloud chats.',
      },
    });

    expect(document.querySelector('.sessions-sheet-empty')?.textContent).toBe(
      'Sign in to AGI Cloud to see cloud chats.',
    );
  });

  it('reveals the search field only past ten rows', () => {
    boot();
    click('#sessionsBtn');
    const rows = Array.from({ length: 11 }, (_unused, index) => ({
      id: `thread-${index}`,
      title: `Session ${index}`,
      age: '1h ago',
      source: 'local',
      sourceLabel: 'Local',
    }));

    deliver({ type: 'sessionsList', payload: { source: 'local', rows: rows.slice(0, 10) } });
    expect((document.getElementById('sessionsSearch') as HTMLInputElement).hidden).toBe(true);

    deliver({ type: 'sessionsList', payload: { source: 'local', rows } });
    expect((document.getElementById('sessionsSearch') as HTMLInputElement).hidden).toBe(false);
  });

  it('opens the clicked row through the host, naming its source', () => {
    const postMessage = boot();
    click('#sessionsBtn');
    deliver({
      type: 'sessionsList',
      payload: {
        source: 'local',
        rows: [
          { id: 'thread-a', title: 'A', age: '4m ago', source: 'local', sourceLabel: 'Local' },
        ],
      },
    });

    click('.sessions-sheet-row');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openSessionRow',
      payload: { id: 'thread-a', source: 'local' },
    });
    expect(document.getElementById('sessionsSheet')?.hidden).toBe(true);
  });
});

describe('the composer command list', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('asks the host for the command list once and renders what comes back', () => {
    const postMessage = boot();

    click('#slashBtn');

    expect(postMessage).toHaveBeenCalledWith({ type: 'requestSlashCommands' });
    expect(document.querySelector('.slash-menu-empty')?.textContent).toBe('Loading commands…');

    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/model', description: 'Choose the model' }] },
    });

    expect(document.querySelector('.slash-menu-item-name')?.textContent).toBe('/model');
  });

  it('filters the same list while the input starts with a slash', () => {
    boot();
    deliver({
      type: 'slashCommands',
      payload: {
        items: [
          { name: '/model', description: 'Choose the model' },
          { name: '/clear', description: 'Start a new chat' },
        ],
      },
    });

    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/cl';
    input.dispatchEvent(new Event('input'));

    expect(
      Array.from(document.querySelectorAll('.slash-menu-item-name')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['/clear']);
  });

  it('runs the chosen command and clears the typed slash', () => {
    const postMessage = boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/clear', description: 'Start a new chat' }] },
    });
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/cl';
    input.dispatchEvent(new Event('input'));

    click('.slash-menu-item');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'runSlashCommand',
      payload: { name: '/clear' },
    });
    expect(input.value).toBe('');
  });

  it('runs the highlighted command on Enter instead of sending "/model" as a message', () => {
    const postMessage = boot();
    deliver({
      type: 'slashCommands',
      payload: {
        items: [
          { name: '/model', description: 'Choose the model' },
          { name: '/models', description: 'List every model' },
        ],
      },
    });
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/model';
    input.dispatchEvent(new Event('input'));

    expect(
      document.querySelector('.slash-menu-item.highlighted .slash-menu-item-name')?.textContent,
    ).toBe('/model');

    postMessage.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'runSlashCommand',
      payload: { name: '/model' },
    });
    expect(postMessage.mock.calls.some((call) => call[0]?.type === 'sendMessage')).toBe(false);
    expect(input.value).toBe('');
    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
  });

  it('moves the highlight with the arrow keys and runs whichever row is lit', () => {
    const postMessage = boot();
    deliver({
      type: 'slashCommands',
      payload: {
        items: [
          { name: '/model', description: 'Choose the model' },
          { name: '/models', description: 'List every model' },
        ],
      },
    });
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/model';
    input.dispatchEvent(new Event('input'));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(
      document.querySelector('.slash-menu-item.highlighted .slash-menu-item-name')?.textContent,
    ).toBe('/models');

    postMessage.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'runSlashCommand',
      payload: { name: '/models' },
    });
  });

  it('closes on Escape without sending anything', () => {
    const postMessage = boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/model', description: 'Choose the model' }] },
    });
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/model';
    input.dispatchEvent(new Event('input'));

    postMessage.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(input.value).toBe('/model');
  });

  it('never leaves the popup floating over an idle composer after a send', () => {
    const postMessage = boot();
    deliver({
      type: 'slashCommands',
      payload: { items: [{ name: '/model', description: 'Choose the model' }] },
    });
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = '/model';
    input.dispatchEvent(new Event('input'));
    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(true);

    input.value = 'ship it';
    postMessage.mockClear();
    click('#sendBtn');

    expect(postMessage.mock.calls.some((call) => call[0]?.type === 'sendMessage')).toBe(true);
    expect(document.getElementById('slashMenu')?.classList.contains('open')).toBe(false);
    expect(input.value).toBe('');
  });

  it('keeps the composer icon buttons at a clickable size', () => {
    boot();
    const rule = Array.from(document.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n')
      .match(/\.plus-btn\s*\{[^}]*\}/u);

    expect(rule, 'the composer + and / buttons have no size rule').toBeTruthy();
    expect(Number(/height:\s*(\d+)px/u.exec(rule![0])?.[1])).toBeGreaterThanOrEqual(28);
    expect(Number(/width:\s*(\d+)px/u.exec(rule![0])?.[1])).toBeGreaterThanOrEqual(28);
  });

  it('resumes a session without narrating the resume, and keeps a panel that says something', () => {
    boot();

    deliver({
      type: 'conversationLoaded',
      payload: {
        threadId: 't2',
        title: 'A replayed session',
        trustMode: 'byok',
        provider: 'DeepSeek',
        messages: [
          { role: 'user', text: 'Reply with exactly: shell ok' },
          { role: 'assistant', text: 'shell ok' },
        ],
      },
    });

    const log = document.getElementById('messages') as HTMLElement;
    expect(log.textContent).toContain('shell ok');
    expect(log.textContent).not.toContain('Resumed developer session');
    expect(log.querySelector('#emptyState')).toBeNull();

    deliver({
      type: 'conversationLoaded',
      payload: { threadId: 't3', title: 'Nothing to replay', trustMode: 'byok', messages: [] },
    });

    expect(log.querySelector('#emptyState')).not.toBeNull();
    expect(log.textContent).toContain('Build with AGI');
  });

  it('states the trust boundary and the permission mode under the composer', () => {
    boot();

    expect(document.getElementById('composerStatusMode')?.textContent).toBe('Auto');

    deliver({
      type: 'conversationLoaded',
      payload: {
        threadId: 't1',
        title: 'A session',
        trustMode: 'local',
        messages: [],
      },
    });

    expect(document.getElementById('composerStatusBoundary')?.textContent).toBe('Local');
  });
});
