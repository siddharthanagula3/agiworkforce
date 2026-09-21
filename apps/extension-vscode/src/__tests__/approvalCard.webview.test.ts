/**
 * approvalCard.webview.test.ts, the in-chat approval card, tool rows and the
 * error detail disclosure.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(): ReturnType<typeof vi.fn> {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/u, 'https://mock'),
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
    'pro',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
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
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  return postMessage;
}

function deliver(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function requestApproval(requestId = 'req-1', toolLabel = 'shell commands'): void {
  deliver({
    type: 'approvalRequested',
    payload: {
      requestId,
      toolLabel,
      summary: 'Allow this command?',
      detail: 'node -e "import(\'./add.mjs\')"',
      sessionApproved: false,
    },
  });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  vi.restoreAllMocks();
});

describe('approval card', () => {
  it('renders one card in the transcript with all four choices', () => {
    boot();
    requestApproval();

    const card = document.querySelector('.approval-card');
    expect(card).toBeTruthy();
    expect(card?.querySelector('.approval-card__summary')?.textContent).toBe('Allow this command?');
    expect(card?.querySelector('.approval-card__detail')?.textContent).toContain('add.mjs');
    expect(
      Array.from(card!.querySelectorAll('.approval-card__action')).map(
        (button) => (button as HTMLElement).dataset['decision'],
      ),
    ).toEqual(['once', 'session', 'deny', 'abort']);
  });

  it('spells its verbs with the shared vocabulary, not with its own literals', () => {
    boot();
    requestApproval();

    const labels = Array.from(document.querySelectorAll('.approval-card__action')).map(
      (button) => button.textContent ?? '',
    );
    expect(labels[0]).toBe(`${TOOL_APPROVAL_ACTION_LABELS.approve} once`);
    expect(labels[2]).toBe(TOOL_APPROVAL_ACTION_LABELS.deny);

    deliver({ type: 'approvalResolved', payload: { requestId: 'req-1', outcome: 'deny' } });
    expect(document.querySelector('.approval-card__outcome')?.textContent).toBe(
      `${TOOL_APPROVAL_ACTION_LABELS.denied}.`,
    );
  });

  it('names the tool on the session choice, not the argument', () => {
    boot();
    requestApproval('req-1', 'shell commands');

    expect(
      document.querySelector('.approval-card__action[data-decision="session"]')?.textContent,
    ).toBe(`${TOOL_APPROVAL_ACTION_LABELS.approve} shell commands for session`);
  });

  it('posts the decision the user pressed', () => {
    const postMessage = boot();
    requestApproval();
    postMessage.mockClear();

    (
      document.querySelector('.approval-card__action[data-decision="session"]') as HTMLElement
    ).click();

    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'respondToApproval',
      payload: { requestId: 'req-1', decision: 'session' },
    });
  });

  it('replaces the buttons with what happened, so a card is never answerable twice', () => {
    boot();
    requestApproval();

    deliver({ type: 'approvalResolved', payload: { requestId: 'req-1', outcome: 'session' } });

    expect(document.querySelector('.approval-card__actions')).toBeNull();
    expect(document.querySelector('.approval-card__outcome')?.textContent).toBe(
      `${TOOL_APPROVAL_ACTION_LABELS.allowed} for the rest of this session.`,
    );
  });

  it('does not charge the tool for the time a person spent deciding', async () => {
    boot();
    deliver({
      type: 'toolCallStart',
      payload: {
        toolUseId: 't1',
        name: 'run_command',
        category: 'shell',
        summary: 'node -p 100/4',
        input: { command: 'node -p 100/4' },
      },
    });
    requestApproval();

    // Stand in for the seconds a person takes to read the card and answer.
    await new Promise((resolve) => setTimeout(resolve, 60));
    deliver({ type: 'approvalResolved', payload: { requestId: 'req-1', outcome: 'once' } });
    deliver({
      type: 'toolCallEnd',
      payload: {
        toolUseId: 't1',
        output: { text: 'Exit code: 0\n25' },
        isError: false,
        elapsedMs: 60_000,
      },
    });

    const summary = document.querySelector('.tool-call__summary')?.textContent ?? '';
    expect(summary).toContain('node -p 100/4');
    expect(summary).not.toContain('60.0 s');
    expect(/· \d+ ms$/u.test(summary)).toBe(true);
  });

  it('says so when the turn ended before the card was answered', () => {
    boot();
    requestApproval();

    deliver({ type: 'approvalResolved', payload: { requestId: 'req-1', outcome: 'expired' } });

    expect(document.querySelector('.approval-card__outcome')?.textContent).toBe(
      'The turn ended before this was answered.',
    );
  });
});

describe('tool rows', () => {
  function startTool(name: string, category: string, input: unknown): void {
    deliver({
      type: 'toolCallStart',
      payload: { toolUseId: 't1', name, category, summary: 'summary', input },
    });
  }

  function endTool(output: unknown, isError = false): void {
    deliver({ type: 'toolCallEnd', payload: { toolUseId: 't1', output, isError } });
  }

  it('shows a command and its output as text, not as escaped JSON', () => {
    boot();
    startTool('run_command', 'shell', { command: 'ls -la' });
    endTool({ text: 'Exit code: 0\ntotal 16\ndrwxr-xr-x 6 siddhartha' });

    const blocks = Array.from(document.querySelectorAll('.tool-call__code')).map(
      (node) => node.textContent ?? '',
    );
    expect(blocks[0]).toBe('$ ls -la');
    expect(blocks[1]).toBe('total 16\ndrwxr-xr-x 6 siddhartha');
    expect(blocks[1]).not.toContain('\\n');
    expect(document.querySelector('.tool-call__exit')?.textContent).toBe('Exit status 0');
  });

  it('marks a non-zero exit status as a failure', () => {
    boot();
    startTool('run_command', 'shell', { command: 'pnpm test' });
    endTool({ text: 'Exit code: 1\n1 failing' }, true);

    const exit = document.querySelector('.tool-call__exit') as HTMLElement;
    expect(exit.textContent).toBe('Exit status 1');
    expect(exit.dataset['failed']).toBe('1');
  });

  it('shows a file read as its path plus a bounded snippet', () => {
    boot();
    startTool('read_file', 'filesystem', { path: 'src/app.ts' });
    endTool({ text: Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n') });

    expect(document.querySelector('.tool-call__path')?.textContent).toBe('src/app.ts');
    const snippet = document.querySelectorAll('.tool-call__code')[0]?.textContent ?? '';
    expect(snippet.split('\n')).toHaveLength(40);
    expect(document.querySelector('.tool-call__exit')?.textContent).toBe('20 more lines not shown');
  });

  it('shows a file edit as a diff summary with a way to open the diff', () => {
    const postMessage = boot();
    startTool('edit_file', 'filesystem', {
      path: 'src/app.ts',
      old_string: 'a\nb',
      new_string: 'a\nb\nc\nd',
    });

    expect(document.querySelector('.tool-call__path')?.textContent).toBe('src/app.ts');
    expect(document.querySelector('.tool-call__diffstat')?.textContent).toBe('+4 −2 lines');

    postMessage.mockClear();
    (document.querySelector('.tool-call__open-diff') as HTMLElement).click();
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'openToolDiff',
      payload: { path: 'src/app.ts' },
    });
  });

  it('keeps a newline a newline for a tool it has no special view for', () => {
    boot();
    startTool('mystery_tool', 'other', { note: 'first\nsecond' });

    expect(document.querySelector('.tool-call__payload')?.textContent).toBe('note:\nfirst\nsecond');
  });
});

describe('error detail disclosure', () => {
  it('opens on a click anywhere on the row, and closes again', () => {
    boot();
    deliver({
      type: 'error',
      payload: { headline: 'DeepSeek rejected the request.', detail: 'HTTP 400 bad request' },
    });

    const toggle = document.querySelector('.error-details-toggle') as HTMLElement;
    const body = document.querySelector('.error-detail-text') as HTMLElement;
    expect(toggle).toBeTruthy();
    expect(body.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    expect(body.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.textContent).toBe('HTTP 400 bad request');

    toggle.click();
    expect(body.hidden).toBe(true);
  });

  it('gives the disclosure a full row to be clicked on', () => {
    boot();
    const css = Array.from(document.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n');
    const rule = /\.error-details-toggle\s*\{[^}]*\}/u.exec(css);

    expect(rule).toBeTruthy();
    expect(rule![0]).toContain('width: 100%');
    expect(Number(/min-height:\s*(\d+)px/u.exec(rule![0])?.[1])).toBeGreaterThanOrEqual(28);
  });
});
