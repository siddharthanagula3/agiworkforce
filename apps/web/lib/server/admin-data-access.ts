import 'server-only';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

export interface AdminDataAccess {
  userId: string;
  organizationId: string;
  resourceType: string;
  role?: string;
  count?: number;
  resourceId?: string;
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
}
