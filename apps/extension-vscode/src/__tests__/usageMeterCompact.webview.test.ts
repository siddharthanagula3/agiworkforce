/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { buildUsageMeterPayload } from '../features/sidebar-webview/ChatStateManager';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

const NOW = Date.parse('2026-08-15T12:00:00.000Z');

const METER = {
  remaining: 0.1,
  resetsAt: '2026-08-15T14:00:00.000Z',
  source: 'managed-plan' as const,
  managedDeveloperEligible: true,
  bindingBucket: 'session' as const,
  buckets: [
    { bucket: 'session' as const, percentRemaining: 10, resetAt: '2026-08-15T14:00:00.000Z' },
    { bucket: 'weekly' as const, percentRemaining: 60, resetAt: '2026-08-18T12:00:00.000Z' },
    { bucket: 'weeklyFlagship' as const, percentRemaining: 30, resetAt: null },
    { bucket: 'period' as const, percentRemaining: 75, resetAt: null },
  ],
  creditBalanceCents: 500,
  overageEnabled: true,
};

let posted: Array<{ type: string }> = [];

function mount(meterCollapsed: boolean): void {
  const html = getWebviewContent(
    {
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => uri.toString().replace(/^file:/, 'https://mock'),
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
    meterCollapsed,
    'max',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  posted = [];
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () =>
      vscodeApiStub({
        postMessage: (message: unknown) => {
          posted.push(message as { type: string });
        },
      }),
  });
  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'usageMeter', payload: buildUsageMeterPayload(METER, meterCollapsed, NOW) },
    }),
  );
}

describe('the usage meter in a default-width sidebar', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('is one line naming the most constrained limit until it is opened', () => {
    mount(true);

    const banner = document.getElementById('usageMeterBanner');
    const details = document.getElementById('meterBuckets');
    const toggle = document.getElementById('meterDetailsBtn');
    expect(banner?.style.display).toBe('flex');
    expect(document.getElementById('meterText')?.textContent).toContain(
      managedUsageBucketLabel('session'),
    );
    expect(details?.style.display).toBe('none');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('usageMeterCollapsed')).toBeNull();

    banner?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(details?.style.display).toBe('block');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(posted).toContainEqual(expect.objectContaining({ type: 'restoreUsageMeter' }));

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(details?.style.display).toBe('none');
    expect(banner?.style.display).toBe('flex');
    expect(posted).toContainEqual(expect.objectContaining({ type: 'dismissUsageMeter' }));
  });
});
