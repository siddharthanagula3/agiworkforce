import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  recordSupportDataAccess,
  type SupportAccessGrant,
} from '@/lib/server/support-access-service';

export interface AdminDataAccess {
  userId: string;
  organizationId: string;
  resourceType: string;
  role?: string;
  count?: number;
  resourceId?: string;
  /** Set for a support read, so it lands in the workspace's own trail too. */
  supportGrant?: SupportAccessGrant;
  db?: DatabaseAdapter;
}

export async function logAdminDataAccess(request: Request, access: AdminDataAccess): Promise<void> {
  try {
    await recordAuditEvent({
      userId: access.userId,
      organizationId: access.organizationId,
      eventType: 'data_accessed',
      request,
      detail: {
        resourceType: access.resourceType,
        resourceId: access.resourceId ?? access.organizationId,
        ...(access.role ? { role: access.role } : {}),
        ...(access.count !== undefined ? { count: access.count } : {}),
      },
    });
  } catch (error) {
    logger.error(
      { error, organizationId: access.organizationId, resourceType: access.resourceType },
      'Admin data access could not be recorded',
    );
  }

  if (!access.supportGrant || !access.db) return;
  try {
    await recordSupportDataAccess({
      db: access.db,
      grant: access.supportGrant,
      actorUserId: access.userId,
      resourceType: access.resourceType,
      resourceId: access.resourceId ?? null,
      rowCount: access.count ?? null,
    });
  } catch (error) {
    logger.error(
      { error, organizationId: access.organizationId, grantId: access.supportGrant.id },
      'Support data access could not be appended to the break-glass trail',
    );
  }
}
