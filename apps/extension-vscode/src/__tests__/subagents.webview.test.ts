/**
 * subagents.webview.test.ts, the subagent group under a developer session.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderWebview(): string {
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
}

function bootWebview() {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  return { postMessage };
}

function postHostMessage(type: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type, payload } }));
}

describe('subagent group', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  const tasks = [
    { id: 'subagent_a', parentSessionId: 't', title: 'Read the tests', state: 'running' },
    { id: 'subagent_b', parentSessionId: 't', title: 'Map the API', state: 'completed' },
    { id: 'subagent_c', parentSessionId: 't', title: 'Check the docs', state: 'failed' },
  ];

  it('stays hidden until a session ran subagents', () => {
    bootWebview();
    expect((document.getElementById('subagentsPanel') as HTMLDetailsElement).hidden).toBe(true);
  });

  it('counts the subagents and names each one’s state, open while one still runs', () => {
    bootWebview();
    postHostMessage('subagents', { tasks });

    const panel = document.getElementById('subagentsPanel') as HTMLDetailsElement;
    expect(panel.hidden).toBe(false);
    expect(panel.open).toBe(true);
    expect(document.getElementById('subagentsSummary')?.textContent).toBe(
      'Subagents (3) · 1 running · 1 done · 1 failed',
    );
    expect(
      Array.from(panel.querySelectorAll('.subagents__row')).map((row) => [
        row.querySelector('.subagents__title')?.textContent,
        row.querySelector('.subagents__state')?.textContent,
      ]),
    ).toEqual([
      ['Read the tests', 'Running'],
      ['Map the API', 'Done'],
      ['Check the docs', 'Failed'],
    ]);
  });

  it('folds once every subagent finished, and clears with the conversation', () => {
    bootWebview();
    postHostMessage('subagents', {
      tasks: [{ id: 'subagent_b', parentSessionId: 't', title: 'Map the API', state: 'completed' }],
    });
    const panel = document.getElementById('subagentsPanel') as HTMLDetailsElement;
    expect(panel.open).toBe(false);
    expect(panel.hidden).toBe(false);

    postHostMessage('conversationCleared', {});
    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('.subagents__row')).toHaveLength(0);
  });

  it('shows the group a resumed conversation carries', () => {
    bootWebview();
    postHostMessage('conversationLoaded', {
      threadId: 't',
      title: 'Fix the build',
      trustMode: 'local',
      transcriptTruncated: false,
      messages: [{ role: 'user', text: 'go' }],
      subagents: tasks,
    });
    expect((document.getElementById('subagentsPanel') as HTMLDetailsElement).hidden).toBe(false);
  });
});
