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
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
}

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
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

    expect(document.querySelector('.tool-call--error')).not.toBeNull();
    expect(document.querySelector('.tool-call-done')?.textContent).toContain(
      'Completed with errors',
    );
    expect(document.querySelector('.tool-call-done')?.textContent).not.toMatch(/\bDone\b/u);
    expect(document.head.textContent).toContain(
      '.tool-call-done--error {\n      color: var(--agi-vscode-danger);',
    );
  });

  it('keeps the concise Done footer when every action succeeds', () => {
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

    expect(document.querySelector('.tool-call-done')?.textContent).toContain('Done');
    expect(document.querySelector('.tool-call-done--error')).toBeNull();
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

    const stacks = Array.from(document.querySelectorAll('.tool-call-stack'));
    expect(stacks).toHaveLength(2);
    expect(stacks[0]?.querySelector('.tool-call-done')?.textContent).toContain(
      'Completed with errors',
    );
    expect(stacks[1]?.querySelector('.tool-call-done')?.textContent).toContain('Done');
    expect(stacks[1]?.querySelector('.tool-call-done--error')).toBeNull();
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

    expect(document.querySelector('.progress-event.tool-call--error')).not.toBeNull();
    expect(document.querySelector('.tool-call-done--error')?.textContent).toContain(
      'Completed with errors',
    );
  });
});
