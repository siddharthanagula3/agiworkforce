import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CREDITS_PER_USD, formatCredits } from '@agiworkforce/types';
import {
  TokenCounter,
  activateTokenCounter,
  formatBilledCredits,
  formatSessionCreditEstimate,
  getTokenCounter,
} from '../data/tokenCounter';
import { MODEL_COST_RATES } from '../features/model-picker/modelConstants';
import { fetchBilledCredits, type ManagedRequestCompletion } from '../utils/api';
import { requireCatalogModel } from './catalogModelFixtures';
import { ExtensionContext } from './__mocks__/vscode';
type ScanModule0 = typeof import('../utils/api');

const managedRequests = vi.hoisted(() => ({
  listeners: [] as Array<(completion: ManagedRequestCompletion) => void>,
}));

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  fetchBilledCredits: vi.fn(),
  onDidCompleteManagedRequest: (listener: (completion: ManagedRequestCompletion) => void) => {
    managedRequests.listeners.push(listener);
    return { dispose: () => undefined };
  },
}));

const SECRETS = {} as vscode.SecretStorage;
const DOLLAR_AMOUNT = /\$\s?\d/u;

function completeManagedRequest(completion: ManagedRequestCompletion): void {
  for (const listener of managedRequests.listeners) listener(completion);
}

function registeredCommand(id: string): () => Promise<void> {
  const registration = vi
    .mocked(vscode.commands.registerCommand)
    .mock.calls.find(([command]) => command === id);
  if (registration === undefined) throw new Error(`${id} was not registered`);
  return registration[1] as () => Promise<void>;
}

function statusBarOf(counter: TokenCounter): {
  text: string;
  tooltip: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
} {
  void counter;
  const created = vi.mocked(vscode.window.createStatusBarItem).mock.results;
  const last = created[created.length - 1]?.value;
  expect(last).toBeDefined();
  return last as ReturnType<typeof statusBarOf>;
}

describe('TokenCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing until a turn reports measured tokens', () => {
    const counter = new TokenCounter();
    const bar = statusBarOf(counter);

    expect(bar.show).not.toHaveBeenCalled();
    expect(bar.hide).toHaveBeenCalled();
    expect(bar.text).toBe('');
  });

  it('reports the session total without a context-window ratio', () => {
    const model = requireCatalogModel();
    const counter = new TokenCounter();
    const bar = statusBarOf(counter);

    counter.addMeasuredUsage(model.id, 41_200, 1_800);

    expect(bar.show).toHaveBeenCalled();
    expect(bar.text).toBe('$(pulse) Tokens: 43.0k');
    expect(bar.text).not.toContain('/');
    expect(bar.tooltip).not.toContain('%');
    expect(counter.totalTokens).toBe(43_000);
  });

  it('never renders a ratio a session total can exceed', () => {
    const model = requireCatalogModel();
    const counter = new TokenCounter();

    for (let turn = 0; turn < 40; turn++) counter.addMeasuredUsage(model.id, 30_000, 5_000);

    const bar = statusBarOf(counter);
    expect(counter.totalTokens).toBe(1_400_000);
    expect(bar.text).toBe('$(pulse) Tokens: 1.40M');
    expect(bar.text).not.toContain('/');
    expect(bar.tooltip).not.toContain('%');
  });

  it('does not accrue a fabricated cost for a model with no published rate', () => {
    const counter = new TokenCounter();

    counter.addMeasuredUsage('fixture-model-with-no-published-rate', 10_000, 10_000);

    expect(counter.estimatedCostUsd).toBe(0);
    expect(counter.unpricedRequestCount).toBe(1);
    expect(counter.requestCount).toBe(1);
    expect(statusBarOf(counter).tooltip).toContain('no published rate');
  });

  it('treats Auto routing as unpriced rather than billing the tier default', () => {
    const counter = new TokenCounter();
    expect(MODEL_COST_RATES['auto']).toBeDefined();

    counter.addMeasuredUsage('auto', 10_000, 10_000);

    expect(counter.estimatedCostUsd).toBe(0);
    expect(counter.unpricedRequestCount).toBe(1);
  });

  it('prices a catalog model from its published rate', () => {
    const model = requireCatalogModel();
    const rates = MODEL_COST_RATES[model.id];
    expect(rates).toBeDefined();
    const counter = new TokenCounter();

    counter.addMeasuredUsage(model.id, 1_000_000, 1_000_000);

    expect(counter.unpricedRequestCount).toBe(0);
    expect(counter.estimatedCostUsd).toBeCloseTo(rates!.input + rates!.output, 6);
  });

  it('hides the readout again after a reset', () => {
    const model = requireCatalogModel();
    const counter = new TokenCounter();
    const bar = statusBarOf(counter);

    counter.addMeasuredUsage(model.id, 1_000, 1_000);
    bar.hide.mockClear();

    counter.reset();

    expect(bar.hide).toHaveBeenCalled();
    expect(counter.totalTokens).toBe(0);
  });
});

