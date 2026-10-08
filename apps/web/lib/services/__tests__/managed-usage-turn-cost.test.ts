import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_RATE_CARD,
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/managed-usage-request-service');

vi.mock('server-only', () => ({}));

const finalizeManagedUsageRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  finalizeManagedUsageRequest,
}));

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import type { ManagedUsageRequestReservation } from '@/lib/services/managed-usage-request-service';

import {
  accumulateObservedProviderUsage,
  addToolSpend,
  createObservedProviderUsage,
  finalizeObservedManagedUsage,
  mergeObservedProviderUsage,
  observedProviderUsageLedgerMicrousd,
  observedTurnCost,
  priceServerToolUsage,
  type ObservedProviderUsage,
} from '../managed-usage-accounting-service';

const ANTHROPIC_SEARCH_MICROUSD = FEATURE_RATE_CARD.web_search_anthropic
  .providerCogsMicrousd as number;
const OPENAI_SEARCH_MICROUSD = FEATURE_RATE_CARD.web_search_openai.providerCogsMicrousd as number;
const OPENAI_SESSION_MICROUSD = FEATURE_RATE_CARD.hosted_code_execution_openai_session
  .providerCogsMicrousd as number;
const OPENAI_MODEL = requireProviderDefaultModel('openai');
const ANTHROPIC_MODEL = requireProviderDefaultModel('anthropic');

const reservation = {
  db: { query: vi.fn() },
  userId: 'user-1',
  idempotencyKey: 'agi.chat.web.send.turn-1',
  requestHash: 'hash-1',
  leaseToken: 'lease-1',
  estimatedCostMicrousd: 5_000_000,
  estimatedCostCents: 500,
} as unknown as ManagedUsageRequestReservation;

beforeEach(() => {
  finalizeManagedUsageRequest.mockReset();
  finalizeManagedUsageRequest.mockResolvedValue({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: 1,
  });
});

describe('priceServerToolUsage', () => {
  it('prices native web searches at the provider rate and charges two credits each', () => {
    const charge = priceServerToolUsage({ provider: 'anthropic', webSearchRequests: 3 });

    expect(charge.providerMicrousd).toBe(3 * ANTHROPIC_SEARCH_MICROUSD);
    expect(charge.chargeMicrousd).toBe(
      chargeMicrousdForProviderCost(3 * ANTHROPIC_SEARCH_MICROUSD),
    );
    expect(charge.chargeMicrousd / 5_000).toBe(6);
  });

  it('adds a hosted code execution session to the searches and charges the rounded total', () => {
    const charge = priceServerToolUsage({
      provider: 'OpenAI',
      webSearchRequests: 2,
      hostedCodeExecution: {
        provider: 'openai',
        requests: 1,
        containerIds: ['cntr_1'],
        elapsedMs: 0,
      },
    });

    const providerMicrousd = 2 * OPENAI_SEARCH_MICROUSD + OPENAI_SESSION_MICROUSD;
    expect(charge).toEqual({
      providerMicrousd,
      chargeMicrousd: chargeMicrousdForProviderCost(providerMicrousd),
    });
  });

  it('prices no fee for a native web fetch or for a provider without native tools', () => {
    expect(priceServerToolUsage({ provider: 'anthropic', webFetchRequests: 4 })).toEqual({
      providerMicrousd: 0,
      chargeMicrousd: 0,
    });
    expect(priceServerToolUsage({ provider: 'google', webSearchRequests: 4 })).toEqual({
      providerMicrousd: 0,
      chargeMicrousd: 0,
    });
  });
});

describe('the observed cost of a turn', () => {
  function observedOpenAiTurn() {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      usage,
      {
        inputTokens: 2_000,
        outputTokens: 500,
        webSearchRequests: 3,
        codeExecutionContainerIds: ['cntr_1'],
        elapsedMs: 60_000,
      },
      { provider: 'openai', model: OPENAI_MODEL },
    );
    return usage;
  }

  it('carries native searches and billable containers from each provider call', () => {
    const usage = observedOpenAiTurn();

    expect(usage.webSearchRequests).toBe(3);
    expect(usage.hostedCodeExecution).toEqual({
      provider: 'openai',
      requests: 0,
      containerIds: ['cntr_1'],
      elapsedMs: 60_000,
    });
  });

  it('keeps no container fee the dynamic-filtering web tool already includes', () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      usage,
      {
        inputTokens: 1_000,
        outputTokens: 100,
        codeExecutionRequests: 2,
        dynamicFilteringWebTool: true,
      },
      { provider: 'anthropic', model: ANTHROPIC_MODEL },
    );

    expect(usage.hostedCodeExecution).toBeUndefined();
    expect(
      observedTurnCost(usage, { provider: 'anthropic', model: ANTHROPIC_MODEL }).toolMicrousd,
    ).toBe(0);
  });

  it('puts searches, containers and tool spend beside the tokens in the turn cost', () => {
    const usage = observedOpenAiTurn();
    addToolSpend(usage, 7_000);
    const pricing = { provider: 'openai', model: OPENAI_MODEL };

    const cost = observedTurnCost(usage, pricing);

    expect(cost.tokenMicrousd).toBe(observedProviderUsageLedgerMicrousd(usage, pricing));
    expect(cost.tokenMicrousd).toBeGreaterThan(0);
    expect(cost.toolMicrousd).toBe(3 * OPENAI_SEARCH_MICROUSD + OPENAI_SESSION_MICROUSD + 7_000);
  });

  it('keeps every fee when durable receipts are merged back into one turn', () => {
    const merged = createObservedProviderUsage();
    mergeObservedProviderUsage(merged, observedOpenAiTurn());
    const second = observedOpenAiTurn();
    addToolSpend(second, 2_500);
    mergeObservedProviderUsage(merged, second);

    expect(merged.webSearchRequests).toBe(6);
    expect(merged.hostedCodeExecution?.containerIds).toEqual(['cntr_1']);
    expect(merged.hostedCodeExecution?.elapsedMs).toBe(120_000);
    expect(merged.toolSpendMicrousd).toBe(2_500);
  });

  it('never counts negative or non-finite tool spend', () => {
    const usage = createObservedProviderUsage();
    addToolSpend(usage, -50);
    addToolSpend(usage, Number.NaN);

    expect(usage.toolSpendMicrousd).toBeUndefined();
  });
});

