import 'server-only';

import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  extractAutoMemoryFactsWithModel,
  isModelMemoryExtractionEnabled,
} from './model-memory-extraction';
import {
  persistManagedAutoMemoryFacts,
  type ManagedMemoryContextDb,
} from './managed-memory-context-service';

export type ManagedMemoryTurnOutcome = 'completed' | 'failed' | 'cancelled';

interface RecordManagedAutoMemoryTurnParams {
  db?: ManagedMemoryContextDb;
  request?: NextRequest;
  userId: string;
  processed: ProcessedRequest;
  outcome: ManagedMemoryTurnOutcome;
}

/**
 * `AGI_MODEL_MEMORY_EXTRACTION` re-reads the turn with a model, which finds the
 * facts the pattern list has no phrasing for. It is gated on more than the flag:
 * a turn whose text was withheld (temporary chat, Memory off, the API surface)
 * carries no source text at all, and a zero-data-retention turn is never
 * forwarded to the shared utility route, which is a different provider from the
 * one the user chose.
 */
function modelExtractionApplies(processed: ProcessedRequest): boolean {
  return (
    isModelMemoryExtractionEnabled() &&
    Boolean(processed.autoMemorySourceText) &&
    processed.zeroDataRetentionOnly !== true
  );
}

/**
 * `onSuccessfulTurn` is awaited before the non-streaming response is written,
 * so anything slow here lands on the user's latency. The model path therefore
 * runs after the response instead. `after` is the framework's own way of
 * holding the invocation open past the response; outside a request scope (a
 * durable workflow step) it throws, and the already-started task is simply left
 * to settle on its own.
 */
function runAfterResponse(task: Promise<void>): void {
  try {
    after(task);
  } catch {
    void task;
  }
}

async function persistTurnCandidates(
  params: RecordManagedAutoMemoryTurnParams,
  candidates: readonly string[],
): Promise<void> {
  if (candidates.length === 0) return;
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
    // the leak project memory exists to prevent, so the project is resolved
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
      candidates: [...candidates],
      projectId: conversationRow?.project_id ?? null,
      organizationId: params.processed.organizationId ?? null,
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

export async function recordManagedAutoMemoryTurn(
  params: RecordManagedAutoMemoryTurnParams,
): Promise<void> {
  const patternCandidates = params.processed.autoMemoryFacts ?? [];
  if (params.outcome !== 'completed') return;
  if (
    params.processed.autoMemoryFactsRequireToolFreeTurn &&
    params.processed.toolExecutionObserved
  ) {
    return;
  }

  if (!modelExtractionApplies(params.processed)) {
    await persistTurnCandidates(params, patternCandidates);
    return;
  }

  runAfterResponse(
    (async () => {
      // Every failure inside the extractor already resolves to the pattern
      // candidates, so this catch only covers the unexpected; it still falls
      // back rather than losing the turn's facts.
      let candidates: readonly string[] = patternCandidates;
      try {
        candidates = await extractAutoMemoryFactsWithModel({
          message: params.processed.autoMemorySourceText ?? '',
          userId: params.userId,
          organizationId: params.processed.organizationId ?? null,
          requestId: params.processed.requestId,
        });
      } catch (error) {
        logger.warn(
          { error, userId: params.userId, requestId: params.processed.requestId },
          '[memory-extraction] model extraction threw; using the pattern candidates',
        );
      }
      await persistTurnCandidates(params, candidates);
    })().catch((error: unknown) => {
      logger.warn(
        { error, userId: params.userId, requestId: params.processed.requestId },
        'Managed auto-memory background task failed',
      );
    }),
  );
}
