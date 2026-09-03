import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { readModelPolicy } from '@/lib/services/model-policy-service';
import {
  evaluateModelAccess,
  type ModelAccessAsk,
  type ModelAccessDecision,
} from '@/lib/services/model-policy-evaluator';

const UNGOVERNED: ModelAccessDecision = {
  allowed: true,
  code: 'ungoverned',
  reason: 'No workspace model policy applies to this request.',
};

interface WorkspaceScopedRequest {
  headers: { get(name: string): string | null };
}

export async function evaluateModelAccessForOrganization(
  db: DatabaseAdapter,
  organizationId: string | null,
  ask: ModelAccessAsk,
): Promise<ModelAccessDecision> {
  if (!organizationId) return UNGOVERNED;

  try {
    const policy = await readModelPolicy(db, organizationId);
    const decision = evaluateModelAccess(policy, ask);

    if (!decision.allowed) {
      logger.info(
        { organizationId, provider: ask.provider, model: ask.modelId, code: decision.code },
        '[model-policy] model refused by workspace policy',
      );
    }
    return decision;
  } catch (error) {
    logger.error(
      { error, organizationId },
      '[model-policy] policy read failed; request ungoverned',
    );
    return UNGOVERNED;
  }
}

export async function evaluateActiveWorkspaceModelAccess(
  db: DatabaseAdapter,
  userId: string,
  ask: ModelAccessAsk,
  request?: WorkspaceScopedRequest,
): Promise<ModelAccessDecision> {
  let organizationId: string | null;
  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.error({ error, userId }, '[model-policy] workspace unresolved; request ungoverned');
    return UNGOVERNED;
  }

  if (!organizationId) return UNGOVERNED;

  try {
    const policy = await readModelPolicy(db, organizationId);
    const decision = evaluateModelAccess(policy, ask);

    if (!decision.allowed) {
      logger.info(
        { userId, organizationId, provider: ask.provider, model: ask.modelId, code: decision.code },
        '[model-policy] model refused by workspace policy',
      );
    }
    return decision;
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[model-policy] policy read failed; request ungoverned',
    );
    return UNGOVERNED;
  }
}

/**
 * The form call sites should use.
 *
 * Acquiring the adapter can itself throw when the database is unconfigured or
 * unreachable, and that throw happens BEFORE the gate below gets a chance to
 * treat it as ungoverned. Leaving `getNeonDb()` at the call site turns a
 * missing connection string into a 500 on every chat turn, which is how this
 * exact mistake was shipped once already in the managed-compute gate.
 */
export async function evaluateModelAccessForRequest(
  userId: string,
  ask: ModelAccessAsk,
  request?: WorkspaceScopedRequest,
): Promise<ModelAccessDecision> {
  let db: DatabaseAdapter;
  try {
    db = getNeonDb();
  } catch (error) {
    logger.error({ error, userId }, '[model-policy] database unavailable; request ungoverned');
    return UNGOVERNED;
  }
  return evaluateActiveWorkspaceModelAccess(db, userId, ask, request);
}
