import 'server-only';

import type { AuditEventDetail } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  handleIdentitySecurityEvent,
  type IdentitySecurityEventKey,
} from '@/lib/services/identity-events';

export interface TwoFactorSecurityEvent {
  userId: string;
  event: IdentitySecurityEventKey;
  request?: Request;
  organizationId?: string | null;
  detail?: AuditEventDetail;
}

/**
 * Announces a change to how an account proves it is itself. The owner
 * connection is needed for the notification and risk rows, and lives here so
 * the routes that hold the second factor never reach for it themselves.
 */
export async function announceTwoFactorChange(event: TwoFactorSecurityEvent): Promise<void> {
  await handleIdentitySecurityEvent(getNeonDb(), getIdentityProvider(), {
    userId: event.userId,
    event: event.event,
    ...(event.request ? { request: event.request } : {}),
    organizationId: event.organizationId ?? null,
    ...(event.detail ? { detail: event.detail } : {}),
  });
}
