import type { OrganizationPermission } from '@agiworkforce/types';

export type WorkspaceRouteMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface WorkspaceRouteAccess {
  route: string;
  method: WorkspaceRouteMethod;
  permission: OrganizationPermission;
  deniedMessage: string;
  /** `members-only` refuses a workspace API key whatever scopes it carries. */
  servicePrincipals: 'allowed' | 'members-only';
}

/**
 * Every route a workspace API key can reach, with the permission it needs
 * there. A route absent from this table is closed to automations, so adding an
 * endpoint never widens automation access by accident: it has to be granted
 * here, per method, at the same permission an interactive member would need.
 */
export const WORKSPACE_ROUTE_ACCESS: readonly WorkspaceRouteAccess[] = Object.freeze([
  {
    route: '/api/settings/organization/audit',
    method: 'GET',
    permission: 'audit.read',
    deniedMessage: 'Your workspace role does not allow reading the audit trail.',
    servicePrincipals: 'allowed',
  },
  {
    route: '/api/settings/organization/audit/export',
    method: 'GET',
    permission: 'audit.read',
    deniedMessage: 'Your workspace role does not allow exporting the audit trail.',
    servicePrincipals: 'allowed',
  },
  {
    route: '/api/settings/organization/legal-holds/[holdId]/export',
    method: 'GET',
    permission: 'content.govern',
    deniedMessage: 'Your workspace role does not allow exporting held records.',
    servicePrincipals: 'allowed',
  },
  {
    route: '/api/settings/organization/service-principals',
    method: 'GET',
    permission: 'identity.read',
    deniedMessage: 'Your workspace role does not allow viewing workspace service principals.',
    servicePrincipals: 'allowed',
  },
  {
    route: '/api/settings/organization/service-principals',
    method: 'PATCH',
    permission: 'identity.manage',
    deniedMessage: 'Your workspace role does not allow changing workspace service principals.',
    servicePrincipals: 'members-only',
  },
]);

const ACCESS = new Map(
  WORKSPACE_ROUTE_ACCESS.map((entry) => [`${entry.method} ${entry.route}`, entry]),
);

export function workspaceRouteAccess(route: string, method: string): WorkspaceRouteAccess | null {
  return ACCESS.get(`${method.toUpperCase()} ${route}`) ?? null;
}

export function servicePrincipalRoutes(): string[] {
  return [
    ...new Set(
      WORKSPACE_ROUTE_ACCESS.filter((entry) => entry.servicePrincipals === 'allowed').map(
        (entry) => entry.route,
      ),
    ),
  ].sort();
}
