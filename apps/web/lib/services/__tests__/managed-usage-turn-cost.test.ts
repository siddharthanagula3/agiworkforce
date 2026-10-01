import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_RATE_CARD,
  chargeMicrousdForProviderCost,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/managed-usage-request-service');

vi.mock('server-only', () => ({}));

const finalizeManagedUsageRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  finalizeManagedUsageRequest,
}));

import type { ManagedUsageRequestReservation } from '@/lib/services/managed-usage-request-service';

import {
  accumulateObservedProviderUsage,
  addToolSpend,
  createObservedProviderUsage,
  finalizeObservedManagedUsage,
  mergeObservedProviderUsage,
  observedListLedgerMicrousd,
  observedProviderUsageLedgerMicrousd,
  observedTurnCost,
  priceServerToolUsage,
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
          observedListLedgerMicrousd(usage, pricing) + chargeMicrousdForProviderCost(fees),
        providerCostMicrousd: observedProviderUsageLedgerMicrousd(usage, pricing) + fees,
        usage: expect.objectContaining({ webSearchRequests: 2 }),
      }),
    );
  });
});
