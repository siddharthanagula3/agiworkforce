import { describe, expect, it } from 'vitest';
import {
  assertSurfaceCanSyncChats,
  providerModeToPrivacyMode,
  SYNCED_APP_SURFACES,
} from '../suite-contracts';
import {
  assertSessionInvariants,
  getSessionKindDefaults,
  isSessionKind,
  SESSION_KINDS,
  validateSessionInvariants,
  type AppSession,
  type BrowserTaskSession,
  type CloudChatSession,
  type CloudWorkSession,
  type DesktopByokChatSession,
  type DesktopLocalChatSession,
  type DeveloperCloudSession,
  type DeveloperLocalSession,
  type HandoffSnapshotSession,
  type ManagedSandboxSession,
  type MobileLocalChatSession,
  type RemoteProjectionSession,
  type SessionKind,
  type SessionKindDefaults,
} from '../sessions/taxonomy';

const NOW = '2026-07-15T00:00:00.000Z';

function common(id: string) {
  return {
    id,
    ownerUserId: 'user_1',
    accountScope: {},
    policySnapshot: {
      capabilityDocument: { sessionId: id, version: 'cap-v1', computedAt: NOW },
      permissionPolicyVersion: 'perm-v1',
      snapshotAt: NOW,
    },
    retentionPolicy: { deletionPolicy: 'user_deletable' as const },
    handoff: { canBeHandoffSource: true, canBeHandoffTarget: true },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeCloudChatSession(): CloudChatSession {
  return {
    ...common('sess_cloud_chat'),
    kind: 'cloud_chat',
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'synced_app_cloud',
    syncPolicy: { syncEligible: true, syncedSurfaces: SYNCED_APP_SURFACES },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'web',
    hostRequirement: { required: false },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
  };
}

function makeCloudWorkSession(): CloudWorkSession {
  return {
    ...common('sess_cloud_work'),
    kind: 'cloud_work',
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'managed_compute',
    syncPolicy: { syncEligible: true, syncedSurfaces: SYNCED_APP_SURFACES },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'desktop',
    hostRequirement: { required: false },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
  };
}

function makeManagedSandboxSession(): ManagedSandboxSession {
  return {
    ...common('sess_managed_sandbox'),
    kind: 'managed_sandbox',
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'managed_compute',
    syncPolicy: { syncEligible: true, syncedSurfaces: SYNCED_APP_SURFACES },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedNative' },
    originSurface: 'mobile',
    hostRequirement: { required: false },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: false },
    retentionPolicy: {
      deletionPolicy: 'auto_expiring',
      retentionExpiresAt: '2026-07-16T00:00:00.000Z',
    },
  };
}

function makeDesktopLocalChatSession(): DesktopLocalChatSession {
  return {
    ...common('sess_desktop_local'),
    kind: 'desktop_local_chat',
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'desktop',
    hostRequirement: { required: true, liveness: 'online' },
  };
}

function makeDesktopByokChatSession(): DesktopByokChatSession {
  return {
    ...common('sess_desktop_byok'),
    kind: 'desktop_byok_chat',
    executionLocation: 'device',
    executionAuthority: 'byok_provider_account',
    storageScope: 'direct_byok_provider',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'byok', providerMode: 'DirectByok' },
    originSurface: 'desktop',
    hostRequirement: { required: true, liveness: 'online' },
  };
}

function makeMobileLocalChatSession(): MobileLocalChatSession {
  return {
    ...common('sess_mobile_local'),
    kind: 'mobile_local_chat',
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'mobile',
    hostRequirement: { required: true, liveness: 'online' },
  };
}

function makeDeveloperLocalSession(): DeveloperLocalSession {
  return {
    ...common('sess_dev_local'),
    kind: 'developer_local',
    executionLocation: 'device',
    executionAuthority: 'developer_workspace_host',
    storageScope: 'developer_workspace',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'cli',
    hostRequirement: { required: true, liveness: 'online' },
  };
}

function makeDeveloperCloudSession(): DeveloperCloudSession {
  return {
    ...common('sess_dev_cloud'),
    kind: 'developer_cloud',
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'developer_workspace',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'vscode',
    hostRequirement: { required: false },
  };
}

function makeBrowserTaskSession(): BrowserTaskSession {
  return {
    ...common('sess_browser_task'),
    kind: 'browser_task',
    executionLocation: 'device',
    executionAuthority: 'browser_profile',
    storageScope: 'local_device',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'chrome',
    hostRequirement: { required: true, liveness: 'online' },
  };
}

function makeRemoteProjectionSession(): RemoteProjectionSession {
  return {
    ...common('sess_remote_projection'),
    kind: 'remote_projection',
    executionLocation: 'hybrid-projection',
    executionAuthority: 'relay_control_plane',
    storageScope: 'developer_workspace',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'desktop',
    hostRequirement: { required: true, hostId: 'host_1', liveness: 'online' },
  };
}

function makeHandoffSnapshotSession(): HandoffSnapshotSession {
  return {
    ...common('sess_handoff_snapshot'),
    kind: 'handoff_snapshot',
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncPolicy: { syncEligible: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
    originSurface: 'cli',
    hostRequirement: { required: false },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: true, provenance: null },
  };
}

