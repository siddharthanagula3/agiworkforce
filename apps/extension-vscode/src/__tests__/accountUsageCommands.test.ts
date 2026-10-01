import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  creditsFromCents,
  formatCredits,
  usageWorkloadLabel,
} from '@agiworkforce/types';
import { setupCommands, type CommandDeps } from '../core/commandSetup';
import { __resetSubsystemHealthForTests } from '../core/subsystemHealth';
import { getTokenCounter } from '../data/tokenCounter';
import { modelDisplayLabel } from '../features/model-picker/modelConstants';
import {
  fetchAccountIdentity,
  fetchTierInfo,
  fetchUsageHistory,
  getAccountToken,
  getCloudWebOrigin,
  type AccountIdentity,
  type TierInfo,
} from '../utils/api';
import type { UsageHistory } from '../protocol/apiResponses';
import { requireCatalogModel } from './catalogModelFixtures';
import { ExtensionContext } from './__mocks__/vscode';
type ScanModule0 = typeof import('../utils/api');

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getAccountToken: vi.fn(),
  fetchTierInfo: vi.fn(),
  fetchAccountIdentity: vi.fn(),
  fetchUsageHistory: vi.fn(),
}));

type Handler = (...args: unknown[]) => unknown;
type Item = vscode.QuickPickItem & { action?: string };

const DOLLAR_AMOUNT = /\$\s?\d/u;
const MODEL = requireCatalogModel();

const IDENTITY: AccountIdentity = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  accountType: 'Personal account',
  planName: 'Max 20x',
  tier: 'max_15x',
  subscriptionStatus: 'active',
  subscriptionSource: 'stripe',
};

const TIER_INFO: TierInfo = {
  tier: 'max_15x',
  subscriptionStatus: 'active',
  creditBalanceCents: 1234,
  overageEnabled: true,
  credits: {
    monthly: { allowance: 20_000, used: 4_000, remaining: 16_000, reset_at: null },
    weekly: { allowance: 5_000, used: 1_250, remaining: 3_750, reset_at: null },
    five_hour: { allowance: 1_000, used: 10, remaining: 990, reset_at: null },
    flagship_weekly: { allowance: 1_500, used: 1_500, remaining: 0, reset_at: null },
    purchased: { remaining: 2_468, overage_enabled: true },
  },
};

const HISTORY: UsageHistory = {
  from: '2026-08-28T00:00:00.000Z',
  to: '2026-09-27T00:00:00.000Z',
  granularity: 'day',
  totals: { requests: 42, credits: 812.5 },
  periods: [
    { start: '2026-09-25T00:00:00.000Z', requests: 12, credits: 300 },
    { start: '2026-09-26T00:00:00.000Z', requests: 30, credits: 512.5 },
  ],
  byWorkload: [
    { key: 'chat', label: null, requests: 30, credits: 500 },
    { key: 'code', label: null, requests: 12, credits: 312.5 },
  ],
  byModel: [{ key: MODEL.id, label: null, requests: 42, credits: 812.5 }],
  freshness: { unsettledRequests: 2 },
};

function registerHandlers(context: ExtensionContext): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: Handler) => {
    handlers.set(id, handler);
    return new vscode.Disposable(() => undefined);
  }) as never);
  const unused = new Proxy({}, { get: () => vi.fn() });
  setupCommands(
    context as unknown as vscode.ExtensionContext,
    {
      sidebarProvider: unused,
      conversationTreeProvider: unused,
      localRuntimes: unused,
      contextPanelProvider: unused,
      memoryTreeProvider: unused,
      diffDecorationProvider: unused,
      diagnosticsProvider: unused,
      nativeChatAvailable: false,
    } as unknown as CommandDeps,
  );
  return handlers;
}

function lastQuickPickItems(): Item[] {
  const call = vi.mocked(vscode.window.showQuickPick).mock.calls.at(-1);
  if (call === undefined) throw new Error('no quick pick was shown');
  return call[0] as Item[];
}

function descriptionOf(items: Item[], label: string): string | undefined {
  return items.find((item) => item.label === label)?.description;
}

