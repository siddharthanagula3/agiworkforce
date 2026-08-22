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

    // A fact learned inside a project belongs to that project. Writing it
    // unscoped would put a client's details into every unrelated chat, which is
    // the leak project memory exists to prevent — so the project is resolved
    // here rather than defaulting to global at four separate call sites.
    const conversationId = params.processed.conversationId;
    const [conversationRow] = conversationId
      ? await db.query<{ project_id: string | null }>(
          `select project_id from web_conversations where id = $1::uuid and user_id = $2 limit 1`,
          [conversationId, params.userId],
        )
      : [];

    const result = await persistManagedAutoMemoryFacts(db, {
      userId: params.userId,
      candidates,
      projectId: conversationRow?.project_id ?? null,
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
