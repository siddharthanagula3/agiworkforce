import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_SESSION_EVENT_KINDS,
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
  type DeveloperSessionCheckpoint,
  type DeveloperSessionEvent,
  type DeveloperSessionEventStreamFrame,
  type DeveloperSessionFork,
  type DeveloperSessionReplayRequest,
  type DeveloperSessionReplayResult,
  type DeveloperSession,
  type GeneratedFile,
  type HandoffDraft,
  type LegacyWebSyncedConversation,
  type LegacyWebSyncedMessage,
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

  it('keeps legacy web sync table records shared while migration debt remains', () => {
    const conversation = {
      id: 'conversation-1',
      user_id: 'user-1',
      title: 'Web sync compatibility',
      model: 'gpt-5.1',
      is_active: true,
      synced_from: 'mobile',
      metadata: { source: 'test' },
      created_at: '2026-05-21T00:00:00.000Z',
      updated_at: '2026-05-21T00:01:00.000Z',
      deleted_at: null,
    } satisfies LegacyWebSyncedConversation;

    const message = {
      id: 'message-1',
      conversation_id: conversation.id,
      role: 'assistant',
      content: 'ok',
      model: 'gpt-5.1',
      input_tokens: 1,
      output_tokens: 2,
      cost_cents: 0,
      created_at: '2026-05-21T00:02:00.000Z',
      updated_at: null,
    } satisfies LegacyWebSyncedMessage;

    expect(conversation.synced_from).toBe('mobile');
    expect(message.conversation_id).toBe(conversation.id);
  });

  it('keeps normal app sync separate from developer sessions', () => {
    expect(SYNCED_APP_SURFACES).toEqual(['web', 'desktop', 'mobile']);
    expect(DEVELOPER_SESSION_SURFACES).toEqual(['cli', 'vscode', 'chrome']);

    expect(isSyncedAppSurface('desktop')).toBe(true);
    expect(isSyncedAppSurface('cli')).toBe(false);
    expect(isDeveloperSessionSurface('vscode')).toBe(true);
    expect(isDeveloperSessionSurface('mobile')).toBe(false);
  });

  it('locks the developer-session event stream vocabulary', () => {
    expect(DEVELOPER_SESSION_EVENT_KINDS).toEqual([
      'session.started',
      'session.paused',
      'session.resumed',
      'session.completed',
      'session.failed',
      'message.created',
      'message.delta',
      'message.completed',
      'tool.requested',
      'tool.started',
      'tool.delta',
      'tool.completed',
      'tool.failed',
      'permission.requested',
      'permission.resolved',
      'hook.started',
      'hook.completed',
      'mcp.prompt.invoked',
      'subagent.started',
      'subagent.completed',
      'checkpoint.created',
      'privacy.changed',
      'provider.changed',
      'fork.created',
      'replay.started',
      'replay.completed',
      'error',
    ]);
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

  it('models developer-session event streams with ordered typed payloads', () => {
    const toolRequest = {
      id: 'event-1',
      sessionId: 'dev-session-1',
      kind: 'tool.requested',
      sourceSurface: 'cli',
      sequence: 42,
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      payload: {
        toolCallId: 'tool-1',
        toolName: 'shell.exec',
        input: { cmd: 'pnpm test' },
        riskLevel: 'low',
      },
      createdAt: '2026-05-21T00:00:00.000Z',
    } satisfies DeveloperSessionEvent;

    const permissionRequest = {
      id: 'event-2',
      sessionId: 'dev-session-1',
      kind: 'permission.requested',
      sourceSurface: 'cli',
      sequence: 43,
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      payload: {
        requestId: 'approval-1',
        toolName: 'shell.exec',
        question: 'Run networked installer?',
        riskLevel: 'medium',
        decision: 'pending',
      },
      createdAt: '2026-05-21T00:00:01.000Z',
    } satisfies DeveloperSessionEvent;

    const frame: DeveloperSessionEventStreamFrame = {
      sessionId: 'dev-session-1',
      cursor: { sessionId: 'dev-session-1', afterSequence: 41 },
      events: [toolRequest, permissionRequest],
      hasMore: false,
      emittedAt: '2026-05-21T00:00:02.000Z',
    };

    const firstEvent = frame.events[0];

    expect(frame.events.map((event) => event.sequence)).toEqual([42, 43]);
    expect(firstEvent?.kind).toBe('tool.requested');
    if (firstEvent?.kind === 'tool.requested') {
      expect(firstEvent.payload.toolName).toBe('shell.exec');
    }
  });

  it('models durable checkpoint, fork, and replay records for child sessions', () => {
    const checkpoint: DeveloperSessionCheckpoint = {
      id: 'checkpoint-1',
      sessionId: 'dev-session-1',
      eventId: 'event-10',
      sequence: 10,
      workspaceRoot: '/repo',
      gitHead: 'abc123',
      dirtyState: 'clean',
      summary: 'Ready to fork after exploration',
      createdAt: '2026-05-21T00:00:00.000Z',
    };

    const fork: DeveloperSessionFork = {
      id: 'fork-1',
      sourceSessionId: checkpoint.sessionId,
      targetSessionId: 'dev-session-child-1',
      forkedFromEventId: checkpoint.eventId,
      forkedFromSequence: checkpoint.sequence,
      selectedContextIds: ['ctx-file-1'],
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      reason: 'Parallel implementation lane',
      createdAt: '2026-05-21T00:01:00.000Z',
    };

    const replayRequest: DeveloperSessionReplayRequest = {
      id: 'replay-request-1',
      sourceSessionId: fork.sourceSessionId,
      targetSurface: 'vscode',
      targetWorkspaceRoot: '/repo',
      fromSequence: 1,
      toSequence: checkpoint.sequence,
      includeToolResults: false,
      includeGeneratedFiles: false,
      createdAt: '2026-05-21T00:02:00.000Z',
    };

    const replayResult: DeveloperSessionReplayResult = {
      id: 'replay-result-1',
      requestId: replayRequest.id,
      targetSessionId: fork.targetSessionId,
      status: 'completed',
      replayedEventCount: 10,
      skippedEventIds: [],
      createdAt: '2026-05-21T00:02:01.000Z',
      completedAt: '2026-05-21T00:02:02.000Z',
    };

    expect(fork.forkedFromSequence).toBe(checkpoint.sequence);
    expect(replayRequest.targetSurface).toBe('vscode');
    expect(replayResult.targetSessionId).toBe(fork.targetSessionId);
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
