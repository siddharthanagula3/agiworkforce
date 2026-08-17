import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  parseToolApprovalPolicy,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';
import { resolveToolMetadata } from './tool-metadata';

export function policyAutoApprovesTool(policy: ToolApprovalPolicy, qualifiedName: string): boolean {
  if (policy !== 'auto_approve_read_only') return false;
  const metadata = resolveToolMetadata(qualifiedName);
  return (
    metadata.declared &&
    metadata.actionClass === 'read' &&
    metadata.reversible &&
    !metadata.createsEgressPath
  );
}

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
