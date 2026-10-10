import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chargeMicrousdForProviderCost, getRoutingSlotModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule1 = typeof import('@/lib/voice/live-voice-backend-cost');
type ScanModule2 = typeof import('@/lib/server/claimed-user-scope-db');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  backendCost: vi.fn(),
  claimed: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
}));
vi.mock('@/lib/voice/live-voice-backend-cost', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordLiveVoiceBackendCost: (...args: unknown[]) => mocks.backendCost(...args),
}));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  createClaimedUserScopedDb: (...args: unknown[]) => mocks.claimed(...args),
}));

import {
  liveSessionChargeMicrousd,
  liveVoiceBlockChargeMicrousd,
  LIVE_VOICE_BLOCK_SECONDS,
} from '@/lib/voice/live-voice-billing';
import { priceLiveVoiceBackend } from '@/lib/voice/live-voice-backend-cost';
import { voiceReservationIdentity } from '../voice-session-budget';
import { settleAbandonedVoiceSessions, settleVoiceSession } from '../voice-session-settlement';
import type { VoiceSessionRecord } from '../voice-session-store';

const LIVE_MODEL = getRoutingSlotModel('voice_live');
const BACKEND = getRoutingSlotModel('voice_live_backend');
const BLOCK = liveVoiceBlockChargeMicrousd(LIVE_MODEL, BACKEND)!;

function record(
  spanSeconds: number,
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  const startedAt = Date.parse('2026-10-10T10:00:00.000Z');
  return {
    id: 'vs_1',
    userId: 'user-1',
    organizationId: null,
    conversationId: 'conv-1',
    provider: 'openai',
    providerSessionId: 'live_1',
    modelId: LIVE_MODEL,
    surface: 'web',
    voice: 'marin',
    language: null,
    pace: 1,
    activeTools: [],
    lastTurnId: null,
    status: 'closed',
    closeReason: 'close_requested',
    startedAt: new Date(startedAt).toISOString(),
    lastSeenAt: new Date(startedAt).toISOString(),
    closedAt: new Date(startedAt + spanSeconds * 1_000).toISOString(),
    ...overrides,
  };
}

function ledgerHolding(reservedMicrousd: number) {
  return {
    query: vi.fn(async (sql: string) =>
      sql.includes('from public.managed_usage_requests request')
        ? [
            {
              reserved_microusd: reservedMicrousd,
              extension_status: null,
              extension_microusd: null,
            },
          ]
        : [],
    ),
  };
}

function finalized(): Record<string, unknown> {
  return mocks.finalize.mock.calls.at(-1)![0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finalize.mockResolvedValue({});
  mocks.backendCost.mockResolvedValue(undefined);
});

describe('settleVoiceSession', () => {
  it('settles the minutes the record spans and the reported backend tokens, named by the record', async () => {
    const db = ledgerHolding(3 * BLOCK);
    const backend = { inputTokens: 4_000, outputTokens: 200 };

    const settlement = await settleVoiceSession({
      db: db as never,
      record: record(150),
      backendModelId: BACKEND,
      reason: 'close_requested',
      backend,
    });

    const backendCost = priceLiveVoiceBackend({
      provider: 'openai',
      backendModel: BACKEND,
      reported: backend,
    });
    expect(settlement.billedSeconds).toBe(150);
    expect(settlement.actualCostMicrousd).toBe(
      liveSessionChargeMicrousd(150, LIVE_MODEL)! +
        chargeMicrousdForProviderCost(backendCost.totalMicrousd),
    );
    expect(finalized()).toMatchObject({
      ...voiceReservationIdentity('vs_1'),
      userId: 'user-1',
      outcome: 'completed',
      actualCostMicrousd: settlement.actualCostMicrousd,
      estimatedCostMicrousd: 3 * BLOCK,
      usage: expect.objectContaining({ operation: 'voice_live_session', billedSeconds: 150 }),
    });
    expect(mocks.backendCost).toHaveBeenCalledWith(
      expect.objectContaining({ backendModel: BACKEND, reported: backend }),
    );
  });

  it('never bills past the blocks the session reserved', async () => {
    const settlement = await settleVoiceSession({
      db: ledgerHolding(2 * BLOCK) as never,
      record: record(600),
      backendModelId: BACKEND,
      reason: 'close_requested',
      backend: { inputTokens: 9_000_000, outputTokens: 9_000_000 },
    });

    expect(settlement.billedSeconds).toBe(2 * LIVE_VOICE_BLOCK_SECONDS);
    expect(settlement.actualCostMicrousd).toBe(2 * BLOCK);
  });
});

describe('settleAbandonedVoiceSessions', () => {
  it('closes a silent session a lease past its last check-in and settles it as its owner', async () => {
    const lastSeen = '2026-10-10T10:03:00.000Z';
    const abandoned = record(0, {
      status: 'closed',
      closeReason: 'expired',
      lastSeenAt: lastSeen,
      closedAt: '2026-10-10T10:13:00.000Z',
    });
    const owner = ledgerHolding(4 * BLOCK);
    mocks.claimed.mockReturnValue(owner);
    const db = {
      query: vi.fn(async (sql: string, _params?: unknown[]) =>
        sql.includes('update public.voice_sessions')
          ? [
              {
                id: abandoned.id,
                user_id: abandoned.userId,
                organization_id: null,
                conversation_id: abandoned.conversationId,
                provider: 'openai',
                provider_session_id: 'live_1',
                model_id: LIVE_MODEL,
                surface: 'web',
                voice: 'marin',
                language: null,
                pace: 1,
                active_tools: [],
                last_turn_id: null,
                status: 'closed',
                close_reason: 'expired',
                started_at: abandoned.startedAt,
                last_seen_at: lastSeen,
                closed_at: abandoned.closedAt,
              },
            ]
          : [],
      ),
    };

    const settled = await settleAbandonedVoiceSessions({
      db: db as never,
      userId: null,
      claimOwner: true,
      backendModelFor: async () => BACKEND,
    });

    expect(settled).toBe(1);
    const sweep = db.query.mock.calls[0]![0] as string;
    expect(sweep).toContain('least(now(), last_seen_at + make_interval(secs => $2))');
    expect((db.query.mock.calls[0]![1] as unknown[])[1]).toBe(600);
    expect(mocks.claimed).toHaveBeenCalledWith(db, { userId: 'user-1', organizationId: null });
    expect(finalized()).toMatchObject({
      ...voiceReservationIdentity('vs_1'),
      db: owner,
      outcome: 'completed',
      usage: expect.objectContaining({ billedSeconds: 4 * LIVE_VOICE_BLOCK_SECONDS }),
    });
  });
});