const ALL_FIXTURES: Record<SessionKind, () => AppSession> = {
  cloud_chat: makeCloudChatSession,
  cloud_work: makeCloudWorkSession,
  managed_sandbox: makeManagedSandboxSession,
  desktop_local_chat: makeDesktopLocalChatSession,
  desktop_byok_chat: makeDesktopByokChatSession,
  mobile_local_chat: makeMobileLocalChatSession,
  developer_local: makeDeveloperLocalSession,
  developer_cloud: makeDeveloperCloudSession,
  browser_task: makeBrowserTaskSession,
  remote_projection: makeRemoteProjectionSession,
  handoff_snapshot: makeHandoffSnapshotSession,
};

describe('SESSION_KINDS', () => {
  it('has exactly the eleven CC §4.2 discriminants, no more, no fewer', () => {
    expect(SESSION_KINDS).toHaveLength(11);
    expect(new Set(SESSION_KINDS).size).toBe(11);
    expect([...SESSION_KINDS].sort()).toEqual([
      'browser_task',
      'cloud_chat',
      'cloud_work',
      'desktop_byok_chat',
      'desktop_local_chat',
      'developer_cloud',
      'developer_local',
      'handoff_snapshot',
      'managed_sandbox',
      'mobile_local_chat',
      'remote_projection',
    ]);
  });

  it('round-trips every kind through isSessionKind', () => {
    for (const kind of SESSION_KINDS) {
      expect(isSessionKind(kind)).toBe(true);
    }
  });

  it('rejects strings that are not a SessionKind', () => {
    expect(isSessionKind('cloud_super_chat')).toBe(false);
    expect(isSessionKind('')).toBe(false);
  });

  it('has a structural-default entry and a fixture for every kind (exhaustiveness)', () => {
    for (const kind of SESSION_KINDS) {
      expect(() => getSessionKindDefaults(kind)).not.toThrow();
      const fixture = ALL_FIXTURES[kind]();
      expect(fixture.kind).toBe(kind);
    }
  });
});

const EXPECTED_SESSION_KIND_DEFAULTS: Record<SessionKind, SessionKindDefaults> = {
  cloud_chat: {
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'synced_app_cloud',
    syncEligible: true,
    hostRequirement: { required: false },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
  },
  cloud_work: {
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'managed_compute',
    syncEligible: true,
    hostRequirement: { required: false },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
  },
  managed_sandbox: {
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'managed_compute',
    syncEligible: true,
    hostRequirement: { required: false },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedNative' },
  },
  desktop_local_chat: {
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'online' },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
  desktop_byok_chat: {
    executionLocation: 'device',
    executionAuthority: 'byok_provider_account',
    storageScope: 'direct_byok_provider',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'online' },
    trustBoundary: { privacyMode: 'byok', providerMode: 'DirectByok' },
  },
  mobile_local_chat: {
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'online' },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
  developer_local: {
    executionLocation: 'device',
    executionAuthority: 'developer_workspace_host',
    storageScope: 'developer_workspace',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'online' },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
  developer_cloud: {
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'developer_workspace',
    syncEligible: false,
    hostRequirement: { required: false },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
  },
  browser_task: {
    executionLocation: 'device',
    executionAuthority: 'browser_profile',
    storageScope: 'local_device',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'online' },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
  remote_projection: {
    executionLocation: 'hybrid-projection',
    executionAuthority: 'relay_control_plane',
    storageScope: 'developer_workspace',
    syncEligible: false,
    hostRequirement: { required: true, liveness: 'unknown' },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
  handoff_snapshot: {
    executionLocation: 'device',
    executionAuthority: 'local_device',
    storageScope: 'local_device',
    syncEligible: false,
    hostRequirement: { required: false },
    trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
  },
};

describe('getSessionKindDefaults, value correctness (not just "does not throw")', () => {
  for (const kind of SESSION_KINDS) {
    it(`"${kind}" matches the CC §4.1/§4.2/§4.3/§5 structural mapping exactly`, () => {
      expect(getSessionKindDefaults(kind)).toEqual(EXPECTED_SESSION_KIND_DEFAULTS[kind]);
    });
  }

  it('pins an internally-consistent trustBoundary for every kind (guards against a copy-paste privacy/provider mismatch inside the switch itself)', () => {
    for (const kind of SESSION_KINDS) {
      const { trustBoundary } = getSessionKindDefaults(kind);
      expect(providerModeToPrivacyMode(trustBoundary.providerMode)).toBe(trustBoundary.privacyMode);
    }
  });

  it('marks sync-eligible only for cloud_chat, cloud_work, and managed_sandbox', () => {
    const eligible = SESSION_KINDS.filter((kind) => getSessionKindDefaults(kind).syncEligible);
    expect([...eligible].sort()).toEqual(['cloud_chat', 'cloud_work', 'managed_sandbox'].sort());
  });
});

