import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  parseToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
// Owned by tool-metadata.ts, which is not server-only, so the tool-loop
// routing can ask the same question without importing this module's database
// read. Re-exported here because the callers that want both live together.
export { policyAutoApprovesTool } from './tool-metadata';

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
    return parseToolApprovalPolicy(row?.settings ?? {});
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[tool-approvals] account default policy unavailable; requiring approval',
    );
    return DEFAULT_TOOL_APPROVAL_POLICY;
  }
}
