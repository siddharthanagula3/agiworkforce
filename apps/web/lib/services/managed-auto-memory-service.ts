import 'server-only';

import type { NextRequest } from 'next/server';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  persistManagedAutoMemoryFacts,
  type ManagedMemoryContextDb,
} from './managed-memory-context-service';

export type ManagedMemoryTurnOutcome = 'completed' | 'failed' | 'cancelled';

/**
 * Best-effort terminal owner for managed auto-memory. Only completed
 * account-surface turns admitted by the server-side memory policy carry
 * candidates; failures, cancellations, empty extraction, tenant mismatch,
 * and persistence outages are safe no-ops.
 */
export async function recordManagedAutoMemoryTurn(params: {
  db?: ManagedMemoryContextDb;
  request?: NextRequest;
  userId: string;
  processed: ProcessedRequest;
  outcome: ManagedMemoryTurnOutcome;
}): Promise<void> {
  const candidates = params.processed.autoMemoryFacts ?? [];
  if (params.outcome !== 'completed' || candidates.length === 0) return;

  try {
    let db = params.db ?? params.processed.managedUsage?.db;
    if (params.processed.managedUsage?.userId !== undefined) {
      if (params.processed.managedUsage.userId !== params.userId) {
        throw new Error('Managed memory tenant mismatch');
      }
    }
    if (!db) {
      if (!params.request) throw new Error('Managed memory request context is unavailable');
      const scoped = await getUserScopedDb(params.request);
      if (scoped.userId !== params.userId) throw new Error('Managed memory tenant mismatch');
      db = scoped.db;
    }

    const result = await persistManagedAutoMemoryFacts(db, {
      userId: params.userId,
      candidates,
    });
    logger.info(
      {
        userId: params.userId,
        requestId: params.processed.requestId,
        extracted: result.extracted,
        inserted: result.inserted,
      },
      'Managed auto-memory turn recorded',
    );
  } catch (error) {
    logger.warn(
      { error, userId: params.userId, requestId: params.processed.requestId },
      'Managed auto-memory persistence failed; chat completion remains successful',
    );
  }
}
