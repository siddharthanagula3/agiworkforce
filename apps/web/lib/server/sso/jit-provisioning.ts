import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { IdentityEnterpriseAccount } from '@agiworkforce/identity';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { isSeatCeilingError } from '@/lib/services/organization-seat-service';

export type JitDefaultRole = 'member' | 'viewer';

export type JitProvisioningOutcome = 'joined' | 'already_member' | 'seat_limit';

export interface JitProvisioningResult {
  organizationId: string;
  connectionId: string;
  role: JitDefaultRole;
  outcome: JitProvisioningOutcome;
}

interface JitConnectionRow {
  id: string;
  organization_id: string;
  domain: string;
  clerk_connection_id: string;
  jit_default_role: JitDefaultRole;
}

export function emailBelongsToDomain(email: string, domain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const host = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  const expected = domain.trim().toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

export async function provisionEnterpriseSignIn(
  db: DatabaseAdapter,
  user: { id: string; enterpriseAccounts: readonly IdentityEnterpriseAccount[] },
): Promise<JitProvisioningResult[]> {
  const accounts = user.enterpriseAccounts.filter(
    (account): account is IdentityEnterpriseAccount & { connectionId: string } =>
      account.active && typeof account.connectionId === 'string' && account.connectionId !== '',
  );
  if (accounts.length === 0) return [];

  const connections = await db.query<JitConnectionRow>(
    `select id, organization_id, domain, clerk_connection_id, jit_default_role
       from public.sso_connections
      where clerk_connection_id = any($1::text[])
        and is_active = true
        and domain_verified_at is not null
        and jit_provisioning_enabled = true`,
    [accounts.map((account) => account.connectionId)],
  );

  const results: JitProvisioningResult[] = [];
  for (const connection of connections) {
    const account = accounts.find(
      (candidate) =>
        candidate.connectionId === connection.clerk_connection_id &&
        emailBelongsToDomain(candidate.emailAddress, connection.domain),
    );
    if (!account) continue;

    const base = {
      organizationId: connection.organization_id,
      connectionId: connection.id,
      role: connection.jit_default_role,
    };

    try {
      const inserted = await db.query<{ user_id: string }>(
        `insert into public.organization_members
           (organization_id, user_id, role, provisioning_source, provisioned_at)
         values ($1, $2, $3, 'sso_jit', now())
         on conflict (organization_id, user_id) do nothing
         returning user_id`,
        [connection.organization_id, user.id, connection.jit_default_role],
      );
      if (inserted.length === 0) {
        results.push({ ...base, outcome: 'already_member' });
        continue;
      }
      results.push({ ...base, outcome: 'joined' });
      await recordAuditEvent({
        userId: user.id,
        eventType: 'sso_jit_membership_granted',
        organizationId: connection.organization_id,
        outcome: 'success',
        severity: 'warning',
        detail: {
          resourceType: 'organization_member',
          resourceId: user.id,
          targetUserId: user.id,
          role: connection.jit_default_role,
          source: 'sso_jit',
          connectorId: connection.id,
        },
      });
    } catch (error) {
      if (!isSeatCeilingError(error)) throw error;
      results.push({ ...base, outcome: 'seat_limit' });
      logger.warn(
        { organizationId: connection.organization_id, userId: user.id },
        'Single sign-on first sign-in could not join the workspace: no licensed seat is free',
      );
      await recordAuditEvent({
        userId: user.id,
        eventType: 'sso_jit_membership_refused',
        organizationId: connection.organization_id,
        outcome: 'denied',
        severity: 'critical',
        detail: {
          resourceType: 'organization_member',
          resourceId: user.id,
          targetUserId: user.id,
          role: connection.jit_default_role,
          reason: 'seat_limit',
        },
      });
    }
  }
  return results;
}
