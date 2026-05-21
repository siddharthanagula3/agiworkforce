import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_SESSION_SURFACES,
  isDeveloperSessionSurface,
  isSyncedAppSurface,
  PRIVACY_MODES,
  providerModeToPrivacyMode,
  providerSurfaceToProviderMode,
  PROVIDER_MODES,
  SYNCED_APP_SURFACES,
  type ArtifactManifest,
  type ComputeSession,
  type DeveloperSession,
  type GeneratedFile,
  type HandoffDraft,
  type ProviderMode,
  type RemoteDispatchPayload,
  type SyncedAppConversation,
} from '../suite-contracts';
import type { ConversationId } from '../conversation';

describe('suite contracts — trust boundaries', () => {
  it('locks the public privacy and provider mode vocabularies', () => {
    expect(PRIVACY_MODES).toEqual(['local', 'byok', 'managed']);
    expect(PROVIDER_MODES).toEqual(['Local', 'DirectByok', 'ManagedGateway', 'ManagedNative']);
  });

  it('keeps normal app sync separate from developer sessions', () => {
    expect(SYNCED_APP_SURFACES).toEqual(['web', 'desktop', 'mobile']);
    expect(DEVELOPER_SESSION_SURFACES).toEqual(['cli', 'vscode', 'chrome']);

    expect(isSyncedAppSurface('desktop')).toBe(true);
    expect(isSyncedAppSurface('cli')).toBe(false);
    expect(isDeveloperSessionSurface('vscode')).toBe(true);
    expect(isDeveloperSessionSurface('mobile')).toBe(false);
  });

  it('maps provider execution modes to privacy modes', () => {
    const cases: Array<[ProviderMode, string]> = [
      ['Local', 'local'],
      ['DirectByok', 'byok'],
      ['ManagedGateway', 'managed'],
      ['ManagedNative', 'managed'],
    ];

    for (const [providerMode, privacyMode] of cases) {
      expect(providerModeToPrivacyMode(providerMode)).toBe(privacyMode);
    }
  });

  it('maps legacy provider surfaces to the canonical provider mode vocabulary', () => {
    expect(providerSurfaceToProviderMode('local')).toBe('Local');
    expect(providerSurfaceToProviderMode('byok')).toBe('DirectByok');
    expect(providerSurfaceToProviderMode('managed_cloud')).toBe('ManagedGateway');
    expect(providerSurfaceToProviderMode('hidden')).toBeNull();
  });
});

describe('suite contracts — records', () => {
  it('models synced app conversations with explicit mode labels', () => {
    const conversation: SyncedAppConversation = {
      id: 'conversation-1' as ConversationId,
      ownerUserId: 'user-1',
      sourceSurface: 'desktop',
      title: 'Local architecture notes',
      visibility: 'private',
      privacyMode: 'local',
      providerMode: 'Local',
      storageScope: 'local_device',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    };

    expect(conversation.sourceSurface).toBe('desktop');
    expect(conversation.privacyMode).toBe(providerModeToPrivacyMode(conversation.providerMode));
  });

  it('models developer sessions as handoff-only surfaces', () => {
    const session: DeveloperSession = {
      id: 'dev-session-1',
      sourceSurface: 'cli',
      kind: 'cli',
      workspaceRoot: '/repo',
      title: 'Fix failing checks',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      status: 'active',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
    };

    expect(isDeveloperSessionSurface(session.sourceSurface)).toBe(true);
  });

  it('requires handoff drafts to carry redaction and preview evidence', () => {
    const draft: HandoffDraft = {
      id: 'handoff-1',
      sourceSessionId: 'dev-session-1',
      sourceSurface: 'cli',
      targetSurface: 'web',
      targetPrivacyMode: 'byok',
      targetProviderMode: 'DirectByok',
      selectedContext: [
        {
          id: 'ctx-1',
          kind: 'file',
          label: 'src/main.rs',
          byteCount: 1024,
          checksumSha256: 'a'.repeat(64),
        },
      ],
      redactionReport: {
        scannerVersion: 'test',
        findings: [],
        redactedByteCount: 0,
        blocked: false,
        generatedAt: '2026-05-21T00:00:00.000Z',
      },
      previewHashSha256: 'b'.repeat(64),
      consentRequired: true,
      expiresAt: '2026-05-21T01:00:00.000Z',
      createdAt: '2026-05-21T00:00:00.000Z',
    };

    expect(draft.targetSurface).toBe('web');
    expect(draft.redactionReport.blocked).toBe(false);
    expect(draft.previewHashSha256).toHaveLength(64);
  });

  it('connects compute sessions, generated files, and artifact manifests', () => {
    const computeSession: ComputeSession = {
      id: 'compute-1',
      ownerUserId: 'user-1',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      status: 'completed',
      workdirUri: 'file:///tmp/agi/compute-1',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
      completedAt: '2026-05-21T00:01:00.000Z',
    };

    const file: GeneratedFile = {
      id: 'file-1',
      computeSessionId: computeSession.id,
      ownerUserId: 'user-1',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: 'file:///tmp/agi/compute-1/report.pdf',
      byteCount: 2048,
      checksumSha256: 'c'.repeat(64),
      previewDerivatives: [],
      createdAt: '2026-05-21T00:01:00.000Z',
    };

    const manifest: ArtifactManifest = {
      id: 'manifest-1',
      artifactId: 'artifact-1',
      type: 'generated_file_bundle',
      title: 'Report',
      computeSessionId: computeSession.id,
      generatedFileIds: [file.id],
      privacyMode: 'local',
      providerMode: 'Local',
      storageScope: 'local_device',
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
    };

    expect(manifest.generatedFileIds).toContain(file.id);
    expect(file.computeSessionId).toBe(computeSession.id);
  });

  it('models remote dispatch payloads without freeform unknown payloads', () => {
    const payload: RemoteDispatchPayload = {
      action: 'agent.command',
      agentId: 'agent-1',
      command: 'pause',
    };

    expect(payload.action).toBe('agent.command');
  });
});
