import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
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
  credit_balance_cents: 1234,
  overage_enabled: true,
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

function creditRow(): HTMLLIElement | null {
  return document.querySelector<HTMLLIElement>('#meterBuckets .usage-credit-row');
}

describe('credit balance in the VS Code meter', () => {
  beforeEach(() => {
    vi.mocked(fetchTierInfo).mockReset();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('carries the published balance from the summary into the meter and payload', async () => {
    const { meter, payload } = await payloadFromServerSummary(RAW_USAGE_SUMMARY);

    expect(meter.creditBalanceCents).toBe(1234);
    expect(meter.overageEnabled).toBe(true);
    expect(payload.credits).toEqual({
      label: 'Credits',
      balanceLabel: '$12.34',
      spendabilityLabel: 'Spent when a limit stops you',
    });
  });

  it('renders the balance beside the per-limit rows', async () => {
    const { payload } = await payloadFromServerSummary(RAW_USAGE_SUMMARY);

    executeWebviewScript();
    postUsageMeter(payload);

    const row = creditRow();
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Credits');
    expect(row?.textContent).toContain('$12.34');
    expect(row?.textContent).toContain('Spent when a limit stops you');
    expect(document.getElementById('meterBuckets')?.style.display).toBe('block');
  });

  it('says a balance is unspendable while the account is not opted in', async () => {
    const { payload } = await payloadFromServerSummary({
      ...RAW_USAGE_SUMMARY,
      overage_enabled: false,
    });

    expect(payload.credits?.spendabilityLabel).toBe('Off - enable in billing to spend');

    executeWebviewScript();
    postUsageMeter(payload);

    expect(creditRow()?.textContent).toContain('Off - enable in billing to spend');
  });

  it('points an empty balance at buying credits instead of claiming headroom', async () => {
    const { payload } = await payloadFromServerSummary({
      ...RAW_USAGE_SUMMARY,
      credit_balance_cents: 0,
      overage_enabled: true,
    });

    expect(payload.credits).toEqual({
      label: 'Credits',
      balanceLabel: '$0.00',
      spendabilityLabel: 'Buy credits to work past a limit',
    });

    executeWebviewScript();
    postUsageMeter(payload);

    expect(creditRow()?.textContent).toContain('Buy credits to work past a limit');
  });

  it('claims no balance when the server publishes none', async () => {
    const {
      credit_balance_cents: _balance,
      overage_enabled: _overage,
      ...older
    } = RAW_USAGE_SUMMARY;
    const { meter, payload } = await payloadFromServerSummary(older);

    expect(meter.creditBalanceCents).toBeUndefined();
    expect(payload.credits).toBeNull();

    executeWebviewScript();
    postUsageMeter(payload);

    expect(creditRow()).toBeNull();
  });

  it('claims no balance on a BYOK boundary', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    const meter = await resolveUsageMeter(SECRETS, 0, CLOUD_MODEL_CONTEXT);
    const payload = buildUsageMeterPayload(meter, false, NOW);

    expect(payload.credits).toBeNull();

    executeWebviewScript();
    postUsageMeter(payload);

    expect(creditRow()).toBeNull();
    expect(document.getElementById('meterBuckets')?.style.display).toBe('none');
  });
});
