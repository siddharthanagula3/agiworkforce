import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  WORKSPACE_SCOPED_CONTENT_TABLES,
  WorkspaceScopeError,
  assertWorkspaceScope,
  isWorkspaceScopedContentTable,
  workspaceAdminVisiblePredicate,
  workspaceOwnedPredicate,
} from '../index';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('workspace scope predicates', () => {
  it('binds an owner read to exactly one workspace, personal included', () => {
    const personal = workspaceOwnedPredicate({ userId: 'user_1', organizationId: null });

    expect(personal.sql).toBe('user_id = $1 and organization_id is not distinct from $2::uuid');
    expect(personal.params).toEqual(['user_1', null]);
    expect(personal.nextParamIndex).toBe(3);
  });

  it('continues an existing parameter list instead of restarting it', () => {
    const predicate = workspaceOwnedPredicate(
      { userId: 'user_1', organizationId: ORG },
      { firstParamIndex: 4, ownerColumn: 'c.user_id', organizationColumn: 'c.organization_id' },
    );

    expect(predicate.sql).toBe(
      'c.user_id = $4 and c.organization_id is not distinct from $5::uuid',
    );
    expect(predicate.nextParamIndex).toBe(6);
  });

  it('lets a workspace admin see other members rows only inside that workspace', () => {
    const predicate = workspaceAdminVisiblePredicate({ userId: 'admin_1', organizationId: ORG });

    expect(predicate.sql).toBe(
      '(user_id = $1 or organization_id = $2::uuid) and organization_id is not distinct from $2::uuid',
    );
    expect(predicate.params).toEqual(['admin_1', ORG]);
  });

  it('never widens a personal read for an admin: there is no admin of Personal', () => {
    const predicate = workspaceAdminVisiblePredicate({ userId: 'admin_1', organizationId: null });

    expect(predicate.sql).toBe('user_id = $1 and organization_id is not distinct from $2::uuid');
  });

  it('refuses a scope with no account, and an undefined organization', () => {
    expect(() => assertWorkspaceScope({ userId: '', organizationId: null })).toThrow(
      WorkspaceScopeError,
    );
    expect(() =>
      assertWorkspaceScope({ userId: 'user_1', organizationId: undefined as unknown as null }),
    ).toThrow(WorkspaceScopeError);
  });

  it('names the tables 0110 made mutually exclusive', () => {
    expect(isWorkspaceScopedContentTable('user_memories')).toBe(true);
    expect(isWorkspaceScopedContentTable('security_audit_logs')).toBe(false);
    expect(WORKSPACE_SCOPED_CONTENT_TABLES).toContain('web_conversations');
  });
});
