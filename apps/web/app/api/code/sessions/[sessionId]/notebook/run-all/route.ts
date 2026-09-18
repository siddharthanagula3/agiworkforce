import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier, type NotebookCellOutput } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  getCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  runCloudCodeNotebookCell,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';
import { recordNotebookRun, requireNotebookNetworkPolicy } from '../lib/notebook-runs';

export const runtime = 'nodejs';
export const maxDuration = 600;

const MAX_CELLS_PER_RUN = 100;

type RouteContext = { params: Promise<{ sessionId: string }> };

interface RunAllCell {
  id: string;
  code: string;
  language: string;
}

interface RunAllCellResult {
  cellId: string;
  ok: boolean;
  outputs: NotebookCellOutput[];
  error?: string;
}

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.serviceUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
}

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

/**
 * Markdown cells never arrive here: they are documentation, not code, and the
 * client keeps them out of the run rather than the server refusing them one by
 * one.
 */
function validateCells(value: unknown): RunAllCell[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw createError.validation('cells must be a non-empty array');
  }
  if (value.length > MAX_CELLS_PER_RUN) {
    throw createError.validation(`A run may cover at most ${MAX_CELLS_PER_RUN} cells`);
  }
  return value.map((entry, index) => {
    const cell =
      typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const id = typeof cell['id'] === 'string' ? cell['id'].trim() : '';
    const code = typeof cell['code'] === 'string' ? cell['code'] : '';
    const language = typeof cell['language'] === 'string' ? cell['language'].trim() : 'python';
    if (!id) throw createError.validation(`cells[${index}].id is required`);
    return { id, code, language };
  });
}

async function handleRunAll(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.serviceUnavailable('Managed Code is not enabled for this deployment');
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const body = await requestObject(request);
  const { sessionId } = await context.params;
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const accessDecision = await evaluateManagedComputeAccess(
    db,
    userId,
    subscription,
    resolveCloudChatSurface(request),
    { request },
    'code',
  );
  const accessGateResponse = buildManagedComputeAccessGateResponse(accessDecision);
  if (accessGateResponse) return accessGateResponse;
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);

  const cells = validateCells(body['cells']);
  const fromTop = body['fromTop'] !== false;
  const runId = randomUUID();

  try {
    const owner = { userId, organizationId };
    const session = await getCloudCodeSession(db, owner, sessionId);
    const networkAccess = requireNotebookNetworkPolicy(
      session.networkAccess,
      body['requireNetworkAccess'],
    );

    const results: RunAllCellResult[] = [];
    let latestSession = session;
    for (const [cellIndex, cell] of cells.entries()) {
      const startedAt = new Date().toISOString();
      const outcome = await runCloudCodeNotebookCell(
        db,
        owner,
        sessionId,
        { code: cell.code, language: cell.language },
        planTier,
      );
      latestSession = outcome.session;
      await recordNotebookRun(db, {
        userId,
        organizationId,
        sessionId,
        runId,
        cellId: cell.id,
        cellIndex,
        language: cell.language,
        code: cell.code,
        networkAccess,
        fromTop,
        ok: outcome.ok,
        error: outcome.error,
        startedAt,
      });
      results.push({
        cellId: cell.id,
        ok: outcome.ok,
        outputs: outcome.outputs,
        ...(outcome.error ? { error: outcome.error } : {}),
      });
      // A cell that failed leaves the kernel in a state the cells below it were
      // not written for, so the run stops rather than reporting results nobody
      // should read.
      if (!outcome.ok) break;
    }

    return NextResponse.json({
      session: latestSession,
      runId,
      fromTop,
      networkAccess,
      results,
      completed: results.length === cells.length && results.every((result) => result.ok),
    });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleRunAll);
