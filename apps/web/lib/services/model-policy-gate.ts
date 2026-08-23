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

/**
 * Resolves the caller's active workspace and asks the model evaluator.
 *
 * Answers `ungoverned` — which allows — in three cases: the caller is in
 * personal scope and has no workspace to be governed by, the workspace has no
 * policy row, or the policy could not be read. The third is the one worth
 * stating: a database fault is an infrastructure problem, not an
 * administrator's decision, and turning it into a denial would make every
 * member's chat stop working the moment the policy table is briefly
 * unreachable. That is the same trade the managed-compute gate already makes.
 *
 * The opposite choice is defensible for a hard security boundary, but model
 * governance is a deployment control over which approved tool staff use, not a
 * containment barrier — the tenancy layer is what stops cross-workspace access,
 * and it fails closed.
 */
/**
 * The form for a caller that has ALREADY resolved the active workspace.
 *
 * The chat path resolves it once for the scoped database handle, including the
 * `x-agi-organization-id` override, and re-resolving here would add a second
 * round trip to the hot path for an answer already in hand. `null` means
 * personal scope, which is ungoverned.
 */
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
