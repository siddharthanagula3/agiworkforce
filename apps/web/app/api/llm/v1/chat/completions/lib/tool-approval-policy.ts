import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { readOrganizationPolicy } from '@/lib/services/organization-policy-service';
import { resolveGoverningOrganizationIds } from '@/lib/services/governing-organizations';
import {
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  loadConnectorToolPermissions,
  type ConnectorToolPermissions,
} from './connector-tool-permissions';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  organizationPermitsAutonomousToolApprovals,
  parseToolApprovalPolicy,
  resolveEffectiveToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
// Owned by tool-metadata.ts, which is not server-only, so the tool-loop
// routing can ask the same question without importing this module's database
// read. Re-exported here because the callers that want both live together.
export { policyAutoApprovesTool } from './tool-metadata';

// Bound against every organization the caller belongs to, never the one the
// caller-supplied header selected: a member must not skip approvals by
// switching workspace.
async function permitsAutonomous(db: DatabaseAdapter, userId: string): Promise<boolean> {
  const organizationIds = await resolveGoverningOrganizationIds(db, userId);
  if (organizationIds.length === 0) return true;
  const policies = await Promise.all(
    organizationIds.map((organizationId) => readOrganizationPolicy(db, organizationId)),
  );
  return policies.every((policy) => organizationPermitsAutonomousToolApprovals(policy?.metadata));
}

// Read fresh per request and per resume, and resolved against the workspace
// permission here so no caller can see an unresolved stored value.
export async function loadToolApprovalPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<ToolApprovalPolicy> {
  if (!userId) return DEFAULT_TOOL_APPROVAL_POLICY;
  try {
    const [row] = await db.query<{ settings: unknown }>(
      'select settings from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
    const stored = parseToolApprovalPolicy(row?.settings ?? {});
    if (stored !== 'autonomous') return stored;
    return resolveEffectiveToolApprovalPolicy(stored, {
      organizationPermitsAutonomous: await permitsAutonomous(db, userId),
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[tool-approvals] account default policy unavailable; requiring approval',
    );
    return DEFAULT_TOOL_APPROVAL_POLICY;
  }
}

// So the settings surface offers the choice only where the runtime would honour
// it. An unreadable workspace answers false, the direction the gate fails in.
export async function autonomousToolApprovalsAvailable(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  try {
    return await permitsAutonomous(db, userId);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[tool-approvals] workspace autonomy permission unavailable; offering approval-gated policies only',
    );
    return false;
  }
}

// A model that cannot call tools has no connector verdicts to apply, but its
// turn still needs the policy: it decides whether provider-native web search is
// withdrawn in favour of the gated function shape.
export async function loadTurnToolPermissions(
  db: DatabaseAdapter,
  userId: string,
  options: { modelSupportsTools: boolean },
): Promise<{
  connectorPermissions: ConnectorToolPermissions;
  toolApprovalPolicy: ToolApprovalPolicy;
}> {
  const [connectorPermissions, toolApprovalPolicy] = await Promise.all([
    options.modelSupportsTools
      ? loadConnectorToolPermissions(db, userId)
      : Promise.resolve(EMPTY_CONNECTOR_TOOL_PERMISSIONS),
    loadToolApprovalPolicy(db, userId),
  ]);
  return { connectorPermissions, toolApprovalPolicy };
}
