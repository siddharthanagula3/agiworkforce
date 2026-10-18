import { describe, test, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS, evaluateAuthorization } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

interface SecurityEvent {
  severity: string;
  details: Record<string, unknown>;
}
const logSecurityEvent = vi.fn(async (_event: SecurityEvent) => {});
vi.mock('@/lib/security-audit', () => ({ logSecurityEvent }));

interface SupportEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
}
const sendSupportEmail = vi.fn(async (_input: SupportEmail) => ({
  delivered: true as const,
  providerMessageId: 'm-1',
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({ sendSupportEmail }));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: () => ({ fallbackEmail: 'security@agiworkforce.test' }),
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: async () => world.activeOrganizationId,
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const OWNERS_ROLE = '33333333-3333-4333-8333-333333333333';
const READER_ROLE = '44444444-4444-4444-8444-444444444444';

interface Member {
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
  grants: Array<{ source: string; permissions: string[] }>;
}

const world = {
  activeOrganizationId: ORG as string | null,
  members: new Map<string, Member>(),
  ownerEmail: 'owner@example.test' as string | null,
  roles: [
    { id: OWNERS_ROLE, organization_id: ORG, key: 'custom_owners', permissions: ['owners.manage'] },
    { id: READER_ROLE, organization_id: ORG, key: 'custom_reader', permissions: ['content.read'] },
  ],
};

function key(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`;
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const statement = String(sql);
  const [first, second] = params as [string, string];

  if (statement.includes("'membership:'")) {
    return world.members.get(key(first, second))?.grants ?? [];
  }
  if (statement.includes('organization_admin_policies')) return [];
  if (statement.includes('organization_policy_overrides')) return [];
  if (statement.includes('public.profiles')) {
    return world.ownerEmail ? [{ email: world.ownerEmail }] : [];
  }
  if (statement.includes('organization_member_permissions')) {
    const found = world.members.get(key(first, second));
    return statement.includes('(select role')
      ? [{ role: found?.role ?? null, permissions: found?.permissions ?? [] }]
      : [{ permissions: found?.permissions ?? [] }];
  }
  if (statement.includes('from public.organization_roles')) {
    const ids = params[0] as string[];
    return world.roles.filter((role) => ids.includes(role.id));
  }
  if (statement.includes('from public.organization_members')) {
    const found = world.members.get(key(first, second));
    return found ? [{ role: found.role, user_id: second }] : [];
  }
  return [];
});

const db = {
  query,
  execute: vi.fn(async () => undefined),
  transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

const { explainMemberAuthorization } = await import('@/lib/authorization/authorize');
const { isEnterpriseDenialError } = await import('@/lib/authorization/denial');
const { requireMemberPermission, requirePermission } =
  await import('@/lib/services/organization-permission-service');
const { setMemberRoles } = await import('@/lib/services/organization-role-service');

function member(role: Member['role'], permissions: string[], grantSource: string): Member {
  return { role, permissions, grants: [{ source: grantSource, permissions }] };
}

const DENIED = 'Your workspace role does not allow that.';

async function denialOf(work: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await work;
  } catch (error) {
    if (!isEnterpriseDenialError(error)) throw error;
    return {
      status: error.statusCode,
      message: error.message,
      ...(error.details as Record<string, unknown>),
    };
  }
  throw new Error('expected a denial');
}

beforeEach(() => {
  vi.clearAllMocks();
  world.activeOrganizationId = ORG;
  world.ownerEmail = 'owner@example.test';
  world.members = new Map([
    [key(ORG, 'u-owner'), member('owner', [...ALL_PERMISSIONS], 'membership:primary_owner')],
    [
      key(ORG, 'u-admin'),
      member(
        'admin',
        ['content.read', 'content.share', 'members.manage', 'policy.manage', 'audit.read'],
        'membership:admin',
      ),
    ],
    [key(ORG, 'u-viewer'), member('viewer', ['content.read'], 'membership:viewer')],
    [
      key(OTHER_ORG, 'u-outsider'),
      member('admin', ['content.read', 'policy.manage'], 'membership:admin'),
    ],
  ]);
});

const ALL_PERMISSIONS = [
  'content.read',
  'content.share',
  'content.govern',
  'sharing.manage',
  'members.manage',
  'owners.manage',
  'roles.manage',
  'groups.manage',
  'policy.manage',
  'identity.read',
  'identity.manage',
  'directory.manage',
  'audit.read',
  'billing.read',
  'workspace.settings',
  'ownership.transfer',
  'workspace.delete',
  'billing.contracts.manage',
] as const;

describe('L1 Security - direct API bypass', () => {
  test('SECURITY: a viewer calling the API directly is refused the permission the UI hides', async () => {
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-viewer', 'policy.manage', DENIED),
    );
    expect(denial['status']).toBe(403);
    expect(denial['code']).toBe('permission_denied');
    expect(denial['stage']).toBe('permission');
    expect(denial['requiredPermission']).toBe('policy.manage');
    expect(denial['message']).toBe(DENIED);
  });

  test('SECURITY: naming another workspace in the request is refused, not honoured', async () => {
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-outsider', 'policy.manage', DENIED),
    );
    expect(denial['code']).toBe('not_a_member');
    expect(denial['stage']).toBe('membership');
  });

  test('SECURITY: being the creator of a workspace is not itself authorization', async () => {
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-creator', 'content.read', DENIED),
    );
    expect(denial['code']).toBe('not_a_member');
  });

  test('SECURITY: an ownership permission is refused to a non-Primary-Owner who was granted it', async () => {
    world.members.set(key(ORG, 'u-escalated'), {
      role: 'admin',
      permissions: ['content.read', 'workspace.delete'],
      grants: [{ source: 'role:custom', permissions: ['content.read', 'workspace.delete'] }],
    });
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-escalated', 'workspace.delete', DENIED),
    );
    expect(denial['code']).toBe('primary_owner_only');
  });

  test('HAPPY_PATH: the Primary Owner keeps the three ownership permissions', async () => {
    const permissions = await requireMemberPermission(ORG, 'u-owner', 'workspace.delete', DENIED);
    expect(permissions.has('workspace.delete')).toBe(true);
  });
});

describe('L1 Security - Analytics Viewer content-access leakage', () => {
  test('SECURITY: a viewer added for analytics cannot share, govern or export', async () => {
    for (const permission of ['content.share', 'content.govern', 'sharing.manage'] as const) {
      const denial = await denialOf(requireMemberPermission(ORG, 'u-viewer', permission, DENIED));
      expect(denial['code'], permission).toBe('permission_denied');
    }
  });

  test('SECURITY: a viewer holding audit.read still cannot read workspace content', async () => {
    world.members.set(key(ORG, 'u-analytics'), {
      role: 'viewer',
      permissions: ['audit.read'],
      grants: [{ source: 'role:analytics_viewer', permissions: ['audit.read'] }],
    });
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-analytics', 'content.read', DENIED),
    );
    expect(denial['code']).toBe('permission_denied');
    const explanation = await explainMemberAuthorization(db as never, ORG, 'u-analytics');
    expect(explanation.permissions).toEqual(['audit.read']);
  });

  test('SECURITY: requirePermission refuses a null membership before it reads a permission', () => {
    expect(() => requirePermission(null, 'content.read', 'denied')).toThrow(
      /not a member of this workspace/i,
    );
  });

  test('SECURITY: a membership with no organization is refused, never read as personal scope', () => {
    expect(() =>
      requirePermission(
        { organizationId: '', role: 'admin', permissions: new Set(['content.read']) } as never,
        'content.read',
        'denied',
      ),
    ).toThrow(/not a member of this workspace/i);
  });

  test('SECURITY: requireMemberPermission on a workspace the caller never joined says so', async () => {
    const denial = await denialOf(
      requireMemberPermission(ORG, 'u-nobody', 'content.read', 'denied'),
    );
    expect(denial['code']).toBe('not_a_member');
    expect(denial['stage']).toBe('membership');
  });
});

describe('L1 Security - self escalation through the role-assignment path', () => {
  const ADMIN_HOLDS = new Set(['content.read', 'members.manage']);

  function assign(subjectUserId: string, roleIds: string[]) {
    return setMemberRoles(db as never, {
      organizationId: ORG,
      userId: subjectUserId,
      roleIds,
      actorUserId: 'u-admin',
      actorPermissions: ADMIN_HOLDS,
    });
  }

  function inserts(): number {
    return query.mock.calls.filter(([sql]) => String(sql).includes('insert into')).length;
  }

  test('SECURITY: granting yourself a permission you lack is refused and nothing is written', async () => {
    await expect(assign('u-admin', [OWNERS_ROLE])).rejects.toMatchObject({ statusCode: 403 });
    expect(inserts()).toBe(0);
  });

  test('SECURITY: the attempt raises a critical security event and alerts the workspace', async () => {
    await expect(assign('u-admin', [OWNERS_ROLE])).rejects.toThrow();
    expect(logSecurityEvent).toHaveBeenCalledTimes(1);
    const event = logSecurityEvent.mock.calls[0]?.[0] as SecurityEvent;
    expect(event.severity).toBe('critical');
    expect(event.details['escalatedPermissions']).toEqual(['owners.manage']);
    expect(sendSupportEmail).toHaveBeenCalledTimes(1);
    const mail = sendSupportEmail.mock.calls[0]?.[0] as SupportEmail;
    expect(mail.to).toBe('owner@example.test');
    expect(mail.text).toContain('owners.manage');
  });

  test('SECURITY: a grant inside the permissions the granter holds is allowed through', async () => {
    const change = await assign('u-viewer', [READER_ROLE]);
    expect(change).toEqual({ added: [READER_ROLE], removed: [] });
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(sendSupportEmail).not.toHaveBeenCalled();
  });

  test('SECURITY: granting somebody else more than you hold is refused without the self-grant alert', async () => {
    await expect(assign('u-viewer', [OWNERS_ROLE])).rejects.toMatchObject({ statusCode: 403 });
    expect(logSecurityEvent).toHaveBeenCalledTimes(1);
    expect(sendSupportEmail).not.toHaveBeenCalled();
  });
});

describe('L1 Security - effective permission explanation', () => {
  test('HAPPY_PATH: names every grant, what was withheld, and the precedence followed', async () => {
    world.members.set(key(ORG, 'u-multi'), {
      role: 'member',
      permissions: ['content.read', 'content.share', 'audit.read'],
      grants: [
        { source: 'membership:member', permissions: ['content.read', 'content.share'] },
        { source: 'group:Analytics:viewer', permissions: ['content.read', 'audit.read'] },
        { source: 'role:custom', permissions: ['ownership.transfer'] },
      ],
    });

    const explanation = await explainMemberAuthorization(db as never, ORG, 'u-multi');
    expect(explanation.permissions).toEqual(['audit.read', 'content.read', 'content.share']);
    expect(explanation.grantedBy['content.read']).toEqual([
      'group:Analytics:viewer',
      'membership:member',
    ]);
    expect(explanation.withheld['ownership.transfer']).toBe('primary_owner_only');
    expect(explanation.precedence.map((stage) => stage.stage)).toEqual([
      'membership',
      'entitlement',
      'permission',
      'policy',
      'rollout',
    ]);
  });

  test('SECURITY: a non-member explanation confers nothing', async () => {
    const explanation = await explainMemberAuthorization(db as never, ORG, 'u-nobody');
    expect(explanation.permissions).toEqual([]);
    expect(explanation.isPrimaryOwner).toBe(false);
  });
});

describe('L1 Security - the decision function is the only rule', () => {
  test('SECURITY: a membership row alone authorizes nothing without the permission', () => {
    const decision = evaluateAuthorization(
      {
        organizationId: ORG,
        isMember: true,
        isPrimaryOwner: false,
        permissions: [],
        entitledFeatures: null,
        controls: DEFAULT_WORKSPACE_CONTROLS,
        policyRevision: 0,
      },
      { permission: 'content.read' },
    );
    expect(decision.allowed).toBe(false);
  });
});
