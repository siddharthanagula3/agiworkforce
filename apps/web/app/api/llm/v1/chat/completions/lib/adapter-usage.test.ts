import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { StreamChunk } from '@agiworkforce/types';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';

function usageChunk(fields: Partial<StreamChunk>): StreamChunk {
  return { type: 'usage', ...fields } as StreamChunk;
}

describe('ingestUsageChunk — provider-reported cost', () => {
  it('carries a gateway-reported costUsd into providerReportedCostUsd', () => {
    const acc = createUsageAccumulator();

    ingestUsageChunk(acc, usageChunk({ inputTokens: 10, outputTokens: 2, costUsd: 0.0031 }));

    expect(acc.providerReportedCostUsd).toBe(0.0031);
  });

  it('prefers an explicit providerReportedCostUsd over costUsd when both are present', () => {
    const acc = createUsageAccumulator();

    ingestUsageChunk(
      acc,
      usageChunk({
        inputTokens: 10,
        outputTokens: 2,
        costUsd: 0.0031,
        providerReportedCostUsd: 0.0055,
      }),
    );

    expect(acc.providerReportedCostUsd).toBe(0.0055);
  });

  it('leaves providerReportedCostUsd unset when the provider reports no cost', () => {
    const acc = createUsageAccumulator();

    ingestUsageChunk(acc, usageChunk({ inputTokens: 10, outputTokens: 2 }));

    expect(acc.providerReportedCostUsd).toBeUndefined();
  });
});
