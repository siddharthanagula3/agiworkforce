import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => execDb }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/product-analytics', () => ({ trackMeteredCapability: vi.fn() }));
vi.mock('@/lib/services/enterprise-funding-organization', () => ({
  resolveEnterpriseFundingOrganizationId: vi.fn(async () => null),
}));

import { VISUAL_USAGE_FEATURE, VISUAL_USAGE_OPERATION } from '@agiworkforce/types';

import {
  recordVisualSessionCost,
  resolveCogsCapability,
  resolveCogsUnits,
  visualUsageFeatures,
} from '../cogs-ledger-service';

const execute = vi.fn(async (_sql: string, _params: unknown[] = []) => undefined);
const execDb = {
  query: vi.fn(async () => []),
  execute,
  transaction: vi.fn(),
} as never;

const COLUMN = {
  capability: 1,
  unitBasis: 4,
  units: 5,
  sourceRef: 8,
  metadata: 9,
  feature: 23,
  inputTokens: 26,
  outputTokens: 28,
} as const;

function insertedRow(call = 0): unknown[] {
  return execute.mock.calls[call]![1] ?? [];
}

beforeEach(() => {
  execute.mockClear();
});

describe('visual session cost events', () => {
  it('is metered as minutes and never as tokens', () => {
    const usage = {
      operation: VISUAL_USAGE_OPERATION,
      visualMinutes: 3,
      promptTokens: 4_000,
      completionTokens: 900,
    };
    const capability = resolveCogsCapability(usage);
    expect(capability).toBe('visual');
    expect(resolveCogsUnits(capability, usage)).toEqual({ unitBasis: 'minute', units: 3 });
  });

  it('settles a camera and a screen share as two distinct ledger lines', async () => {
    await recordVisualSessionCost({
      userId: 'user-1',
      sessionId: 'session-1',
      provider: 'agiworkforce',
      surface: 'web',
      usages: [
        { source: 'camera', capturedMs: 60_000, sampledFrames: 6, sentFrames: 2 },
        { source: 'screen', capturedMs: 150_000, sampledFrames: 9, sentFrames: 3 },
      ],
      db: execDb,
    });

    expect(execute).toHaveBeenCalledTimes(2);

    const camera = insertedRow(0);
    expect(camera[COLUMN.capability]).toBe('visual');
    expect(camera[COLUMN.unitBasis]).toBe('minute');
    expect(camera[COLUMN.units]).toBe(1);
    expect(camera[COLUMN.feature]).toBe(VISUAL_USAGE_FEATURE.camera);
    expect(camera[COLUMN.sourceRef]).toBe('visual_session:session-1:camera');

    const screen = insertedRow(1);
    expect(screen[COLUMN.units]).toBe(3);
    expect(screen[COLUMN.feature]).toBe(VISUAL_USAGE_FEATURE.screen);
    expect(screen[COLUMN.sourceRef]).toBe('visual_session:session-1:screen');
  });

  it('writes no token columns and carries the frame counts as evidence', async () => {
    await recordVisualSessionCost({
      userId: 'user-1',
      sessionId: 'session-2',
      provider: 'agiworkforce',
      usages: [{ source: 'camera', capturedMs: 30_000, sampledFrames: 4, sentFrames: 1 }],
      db: execDb,
    });

    const row = insertedRow(0);
    expect(row[COLUMN.inputTokens]).toBeNull();
    expect(row[COLUMN.outputTokens]).toBeNull();
    const metadata = JSON.parse(String(row[COLUMN.metadata])) as Record<string, unknown>;
    expect(metadata['operation']).toBe(VISUAL_USAGE_OPERATION);
    expect(metadata['visualSource']).toBe('camera');
    expect(metadata['sampledFrames']).toBe(4);
    expect(metadata['sentFrames']).toBe(1);
  });

  it('writes nothing for a session that never captured a frame', async () => {
    await recordVisualSessionCost({
      userId: 'user-1',
      sessionId: 'session-3',
      provider: 'agiworkforce',
      usages: [{ source: 'screen', capturedMs: 0, sampledFrames: 0, sentFrames: 0 }],
      db: execDb,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('names both features a usage limit has to count', () => {
    expect(visualUsageFeatures()).toEqual([
      VISUAL_USAGE_FEATURE.camera,
      VISUAL_USAGE_FEATURE.screen,
    ]);
  });
});