describe('finalizeObservedManagedUsage', () => {
  it('charges tokens at list plus the rounded native tool fees, and records both at provider cost', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      usage,
      { inputTokens: 2_000, outputTokens: 500, webSearchRequests: 2 },
      { provider: 'openai', model: OPENAI_MODEL },
    );
    const pricing = { provider: 'openai', model: OPENAI_MODEL };
    const fees = 2 * OPENAI_SEARCH_MICROUSD;

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'openai',
      model: OPENAI_MODEL,
      usage,
      reason: 'tool_loop_completed',
    });

    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed',
        actualCostMicrousd:
          listMicrousd(OPENAI_MODEL, { promptTokens: 2_000, completionTokens: 500 }) +
          chargeMicrousdForProviderCost(fees),
        providerCostMicrousd: observedProviderUsageLedgerMicrousd(usage, pricing) + fees,
        usage: expect.objectContaining({ webSearchRequests: 2 }),
      }),
    );
  });
});

function listMicrousd(
  model: string,
  tokens: { promptTokens: number; completionTokens: number },
): number {
  const microusd = LLMCostCalculator.calculateListCostMicrousd(model, {
    ...tokens,
    totalTokens: tokens.promptTokens + tokens.completionTokens,
    reasoningTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
  });
  if (microusd === null) throw new Error(`Expected a catalog list price for ${model}`);
  return microusd;
}

async function settledMicrousd(model: string, usage: ObservedProviderUsage): Promise<number> {
  await finalizeObservedManagedUsage({
    reservation,
    provider: 'open_router',
    model,
    usage,
    reason: 'tool_loop_completed',
  });
  return finalizeManagedUsageRequest.mock.calls.at(-1)?.[0].actualCostMicrousd;
}

describe('the list price an agent turn settles at', () => {
  const servedRoute = { provider: 'open_router', model: ANTHROPIC_MODEL };

  it('settles one call at the catalog list price in microUSD', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 1_000, outputTokens: 100 }, servedRoute);

    const expected = listMicrousd(ANTHROPIC_MODEL, { promptTokens: 1_000, completionTokens: 100 });
    const metadata = getModelMetadataById(ANTHROPIC_MODEL);
    if (!metadata) throw new Error('Expected catalog metadata for the default model');

    const perMillionTimesTokens = 1_000 * metadata.inputCost + 100 * metadata.outputCost;

    expect(await settledMicrousd(ANTHROPIC_MODEL, usage)).toBe(expected);
    expect(Math.abs(expected - perMillionTimesTokens)).toBeLessThanOrEqual(1);
  });

  it('settles a sub-cent call below one cent rather than at a cent floor', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 10, outputTokens: 1 }, servedRoute);

    const settled = await settledMicrousd(ANTHROPIC_MODEL, usage);

    expect(settled).toBe(listMicrousd(ANTHROPIC_MODEL, { promptTokens: 10, completionTokens: 1 }));
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThan(10_000);
  });

  it('sums each observed call of a multi-call turn at its own list price', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 1_000, outputTokens: 100 }, servedRoute);
    accumulateObservedProviderUsage(usage, { inputTokens: 3_000, outputTokens: 400 }, servedRoute);

    expect(await settledMicrousd(ANTHROPIC_MODEL, usage)).toBe(
      listMicrousd(ANTHROPIC_MODEL, { promptTokens: 1_000, completionTokens: 100 }) +
        listMicrousd(ANTHROPIC_MODEL, { promptTokens: 3_000, completionTokens: 400 }),
    );
  });

  it('prices the aggregate at list when the calls were not individually observed', async () => {
    const usage = createObservedProviderUsage();
    usage.providerCalls = 2;
    usage.inputTokens = 4_000;
    usage.outputTokens = 500;

    expect(await settledMicrousd(ANTHROPIC_MODEL, usage)).toBe(
      listMicrousd(ANTHROPIC_MODEL, { promptTokens: 4_000, completionTokens: 500 }),
    );
  });

  it('settles a model with no published list sheet at its recorded route cost', async () => {
    const unlistedModel = 'fixture-unlisted-model';
    const usage: ObservedProviderUsage = {
      ...createObservedProviderUsage(),
      providerCalls: 1,
      inputTokens: 1_000,
      outputTokens: 100,
      providerCallObservations: [
        {
          inputTokens: 1_000,
          outputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          reasoningTokens: 0,
          provider: 'open_router',
          model: unlistedModel,
          costDollars: 0.0123,
        },
      ],
    };

    expect(
      LLMCostCalculator.calculateListCostMicrousd(unlistedModel, {
        promptTokens: 1_000,
        completionTokens: 100,
        totalTokens: 1_100,
      }),
    ).toBeNull();
    expect(await settledMicrousd(unlistedModel, usage)).toBe(12_300);
  });
});
