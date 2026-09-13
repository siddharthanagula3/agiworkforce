import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { SSOConnectionRow } from '@/lib/server/neon-types';

/**
 * The email domains an organization has proved it controls.
 *
 * A verified domain is the only evidence this product holds that an address
 * belongs to a workspace rather than to a person. Anything that binds an
 * account to a tenant without the account's own consent must ask this first,
 * because the alternative is that knowing someone's email is enough to put
 * them in your workspace.
 */
export async function listVerifiedDomains(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<ReadonlySet<string>> {
  const rows = await db.query<Pick<SSOConnectionRow, 'domain'>>(
    `select lower(domain) as domain
       from sso_connections
      where organization_id = $1 and domain_verified_at is not null`,
    [organizationId],
  );
  return new Set(rows.map((row) => row.domain));
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

export function ownsEmailDomain(email: string | null, domains: ReadonlySet<string>): boolean {
  if (!email) return false;
  const domain = emailDomain(email);
  return domain !== null && domains.has(domain);
}

export async function organizationOwnsEmailDomain(
  db: DatabaseAdapter,
  organizationId: string,
  email: string | null,
): Promise<boolean> {
  if (!email) return false;
  return ownsEmailDomain(email, await listVerifiedDomains(db, organizationId));
}
