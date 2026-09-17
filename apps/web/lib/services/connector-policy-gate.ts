import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { readConnectorPolicySafely } from '@/lib/services/connector-policy-service';
import {
  evaluateConnectorAccess,
  evaluatePluginAccess,
  type ConnectorAccessDecision,
  type ConnectorAccessPolicy,
} from '@/lib/services/connector-policy-evaluator';

/**
 * @file One place the connect, authorize and create paths ask the same question.
 *
 * The workspace connector policy was consulted only when tools were READ for a
 * chat turn: `applyConnectorPolicy` filtered the offered catalog and
 * `connectorPolicyAllows` gated capability loading. Nothing asked it on the way
 * IN. A member could start an OAuth flow for a connector the policy forbids,
 * complete it, and have credentials exchanged and stored; the policy only
 * caught up later by hiding the resulting tools. An administrator setting
 * "these connectors only" reads that as binding at the point of connection,
 * because that is the point at which their organization's data starts moving.
 *
 * One gate rather than a copy per route, for the reason the register gives:
 * three routes each re-deriving the organization, reading the policy and
 * interpreting the decision is three places for the interpretation to drift.
 *
 * FAIL-OPEN, and deliberately. `readConnectorPolicySafely` already carries the
 * reasoning: connector governance is a deployment control over which approved
 * integrations staff use, not a containment barrier. Tenancy is what stops
 * cross-workspace access and that fails closed. Denying every connection
 * because the policy table blipped would break every member for an outage that
 * granted nobody anything.
 */
export interface ConnectorPolicyGateResult extends ConnectorAccessDecision {
  organizationId: string | null;
}

const UNGOVERNED: ConnectorPolicyGateResult = {
  allowed: true,
  code: 'ungoverned',
  reason: 'No workspace connector policy applies.',
  organizationId: null,
};

interface ScopedRequest {
  headers: { get(name: string): string | null };
}

interface WorkspacePolicyAsk {
  db: DatabaseAdapter;
  userId: string;
  request?: ScopedRequest;
  /**
   * The active workspace, when the caller already has it.
   *
   * `getUserScopedDb` returns it, so the routes that use a scoped database
   * hand it over rather than making this resolve it a second time. `null` is a
   * personal account and answers immediately; omitting it means resolve.
   */
  organizationId?: string | null;
}

async function evaluateWorkspacePolicy(
  params: WorkspacePolicyAsk,
  subject: Record<string, unknown>,
  refusal: string,
  decide: (policy: ConnectorAccessPolicy) => ConnectorAccessDecision,
): Promise<ConnectorPolicyGateResult> {
  const { db, userId } = params;
  if (!userId) return UNGOVERNED;
  if (params.organizationId === null) return UNGOVERNED;

  // Total, not merely fail-open at each await. A gate added to live routes
  // must not be able to turn any of them into a 500: whatever goes wrong here,
  // the answer is the same one an ungoverned workspace gets, and the reason is
  // logged.
  let organizationId: string | null = params.organizationId ?? null;
  try {
    organizationId ??= await resolveActiveOrganizationId(db, userId, params.request);
    if (!organizationId) return UNGOVERNED;

    const policy = await readConnectorPolicySafely(db, organizationId);
    if (!policy) return { ...UNGOVERNED, organizationId };

    const decision = decide(policy);
    if (!decision.allowed) {
      logger.info({ userId, organizationId, ...subject, code: decision.code }, refusal);
    }
    return { ...decision, organizationId };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId, organizationId },
      '[connector-policy] unavailable at connection time; connection ungoverned',
    );
    return { ...UNGOVERNED, organizationId };
  }
}

export async function evaluateConnectorPolicyForUser(
  params: WorkspacePolicyAsk & {
    connectorId: string | null;
    isCustom?: boolean;
    url?: string | null;
  },
): Promise<ConnectorPolicyGateResult> {
  return evaluateWorkspacePolicy(
    params,
    { connectorId: params.connectorId },
    '[connector-policy] workspace policy refused a connection before any credential was exchanged',
    (policy) =>
      evaluateConnectorAccess(policy, {
        connectorId: params.connectorId,
        ...(params.isCustom === undefined ? {} : { isCustom: params.isCustom }),
        ...(params.url ? { url: params.url } : {}),
      }),
  );
}

export async function evaluatePluginPolicyForUser(
  params: WorkspacePolicyAsk & { pluginKey: string },
): Promise<ConnectorPolicyGateResult> {
  return evaluateWorkspacePolicy(
    params,
    { pluginKey: params.pluginKey },
    '[connector-policy] workspace policy refused a plugin before it was installed',
    (policy) => evaluatePluginAccess(policy, params.pluginKey),
  );
}
