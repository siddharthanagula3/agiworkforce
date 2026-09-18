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
const logAuthorizationFailure = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/security-audit', () => ({ logSecurityEvent, logAuthorizationFailure }));

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

interface Member {
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
  grants: Array<{ source: string; permissions: string[] }>;
}

const world = {
  activeOrganizationId: ORG as string | null,
  members: new Map<string, Member>(),
  policyRow: null as Record<string, unknown> | null,
  overrides: [] as Array<Record<string, unknown>>,
  ownerEmail: 'owner@example.test' as string | null,
};

function key(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`;
}

const db = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const statement = String(sql);
    const [first, second] = params as [string, string];

    if (statement.includes("'membership:'")) {
      return world.members.get(key(first, second))?.grants ?? [];
    }
    // The layered-policy read names both tables, so it must be matched first.
    if (statement.includes('organization_admin_policies')) {
      return world.policyRow ? [world.policyRow] : [];
    }
    if (statement.includes('organization_policy_overrides')) {
      return world.overrides;
    }
    if (statement.includes('public.profiles')) {
      return world.ownerEmail ? [{ email: world.ownerEmail }] : [];
    }
    if (statement.includes('organization_member_permissions')) {
      const found = world.members.get(key(first, second));
      return statement.includes('(select role')
        ? [{ role: found?.role ?? null, permissions: found?.permissions ?? [] }]
        : [{ permissions: found?.permissions ?? [] }];
    }
    if (statement.includes('from public.organization_members')) {
      const found = world.members.get(key(first, second));
      return found ? [{ role: found.role }] : [];
    }
    return [];
  }),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

const { authorize, authorizeInWorkspace, explainMemberAuthorization } =
  await import('@/lib/authorization/authorize');
const { assertNoPermissionEscalation } = await import('@/lib/authorization/escalation');
const { isEnterpriseDenialError } = await import('@/lib/authorization/denial');
const { requireMemberPermission, requirePermission } =
  await import('@/lib/services/organization-permission-service');

function member(role: Member['role'], permissions: string[], grantSource: string): Member {
  return { role, permissions, grants: [{ source: grantSource, permissions }] };
}

function policyRow(controls: Record<string, unknown>, revision = 4, overrideCount = 0) {
  return {
    organization_id: ORG,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: false,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    retention_enforced: false,
    external_sharing_enabled: true,
    allow_memory: false,
    metadata: { controls },
    updated_at: '2026-09-17T00:00:00.000Z',
    revision,
    override_count: overrideCount,
  };
}

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
  world.policyRow = null;
  world.overrides = [];
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
    const denial = await denialOf(authorize('u-viewer', { permission: 'policy.manage' }));
    expect(denial['status']).toBe(403);
    expect(denial['code']).toBe('permission_denied');
    expect(denial['stage']).toBe('permission');
    expect(denial['requiredPermission']).toBe('policy.manage');
  });

  test('SECURITY: naming another workspace in the request is refused, not honoured', async () => {
    const denial = await denialOf(
      authorizeInWorkspace('u-outsider', ORG, { permission: 'policy.manage' }),
    );
    expect(denial['code']).toBe('not_a_member');
    expect(denial['stage']).toBe('membership');
  });

  test('SECURITY: being the creator of a workspace is not itself authorization', async () => {
    world.members.delete(key(ORG, 'u-creator'));
    const denial = await denialOf(authorize('u-creator', { permission: 'content.read' }));
    expect(denial['code']).toBe('not_a_member');
  });

  test('SECURITY: the route helper and the library refuse on the same facts', async () => {
    const viaService = await denialOf(
      requireMemberPermission(ORG, 'u-viewer', 'policy.manage', 'Your workspace role does not.'),
    );
    expect(viaService['status']).toBe(403);
    expect(viaService['code']).toBe('permission_denied');
    expect(viaService['message']).toBe('Your workspace role does not.');
  });

  test('SECURITY: an ownership permission is refused to a non-Primary-Owner who was granted it', async () => {
    world.members.set(key(ORG, 'u-escalated'), {
      role: 'admin',
      permissions: ['content.read', 'workspace.delete'],
      grants: [{ source: 'role:custom', permissions: ['content.read', 'workspace.delete'] }],
    });
    const denial = await denialOf(authorize('u-escalated', { permission: 'workspace.delete' }));
    expect(denial['code']).toBe('primary_owner_only');
  });

  test('HAPPY_PATH: the Primary Owner keeps the three ownership permissions', async () => {
    const facts = await authorize('u-owner', { permission: 'workspace.delete' });
    expect(facts.isPrimaryOwner).toBe(true);
  });
});

describe('L1 Security - Analytics Viewer content-access leakage', () => {
  test('SECURITY: a viewer added for analytics cannot share, govern or export', async () => {
    for (const permission of ['content.share', 'content.govern', 'sharing.manage'] as const) {
      const denial = await denialOf(authorize('u-viewer', { permission }));
      expect(denial['code'], permission).toBe('permission_denied');
    }
  });

  test('SECURITY: a viewer holding audit.read still cannot read workspace content', async () => {
    world.members.set(key(ORG, 'u-analytics'), {
      role: 'viewer',
      permissions: ['audit.read'],
      grants: [{ source: 'role:analytics_viewer', permissions: ['audit.read'] }],
    });
    const denial = await denialOf(authorize('u-analytics', { permission: 'content.read' }));
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

describe('L1 Security - policy outranks the permission grid', () => {
  test('SECURITY: an organization-wide feature deny survives a user exception that lifts it', async () => {
    world.policyRow = policyRow({ featureAccess: { browser: false } }, 9, 1);
    world.overrides = [
      {
        id: 'o-1',
        organization_id: ORG,
        subject_type: 'user',
        subject_id: 'u-admin',
        layer: { featureAccess: { browser: true } },
        updated_at: '2026-09-17T00:00:00.000Z',
      },
    ];

    const denial = await denialOf(authorize('u-admin', { feature: 'browser' }));
    expect(denial['code']).toBe('feature_disabled');
    expect(denial['stage']).toBe('policy');
    expect(denial['policyRevision']).toBe(9);
  });

  test('SECURITY: the rule version travels with the decision', async () => {
    world.policyRow = policyRow({ maxReasoningEffort: 'low' }, 12);
    const facts = await authorize('u-admin');
    expect(facts.policyRevision).toBe(12);
    expect(facts.controls.revision).toBe(12);
    expect(facts.controls.blockingRules.some((rule) => rule.scope === 'workspace')).toBe(true);
  });
});

describe('L1 Security - self escalation', () => {
  const escalation = {
    db: db as never,
    organizationId: ORG,
    granterUserId: 'u-admin',
    subjectUserId: 'u-admin',
    granterPermissions: ['content.read', 'members.manage'] as const,
    requestedPermissions: ['owners.manage'] as const,
  };

  test('SECURITY: granting yourself a permission you lack is refused', async () => {
    const denial = await denialOf(assertNoPermissionEscalation({ ...escalation }));
    expect(denial['code']).toBe('self_escalation_denied');
    expect(denial['blockingRule']).toBe('owners.manage');
  });

  test('SECURITY: the attempt raises a critical security event and alerts the workspace', async () => {
    await expect(assertNoPermissionEscalation({ ...escalation })).rejects.toThrow();
    expect(logSecurityEvent).toHaveBeenCalledTimes(1);
    const event = logSecurityEvent.mock.calls[0]?.[0] as {
      severity: string;
      details: Record<string, unknown>;
    };
    expect(event.severity).toBe('critical');
    expect(event.details['escalatedPermissions']).toEqual(['owners.manage']);
    expect(sendSupportEmail).toHaveBeenCalledTimes(1);
    const mail = sendSupportEmail.mock.calls[0]?.[0] as { to: string; text: string };
    expect(mail.to).toBe('owner@example.test');
    expect(mail.text).toContain('owners.manage');
  });

  test('SECURITY: a grant inside the permissions the granter holds is allowed through', async () => {
    const allowed = await assertNoPermissionEscalation({
      ...escalation,
      subjectUserId: 'u-viewer',
      requestedPermissions: ['content.read'] as const,
    });
    expect(allowed).toBeNull();
    expect(sendSupportEmail).not.toHaveBeenCalled();
  });

  test('SECURITY: granting somebody else more than you hold is refused without the self-grant alert', async () => {
    await expect(
      assertNoPermissionEscalation({ ...escalation, subjectUserId: 'u-viewer' }),
    ).rejects.toThrow();
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
