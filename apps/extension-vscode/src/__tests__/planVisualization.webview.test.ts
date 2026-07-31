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
    value: () => ({ postMessage: vi.fn() }),
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
});
