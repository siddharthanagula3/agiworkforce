/**
 * ExecutionProfile contract tests (`../sessions/execution-profile`).
 *
 * Covers the R5 "one Local/Cloud toggle resolving five internal planes"
 * contract: `resolveExecutionProfile` is exercised for both toggle values and
 * both sub-modes per side, every resolved profile round-trips through
 * `validateExecutionProfile` with zero violations, and every cross-plane
 * invariant has a dedicated test that tampers exactly one plane.
 */
import { describe, expect, it } from 'vitest';
import {
  assertExecutionProfile,
  EXECUTION_PROFILE_GOVERNED_SESSION_KINDS,
  EXECUTION_PROFILE_TOGGLES,
  executionProfileForSessionKind,
  resolveExecutionProfile,
  validateExecutionProfile,
  type ExecutionProfile,
} from '../sessions/execution-profile';
import { getSessionKindDefaults } from '../sessions/taxonomy';

describe('EXECUTION_PROFILE_TOGGLES', () => {
  it('is exactly the two-way local/cloud toggle — BYOK is a sub-mode, not a third value', () => {
    expect(EXECUTION_PROFILE_TOGGLES).toEqual(['local', 'cloud']);
  });
});

describe('resolveExecutionProfile — local toggle', () => {
  it('defaults to on-device Local inference when no sub-mode is given', () => {
    const profile = resolveExecutionProfile({ toggle: 'local' });
    expect(profile.toggle).toBe('local');
    expect(profile.inference.providerMode).toBe('Local');
    expect(profile.identity.source).toBe('device_keychain');
    expect(profile.data.storageScope).toBe('local_device');
    expect(profile.data.syncPolicy.syncEligible).toBe(false);
    expect(profile.tools).toEqual({
      executionSurface: 'local_process',
      cloudExecutionAllowed: false,
    });
    expect(profile.workflow.orchestrator).toBe('local_agent_loop');
  });

  it('resolves BYOK as a sub-mode of local, not a third toggle value', () => {
    const profile = resolveExecutionProfile({ toggle: 'local', localInferenceMode: 'DirectByok' });
    expect(profile.toggle).toBe('local');
    expect(profile.inference.providerMode).toBe('DirectByok');
    expect(profile.identity.source).toBe('byok_credential_store');
    expect(profile.data.storageScope).toBe('direct_byok_provider');
    // Tools/workflow stay local under BYOK too — only the model call leaves the device.
    expect(profile.tools.cloudExecutionAllowed).toBe(false);
    expect(profile.workflow.orchestrator).toBe('local_agent_loop');
  });

  it('carries accountUserId through a local profile (e.g. a BYOK key linked to an account)', () => {
    const profile = resolveExecutionProfile({ toggle: 'local', accountUserId: 'user_1' });
    expect(profile.identity.accountUserId).toBe('user_1');
  });

  it('defaults accountUserId to null when omitted', () => {
    const profile = resolveExecutionProfile({ toggle: 'local' });
    expect(profile.identity.accountUserId).toBeNull();
  });
});

describe('resolveExecutionProfile — cloud toggle', () => {
  it('defaults to ManagedGateway routing when no sub-mode is given', () => {
    const profile = resolveExecutionProfile({ toggle: 'cloud' });
    expect(profile.toggle).toBe('cloud');
    expect(profile.inference.providerMode).toBe('ManagedGateway');
    expect(profile.identity.source).toBe('agi_managed_account');
    expect(profile.data.storageScope).toBe('synced_app_cloud');
    expect(profile.data.syncPolicy.syncEligible).toBe(true);
    expect(profile.data.syncPolicy.syncedSurfaces).toEqual(['web', 'desktop', 'mobile']);
    expect(profile.tools).toEqual({
      executionSurface: 'managed_sandbox',
      cloudExecutionAllowed: true,
    });
    expect(profile.workflow.orchestrator).toBe('managed_workflow_engine');
  });

  it('honors an explicit ManagedNative sub-mode', () => {
    const profile = resolveExecutionProfile({
      toggle: 'cloud',
      cloudInferenceMode: 'ManagedNative',
    });
    expect(profile.inference.providerMode).toBe('ManagedNative');
  });
});

describe('resolveExecutionProfile — every resolved combination round-trips clean', () => {
  const cases: Array<[string, () => ExecutionProfile]> = [
    ['local default (on-device)', () => resolveExecutionProfile({ toggle: 'local' })],
    [
      'local BYOK',
      () => resolveExecutionProfile({ toggle: 'local', localInferenceMode: 'DirectByok' }),
    ],
    ['cloud default (gateway)', () => resolveExecutionProfile({ toggle: 'cloud' })],
    [
      'cloud native',
      () => resolveExecutionProfile({ toggle: 'cloud', cloudInferenceMode: 'ManagedNative' }),
    ],
  ];

  for (const [label, build] of cases) {
    it(`${label} — zero invariant violations`, () => {
      const profile = build();
      expect(validateExecutionProfile(profile)).toEqual([]);
      expect(() => assertExecutionProfile(profile)).not.toThrow();
    });
  }
});

