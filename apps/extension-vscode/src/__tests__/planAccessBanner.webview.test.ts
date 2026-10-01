/**
 * The meter banner names the account's plan from the billing catalog, so the
 * $200 plan reads "Max 20x" rather than a capitalised tier key, and the plan
 * that unlocks Managed Cloud in the editor comes from the shared capability
 * table instead of a list kept in the webview.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  canUseBillingPlanCapability,
} from '@agiworkforce/types';
import { fetchTierInfo, parseTierInfoResponse } from '../utils/api';
import { resolveUsageMeter } from '../data/usageMeter';
import { buildUsageMeterPayload } from '../features/sidebar-webview/ChatStateManager';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';
type ScanModule0 = typeof import('../utils/api');

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, fetchTierInfo: vi.fn() };
});

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const SECRETS = {} as vscode.SecretStorage;
const CLOUD_MODEL_CONTEXT = { modelId: 'fixture-cloud-model' };

const FIRST_DEVELOPER_PLAN = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find((tier) =>
  canUseBillingPlanCapability(tier, 'developer_surfaces'),
)!;

function usageSummary(planTier: string, subscriptionStatus: string) {
  return {
    plan_tier: planTier,
    subscription_status: subscriptionStatus,
    usage_percentage: 10,
    usage_reset_at: '2026-09-01T00:00:00.000Z',
  };
}

async function payloadFor(planTier: string, subscriptionStatus: string) {
  vi.mocked(fetchTierInfo).mockResolvedValue(
    parseTierInfoResponse(usageSummary(planTier, subscriptionStatus)),
  );
  const meter = await resolveUsageMeter(SECRETS, 0, CLOUD_MODEL_CONTEXT);
  return buildUsageMeterPayload(meter, false, NOW);
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
    value: () => vscodeApiStub({ postMessage: vi.fn() }),
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

function banner(): { text: string; action: string | undefined; button: string; collapsed: string } {
  const button = document.getElementById('upgradeBtn');
  return {
    text: document.getElementById('meterText')?.textContent ?? '',
    action: button?.dataset['action'],
    button: button?.textContent ?? '',
    collapsed: document.getElementById('meterCollapsedLabel')?.textContent ?? '',
  };
}

describe('plan access banner in the VS Code meter', () => {
  beforeEach(() => {
    vi.mocked(fetchTierInfo).mockReset();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('names the first plan with editor access from the capability table', async () => {
    const payload = await payloadFor('basic', 'active');

    expect(payload).toMatchObject({
      managedDeveloperEligible: false,
      accountPlanTier: 'basic',
      accountPlanLabel: BILLING_PLAN_PRICING.basic.label,
      accountPlanNeedsBilling: false,
      developerAccessPlanLabel: BILLING_PLAN_PRICING[FIRST_DEVELOPER_PLAN].label,
    });

    executeWebviewScript();
    postUsageMeter(payload);

    expect(banner()).toEqual({
      text: `${BILLING_PLAN_PRICING.basic.label} account · Managed developer access requires ${BILLING_PLAN_PRICING[FIRST_DEVELOPER_PLAN].label} or above`,
      action: 'upgrade',
      button: 'Upgrade',
      collapsed: 'Upgrade for Cloud',
    });
  });

  it('sends a paused Max 20x subscription to billing under its catalog name', async () => {
    const payload = await payloadFor('max_15x', 'past_due');

    expect(payload).toMatchObject({
      managedDeveloperEligible: false,
      accountPlanTier: 'max_15x',
      accountPlanLabel: 'Max 20x',
      accountPlanNeedsBilling: true,
    });

    executeWebviewScript();
    postUsageMeter(payload);

    expect(banner()).toEqual({
      text: 'Max 20x subscription needs attention · Managed Cloud paused',
      action: 'billing',
      button: 'Manage billing',
      collapsed: 'Billing needs attention',
    });
    expect(banner().text).not.toContain('max_15x');
    expect(banner().text).not.toContain('Max 15x');
  });

  it('shows no plan banner while the plan includes the editor', async () => {
    const payload = await payloadFor('max_15x', 'active');

    expect(payload.managedDeveloperEligible).toBe(true);

    executeWebviewScript();
    postUsageMeter(payload);

    expect(banner().text).not.toMatch(/needs attention|requires/u);
  });
});
