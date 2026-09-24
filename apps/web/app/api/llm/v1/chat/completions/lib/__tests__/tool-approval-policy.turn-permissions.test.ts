import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const organizations = vi.hoisted(() => ({
  resolveGoverningOrganizationIds: vi.fn(),
  readOrganizationPolicy: vi.fn(),
}));

vi.mock('@/lib/services/governing-organizations', () => ({
  resolveGoverningOrganizationIds: organizations.resolveGoverningOrganizationIds,
}));
vi.mock('@/lib/services/organization-policy-service', () => ({
  readOrganizationPolicy: organizations.readOrganizationPolicy,
}));

import {
  autonomousToolApprovalsAvailable,
  loadToolApprovalPolicy,
  loadTurnToolPermissions,
} from '../tool-approval-policy';
import { EMPTY_CONNECTOR_TOOL_PERMISSIONS } from '../connector-tool-permissions';

function dbWithStoredPolicy(defaultPolicy: string): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('user_settings')) {
      return [{ settings: { 'tool-approvals': { defaultPolicy } } }];
    }
    return [];
  });
  return { query } as unknown as DatabaseAdapter;
}

function permitAutonomy(permitted: boolean): void {
  organizations.resolveGoverningOrganizationIds.mockResolvedValue(['org_1']);
  organizations.readOrganizationPolicy.mockResolvedValue({
    metadata: permitted ? {} : { allowAutonomousToolApprovals: false },
  });
}

describe('loadToolApprovalPolicy', () => {
  beforeEach(() => {
    organizations.resolveGoverningOrganizationIds.mockReset();
    organizations.readOrganizationPolicy.mockReset();
  });

  it('uses Skip approvals for a website account with no stored choice', async () => {
    permitAutonomy(true);
    const db = { query: vi.fn(async () => []) } as unknown as DatabaseAdapter;

    await expect(loadToolApprovalPolicy(db, 'user_1')).resolves.toBe('autonomous');
  });

  it('asks when the account policy read fails', async () => {
    const db = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as DatabaseAdapter;

    await expect(loadToolApprovalPolicy(db, 'user_1')).resolves.toBe('ask_every_time');
  });

  it('returns the stored autonomous choice when every governing workspace permits it', async () => {
    permitAutonomy(true);

    await expect(loadToolApprovalPolicy(dbWithStoredPolicy('autonomous'), 'user_1')).resolves.toBe(
      'autonomous',
    );
  });

  it('drops the stored autonomous choice to the default when a workspace forbids it', async () => {
    permitAutonomy(false);

    await expect(loadToolApprovalPolicy(dbWithStoredPolicy('autonomous'), 'user_1')).resolves.toBe(
      'ask_every_time',
    );
  });

  it('forbids when any one of several governing workspaces forbids', async () => {
    organizations.resolveGoverningOrganizationIds.mockResolvedValue(['org_1', 'org_2']);
    organizations.readOrganizationPolicy.mockImplementation(
      async (_db: unknown, organizationId: string) => ({
        metadata: organizationId === 'org_2' ? { allowAutonomousToolApprovals: false } : {},
      }),
    );

    await expect(loadToolApprovalPolicy(dbWithStoredPolicy('autonomous'), 'user_1')).resolves.toBe(
      'ask_every_time',
    );
  });

  it('does not read workspace policy for a choice no workspace governs', async () => {
    permitAutonomy(false);

    await expect(
      loadToolApprovalPolicy(dbWithStoredPolicy('auto_approve_read_only'), 'user_1'),
    ).resolves.toBe('auto_approve_read_only');
    expect(organizations.resolveGoverningOrganizationIds).not.toHaveBeenCalled();
  });

  it('permits autonomy for an account in no organization', async () => {
    organizations.resolveGoverningOrganizationIds.mockResolvedValue([]);

    await expect(loadToolApprovalPolicy(dbWithStoredPolicy('autonomous'), 'user_1')).resolves.toBe(
      'autonomous',
    );
    expect(organizations.readOrganizationPolicy).not.toHaveBeenCalled();
  });
});

describe('autonomousToolApprovalsAvailable', () => {
  beforeEach(() => {
    organizations.resolveGoverningOrganizationIds.mockReset();
    organizations.readOrganizationPolicy.mockReset();
  });

  it('answers false when the workspace read fails', async () => {
    organizations.resolveGoverningOrganizationIds.mockRejectedValue(new Error('offline'));

    await expect(
      autonomousToolApprovalsAvailable(dbWithStoredPolicy('ask_every_time'), 'user_1'),
    ).resolves.toBe(false);
  });

  it('answers the workspace permission for a signed-in account', async () => {
    permitAutonomy(true);

    await expect(
      autonomousToolApprovalsAvailable(dbWithStoredPolicy('ask_every_time'), 'user_1'),
    ).resolves.toBe(true);
  });
});

describe('loadTurnToolPermissions', () => {
  beforeEach(() => {
    organizations.resolveGoverningOrganizationIds.mockReset();
    organizations.readOrganizationPolicy.mockReset();
  });

  it('honours the stored preference on a model that cannot call tools', async () => {
    permitAutonomy(true);
    const db = dbWithStoredPolicy('auto_approve_read_only');

    const permissions = await loadTurnToolPermissions(db, 'user_1', { modelSupportsTools: false });

    expect(permissions.toolApprovalPolicy).toBe('auto_approve_read_only');
    expect(permissions.connectorPermissions).toBe(EMPTY_CONNECTOR_TOOL_PERMISSIONS);
  });

  it('honours the stored autonomous preference on a model that cannot call tools', async () => {
    permitAutonomy(true);

    const permissions = await loadTurnToolPermissions(dbWithStoredPolicy('autonomous'), 'user_1', {
      modelSupportsTools: false,
    });

    expect(permissions.toolApprovalPolicy).toBe('autonomous');
  });

  it('loads the connector verdicts when the model can call tools', async () => {
    permitAutonomy(true);

    const permissions = await loadTurnToolPermissions(
      dbWithStoredPolicy('auto_approve_read_only'),
      'user_1',
      { modelSupportsTools: true },
    );

    expect(permissions.connectorPermissions).not.toBe(EMPTY_CONNECTOR_TOOL_PERMISSIONS);
  });

  it('performs no account reads when the admitted turn offers no tools or connectors', async () => {
    const query = vi.fn(async () => []);
    const db = { query } as unknown as DatabaseAdapter;

    const permissions = await loadTurnToolPermissions(db, 'user_1', {
      modelSupportsTools: true,
      connectorPermissionsRequired: false,
      toolApprovalPolicyRequired: false,
    });

    expect(query).not.toHaveBeenCalled();
    expect(permissions).toEqual({
      connectorPermissions: EMPTY_CONNECTOR_TOOL_PERMISSIONS,
      toolApprovalPolicy: 'ask_every_time',
    });
  });
});
