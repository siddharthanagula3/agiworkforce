import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_ROUTE_ACCESS,
  servicePrincipalRoutes,
  servicePrincipalScopes,
  workspaceRouteAccess,
} from '../route-access';

const APP_ROOT = path.resolve(__dirname, '../../../../app');

describe('workspace route access table', () => {
  it('names only routes that exist', () => {
    for (const entry of WORKSPACE_ROUTE_ACCESS) {
      const file = path.join(APP_ROOT, entry.route.replace(/^\/api\//u, 'api/'), 'route.ts');
      expect(existsSync(file), `${entry.method} ${entry.route}`).toBe(true);
    }
  });

  it('closes every route it does not name', () => {
    expect(workspaceRouteAccess('/api/settings/organization/members', 'POST')).toBeNull();
    expect(workspaceRouteAccess('/api/settings/organization/audit', 'DELETE')).toBeNull();
    expect(workspaceRouteAccess('/api/settings/organization/usage-report', 'POST')).toBeNull();
  });

  it.each([
    ['/api/settings/organization/members', 'GET', 'admin.members.view'],
    ['/api/settings/organization/members/[userId]', 'GET', 'admin.members.view'],
    ['/api/settings/organization/members/[userId]', 'PATCH', 'admin.members.manage'],
    ['/api/settings/organization/members/[userId]', 'DELETE', 'admin.members.manage'],
    ['/api/settings/organization/invitations', 'GET', 'admin.members.view'],
    ['/api/settings/organization/invitations', 'POST', 'admin.members.manage'],
    ['/api/settings/organization/invitations/[invitationId]', 'DELETE', 'admin.members.manage'],
    ['/api/settings/organization/usage-report', 'GET', 'admin.billing.view'],
  ])('opens %s %s to a key scoped for %s', (route, method, permission) => {
    expect(workspaceRouteAccess(route, method)).toMatchObject({
      permission,
      servicePrincipals: 'allowed',
    });
  });

  it('keeps writes that change who may administer out of reach of a key', () => {
    const write = workspaceRouteAccess('/api/settings/organization/service-principals', 'PATCH');
    expect(write?.servicePrincipals).toBe('members-only');
    for (const route of [
      '/api/settings/organization/members/[userId]/roles',
      '/api/settings/organization/roles',
      '/api/settings/organization/admin-api-keys',
      '/api/settings/organization/transfer-ownership',
    ]) {
      expect(servicePrincipalRoutes(), route).not.toContain(route);
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(workspaceRouteAccess(route, method), `${method} ${route}`).toBeNull();
      }
    }
  });

  it('offers keys exactly the scopes some route lets a key use, in the namespaced vocabulary', () => {
    expect(servicePrincipalScopes()).toEqual([
      'admin.audit.view',
      'admin.billing.view',
      'admin.identity.view',
      'admin.members.manage',
      'admin.members.view',
      'feature.content.govern',
    ]);
    expect(servicePrincipalScopes()).not.toContain('admin.identity.manage');
  });

  it('reaches past the three compliance endpoints', () => {
    expect(servicePrincipalRoutes()).toContain('/api/settings/organization/service-principals');
    expect(servicePrincipalRoutes()).toContain('/api/settings/organization/members');
    expect(servicePrincipalRoutes().length).toBeGreaterThan(3);
  });
});