describe('account usage in the editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    getTokenCounter().reset();
    vi.mocked(getAccountToken).mockResolvedValue('account-token');
    vi.mocked(fetchAccountIdentity).mockResolvedValue(IDENTITY);
    vi.mocked(fetchTierInfo).mockResolvedValue(TIER_INFO);
    vi.mocked(fetchUsageHistory).mockResolvedValue({ kind: 'ready', history: HISTORY });
  });

  it('states every plan window, the balance and the history in credits', async () => {
    const handlers = registerHandlers(new ExtensionContext());

    await handlers.get('agi-workforce.showAccountUsage')?.();

    const items = lastQuickPickItems();
    const labels = items.map((item) => item.label);
    expect(labels).toContain('Max 20x plan usage');
    expect(labels).toContain('$(pulse) Current session: Used 10 of 1,000 credits · 990 left');
    expect(labels).toContain('$(pulse) Most capable models: Used 1,500 of 1,500 credits · 0 left');
    expect(labels).toContain(
      `$(credit-card) Credits: ${formatCredits(creditsFromCents(TIER_INFO.creditBalanceCents!))}`,
    );
    expect(descriptionOf(items, '$(graph) Total: 812.5 credits')).toBe('42 requests');
    expect(labels).toContain('$(sync) 2 turns are still settling and not counted yet');
    for (const item of items) {
      expect(`${item.label} ${item.description ?? ''}`).not.toMatch(DOLLAR_AMOUNT);
    }
  });

  it('breaks settled credits down by product area before the model breakdown', async () => {
    const handlers = registerHandlers(new ExtensionContext());

    await handlers.get('agi-workforce.showAccountUsage')?.();

    const items = lastQuickPickItems();
    const labels = items.map((item) => item.label);
    const productArea = labels.indexOf('By product area');
    const byModel = labels.indexOf('By model');
    expect(productArea).toBeGreaterThan(-1);
    expect(byModel).toBeGreaterThan(productArea);
    expect(labels.slice(productArea + 1, byModel)).toEqual([
      `$(briefcase) ${usageWorkloadLabel('chat')}`,
      `$(briefcase) ${usageWorkloadLabel('code')}`,
    ]);
    expect(descriptionOf(items, `$(briefcase) ${usageWorkloadLabel('code')}`)).toBe(
      '312.5 credits · 12 requests',
    );
    expect(descriptionOf(items, `$(symbol-namespace) ${modelDisplayLabel(MODEL.id)}`)).toBe(
      '812.5 credits · 42 requests',
    );
  });

  it('says why the history is missing instead of showing an empty breakdown', async () => {
    vi.mocked(fetchUsageHistory).mockResolvedValue({
      kind: 'unavailable',
      reason: 'AGI Cloud returned usage history this editor cannot read.',
    });
    const handlers = registerHandlers(new ExtensionContext());

    await handlers.get('agi-workforce.showAccountUsage')?.();

    const items = lastQuickPickItems();
    expect(descriptionOf(items, '$(warning) Usage history unavailable')).toBe(
      'AGI Cloud returned usage history this editor cannot read.',
    );
    expect(items.map((item) => item.label)).not.toContain('By product area');
  });

  it('opens the plan comparison from the account menu', async () => {
    const handlers = registerHandlers(new ExtensionContext());
    vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((async (items: Item[]) =>
      items.find((item) => item.action === 'compare-plans')) as never);

    await handlers.get('agi-workforce.showAccountUsage')?.();

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('agi-workforce.comparePlans');
  });
});

describe('compare plans command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubsystemHealthForTests();
    vi.mocked(fetchAccountIdentity).mockResolvedValue(IDENTITY);
  });

  it("marks the account's plan and states what each plan adds over it", async () => {
    const handlers = registerHandlers(new ExtensionContext());

    await handlers.get('agi-workforce.comparePlans')?.();

    const items = lastQuickPickItems();
    const current = items.find((item) => item.label === '$(check) Max 20x');
    expect(current?.description).toMatch(/^Your plan · /u);
    expect(items.find((item) => item.label === 'Enterprise')?.detail).toBe(
      `Adds over Max 20x: ${BILLING_PLAN_CAPABILITY_LABELS.team_admin}, ${BILLING_PLAN_CAPABILITY_LABELS.enterprise_controls}`,
    );
    expect(items.find((item) => item.label === 'Pro')?.detail).toBe('No features beyond Max 20x');
  });

  it('falls back to the cached plan when the account cannot be read', async () => {
    vi.mocked(fetchAccountIdentity).mockResolvedValue(undefined);
    const context = new ExtensionContext();
    await context.globalState.update('tierStatus.cachedTier', 'pro');
    const handlers = registerHandlers(context);

    await handlers.get('agi-workforce.comparePlans')?.();

    expect(lastQuickPickItems().some((item) => item.label === '$(check) Pro')).toBe(true);
  });

  it('opens web pricing for prices and checkout', async () => {
    const handlers = registerHandlers(new ExtensionContext());
    vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((async (items: Item[]) =>
      items.find((item) => item.label.endsWith('Compare prices and upgrade on Web'))) as never);

    await handlers.get('agi-workforce.comparePlans')?.();

    expect(vi.mocked(vscode.env.openExternal).mock.calls[0]?.[0].toString()).toBe(
      `${getCloudWebOrigin()}/pricing?from=vscode-extension-plans`,
    );
  });
});