describe('validateExecutionProfile — catches a local toggle with a mismatched plane', () => {
  it('flags managed-cloud inference under the local toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'local' }),
      inference: { providerMode: 'ManagedGateway' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain(
      'inference-provider-mode-mismatch',
    );
  });

  it('flags the managed-account identity plane under the local toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'local' }),
      identity: { source: 'agi_managed_account' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain('identity-source-mismatch');
  });

  it('flags a data plane that claims sync eligibility under the local toggle (no automatic cloud egress)', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'local' }),
      data: { storageScope: 'local_device', syncPolicy: { syncEligible: true } },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain(
      'data-plane-egress-violation',
    );
  });

  it('flags a tools plane that allows cloud execution under the local toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'local' }),
      tools: { executionSurface: 'managed_sandbox', cloudExecutionAllowed: true },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain(
      'tools-plane-egress-violation',
    );
  });

  it('flags the managed workflow engine under the local toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'local' }),
      workflow: { orchestrator: 'managed_workflow_engine' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain('workflow-plane-mismatch');
    expect(() => assertExecutionProfile(bad)).toThrow(/workflow-plane-mismatch/);
  });
});

describe('validateExecutionProfile — catches a cloud toggle with a mismatched plane', () => {
  it('flags local/BYOK inference under the cloud toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'cloud' }),
      inference: { providerMode: 'DirectByok' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain(
      'inference-provider-mode-mismatch',
    );
  });

  it('flags a device/BYOK identity plane under the cloud toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'cloud' }),
      identity: { source: 'device_keychain' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain('identity-source-mismatch');
  });

  it('flags the local agent loop under the cloud toggle', () => {
    const bad: ExecutionProfile = {
      ...resolveExecutionProfile({ toggle: 'cloud' }),
      workflow: { orchestrator: 'local_agent_loop' },
    };
    expect(validateExecutionProfile(bad).map((v) => v.code)).toContain('workflow-plane-mismatch');
  });
});

describe('validateExecutionProfile — accumulates every violation at once', () => {
  it('reports all five codes for a fully cloud-shaped profile under the local toggle', () => {
    const bad: ExecutionProfile = {
      toggle: 'local',
      identity: { source: 'agi_managed_account' },
      data: { storageScope: 'synced_app_cloud', syncPolicy: { syncEligible: true } },
      inference: { providerMode: 'ManagedGateway' },
      tools: { executionSurface: 'managed_sandbox', cloudExecutionAllowed: true },
      workflow: { orchestrator: 'managed_workflow_engine' },
    };
    const codes = validateExecutionProfile(bad).map((v) => v.code);
    expect(codes.sort()).toEqual(
      [
        'data-plane-egress-violation',
        'identity-source-mismatch',
        'inference-provider-mode-mismatch',
        'tools-plane-egress-violation',
        'workflow-plane-mismatch',
      ].sort(),
    );
  });
});

describe('executionProfileForSessionKind — cross-module coherence with ../sessions/taxonomy', () => {
  it('governs exactly the four consumer-chat kinds the R5 adjudication names, no more', () => {
    expect([...EXECUTION_PROFILE_GOVERNED_SESSION_KINDS].sort()).toEqual(
      ['cloud_chat', 'desktop_byok_chat', 'desktop_local_chat', 'mobile_local_chat'].sort(),
    );
  });

  for (const kind of EXECUTION_PROFILE_GOVERNED_SESSION_KINDS) {
    it(`"${kind}" resolves the same providerMode and storageScope as its SessionKind defaults (the two modules cannot drift apart)`, () => {
      const defaults = getSessionKindDefaults(kind);
      const profile = executionProfileForSessionKind(kind);
      expect(profile.inference.providerMode).toBe(defaults.trustBoundary.providerMode);
      expect(profile.data.storageScope).toBe(defaults.storageScope);
      expect(validateExecutionProfile(profile)).toEqual([]);
    });
  }

  it('carries accountUserId through the bridge', () => {
    const profile = executionProfileForSessionKind('cloud_chat', { accountUserId: 'user_9' });
    expect(profile.identity.accountUserId).toBe('user_9');
  });

  it('never resolves a Local/BYOK-boundary governed kind onto a cloud, synced, or managed plane', () => {
    for (const kind of ['desktop_local_chat', 'desktop_byok_chat', 'mobile_local_chat'] as const) {
      const profile = executionProfileForSessionKind(kind);
      expect(profile.toggle).toBe('local');
      expect(profile.data.syncPolicy.syncEligible).toBe(false);
      expect(profile.tools.cloudExecutionAllowed).toBe(false);
      expect(profile.identity.source).not.toBe('agi_managed_account');
    }
  });
});