describe('TokenCounter billed credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managedRequests.listeners.length = 0;
  });

  it('shows the credits a settled turn was billed before any tokens are measured', () => {
    const counter = new TokenCounter();
    const bar = statusBarOf(counter);

    counter.recordBilledRequest(2.5);

    expect(bar.show).toHaveBeenCalled();
    expect(bar.text).toBe('$(credit-card) Billed: 2.5 credits');
    expect(bar.tooltip).toContain('Billed this session: 2.5 credits');
    expect(bar.text).not.toMatch(DOLLAR_AMOUNT);
    expect(bar.tooltip).not.toMatch(DOLLAR_AMOUNT);
  });

  it('adds each settled turn and names a single credit in the singular', () => {
    const counter = new TokenCounter();

    counter.recordBilledRequest(0.4);
    counter.recordBilledRequest(0.6);

    expect(counter.billedRequests).toBe(2);
    expect(formatBilledCredits(counter)).toBe('1 credit');
  });

  it('says a turn whose settlement could not be read is not settled rather than free', () => {
    const counter = new TokenCounter();

    counter.recordBilledRequest(null);
    expect(formatBilledCredits(counter)).toBe('1 request not settled yet');

    counter.recordBilledRequest(1.25);
    expect(formatBilledCredits(counter)).toBe('1.25 credits (1 request not settled yet)');
    expect(statusBarOf(counter).text).toBe(
      '$(credit-card) Billed: 1.25 credits (1 request not settled yet)',
    );
  });

  it('settles deferred requests ten at a time, in the order they finished', async () => {
    const counter = new TokenCounter();
    const pending: Array<(credits: number | null) => void> = [];
    vi.mocked(fetchBilledCredits).mockImplementation(
      () => new Promise<number | null>((resolve) => pending.push(resolve)),
    );
    const requestIds = Array.from({ length: 12 }, (_, index) => `agi.vscode.chat.inline-${index}`);
    for (const requestId of requestIds) counter.queueBillingRequest(requestId);
    expect(counter.unsettledRequests).toBe(12);

    const settling = counter.settleQueuedBilling(SECRETS);
    await vi.waitFor(() => expect(fetchBilledCredits).toHaveBeenCalledTimes(10));
    pending.splice(0).forEach((resolve) => resolve(0.25));
    await vi.waitFor(() => expect(fetchBilledCredits).toHaveBeenCalledTimes(12));
    pending.splice(0).forEach((resolve) => resolve(0.25));
    await settling;

    expect(vi.mocked(fetchBilledCredits).mock.calls.map(([, requestId]) => requestId)).toEqual(
      requestIds,
    );
    expect(counter.billedRequests).toBe(12);
    expect(counter.billedCredits).toBeCloseTo(3, 10);
    expect(counter.unsettledRequests).toBe(0);
    expect(formatBilledCredits(counter)).toBe('3 credits');
  });

  it('keeps at most 200 requests waiting and reports the dropped ones as not settled', async () => {
    const counter = new TokenCounter();
    vi.mocked(fetchBilledCredits).mockResolvedValue(0.5);
    for (let index = 0; index < 205; index++) {
      counter.queueBillingRequest(`agi.vscode.chat.inline-${index}`);
    }

    expect(counter.unsettledRequests).toBe(205);
    await counter.settleQueuedBilling(SECRETS);

    expect(fetchBilledCredits).toHaveBeenCalledTimes(200);
    expect(vi.mocked(fetchBilledCredits).mock.calls[0]?.[1]).toBe('agi.vscode.chat.inline-5');
    expect(counter.billedRequests).toBe(200);
    expect(counter.unsettledRequests).toBe(5);
    expect(formatBilledCredits(counter)).toBe('100 credits (5 requests not settled yet)');
  });

  it('estimates a session in credits from published rates, never in dollars', () => {
    const model = requireCatalogModel();
    const rates = MODEL_COST_RATES[model.id]!;
    const counter = new TokenCounter();

    counter.addMeasuredUsage(model.id, 1_000_000, 1_000_000);

    expect(counter.estimatedCredits).toBeCloseTo((rates.input + rates.output) * CREDITS_PER_USD, 6);
    expect(formatSessionCreditEstimate(counter)).toBe(
      formatCredits(counter.estimatedCredits, { maximumFractionDigits: 2 }),
    );
    expect(statusBarOf(counter).tooltip).toContain(
      `Estimate: ${formatSessionCreditEstimate(counter)}`,
    );
    expect(statusBarOf(counter).tooltip).not.toMatch(DOLLAR_AMOUNT);
  });

  it('forgets billed and queued credits on reset', () => {
    const counter = new TokenCounter();
    counter.recordBilledRequest(4);
    counter.queueBillingRequest('agi.vscode.chat.inline-1');

    counter.reset();

    expect(counter.billedCredits).toBe(0);
    expect(counter.unsettledRequests).toBe(0);
    expect(formatBilledCredits(counter)).toBe('none yet');
    expect(statusBarOf(counter).hide).toHaveBeenCalled();
  });

  it('settles a chat turn at once and inline requests when the breakdown opens', async () => {
    const context = new ExtensionContext();
    activateTokenCounter(context as unknown as vscode.ExtensionContext);
    const counter = getTokenCounter();
    counter.reset();
    vi.mocked(fetchBilledCredits).mockResolvedValue(1.25);

    completeManagedRequest({ requestId: 'agi.vscode.chat.turn-1', billing: 'settle-now' });
    await vi.waitFor(() => expect(counter.billedRequests).toBe(1));
    expect(fetchBilledCredits).toHaveBeenCalledWith(context.secrets, 'agi.vscode.chat.turn-1');

    completeManagedRequest({ requestId: 'agi.vscode.chat.inline-1', billing: 'deferred' });
    expect(fetchBilledCredits).toHaveBeenCalledTimes(1);
    expect(counter.unsettledRequests).toBe(1);

    vi.mocked(fetchBilledCredits).mockResolvedValue(0.75);
    await registeredCommand('agi-workforce.showTokenBreakdown')();

    expect(fetchBilledCredits).toHaveBeenLastCalledWith(
      context.secrets,
      'agi.vscode.chat.inline-1',
    );
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls.at(-1)?.[0] as
      vscode.QuickPickItem[] | undefined;
    expect(items?.find((item) => item.label.includes('Billed Credits'))?.description).toBe(
      '2 credits',
    );
    expect(items?.find((item) => item.label.includes('Estimated Credits'))?.description).toBe(
      'none yet',
    );
    expect(items?.some((item) => DOLLAR_AMOUNT.test(item.description ?? ''))).toBe(false);
    counter.reset();
  });
});
