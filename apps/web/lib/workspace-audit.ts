import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { recordAuditEvent, type AuditEvent } from '@/lib/security-audit';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

export type WorkspaceAuditEvent = Omit<AuditEvent, 'organizationId' | 'request' | 'userId'> & {
  userId: string;
};

export async function recordWorkspaceAuditEvent(
  db: DatabaseAdapter,
  request: Request,
  event: WorkspaceAuditEvent,
): Promise<void> {
  const organizationId = await resolveActiveOrganizationId(db, event.userId, request).catch(
    () => null,
  );
  await recordAuditEvent({ ...event, request, organizationId });
}
