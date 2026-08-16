/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function boot(): void {
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
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage: vi.fn() }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  new Function(inline?.textContent ?? '')();
}

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function activity(index = 0): HTMLElement {
  const groups = document.querySelectorAll<HTMLElement>('.activity-group');
  const group = groups.item(index);
  expect(group).not.toBeNull();
  return group;
}

function activityMeta(group: HTMLElement): string {
  return group.querySelector('.activity-group__meta')?.textContent ?? '';
}

describe('sidebar action status', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('shows live action counts while an activity group is working', () => {
    boot();
    post({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'tool-1',
        name: 'run_command',
        category: 'shell',
        summary: 'Run focused tests',
        input: { command: 'pnpm test' },
      },
    });

    const group = activity();
    expect(group.dataset.status).toBe('working');
    expect(group.classList.contains('activity-group--collapsed')).toBe(false);
    expect(group.querySelector('.activity-group__summary')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(activityMeta(group)).toContain('1 action');
    expect(activityMeta(group)).toContain('1 running');
    expect(activityMeta(group)).toContain('Run focused tests');

    post({
      type: 'toolCallEnd',
      payload: {
        toolUseId: 'tool-1',
        output: 'Tests failed',
        isError: true,
        elapsedMs: 1200,
      },
    });

    expect(group.dataset.status).toBe('working');
    expect(activityMeta(group)).toContain('1 action');
    expect(activityMeta(group)).toContain('1 error');
    expect(group.querySelector('.tool-call--error')).not.toBeNull();
  });

  it('does not label a turn Done after one of its tool actions failed', () => {
    boot();
    post({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'tool-1',
        name: 'run_command',
        category: 'shell',
        summary: 'Run focused tests',
        input: { command: 'pnpm test' },
      },
    });
    post({
      type: 'toolCallEnd',
      payload: {
        toolUseId: 'tool-1',
        output: 'Tests failed',
        isError: true,
        elapsedMs: 1200,
      },
    });
    post({ type: 'done', payload: {} });

    const group = activity();
    expect(group.querySelector('.tool-call--error')).not.toBeNull();
    expect(group.dataset.status).toBe('error');
    expect(activityMeta(group)).toContain('1 error');
    expect(activityMeta(group)).not.toMatch(/\bDone\b/u);
    expect(group.classList.contains('activity-group--collapsed')).toBe(true);
    expect(group.querySelector('.activity-group__summary')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('auto-collapses successful activity and lets the user reopen it', () => {
    boot();
    post({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'tool-1',
        name: 'read_file',
        category: 'filesystem',
        summary: 'Read source',
        input: { path: 'src/index.ts' },
      },
    });
    post({
      type: 'toolCallEnd',
      payload: { toolUseId: 'tool-1', output: 'ok', isError: false, elapsedMs: 20 },
    });
    post({ type: 'done', payload: {} });

    const group = activity();
    const summary = group.querySelector<HTMLButtonElement>('.activity-group__summary');
    expect(group.querySelector('.tool-call--done')).not.toBeNull();
    expect(group.dataset.status).toBe('done');
    expect(activityMeta(group)).toBe('1 action · Done');
    expect(group.classList.contains('activity-group--collapsed')).toBe(true);
    expect(summary?.getAttribute('aria-expanded')).toBe('false');

    summary?.click();

    expect(group.classList.contains('activity-group--collapsed')).toBe(false);
    expect(summary?.getAttribute('aria-expanded')).toBe('true');
    expect(activityMeta(group)).toBe('1 action · Done');
  });

  it('separates a terminally failed action stack from the next successful turn', () => {
    boot();
    post({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'failed-tool',
        name: 'run_command',
        category: 'shell',
        summary: 'Run focused tests',
        input: { command: 'pnpm test' },
      },
    });
    post({ type: 'error', payload: { message: 'The local developer turn failed.' } });

    post({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'successful-tool',
        name: 'read_file',
        category: 'filesystem',
        summary: 'Read source',
        input: { path: 'src/index.ts' },
      },
    });
    post({
      type: 'toolCallEnd',
      payload: {
        toolUseId: 'successful-tool',
        output: 'ok',
        isError: false,
        elapsedMs: 20,
      },
    });
    post({ type: 'done', payload: {} });

    const stacks = Array.from(document.querySelectorAll<HTMLElement>('.activity-group'));
    expect(stacks).toHaveLength(2);
    expect(stacks[0]?.dataset.status).toBe('error');
    expect(activityMeta(stacks[0]!)).toBe('1 action · Completed with errors');
    expect(stacks[0]?.classList.contains('activity-group--collapsed')).toBe(true);
    expect(stacks[1]?.dataset.status).toBe('done');
    expect(activityMeta(stacks[1]!)).toBe('1 action · Done');
    expect(stacks[1]?.querySelector('.tool-call--done')).not.toBeNull();
    expect(stacks[1]?.querySelector('.tool-call--error')).toBeNull();
  });

  it('summarizes a failed progress action as completed with errors', () => {
    boot();
    post({
      type: 'progressUpdate',
      payload: {
        progressId: 'progress-1',
        summary: 'Index workspace',
        detail: 'Indexing failed',
        status: 'failed',
      },
    });
    post({ type: 'done', payload: {} });

    const group = activity();
    expect(group.querySelector('.progress-event.tool-call--error')).not.toBeNull();
    expect(group.dataset.status).toBe('error');
    expect(activityMeta(group)).toBe('1 action · 1 error');
    expect(group.classList.contains('activity-group--collapsed')).toBe(true);
  });
});
