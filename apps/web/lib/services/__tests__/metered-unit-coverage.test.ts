import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

import { RATE_CARD_FEATURES, VISUAL_USAGE_OPERATION } from '@agiworkforce/types';
import {
  COGS_CAPABILITIES,
  COGS_UNIT_BASES,
  infrastructureRateCardFeature,
  resolveCogsCapability,
  resolveCogsUnits,
  resolveRetailCostCents,
  resolveTokenClassDimensions,
  type CogsCapability,
} from '@/lib/services/cogs-ledger-service';

/**
 * What each capability's own meter reads, and how much of it one unit is. A
 * capability added without an entry here fails the first case below, so this
 * table cannot fall behind the ledger it describes.
 */
const MEASUREMENT: Readonly<
  Record<CogsCapability, { usage: Record<string, unknown>; units: number }>
> = {
  chat: { usage: { totalTokens: 1_200 }, units: 1_200 },
  embedding: { usage: { totalTokens: 640 }, units: 640 },
  image: { usage: { outputCount: 3 }, units: 3 },
  video: { usage: { durationSecs: 12 }, units: 12 },
  transcription: { usage: { audioSeconds: 90 }, units: 1.5 },
  computer_use: { usage: { requests: 4 }, units: 4 },
  sandbox: { usage: { sandboxMinutes: 7 }, units: 7 },
  tool: { usage: { requests: 9 }, units: 9 },
  storage: { usage: { gibibyteMonths: 2.5 }, units: 2.5 },
  database: { usage: { computeSeconds: 30 }, units: 30 },
  vector: { usage: { requests: 6 }, units: 6 },
  notification: { usage: { requests: 2 }, units: 2 },
  email: { usage: { requests: 5 }, units: 5 },
  egress: { usage: { gibibytes: 0.25 }, units: 0.25 },
  browser: { usage: { computeMinutes: 18 }, units: 18 },
  work_compute: { usage: { computeMinutes: 45 }, units: 45 },
  code_compute: { usage: { computeMinutes: 11 }, units: 11 },
  connector: { usage: { requests: 8 }, units: 8 },
  artifact: { usage: { gibibyteMonths: 0.75 }, units: 0.75 },
  visual: { usage: { visualMinutes: 22 }, units: 22 },
};

/** Token counts loud enough that a meter reading them instead would be obvious. */
const LOUD_TOKENS = {
  totalTokens: 9_000_000,
  promptTokens: 4_000_000,
  inputTokens: 4_000_000,
  completionTokens: 5_000_000,
  outputTokens: 5_000_000,
  cacheReadTokens: 3_000_000,
  cacheWriteTokens: 2_000_000,
} as const;

function operationOf(capability: CogsCapability): string {
  return capability === 'visual' ? VISUAL_USAGE_OPERATION : capability;
}

function tokenBased(capability: CogsCapability): boolean {
  return resolveCogsUnits(capability, {}).unitBasis === 'token';
}

describe('every metered capability', () => {
  it('has a measurement of its own', () => {
    expect(Object.keys(MEASUREMENT).sort()).toEqual([...COGS_CAPABILITIES].sort());
  });

  it.each([...COGS_CAPABILITIES])('%s is reachable by name and declares a unit', (capability) => {
    expect(resolveCogsCapability({ operation: operationOf(capability) })).toBe(capability);
    expect(COGS_UNIT_BASES).toContain(resolveCogsUnits(capability, {}).unitBasis);
  });

  it.each([...COGS_CAPABILITIES])('%s counts what it measures', (capability) => {
    const { usage, units } = MEASUREMENT[capability];
    expect(resolveCogsUnits(capability, usage).units).toBe(units);
  });
});

describe('a unit that is not a token', () => {
  const nonToken = [...COGS_CAPABILITIES].filter((capability) => !tokenBased(capability));

  it('covers the media, voice, compute and tool work the platform sells', () => {
    expect(nonToken).toEqual(
      expect.arrayContaining([
        'image',
        'video',
        'transcription',
        'visual',
        'tool',
        'connector',
        'computer_use',
        'browser',
        'work_compute',
        'code_compute',
        'artifact',
      ]),
    );
  });

  it.each([...COGS_CAPABILITIES].filter((capability) => !tokenBased(capability)))(
    '%s ignores token counts standing beside its own measurement',
    (capability) => {
      const { usage, units } = MEASUREMENT[capability];
      expect(resolveCogsUnits(capability, { ...LOUD_TOKENS, ...usage }).units).toBe(units);
    },
  );

  it.each([...COGS_CAPABILITIES].filter((capability) => !tokenBased(capability)))(
    '%s is never priced by a token formula',
    (capability) => {
      const usage = { ...LOUD_TOKENS, ...MEASUREMENT[capability].usage };
      expect(
        resolveRetailCostCents({
          capability,
          provider: 'openai',
          model: 'fixture-model',
          usage,
          pricedAt: new Date('2026-09-21T00:00:00.000Z'),
        }),
      ).toBeNull();
      expect(
        resolveTokenClassDimensions({
          capability,
          provider: 'openai',
          model: 'fixture-model',
          usage,
          pricedAt: new Date('2026-09-21T00:00:00.000Z'),
        }),
      ).toEqual({
        cacheReadUnits: 0,
        cacheWriteUnits: 0,
        compactionSavedUnits: 0,
        cacheSavingsCents: 0,
        cacheWritePremiumCents: 0,
      });
    },
  );
});

describe('infrastructure a limit has to be able to count', () => {
  const INFRASTRUCTURE = [
    'storage',
    'database',
    'vector',
    'notification',
    'email',
    'egress',
    'browser',
    'work_compute',
    'code_compute',
    'connector',
    'artifact',
  ] as const;

  it('gives each one a rate-card feature nothing else shares', () => {
    const features = INFRASTRUCTURE.map((capability) => infrastructureRateCardFeature(capability));
    for (const feature of features) expect(RATE_CARD_FEATURES).toContain(feature);
    expect(new Set(features).size).toBe(features.length);
  });

  it('keeps what a user generated apart from what the platform stores for itself', () => {
    expect(infrastructureRateCardFeature('artifact')).not.toBe(
      infrastructureRateCardFeature('storage'),
    );
  });
});
