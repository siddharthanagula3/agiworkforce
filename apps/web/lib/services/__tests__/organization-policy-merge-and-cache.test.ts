import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  DEFAULT_WORKSPACE_CONTROLS,
  resolveWorkspaceControls,
  type AdminPolicy,
  type WorkspacePolicyOverride,
} from '@agiworkforce/types';

import {
  clearIpAllowListCacheForTests,
  getCachedIpAllowList,
  setCachedIpAllowList,
} from '../organization-ip-allow-list-cache';
import {
  defaultAdminPolicyFor,
  parseWorkspaceControlsLayer,
  readWorkspaceControls,
  simulateAdminPolicyChange,
  upsertOrganizationPolicy,
} from '../organization-policy-service';

const ORGANIZATION_ID = 'org_merge_cache';

function policy(overrides: Partial<AdminPolicy> = {}): AdminPolicy {
  return {
    ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    organizationId: ORGANIZATION_ID,
    updatedAt: new Date(0).toISOString(),
    allowedPrivacyModes: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.allowedPrivacyModes],
    chatSyncSurfaces: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces],
    metadata: {},
    ...overrides,
  };
}

describe('a malformed policy payload never widens what is in force', () => {
  it('drops a layer that is not an object', () => {
    expect(parseWorkspaceControlsLayer('yes')).toEqual({});
    expect(parseWorkspaceControlsLayer(['web'])).toEqual({});
    expect(parseWorkspaceControlsLayer(null)).toEqual({});
  });

  it('drops a feature flag that is not a boolean', () => {
    const layer = parseWorkspaceControlsLayer({ featureAccess: { web_search: 'true' } });
    expect(layer.featureAccess).toEqual({});
  });

  it('drops an unknown feature name and an invalid reasoning effort', () => {
    const layer = parseWorkspaceControlsLayer({
      featureAccess: { not_a_feature: false },
      maxReasoningEffort: 'maximum',
    });
    expect(layer.featureAccess).toEqual({});
    expect(layer.maxReasoningEffort).toBeUndefined();
  });

  it('keeps the shipped defaults when metadata carries garbage', () => {
    expect(readWorkspaceControls({ controls: 42 })).toEqual({
      featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess },
      defaultModelId: null,
      maxReasoningEffort: null,
      allowedCountries: [],
      allowedSurfaces: null,
    });
  });

  it('keeps only the country codes that are well formed', () => {
    const layer = parseWorkspaceControlsLayer({ allowedCountries: ['us', 'DEU', 7, 'FR'] });
    expect(layer.allowedCountries).toEqual(['FR', 'US']);
  });
});

describe('layer precedence', () => {
  const feature = Object.keys(
    DEFAULT_WORKSPACE_CONTROLS.featureAccess,
  )[0] as keyof typeof DEFAULT_WORKSPACE_CONTROLS.featureAccess;

  function override(enabled: boolean, subjectType: string, subjectId: string) {
    return {
      id: `ovr_${subjectType}_${String(enabled)}`,
      subjectType,
      subjectId,
      layer: { featureAccess: { [feature]: enabled } },
    } as unknown as WorkspacePolicyOverride;
  }

  it('lets a narrower layer take a feature away', () => {
    const base = {
      ...DEFAULT_WORKSPACE_CONTROLS,
      featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, [feature]: true },
    };
    const resolved = resolveWorkspaceControls(base, [override(false, 'group', 'grp_1')]);
    expect(resolved.featureAccess[feature]).toBe(false);
  });

  it('never lets a role or group layer hand back what the organization denied', () => {
    const base = {
      ...DEFAULT_WORKSPACE_CONTROLS,
      featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, [feature]: false },
    };
    const resolved = resolveWorkspaceControls(base, [
      override(true, 'role', 'admin'),
      override(true, 'user', 'usr_1'),
    ]);
    expect(resolved.featureAccess[feature]).toBe(false);
  });

  it('resolves an unconfigured organization to the restrictive defaults, not to permissive ones', () => {
    const fallback = defaultAdminPolicyFor(ORGANIZATION_ID);
    expect(fallback.allowManagedCompute).toBe(false);
    expect(fallback.allowCliCloudSync).toBe(false);
    expect(fallback.allowMemory).toBe(false);
  });
});

