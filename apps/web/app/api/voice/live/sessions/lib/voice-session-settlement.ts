import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { chargeMicrousdForProviderCost, getModelMetadataById } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { settleFreeVoiceSeconds } from '@/lib/voice/free-voice-allowance';
import {
  LIVE_SESSION_PROVIDER_COST_SOURCE,
  LIVE_VOICE_BLOCK_SECONDS,
  LIVE_VOICE_FEATURE,
  LIVE_VOICE_LEASE_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionProviderCostMicrousd,
  liveVoiceBlockChargeMicrousd,
} from '@/lib/voice/live-voice-billing';
import {
  priceLiveVoiceBackend,
  recordLiveVoiceBackendCost,
  type LiveVoiceBackendUsage,
} from '@/lib/voice/live-voice-backend-cost';
import { readVoiceReservation, voiceReservationIdentity } from './voice-session-budget';
import {
  closeExpiredVoiceSessions,
  meteredVoiceSessionSeconds,
  type VoiceSessionRecord,
} from './voice-session-store';

export interface VoiceSettlement {
  billedSeconds: number;
  actualCostMicrousd: number;
}

/**
 * Settles a closed session's reservation at what it used: the seconds its own
 * record spans, up to the blocks it reserved, and the backend usage its tab
 * reported, priced at the backend the server chose. Never more than was
 * reserved, so a session cannot spend past the budget it was admitted on.
 */
export async function settleVoiceSession(input: {
  db: DatabaseAdapter;
  record: VoiceSessionRecord;
  backendModelId: string;
  reason: string;
  reportedSeconds?: number;
  backend?: LiveVoiceBackendUsage | null;
  nowMs?: number;
}): Promise<VoiceSettlement> {
  const { db, record } = input;
  const identity = voiceReservationIdentity(record.id);
  const model = record.modelId;
  const span = meteredVoiceSessionSeconds(record, 0, input.nowMs ?? Date.now());
  const allowanceSeconds = await settleFreeVoiceSeconds({
    db,
    userId: record.userId,
    sessionId: record.id,
    usedSeconds: span,
  });
  if (allowanceSeconds !== null) {
    await recordFreeAllowanceSessionCost(input, span, allowanceSeconds);
    return { billedSeconds: allowanceSeconds, actualCostMicrousd: 0 };
  }
  const blockCharge = liveVoiceBlockChargeMicrousd(model, input.backendModelId) ?? 0;
  let reservedMicrousd = blockCharge;
  try {
    reservedMicrousd =
      (
        await readVoiceReservation({
          db,
          userId: record.userId,
          idempotencyKey: identity.idempotencyKey,
          requestHash: identity.requestHash,
        })
      )?.reservedMicrousd ?? blockCharge;
  } catch (error) {
    logger.error(
      { error, userId: record.userId, voiceSessionId: record.id },
      'Live voice reservation could not be read; settling against one block',
    );
  }
  const reservedBlocks =
    blockCharge > 0 ? Math.max(1, Math.floor(reservedMicrousd / blockCharge)) : 1;
  const billedSeconds = Math.min(span, reservedBlocks * LIVE_VOICE_BLOCK_SECONDS);
  const backendCost = input.backend
    ? priceLiveVoiceBackend({
        provider: record.provider,
        backendModel: input.backendModelId,
        reported: input.backend,
      })
    : null;
  const actualCostMicrousd = Math.min(
    (liveSessionChargeMicrousd(billedSeconds, model) ?? 0) +
      chargeMicrousdForProviderCost(backendCost?.totalMicrousd ?? 0),
    reservedMicrousd,
  );
  const providerCostMicrousd = liveSessionProviderCostMicrousd(billedSeconds, model);
  await finalizeManagedUsageRequest({
    db,
    userId: record.userId,
    idempotencyKey: identity.idempotencyKey,
    leaseToken: identity.leaseToken,
    requestHash: identity.requestHash,
    estimatedCostMicrousd: reservedMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(reservedMicrousd),
    quotaFeature: LIVE_VOICE_FEATURE,
    provider: record.provider,
    model,
    outcome: 'completed',
    actualCostMicrousd,
    ...(providerCostMicrousd === null ? {} : { providerCostMicrousd }),
    usage: {
      operation: 'voice_live_session',
      provider: record.provider,
      model,
      providerSku: getModelMetadataById(model)?.apiModelId ?? model,
      sessionId: record.providerSessionId,
      sessionSeconds: span,
      reportedSeconds: input.reportedSeconds ?? 0,
      billedSeconds,
      reason: input.reason,
      ...(backendCost ? { backendCostMicrousd: backendCost.totalMicrousd } : {}),
      ...(providerCostMicrousd === null
        ? {}
        : { providerCostMicrousd, costSource: LIVE_SESSION_PROVIDER_COST_SOURCE }),
    },
  });
  if (input.backend) {
    await recordLiveVoiceBackendCost({
      userId: record.userId,
      organizationId: record.organizationId,
      provider: record.provider,
      sessionId: record.providerSessionId,
      surface: record.surface,
      backendModel: input.backendModelId,
      reported: input.backend,
    });
  }
  return { billedSeconds, actualCostMicrousd };
}

