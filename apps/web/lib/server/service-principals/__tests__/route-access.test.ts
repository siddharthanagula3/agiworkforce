import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_ROUTE_ACCESS,
  servicePrincipalRoutes,
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
    expect(workspaceRouteAccess('/api/settings/organization/members', 'GET')).toBeNull();
    expect(workspaceRouteAccess('/api/settings/organization/audit', 'DELETE')).toBeNull();
  });

  it('keeps writes that change who may act out of reach of a key', () => {
    const write = workspaceRouteAccess('/api/settings/organization/service-principals', 'PATCH');
    expect(write?.servicePrincipals).toBe('members-only');
    expect(servicePrincipalRoutes()).not.toContain('/api/settings/organization/members');
  });

  it('reaches past the three compliance endpoints', () => {
    expect(servicePrincipalRoutes()).toContain('/api/settings/organization/service-principals');
    expect(servicePrincipalRoutes().length).toBeGreaterThan(3);
  });
});