describe('per-kind fixtures satisfy validateSessionInvariants', () => {
  for (const kind of SESSION_KINDS) {
    it(`"${kind}", well-formed fixture has zero violations`, () => {
      const fixture = ALL_FIXTURES[kind]();
      expect(validateSessionInvariants(fixture)).toEqual([]);
      expect(() => assertSessionInvariants(fixture)).not.toThrow();
    });
  }
});

describe('kernel composition, sync eligibility reuses ../suite-contracts, not a fork', () => {
  it("assertSurfaceCanSyncChats throws for a developer_local session's originSurface", () => {
    const session = makeDeveloperLocalSession();
    expect(() => assertSurfaceCanSyncChats(session.originSurface)).toThrowError(
      /sync-rule violation/,
    );
  });

  it("assertSurfaceCanSyncChats throws for a browser_task session's originSurface", () => {
    const session = makeBrowserTaskSession();
    expect(() => assertSurfaceCanSyncChats(session.originSurface)).toThrowError(
      /sync-rule violation/,
    );
  });

  it("assertSurfaceCanSyncChats does not throw for a cloud_chat session's originSurface", () => {
    const session = makeCloudChatSession();
    expect(() => assertSurfaceCanSyncChats(session.originSurface)).not.toThrow();
  });
});

describe('validateSessionInvariants, trust-boundary-provider-mismatch', () => {
  it('flags a providerMode/privacyMode pair that do not agree', () => {
    const tampered: DeveloperLocalSession = {
      ...makeDeveloperLocalSession(),
      trustBoundary: { privacyMode: 'local', providerMode: 'ManagedGateway' },
    };
    const violations = validateSessionInvariants(tampered);
    expect(violations.map((v) => v.code)).toContain('trust-boundary-provider-mismatch');
    expect(() => assertSessionInvariants(tampered)).toThrow(/trust-boundary-provider-mismatch/);
  });
});

describe('validateSessionInvariants, sync-eligible-kind-not-allowed', () => {
  it('flags a developer_local session that claims sync eligibility', () => {
    const tampered = {
      ...makeDeveloperLocalSession(),
      syncPolicy: { syncEligible: true },
    } as unknown as AppSession;
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'sync-eligible-kind-not-allowed',
    );
  });

  it('flags a remote_projection session hosted on a normally-synced desktop surface that claims sync eligibility', () => {
    const valid = makeRemoteProjectionSession();
    expect(valid.originSurface).toBe('desktop');
    const tampered = { ...valid, syncPolicy: { syncEligible: true } } as unknown as AppSession;
    const codes = validateSessionInvariants(tampered).map((v) => v.code);
    expect(codes).toContain('sync-eligible-kind-not-allowed');
    expect(codes).not.toContain('sync-eligible-surface-not-synced');
  });
});

describe('validateSessionInvariants, sync-eligible-surface-not-synced', () => {
  it('flags an allowed kind whose originSurface is not actually sync-eligible', () => {
    const tampered = {
      ...makeCloudChatSession(),
      originSurface: 'cli',
    } as unknown as AppSession;
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'sync-eligible-surface-not-synced',
    );
  });
});

describe('validateSessionInvariants, remote-projection-requires-live-host', () => {
  it('flags a remote_projection session missing hostRequirement.required', () => {
    const tampered = {
      ...makeRemoteProjectionSession(),
      hostRequirement: { required: false },
    } as unknown as AppSession;
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'remote-projection-requires-live-host',
    );
  });

  it('flags a remote_projection session missing liveness', () => {
    const tampered = {
      ...makeRemoteProjectionSession(),
      hostRequirement: { required: true },
    } as unknown as AppSession;
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'remote-projection-requires-live-host',
    );
  });

  it('does not flag a well-formed remote_projection session', () => {
    expect(validateSessionInvariants(makeRemoteProjectionSession())).toEqual([]);
  });
});

describe('validateSessionInvariants, handoff-snapshot-requires-provenance-or-pending-consent', () => {
  it('flags a snapshot that is neither a pending target nor carries accepted provenance', () => {
    const tampered: HandoffSnapshotSession = {
      ...makeHandoffSnapshotSession(),
      handoff: { canBeHandoffSource: false, canBeHandoffTarget: false, provenance: null },
    };
    expect(validateSessionInvariants(tampered).map((v) => v.code)).toContain(
      'handoff-snapshot-requires-provenance-or-pending-consent',
    );
  });

  it('passes when the snapshot carries accepted provenance instead of pending-target eligibility', () => {
    const accepted: HandoffSnapshotSession = {
      ...makeHandoffSnapshotSession(),
      handoff: {
        canBeHandoffSource: false,
        canBeHandoffTarget: false,
        provenance: {
          handoffDraftId: 'hd_1',
          sourceSessionId: 'sess_dev_local',
          sourceSurface: 'cli',
          acceptedAt: NOW,
        },
      },
    };
    expect(validateSessionInvariants(accepted)).toEqual([]);
  });

  it('passes when the snapshot is a pending handoff target with no provenance yet', () => {
    expect(validateSessionInvariants(makeHandoffSnapshotSession())).toEqual([]);
  });
});
