import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { DEFAULT_ENTERPRISE_ADMIN_POLICY, type AdminPolicy } from '@agiworkforce/types';
import { deriveCollectionState } from '../enterprise-collection-state';
import {
  evaluateBillingHold,
  evaluateOrganizationPolicy,
  UNSCOPED_POLICY_DECISION,
} from '../organization-policy-evaluator';

const ORG_ID = '00000000-0000-4000-8000-000000000001';

function policy(overrides: Partial<AdminPolicy> = {}): AdminPolicy {
  return {
    ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
    allowedPrivacyModes: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.allowedPrivacyModes],
    chatSyncSurfaces: [...DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces],
    organizationId: ORG_ID,
    updatedAt: '2026-08-22T00:00:00.000Z',
    ...overrides,
  };
}

const permissive = policy({
  allowManagedCompute: true,
  allowedPrivacyModes: ['local', 'byok', 'managed'],
  defaultPrivacyMode: 'managed',
});

describe('evaluateOrganizationPolicy, managed compute', () => {
  it('denies when the administrator has turned managed compute off', () => {
    const decision = evaluateOrganizationPolicy(policy({ allowManagedCompute: false }), {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('managed_compute_disabled');
  });

  it('denies when managed compute is on but the managed privacy mode is not allowed', () => {
    const decision = evaluateOrganizationPolicy(
      policy({ allowManagedCompute: true, allowedPrivacyModes: ['local', 'byok'] }),
      { resource: 'managed_compute', surface: 'web' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('privacy_mode_not_allowed');
  });

  it('denies a surface the administrator has not enabled for cloud sync', () => {
    const decision = evaluateOrganizationPolicy(permissive, {
      resource: 'managed_compute',
      surface: 'cli',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('surface_sync_disabled');
    expect(decision.reason).toContain('CLI');
  });

  it('allows an enabled surface under a permissive policy', () => {
    const decision = evaluateOrganizationPolicy(permissive, {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed');
  });

  it('allows the CLI once the administrator enables developer cloud sync', () => {
    const decision = evaluateOrganizationPolicy(
      policy({
        allowManagedCompute: true,
        allowedPrivacyModes: ['local', 'byok', 'managed'],
        defaultPrivacyMode: 'managed',
        allowCliCloudSync: true,
      }),
      { resource: 'managed_compute', surface: 'cli' },
    );

    expect(decision.allowed).toBe(true);
  });

  it('does not apply the per-surface switch to API or unhinted callers', () => {
    for (const surface of ['api', 'unknown'] as const) {
      expect(
        evaluateOrganizationPolicy(permissive, { resource: 'managed_compute', surface }).allowed,
      ).toBe(true);
    }
  });

  it('still binds allowManagedCompute on an unhinted caller', () => {
    const decision = evaluateOrganizationPolicy(
      policy({ allowManagedCompute: false, allowedPrivacyModes: ['local', 'byok', 'managed'] }),
      { resource: 'managed_compute', surface: 'unknown' },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('managed_compute_disabled');
  });
});

describe('evaluateOrganizationPolicy, chat sync', () => {
  it('denies a surface removed from chatSyncSurfaces', () => {
    const decision = evaluateOrganizationPolicy(policy({ chatSyncSurfaces: ['web'] }), {
      resource: 'chat_sync',
      surface: 'mobile',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('surface_sync_disabled');
  });

  it('allows a surface listed in chatSyncSurfaces', () => {
    const decision = evaluateOrganizationPolicy(policy({ chatSyncSurfaces: ['web', 'mobile'] }), {
      resource: 'chat_sync',
      surface: 'mobile',
    });

    expect(decision.allowed).toBe(true);
  });

  it('reads each developer surface from its own switch', () => {
    const vscodeOnly = policy({ allowVsCodeCloudSync: true, allowChromeCloudSync: false });

    expect(
      evaluateOrganizationPolicy(vscodeOnly, { resource: 'chat_sync', surface: 'vscode' }).allowed,
    ).toBe(true);
    expect(
      evaluateOrganizationPolicy(vscodeOnly, { resource: 'chat_sync', surface: 'chrome' }).allowed,
    ).toBe(false);
  });
});

describe('evaluateOrganizationPolicy, privacy mode and audit export', () => {
  it('denies a privacy mode outside allowedPrivacyModes', () => {
    const decision = evaluateOrganizationPolicy(policy({ allowedPrivacyModes: ['local'] }), {
      resource: 'privacy_mode',
      mode: 'byok',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('privacy_mode_not_allowed');
  });

  it('allows a privacy mode inside allowedPrivacyModes', () => {
    const decision = evaluateOrganizationPolicy(
      policy({ allowedPrivacyModes: ['local', 'byok'] }),
      {
        resource: 'privacy_mode',
        mode: 'byok',
      },
    );

    expect(decision.allowed).toBe(true);
  });

  it('denies audit export when the administrator has turned it off', () => {
    const decision = evaluateOrganizationPolicy(policy({ auditExportEnabled: false }), {
      resource: 'audit_export',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('audit_export_disabled');
  });
});

describe('evaluateOrganizationPolicy, mfa', () => {
  it('denies an unenrolled caller when the administrator requires mfa', () => {
    const decision = evaluateOrganizationPolicy(policy({ requireMfa: true }), {
      resource: 'mfa',
      mfaEnrolled: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('mfa_required');
  });

  it('allows an enrolled caller when the administrator requires mfa', () => {
    const decision = evaluateOrganizationPolicy(policy({ requireMfa: true }), {
      resource: 'mfa',
      mfaEnrolled: true,
    });

    expect(decision.allowed).toBe(true);
  });

  it('allows an unenrolled caller when the administrator does not require mfa', () => {
    const decision = evaluateOrganizationPolicy(policy({ requireMfa: false }), {
      resource: 'mfa',
      mfaEnrolled: false,
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('evaluateOrganizationPolicy, spend cap', () => {
  it('denies once month-to-date spend reaches the cap', () => {
    const decision = evaluateOrganizationPolicy(policy({ monthlySpendCapCents: 10_000 }), {
      resource: 'spend_cap',
      monthToDateSpendCents: 10_000,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('spend_cap_exceeded');
  });

  it('allows spend under the cap', () => {
    const decision = evaluateOrganizationPolicy(policy({ monthlySpendCapCents: 10_000 }), {
      resource: 'spend_cap',
      monthToDateSpendCents: 9_999,
    });

    expect(decision.allowed).toBe(true);
  });

  it('allows any spend when no cap is configured', () => {
    const decision = evaluateOrganizationPolicy(policy({ monthlySpendCapCents: null }), {
      resource: 'spend_cap',
      monthToDateSpendCents: 1_000_000,
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('evaluateOrganizationPolicy, obligations', () => {
  it('carries the preview requirement and retention window on every decision', () => {
    const subject = policy({ requireLocalToByokPreview: true, retentionDays: 30 });

    for (const decision of [
      evaluateOrganizationPolicy(subject, { resource: 'managed_compute', surface: 'web' }),
      evaluateOrganizationPolicy(subject, { resource: 'chat_sync', surface: 'web' }),
      evaluateOrganizationPolicy(subject, { resource: 'privacy_mode', mode: 'local' }),
      evaluateOrganizationPolicy(subject, { resource: 'audit_export' }),
    ]) {
      expect(decision.obligations).toEqual([
        { type: 'local_to_byok_preview', value: true },
        { type: 'retention_days', value: 30 },
      ]);
    }
  });
});

const NOW_MS = Date.parse('2026-09-04T00:00:00.000Z');

function collectionStateForDaysPastDue(daysPastDue: number) {
  return deriveCollectionState(
    NOW_MS,
    new Date(NOW_MS - daysPastDue * 24 * 60 * 60 * 1000).toISOString(),
  );
}

describe('evaluateBillingHold', () => {
  it('denies managed compute once the workspace is read-only past day 90', () => {
    const decision = evaluateBillingHold(
      { resource: 'managed_compute', surface: 'web' },
      collectionStateForDaysPastDue(95),
    );

    expect(decision?.allowed).toBe(false);
    expect(decision?.code).toBe('billing_read_only');
  });

  it('does not block managed compute in the 61-90 day window, only new paid usage', () => {
    expect(
      evaluateBillingHold(
        { resource: 'managed_compute', surface: 'web' },
        collectionStateForDaysPastDue(75),
      ),
    ).toBeNull();
  });

  it('denies a credit top-up and a seat purchase once past day 60', () => {
    const collectionState = collectionStateForDaysPastDue(61);

    for (const ask of [{ resource: 'credit_topup' }, { resource: 'seat_purchase' }] as const) {
      const decision = evaluateBillingHold(ask, collectionState);
      expect(decision?.allowed).toBe(false);
      expect(decision?.code).toBe('billing_past_due');
    }
  });

  it('allows every resource when the workspace is current on payment', () => {
    const collectionState = collectionStateForDaysPastDue(0);

    for (const ask of [
      { resource: 'managed_compute', surface: 'web' },
      { resource: 'credit_topup' },
      { resource: 'seat_purchase' },
    ] as const) {
      expect(evaluateBillingHold(ask, collectionState)).toBeNull();
    }
  });

  it('never intercepts a resource that is not content-creating or a paid usage commitment', () => {
    const readOnly = collectionStateForDaysPastDue(95);

    for (const ask of [
      { resource: 'chat_sync', surface: 'web' },
      { resource: 'privacy_mode', mode: 'local' },
      { resource: 'audit_export' },
      { resource: 'external_sharing' },
      { resource: 'mfa', mfaEnrolled: true },
      { resource: 'spend_cap', monthToDateSpendCents: 0 },
    ] as const) {
      expect(evaluateBillingHold(ask, readOnly)).toBeNull();
    }
  });
});

describe('evaluateOrganizationPolicy, billing hold', () => {
  it('overrides a permissive policy once the workspace is read-only for non-payment', () => {
    const decision = evaluateOrganizationPolicy(
      permissive,
      { resource: 'managed_compute', surface: 'web' },
      collectionStateForDaysPastDue(95),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_read_only');
  });

  it('blocks a seat purchase through a saved policy once new paid usage is blocked', () => {
    const decision = evaluateOrganizationPolicy(
      permissive,
      { resource: 'seat_purchase' },
      collectionStateForDaysPastDue(65),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('billing_past_due');
  });

  it('leaves reads, exports and settings allowed while read-only', () => {
    const readOnly = collectionStateForDaysPastDue(95);

    expect(
      evaluateOrganizationPolicy(permissive, { resource: 'audit_export' }, readOnly).allowed,
    ).toBe(true);
    expect(
      evaluateOrganizationPolicy(permissive, { resource: 'external_sharing' }, readOnly).allowed,
    ).toBe(true);
  });

  it('defaults to the unblocked collection state when none is passed', () => {
    const decision = evaluateOrganizationPolicy(permissive, {
      resource: 'managed_compute',
      surface: 'web',
    });

    expect(decision.allowed).toBe(true);
  });
});

describe('UNSCOPED_POLICY_DECISION', () => {
  it('allows, and is frozen so a caller cannot mutate the shared allow', () => {
    expect(UNSCOPED_POLICY_DECISION.allowed).toBe(true);
    expect(UNSCOPED_POLICY_DECISION.code).toBe('unscoped');
    expect(Object.isFrozen(UNSCOPED_POLICY_DECISION)).toBe(true);
  });
});
