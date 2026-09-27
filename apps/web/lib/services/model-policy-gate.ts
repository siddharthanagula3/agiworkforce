import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MODEL_POLICY_UNAVAILABLE } from '@agiworkforce/routing';

import { logger } from '@/lib/logger';
import { recordCapabilityDenial } from '@/lib/observability/denials';
import { httpRequestLabels } from '@/lib/observability/request-labels';
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

// A policy refusal is an administrator's decision, so it is counted apart from
// a capability that is off and an entitlement the plan does not include.
function notePolicyRefusal(organizationId: string, request?: WorkspaceScopedRequest): void {
  recordCapabilityDenial({
    layer: 'policy',
    reason: 'policy_blocked',
    organizationId,
    surface: request ? httpRequestLabels((name) => request.headers.get(name)).surface : undefined,
  });
}

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
      notePolicyRefusal(organizationId);
      logger.info(
        { organizationId, provider: ask.provider, model: ask.modelId, code: decision.code },
        '[model-policy] model refused by workspace policy',
      );
    }
    return decision;
  } catch (error) {
    logger.error({ error, organizationId }, '[model-policy] policy read failed; request refused');
    return MODEL_POLICY_UNAVAILABLE;
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
    logger.error({ error, userId }, '[model-policy] workspace unresolved; request refused');
    return MODEL_POLICY_UNAVAILABLE;
  }

  if (!organizationId) return UNGOVERNED;

  try {
    const policy = await readModelPolicy(db, organizationId);
    const decision = evaluateModelAccess(policy, ask);

    if (!decision.allowed) {
      notePolicyRefusal(organizationId, request);
      logger.info(
        { userId, organizationId, provider: ask.provider, model: ask.modelId, code: decision.code },
        '[model-policy] model refused by workspace policy',
      );
    }
    return decision;
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[model-policy] policy read failed; request refused',
    );
    return MODEL_POLICY_UNAVAILABLE;
  }
}

/**
 * The form call sites should use.
 *
 * Acquiring the adapter can itself throw when the database is unconfigured or
 * unreachable, and that throw happens BEFORE the gate below gets a chance to
 * refuse it. Leaving `getNeonDb()` at the call site turns a missing connection
 * string into a 500 on every chat turn, which is how this exact mistake was
 * shipped once already in the managed-compute gate.
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
    logger.error({ error, userId }, '[model-policy] database unavailable; request refused');
    return MODEL_POLICY_UNAVAILABLE;
  }
  return evaluateActiveWorkspaceModelAccess(db, userId, ask, request);
}
