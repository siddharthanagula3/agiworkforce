import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  describeEffectiveWorkspaceControls,
  resolveModelImprovementEligibility,
} from '../organization-policy-gate';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORGANIZATION_ID,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: false,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web', 'desktop', 'mobile'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    metadata: {},
    updated_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  };
}

function governedWorkspace(h: ReturnType<typeof harness>, controls: Record<string, unknown>) {
  h.query
    .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
    .mockResolvedValueOnce([policyRow({ metadata: { controls }, revision: '4' })]);
}

describe('resolveModelImprovementEligibility', () => {
  const ASK = { source: 'user_content', accountOptIn: true, feedbackOptIn: true } as const;

  beforeEach(() => vi.clearAllMocks());

  it('leaves an ungoverned account to its own opt-in', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await expect(resolveModelImprovementEligibility(h.db, 'user-1', ASK)).resolves.toMatchObject({
      eligible: true,
    });
  });

  it('honours a workspace that turned model improvement off', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { modelImprovement: { allowed: false } } })]);

    await expect(resolveModelImprovementEligibility(h.db, 'user-1', ASK)).resolves.toMatchObject({
      eligible: false,
      code: 'enterprise_policy_denies',
    });
  });

  it('refuses connector content even where the workspace allows improvement', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockResolvedValueOnce([policyRow({ metadata: { modelImprovement: { allowed: true } } })]);

    await expect(
      resolveModelImprovementEligibility(h.db, 'user-1', {
        ...ASK,
        source: 'connector_content',
        connectorId: 'google-drive',
      }),
    ).resolves.toMatchObject({ eligible: false, code: 'connector_content_not_eligible' });
  });

  it('denies rather than assuming consent when the policy cannot be read', async () => {
    const h = harness();
    h.query
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(resolveModelImprovementEligibility(h.db, 'user-1', ASK)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});

describe('describeEffectiveWorkspaceControls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports a personal-scope member as ungoverned and keeps their own choices', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const view = await describeEffectiveWorkspaceControls(h.db, 'user-1', {
      featureAccess: { browser: false },
      maxReasoningEffort: 'high',
    });

    expect(view.organizationId).toBeNull();
    expect(view.features.browser).toEqual({
      effective: false,
      preferred: false,
      enforced: true,
      governed: false,
      explanation: null,
    });
    expect(view.features.code.effective).toBe(true);
    expect(view.maxReasoningEffort.effective).toBe('high');
    expect(view.maxReasoningEffort.governed).toBe(false);
  });

  it('shows the member the effective value and the administrator the enforced value', async () => {
    const h = harness();
    governedWorkspace(h, { featureAccess: { computer_use: false } });

    const view = await describeEffectiveWorkspaceControls(h.db, 'user-1', {
      featureAccess: { computer_use: true },
    });

    expect(view.organizationId).toBe(ORGANIZATION_ID);
    expect(view.revision).toBe(4);
    expect(view.features.computer_use.effective).toBe(false);
    expect(view.features.computer_use.enforced).toBe(false);
    expect(view.features.computer_use.governed).toBe(true);
  });

  it('explains a disabled control by naming the policy scope that turned it off', async () => {
    const h = harness();
    governedWorkspace(h, { featureAccess: { remote_control: false } });

    const view = await describeEffectiveWorkspaceControls(h.db, 'user-1');

    expect(view.features.remote_control.explanation).toBe(
      'Remote Control is turned off by workspace policy.',
    );
    expect(view.features.work.explanation).toBeNull();
  });

  it('preserves the preference underneath policy so it returns when policy is lifted', async () => {
    const governed = harness();
    governedWorkspace(governed, { featureAccess: { schedules: false } });

    const preferences = { featureAccess: { schedules: true } };
    const underPolicy = await describeEffectiveWorkspaceControls(
      governed.db,
      'user-1',
      preferences,
    );
    expect(underPolicy.features.schedules.effective).toBe(false);
    expect(underPolicy.features.schedules.preferred).toBe(true);
    expect(governed.execute).not.toHaveBeenCalled();

    const lifted = harness();
    governedWorkspace(lifted, {});
    const afterPolicy = await describeEffectiveWorkspaceControls(lifted.db, 'user-1', preferences);
    expect(afterPolicy.features.schedules.effective).toBe(true);
  });

  it('caps a preferred reasoning effort and says what capped it', async () => {
    const h = harness();
    governedWorkspace(h, { maxReasoningEffort: 'low' });

    const view = await describeEffectiveWorkspaceControls(h.db, 'user-1', {
      maxReasoningEffort: 'max',
    });

    expect(view.maxReasoningEffort).toEqual({
      effective: 'low',
      preferred: 'max',
      enforced: 'low',
      governed: true,
      explanation: 'Reasoning effort is capped at low by workspace policy.',
    });
  });

  it('leaves a preferred effort below the cap alone', async () => {
    const h = harness();
    governedWorkspace(h, { maxReasoningEffort: 'high' });

    const view = await describeEffectiveWorkspaceControls(h.db, 'user-1', {
      maxReasoningEffort: 'low',
    });

    expect(view.maxReasoningEffort.effective).toBe('low');
    expect(view.maxReasoningEffort.governed).toBe(false);
  });
});
