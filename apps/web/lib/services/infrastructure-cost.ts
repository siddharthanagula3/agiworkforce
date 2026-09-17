import 'server-only';

import { randomUUID } from 'node:crypto';

import { logger } from '@/lib/logger';
import type { recordInfrastructureCostEvent } from '@/lib/services/cogs-ledger-service';

const BYTES_PER_GIBIBYTE = 1024 ** 3;

/**
 * The ledger is loaded only when there is something to accrue.
 *
 * Callers are leaves: an email client, a push sender, a file route. A static
 * import would put a database client in each of their module graphs, which is
 * both weight they do not need and a side effect at import time.
 */
let ledger: Promise<typeof import('@/lib/services/cogs-ledger-service')> | null = null;

async function accrue(input: Parameters<typeof recordInfrastructureCostEvent>[0]): Promise<void> {
  ledger ??= import('@/lib/services/cogs-ledger-service');
  await (await ledger).recordInfrastructureCostEvent(input);
}

/**
 * Bytes leaving the platform, metered where they are actually served.
 *
 * Egress is billed by the hosting and object-storage vendors and was the one
 * large cost the ledger could not see at all, so a file served a thousand times
 * looked free. The accrual is deliberately fire-and-forget: a serve must never
 * wait on, or fail because of, its own accounting.
 */
export function recordEgressBytes(input: {
  userId?: string | null;
  organizationId?: string | null;
  bytes: number;
  surface?: string | null;
  provider: string;
  sourceRef?: string;
}): void {
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) return;
  void accrue({
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    capability: 'egress',
    provider: input.provider,
    units: input.bytes / BYTES_PER_GIBIBYTE,
    surface: input.surface ?? null,
    sourceRef: input.sourceRef ?? `egress:${randomUUID()}`,
    metadata: { bytes: Math.round(input.bytes) },
  }).catch((error: unknown) => {
    logger.warn({ error }, '[infrastructure-cost] served bytes were not accrued');
  });
}

/**
 * Push notifications the platform paid to deliver, counted where the sender
 * knows how many actually left. The sender already holds a database handle, so
 * the accrual adds no new reach to its module graph.
 */
export function recordNotificationDeliveries(input: {
  userId?: string | null;
  organizationId?: string | null;
  provider: string;
  deliveries: number;
  surface?: string | null;
}): void {
  if (!Number.isInteger(input.deliveries) || input.deliveries <= 0) return;
  void accrue({
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    capability: 'notification',
    provider: input.provider,
    units: input.deliveries,
    surface: input.surface ?? null,
    sourceRef: `notification:${randomUUID()}`,
    metadata: { deliveries: input.deliveries },
  }).catch((error: unknown) => {
    logger.warn({ error }, '[infrastructure-cost] deliveries were not accrued');
  });
}