describe('a policy write evicts the cache it invalidates', () => {
  beforeEach(() => {
    clearIpAllowListCacheForTests();
  });

  it('drops the cached allow list on every upsert, not only the one route that remembers to', async () => {
    setCachedIpAllowList(ORGANIZATION_ID, ['10.0.0.0/8']);
    expect(getCachedIpAllowList(ORGANIZATION_ID)).toEqual(['10.0.0.0/8']);

    const db = {
      query: vi.fn().mockResolvedValue([
        {
          organization_id: ORGANIZATION_ID,
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
          metadata: { ipAllowList: ['192.168.0.0/16'] },
          updated_at: new Date(0).toISOString(),
        },
      ]),
    };

    const { organizationId: _organizationId, updatedAt: _updatedAt, ...input } = policy();
    await upsertOrganizationPolicy(db as never, ORGANIZATION_ID, input);

    expect(getCachedIpAllowList(ORGANIZATION_ID)).toBeUndefined();
  });

  it('leaves the cached allow list of another organization alone', async () => {
    setCachedIpAllowList('org_other', ['172.16.0.0/12']);
    const db = { query: vi.fn().mockResolvedValue([]) };
    const { organizationId: _organizationId, updatedAt: _updatedAt, ...input } = policy();
    await expect(upsertOrganizationPolicy(db as never, ORGANIZATION_ID, input)).rejects.toThrow();
    expect(getCachedIpAllowList('org_other')).toEqual(['172.16.0.0/12']);
  });
});

describe('blast radius of a policy change', () => {
  it('reports nothing for a no-op', () => {
    const current = policy();
    expect(simulateAdminPolicyChange(current, current)).toEqual({
      narrowing: [],
      widening: [],
      neutral: [],
      revokesAccess: false,
    });
  });

  it('names a permission being taken away', () => {
    const result = simulateAdminPolicyChange(
      policy({ externalSharingEnabled: true, allowMemory: true }),
      policy({ externalSharingEnabled: false, allowMemory: true }),
    );
    expect(result.revokesAccess).toBe(true);
    expect(result.narrowing.map((impact) => impact.key)).toEqual(['externalSharingEnabled']);
  });

  it('counts a new requirement as narrowing', () => {
    const result = simulateAdminPolicyChange(
      policy({ requireMfa: false }),
      policy({ requireMfa: true }),
    );
    expect(result.narrowing.map((impact) => impact.key)).toEqual(['requireMfa']);
  });

  it('counts a granted permission as widening', () => {
    const result = simulateAdminPolicyChange(
      policy({ allowManagedCompute: false }),
      policy({ allowManagedCompute: true }),
    );
    expect(result.revokesAccess).toBe(false);
    expect(result.widening.map((impact) => impact.key)).toEqual(['allowManagedCompute']);
  });

  it('reads a first IP allow list as narrowing and its removal as widening', () => {
    const locked = simulateAdminPolicyChange(
      policy({ ipAllowList: [] }),
      policy({ ipAllowList: ['10.0.0.0/8'] }),
    );
    expect(locked.narrowing.map((impact) => impact.key)).toEqual(['ipAllowList']);

    const opened = simulateAdminPolicyChange(
      policy({ ipAllowList: ['10.0.0.0/8'] }),
      policy({ ipAllowList: [] }),
    );
    expect(opened.widening.map((impact) => impact.key)).toEqual(['ipAllowList']);
  });

  it('reads a shorter retention and a lower spend cap as narrowing', () => {
    const result = simulateAdminPolicyChange(
      policy({ retentionDays: 365, monthlySpendCapCents: 100_000 }),
      policy({ retentionDays: 30, monthlySpendCapCents: 10_000 }),
    );
    expect(result.narrowing.map((impact) => impact.key).sort()).toEqual([
      'monthlySpendCapCents',
      'retentionDays',
    ]);
  });

  it('descends into the workspace controls and names each feature that goes off', () => {
    const features = Object.keys(DEFAULT_WORKSPACE_CONTROLS.featureAccess).slice(0, 2);
    const before = policy({
      controls: {
        ...DEFAULT_WORKSPACE_CONTROLS,
        featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess },
      },
    });
    const after = policy({
      controls: {
        ...DEFAULT_WORKSPACE_CONTROLS,
        featureAccess: {
          ...DEFAULT_WORKSPACE_CONTROLS.featureAccess,
          [features[0] as string]: false,
          [features[1] as string]: false,
        },
      },
    });

    const result = simulateAdminPolicyChange(before, after);
    const keys = result.narrowing.map((impact) => impact.key);
    for (const feature of features) {
      expect(keys).toContain(`controls.featureAccess.${feature}`);
    }
  });

  it('treats a first save as the change it is, against the shipped defaults', () => {
    const result = simulateAdminPolicyChange(null, policy({ allowManagedCompute: true }));
    expect(result.widening.map((impact) => impact.key)).toContain('allowManagedCompute');
  });
});