/**
 * A session the monthly allowance paid for charges its owner nothing, and what
 * the provider billed for it still has to reach the cost ledger.
 */
async function recordFreeAllowanceSessionCost(
  input: Parameters<typeof settleVoiceSession>[0],
  sessionSeconds: number,
  billedSeconds: number,
): Promise<void> {
  const { record } = input;
  const model = record.modelId;
  const providerCostMicrousd = liveSessionProviderCostMicrousd(billedSeconds, model);
  if (providerCostMicrousd !== null && billedSeconds > 0) {
    await recordSettledProviderCost({
      db: input.db,
      userId: record.userId,
      organizationId: record.organizationId,
      provider: record.provider,
      model,
      actualCostCents: ledgerCentsFromMicrousd(providerCostMicrousd),
      customerCanonicalMicrousd: 0,
      sourceRef: `free_voice_allowance:${record.userId}:${record.id}`,
      taskOutcome: 'delivered',
      taskRef: record.id,
      usage: {
        operation: 'voice_live_session',
        quotaFeature: LIVE_VOICE_FEATURE,
        provider: record.provider,
        model,
        providerSku: getModelMetadataById(model)?.apiModelId ?? model,
        sessionId: record.providerSessionId,
        sessionSeconds,
        reportedSeconds: input.reportedSeconds ?? 0,
        billedSeconds,
        reason: input.reason,
        funding: 'free_voice_allowance',
        providerCostMicrousd,
        costSource: LIVE_SESSION_PROVIDER_COST_SOURCE,
      },
    });
  }
  if (input.backend) {
    await recordLiveVoiceBackendCost({
      userId: record.userId,
      organizationId: record.organizationId,
      provider: record.provider,
      sessionId: record.providerSessionId,
      surface: record.surface,
      backendModel: input.backendModelId,
      reported: input.backend,
    });
  }
}

/**
 * Closes sessions whose tab stopped checking in a lease ago, at its last
 * check-in, and settles their reservations there. One user's on a session start;
 * every user's from the reservation sweep, each settled as its owner.
 */
export async function settleAbandonedVoiceSessions(input: {
  db: DatabaseAdapter;
  userId: string | null;
  backendModelFor: (record: VoiceSessionRecord) => Promise<string>;
  limit?: number;
  claimOwner?: boolean;
}): Promise<number> {
  const closed = await closeExpiredVoiceSessions({
    db: input.db,
    userId: input.userId,
    maxOpenSeconds: LIVE_VOICE_LEASE_SECONDS,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
  let settled = 0;
  for (const record of closed) {
    try {
      const ownerDb = input.claimOwner
        ? createClaimedUserScopedDb(input.db, {
            userId: record.userId,
            organizationId: record.organizationId,
          })
        : input.db;
      await settleVoiceSession({
        db: ownerDb,
        record,
        backendModelId: await input.backendModelFor(record),
        reason: record.closeReason ?? 'expired',
      });
      settled += 1;
    } catch (error) {
      logger.error(
        {
          event: 'voice_abandoned_settlement_failed',
          error,
          userId: record.userId,
          voiceSessionId: record.id,
        },
        'An abandoned voice session could not be settled; the reservation sweep releases it',
      );
    }
  }
  return settled;
}
