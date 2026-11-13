/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

function boot(postMessage = vi.fn()): void {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
    } as never,
    { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' } as never,
    'test-nonce-base64url-32-chars-abcdef',
    'plan',
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
    value: () => vscodeApiStub({ postMessage }),
  });
  const inline = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inline?.textContent ?? '')();
}

function sendPlan(plan: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: 'planUpdate', payload: plan } }),
  );
}

describe('VS Code sidebar plan visualization', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('updates one accessible checklist as plan status changes', () => {
    boot();
    sendPlan({
      explanation: 'Implement and verify.',
      plan: [
        { step: 'Inspect the flow', status: 'completed' },
        { step: 'Build the UI', status: 'in_progress' },
        { step: 'Run tests', status: 'pending' },
      ],
    });

    expect(document.querySelectorAll('.plan-card')).toHaveLength(1);
    expect(document.querySelector('.plan-card')?.getAttribute('aria-label')).toBe('Current plan');
    expect(document.querySelector('.plan-card__count')?.textContent).toBe('1/3 complete');
    expect(document.querySelector('.plan-card__explanation')?.textContent).toBe(
      'Implement and verify.',
    );
    expect(document.querySelector('.plan-card__step--in-progress')?.textContent).toContain(
      'Build the UI',
    );

    sendPlan({
      plan: [
        { step: 'Inspect the flow', status: 'completed' },
        { step: 'Build the UI', status: 'completed' },
        { step: 'Run tests', status: 'in_progress' },
      ],
    });

    expect(document.querySelectorAll('.plan-card')).toHaveLength(1);
    expect(document.querySelector('.plan-card__count')?.textContent).toBe('2/3 complete');
    expect(document.querySelectorAll('.plan-card__step--completed')).toHaveLength(2);
    expect(document.querySelector('.plan-card__step--in-progress')?.textContent).toContain(
      'Run tests',
    );
  });

  it('approves a plan into auto-accepted edits or asked edits, like Claude Code', () => {
    const postMessage = vi.fn();
    boot(postMessage);
    sendPlan({ plan: [{ step: 'Edit the store', status: 'pending' }] });

    const actions = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.plan-card .approval-card__action'),
    ).map((button) => button.textContent);
    expect(actions).toEqual([
      'Approve and auto-accept edits',
      'Approve and ask before edits',
      'Revise',
    ]);

    document.querySelectorAll<HTMLButtonElement>('.plan-card .approval-card__action')[1]?.click();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'planDecision',
        payload: { decision: 'approve', then: 'ask' },
      }),
    );
  });

  it('shows Stop for the turn the host starts after a plan is approved', () => {
    boot();
    const stop = document.getElementById('stopBtn');
    expect(stop?.classList.contains('visible')).toBe(false);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'addUserMessage',
          payload: { text: 'Go ahead with the plan.', startsTurn: true },
        },
      }),
    );

    expect(stop?.classList.contains('visible')).toBe(true);
  });

  it('opens the plan as a document from the plan card', () => {
    const postMessage = vi.fn();
    boot(postMessage);
    sendPlan({ plan: [{ step: 'Run tests', status: 'pending' }] });

    const open = document.querySelector<HTMLButtonElement>('.plan-card__open');
    expect(open?.getAttribute('aria-label')).toBe('Open the plan as a document');
    open?.click();

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'openPlanDocument' }));
  });
});
