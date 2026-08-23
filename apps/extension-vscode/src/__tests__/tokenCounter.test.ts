import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { TokenCounter } from '../data/tokenCounter';
import { MODEL_COST_RATES } from '../features/model-picker/modelConstants';
import { requireCatalogModel } from './catalogModelFixtures';

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
