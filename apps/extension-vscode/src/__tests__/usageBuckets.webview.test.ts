import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { managedUsageBucketLabel } from '@agiworkforce/types';
import { fetchTierInfo, parseTierInfoResponse } from '../utils/api';
import { resolveUsageMeter } from '../data/usageMeter';
import { buildUsageMeterPayload } from '../features/sidebar-webview/ChatStateManager';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return { ...actual, fetchTierInfo: vi.fn() };
});

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const SECRETS = {} as vscode.SecretStorage;
const CLOUD_MODEL_CONTEXT = { modelId: 'fixture-cloud-model' };

const RAW_USAGE_SUMMARY = {
  plan_tier: 'max',
  usage_percentage: 25,
  usage_reset_at: '2026-09-01T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-08-01T00:00:00.000Z',
  period_end: '2026-09-01T00:00:00.000Z',
  subscription_status: 'active',
  session_usage_percentage: 90,
  session_reset_at: '2026-08-15T14:00:00.000Z',
  weekly_usage_percentage: 40,
  weekly_reset_at: '2026-08-18T12:00:00.000Z',
  flagship_weekly_usage_percentage: 70,
  flagship_weekly_reset_at: '2026-08-17T12:00:00.000Z',
};

async function payloadFromServerSummary(raw: unknown) {
  vi.mocked(fetchTierInfo).mockResolvedValue(parseTierInfoResponse(raw));
  const meter = await resolveUsageMeter(SECRETS, 0, CLOUD_MODEL_CONTEXT);
  return { meter, payload: buildUsageMeterPayload(meter, false, NOW) };
}

function renderWebview(): string {
  return getWebviewContent(
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
    false,
    'max',
  );
}

function executeWebviewScript(): void {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage: vi.fn() }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
}

function postUsageMeter(payload: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'usageMeter', payload } }));
}

function bucketRows(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>('#meterBuckets .usage-bucket-row'));
}

describe('per-limit usage breakdown in the VS Code meter', () => {
  beforeEach(() => {
    vi.mocked(fetchTierInfo).mockReset();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('carries every published limit and its own reset time into the payload', async () => {
    const { meter, payload } = await payloadFromServerSummary(RAW_USAGE_SUMMARY);

    expect(meter.source).toBe('managed-plan');
    expect(meter.hasUsageRemaining).toBe(true);
    expect(payload.buckets.map((row) => row.label)).toEqual([
      managedUsageBucketLabel('session'),
      managedUsageBucketLabel('weekly'),
      managedUsageBucketLabel('weeklyFlagship'),
      managedUsageBucketLabel('period'),
    ]);
    expect(payload.buckets.map((row) => row.remainingLabel)).toEqual([
      '10% left',
      '60% left',
      '30% left',
      '75% left',
    ]);
    expect(payload.buckets.map((row) => row.resetsIn)).toEqual([
      'Resets in 2 hours',
      'Resets in 3 days',
      'Resets in 2 days',
      'Resets in 17 days',
    ]);
    expect(payload.bucketsEmptyLabel).toBeNull();
  });

  it('headlines the limit that binds first rather than the billing period', async () => {
    const { meter, payload } = await payloadFromServerSummary(RAW_USAGE_SUMMARY);

    expect(meter.bindingBucket).toBe('session');
    expect(meter.remaining).toBeCloseTo(0.1, 5);
    expect(payload.usageLabel).toBe(`${managedUsageBucketLabel('session')} - 10% left`);
    expect(payload.resetsIn).toBe('Resets in 2 hours');
    expect(payload.showUpgrade).toBe(true);
    expect(payload.buckets.filter((row) => row.binding).map((row) => row.label)).toEqual([
      managedUsageBucketLabel('session'),
    ]);
  });

  it('renders one row per limit in the webview', async () => {
    const { payload } = await payloadFromServerSummary(RAW_USAGE_SUMMARY);

    executeWebviewScript();
    postUsageMeter(payload);

    const rows = bucketRows();
    expect(rows).toHaveLength(4);
    expect(document.getElementById('meterBuckets')?.style.display).toBe('block');
    expect(rows[0]?.classList.contains('binding')).toBe(true);
    expect(rows[0]?.textContent).toContain(managedUsageBucketLabel('session'));
    expect(rows[0]?.textContent).toContain('10% left');
    expect(rows[0]?.textContent).toContain('Resets in 2 hours');
    expect(rows[3]?.textContent).toContain(managedUsageBucketLabel('period'));
    expect(rows[3]?.textContent).toContain('75% left');
    expect(rows[3]?.classList.contains('binding')).toBe(false);
  });

  it('shows an explicit empty state when the summary cannot be read', () => {
    const payload = buildUsageMeterPayload(
      { remaining: null, resetsAt: null, source: 'managed-plan' },
      false,
      NOW,
    );

    expect(payload.bucketsEmptyLabel).toBe('Per-limit breakdown unavailable');

    executeWebviewScript();
    postUsageMeter(payload);

    const rows = bucketRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toBe('Per-limit breakdown unavailable');
  });

  it('claims no managed limits on a BYOK boundary', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    const meter = await resolveUsageMeter(SECRETS, 0, CLOUD_MODEL_CONTEXT);
    const payload = buildUsageMeterPayload(meter, false, NOW);

    expect(payload.buckets).toEqual([]);
    expect(payload.bucketsEmptyLabel).toBeNull();

    executeWebviewScript();
    postUsageMeter(payload);

    expect(bucketRows()).toHaveLength(0);
    expect(document.getElementById('meterBuckets')?.style.display).toBe('none');
  });
});
