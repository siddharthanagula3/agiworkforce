import { describe, expect, it } from 'vitest';
import {
  CHAT_EXECUTION_MODE_DISPLAY,
  CHAT_EXECUTION_MODES,
  DEVELOPER_SESSION_EVENT_KINDS,
  DEVELOPER_SESSION_SURFACES,
  chatExecutionModeToPrivacyMode,
  chatExecutionModeToProviderMode,
  formatChatExecutionModeLabel,
  formatGeneratedFileByteCount,
  formatGeneratedFileKindLabel,
  formatPrivacyModeLabel,
  formatProviderModeLabel,
  getChatExecutionModeDisplay,
  getPrivacyModeDisplay,
  getProviderModeDisplay,
  isDeveloperSessionSurface,
  isSyncedAppSurface,
  PRIVACY_MODE_DISPLAY,
  PRIVACY_MODES,
  providerModeToPrivacyMode,
  PROVIDER_MODE_DISPLAY,
  providerSurfaceToProviderMode,
  PROVIDER_MODES,
  summarizeGeneratedFileBundle,
  summarizeSendPreview,
  SYNCED_APP_SURFACES,
  validateGeneratedFileTrustBoundary,
  type ArtifactManifest,
  type ChatIntent,
  type ComputeSession,
  type ConnectorStatusSnapshot,
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
  type PermissionDecision,
  type PrivacyMode,
  type ProviderMode,
  type RemoteDispatchPayload,
  type SuiteToolEvent,
  type SyncedAppConversation,
} from '../suite-contracts';
import type { ConversationId } from '../conversation';

describe('suite contracts — trust boundaries', () => {
  it('locks the public privacy and provider mode vocabularies', () => {
    expect(PRIVACY_MODES).toEqual(['local', 'byok', 'managed']);
    expect(PROVIDER_MODES).toEqual(['Local', 'DirectByok', 'ManagedGateway', 'ManagedNative']);
    expect(CHAT_EXECUTION_MODES).toEqual(['local_only', 'byok', 'cloud_managed']);
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

  it('throws when assertSurfaceCanSyncChats receives a developer-session surface', async () => {
    // Round-2 audit (2026-05-21): the runtime guard fails fast when a
    // CLI / VS Code / Chrome surface is wired into the synced-app chat
    // pipeline. Type-only enforcement isn't enough at boundaries that
    // take a raw SourceSurface from external input (gateway query param,
    // supabase channel id, deserialized telemetry).
    const { assertSurfaceCanSyncChats } = await import('../suite-contracts');

    expect(() => assertSurfaceCanSyncChats('web')).not.toThrow();
    expect(() => assertSurfaceCanSyncChats('desktop')).not.toThrow();
    expect(() => assertSurfaceCanSyncChats('mobile')).not.toThrow();
    expect(() => assertSurfaceCanSyncChats('cli')).toThrowError(/sync-rule violation/);
    expect(() => assertSurfaceCanSyncChats('vscode')).toThrowError(/sync-rule violation/);
    expect(() => assertSurfaceCanSyncChats('chrome')).toThrowError(/sync-rule violation/);
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

  it('locks visible Local/BYOK/Managed display copy for every surface', () => {
    const expectedPrivacyLabels: Record<PrivacyMode, string> = {
      local: 'Local',
      byok: 'BYOK',
      managed: 'Managed',
    };

    for (const privacyMode of PRIVACY_MODES) {
      expect(formatPrivacyModeLabel(privacyMode)).toBe(expectedPrivacyLabels[privacyMode]);
      expect(getPrivacyModeDisplay(privacyMode).description.length).toBeGreaterThan(20);
    }

    expect(PRIVACY_MODE_DISPLAY.byok.shortLabel).toBe('BYOK');
  });

  it('locks provider execution labels to their privacy boundaries', () => {
    const expectedProviderLabels: Record<ProviderMode, string> = {
      Local: 'Local',
      DirectByok: 'BYOK',
      ManagedGateway: 'Managed Gateway',
      ManagedNative: 'Managed Native',
    };

    for (const providerMode of PROVIDER_MODES) {
      const display = getProviderModeDisplay(providerMode);

      expect(formatProviderModeLabel(providerMode)).toBe(expectedProviderLabels[providerMode]);
      expect(display.privacyMode).toBe(providerModeToPrivacyMode(providerMode));
      expect(display.description.length).toBeGreaterThan(20);
    }

    expect(PROVIDER_MODE_DISPLAY.ManagedGateway.shortLabel).toBe('Managed');
  });

  it('locks chat execution modes to privacy and provider defaults', () => {
    expect(formatChatExecutionModeLabel('local_only')).toBe('Local Mode + Local LLMs');
    expect(formatChatExecutionModeLabel('byok')).toBe('Local Mode + BYOK');
    expect(formatChatExecutionModeLabel('cloud_managed')).toBe('Cloud Managed');

    expect(chatExecutionModeToPrivacyMode('local_only')).toBe('local');
    expect(chatExecutionModeToProviderMode('local_only')).toBe('Local');
    expect(chatExecutionModeToPrivacyMode('byok')).toBe('byok');
    expect(chatExecutionModeToProviderMode('byok')).toBe('DirectByok');
    expect(chatExecutionModeToPrivacyMode('cloud_managed')).toBe('managed');
    expect(chatExecutionModeToProviderMode('cloud_managed')).toBe('ManagedGateway');

    for (const mode of CHAT_EXECUTION_MODES) {
      const display = getChatExecutionModeDisplay(mode);
      expect(display).toBe(CHAT_EXECUTION_MODE_DISPLAY[mode]);
      expect(display.privacyMode).toBe(chatExecutionModeToPrivacyMode(mode));
      expect(providerModeToPrivacyMode(display.defaultProviderMode)).toBe(display.privacyMode);
      expect(display.description.length).toBeGreaterThan(20);
    }
  });
});

describe('suite contracts — records', () => {
  it('models a cross-surface chat intent without losing the trust boundary', () => {
    const intent = {
      id: 'intent-1',
      sourceSurface: 'desktop',
      conversationId: 'conversation-1' as ConversationId,
      kind: 'generated_file',
      executionMode: 'cloud_managed',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      provider: 'openai',
      model: 'gpt-5.1',
      prompt: 'Create a board update deck',
      projectId: 'project-1',
      skillIds: ['presentations'],
      connectorIds: ['drive'],
      toolIds: ['code_interpreter'],
      attachmentIds: ['file-1'],
      reasoningEffort: 'high',
      webSearch: true,
      codeExecution: true,
      computerUse: false,
      temporary: false,
      handoffRequired: false,
      createdAt: '2026-05-21T00:00:00.000Z',
    } satisfies ChatIntent;

    expect(intent.privacyMode).toBe(chatExecutionModeToPrivacyMode(intent.executionMode));
    expect(intent.providerMode).toBe(chatExecutionModeToProviderMode(intent.executionMode));
    expect(intent.kind).toBe('generated_file');
  });

  it('models shared connector status, permission decisions, and tool events', () => {
    const connector = {
      connectorId: 'github',
      sourceSurface: 'vscode',
      status: 'needs_auth',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      capabilityIds: ['pull_requests', 'issues'],
      message: 'OAuth sign-in required',
      lastCheckedAt: '2026-05-21T00:00:00.000Z',
    } satisfies ConnectorStatusSnapshot;

    const decision: PermissionDecision = 'allow_session';
    const event = {
      id: 'tool-event-1',
      sourceSurface: 'cli',
      toolCallId: 'tool-1',
      toolName: 'Bash',
      displayName: 'Run command',
      status: 'approval_needed',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      permissionRequestId: 'permission-1',
      permissionDecision: decision,
      input: { command: 'pnpm test' },
      riskLevel: 'medium',
      createdAt: '2026-05-21T00:00:01.000Z',
    } satisfies SuiteToolEvent;

    expect(connector.status).toBe('needs_auth');
    expect(event.permissionDecision).toBe('allow_session');
    expect(providerModeToPrivacyMode(event.providerMode)).toBe(event.privacyMode);
  });

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

  it('builds generated-file UI metadata from the shared manifest contract', () => {
    const computeSession: ComputeSession = {
      id: 'compute-1',
      ownerUserId: 'user-1',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      status: 'completed',
      workdirUri: 'file:///tmp/agi/compute-1',
      retentionExpiresAt: '2026-06-20T00:00:00.000Z',
      ttlSeconds: 2592000,
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
      kind: 'pptx',
      fileName: 'board-update.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      uri: 'file:///tmp/agi/compute-1/board-update.pptx',
      byteCount: 1_536,
      checksumSha256: 'd'.repeat(64),
      previewDerivatives: [{ kind: 'thumbnail', uri: 'file:///tmp/agi/compute-1/preview.png' }],
      createdAt: '2026-05-21T00:01:00.000Z',
    };

    const manifest: ArtifactManifest = {
      id: 'manifest-1',
      artifactId: 'artifact-1',
      type: 'generated_file_bundle',
      title: 'Board Update',
      sourceSessionId: 'session-1',
      computeSessionId: computeSession.id,
      generatedFileIds: [file.id],
      privacyMode: 'local',
      providerMode: 'Local',
      storageScope: 'local_device',
      checksumSha256: file.checksumSha256,
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
    };

    const view = summarizeGeneratedFileBundle({
      computeSession,
      generatedFile: file,
      artifactManifest: manifest,
    });

    expect(view.title).toBe('Board Update');
    expect(view.kindLabel).toBe('PowerPoint');
    expect(view.statusLabel).toBe('Ready');
    expect(view.privacyLabel).toBe('Local');
    expect(view.providerLabel).toBe('Local');
    expect(view.sourceSurfaceLabel).toBe('Desktop');
    expect(view.sourceSessionLabel).toBe('Session session-1');
    expect(view.byteCountLabel).toBe('1.5 KB');
    expect(view.checksumShort).toHaveLength(12);
    expect(view.canPreview).toBe(true);
    expect(view.canDownload).toBe(true);
    expect(view.canShare).toBe(true);
    expect(view.localOnly).toBe(true);
    expect(view.storageScope).toBe('local_device');
  });

  it('formats generated-file fallback labels for in-progress requests', () => {
    const view = summarizeGeneratedFileBundle({
      fallbackFileName: 'queued-report.pdf',
      fallbackKind: 'pdf',
      fallbackStatus: 'running',
    });

    expect(formatGeneratedFileKindLabel('pptx')).toBe('PowerPoint');
    expect(formatGeneratedFileByteCount(1024)).toBe('1.0 KB');
    expect(view.fileName).toBe('queued-report.pdf');
    expect(view.kindLabel).toBe('PDF');
    expect(view.statusLabel).toBe('Generating');
    expect(view.canDownload).toBe(false);
    expect(view.canShare).toBe(false);
  });

  it('proves Local generated files stay on local-device storage', () => {
    const computeSession: ComputeSession = {
      id: 'compute-local',
      ownerUserId: 'user-1',
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      status: 'completed',
      workdirUri: 'file:///Users/user/Library/Application Support/AGI/compute-local',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
      completedAt: '2026-05-21T00:01:00.000Z',
    };
    const generatedFile: GeneratedFile = {
      id: 'file-local',
      computeSessionId: computeSession.id,
      ownerUserId: computeSession.ownerUserId,
      sourceSurface: 'desktop',
      privacyMode: 'local',
      providerMode: 'Local',
      kind: 'pdf',
      fileName: 'local-report.pdf',
      mimeType: 'application/pdf',
      uri: 'file:///Users/user/Documents/local-report.pdf',
      byteCount: 2048,
      checksumSha256: 'e'.repeat(64),
      previewDerivatives: [],
      createdAt: '2026-05-21T00:01:00.000Z',
    };
    const artifactManifest: ArtifactManifest = {
      id: 'manifest-local',
      artifactId: 'artifact-local',
      type: 'generated_file_bundle',
      title: 'Local Report',
      computeSessionId: computeSession.id,
      generatedFileIds: [generatedFile.id],
      privacyMode: 'local',
      providerMode: 'Local',
      storageScope: 'local_device',
      checksumSha256: generatedFile.checksumSha256,
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
    };

    expect(
      validateGeneratedFileTrustBoundary({ computeSession, generatedFile, artifactManifest }),
    ).toEqual([]);

    expect(
      validateGeneratedFileTrustBoundary({
        computeSession,
        generatedFile: { ...generatedFile, uri: 'https://files.example.com/local-report.pdf' },
        artifactManifest,
      }).map((violation) => violation.code),
    ).toContain('local-file-uploaded');
  });

  it('requires BYOK generated-file transfers to include preview and approval evidence', () => {
    const computeSession: ComputeSession = {
      id: 'compute-byok',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      provider: 'openai',
      status: 'completed',
      workdirUri: 'openai://containers/cntr_1',
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
      completedAt: '2026-05-21T00:01:00.000Z',
    };
    const generatedFile: GeneratedFile = {
      id: 'file-byok',
      computeSessionId: computeSession.id,
      ownerUserId: computeSession.ownerUserId,
      sourceSurface: 'web',
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      kind: 'csv',
      fileName: 'analysis.csv',
      mimeType: 'text/csv',
      uri: 'openai://containers/cntr_1/files/file-byok',
      byteCount: 4096,
      checksumSha256: 'f'.repeat(64),
      previewDerivatives: [],
      createdAt: '2026-05-21T00:01:00.000Z',
    };
    const artifactManifest: ArtifactManifest = {
      id: 'manifest-byok',
      artifactId: 'artifact-byok',
      type: 'generated_file_bundle',
      title: 'Analysis',
      computeSessionId: computeSession.id,
      generatedFileIds: [generatedFile.id],
      privacyMode: 'byok',
      providerMode: 'DirectByok',
      storageScope: 'direct_byok_provider',
      checksumSha256: generatedFile.checksumSha256,
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
    };

    expect(
      validateGeneratedFileTrustBoundary({
        computeSession,
        generatedFile,
        artifactManifest,
        transfer: {
          targetPrivacyMode: 'byok',
          previewAccepted: false,
          approved: false,
        },
      }).map((violation) => violation.code),
    ).toEqual(['byok-transfer-preview-required', 'byok-transfer-approval-required']);

    expect(
      validateGeneratedFileTrustBoundary({
        computeSession,
        generatedFile,
        artifactManifest,
        transfer: {
          targetPrivacyMode: 'byok',
          previewAccepted: true,
          previewHashSha256: '1'.repeat(64),
          approved: true,
          approvedAt: '2026-05-21T00:02:00.000Z',
        },
      }),
    ).toEqual([]);
  });

  it('requires managed generated files to carry quota, owner, checksum, retention, and deletion metadata', () => {
    const computeSession: ComputeSession = {
      id: 'compute-managed',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      provider: 'openai',
      status: 'deleted',
      workdirUri: 'agi-managed://compute/compute-managed',
      retentionExpiresAt: '2026-05-22T00:00:00.000Z',
      ttlSeconds: 86_400,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
      completedAt: '2026-05-21T00:01:00.000Z',
      deletedAt: '2026-05-21T00:10:00.000Z',
    };
    const generatedFile: GeneratedFile = {
      id: 'file-managed',
      computeSessionId: computeSession.id,
      ownerUserId: computeSession.ownerUserId,
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: 'xlsx',
      fileName: 'managed-analysis.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uri: 'agi-managed://files/file-managed',
      byteCount: 8192,
      checksumSha256: '2'.repeat(64),
      previewDerivatives: [],
      retentionExpiresAt: '2026-05-22T00:00:00.000Z',
      createdAt: '2026-05-21T00:01:00.000Z',
      deletedAt: '2026-05-21T00:10:00.000Z',
    };
    const artifactManifest: ArtifactManifest = {
      id: 'manifest-managed',
      artifactId: 'artifact-managed',
      type: 'generated_file_bundle',
      title: 'Managed Analysis',
      computeSessionId: computeSession.id,
      generatedFileIds: [generatedFile.id],
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      storageScope: 'managed_compute',
      checksumSha256: generatedFile.checksumSha256,
      createdAt: '2026-05-21T00:01:00.000Z',
      updatedAt: '2026-05-21T00:01:00.000Z',
    };

    expect(
      validateGeneratedFileTrustBoundary({
        computeSession,
        generatedFile,
        artifactManifest,
        managed: { quotaReservationId: 'quota-reservation-1' },
      }),
    ).toEqual([]);

    expect(
      validateGeneratedFileTrustBoundary({
        computeSession: { ...computeSession, deletedAt: null, ttlSeconds: undefined },
        generatedFile,
        artifactManifest: { ...artifactManifest, checksumSha256: undefined },
        managed: {},
      }).map((violation) => violation.code),
    ).toEqual([
      'managed-quota-reservation-required',
      'managed-checksum-required',
      'managed-retention-required',
      'managed-deletion-metadata-required',
    ]);
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

describe('summarizeSendPreview', () => {
  it('produces a privacy-positive banner for Local turns', () => {
    const out = summarizeSendPreview({
      providerMode: 'Local',
      modelLabel: 'Llama 3.2 8B',
      messageBody: 'hello',
    });
    expect(out.staysLocal).toBe(true);
    expect(out.privacyMode).toBe('local');
    expect(out.privacyShortLabel).toBe('Local');
    expect(out.destinationLabel).toBe('Stays on this device');
    expect(out.bannerCopy).toMatch(/nothing is uploaded/i);
    expect(out.modelLabel).toBe('Llama 3.2 8B');
  });

  it('names the BYOK destination host when supplied', () => {
    const out = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
      modelLabel: 'Claude Sonnet 4.6',
      messageBody: 'hi',
    });
    expect(out.staysLocal).toBe(false);
    expect(out.privacyMode).toBe('byok');
    expect(out.destinationLabel).toBe('Sent to api.anthropic.com');
    expect(out.bannerCopy).toMatch(/api.anthropic.com/);
    expect(out.bannerCopy).toMatch(/your API key/);
  });

  it('falls back to a generic BYOK label when destinationHost is omitted', () => {
    const out = summarizeSendPreview({ providerMode: 'DirectByok' });
    expect(out.destinationLabel).toBe('Sent to your BYOK provider');
    expect(out.bannerCopy).toMatch(/your configured provider/);
  });

  it('names the Managed gateway destination for ManagedGateway / ManagedNative', () => {
    const gateway = summarizeSendPreview({
      providerMode: 'ManagedGateway',
      destinationHost: 'gateway.agi.example',
    });
    expect(gateway.privacyMode).toBe('managed');
    expect(gateway.destinationLabel).toBe('Sent to gateway.agi.example');

    const native = summarizeSendPreview({ providerMode: 'ManagedNative' });
    expect(native.destinationLabel).toBe('Sent through AGI Managed gateway');
    expect(native.bannerCopy).toMatch(/managed-mode retention/);
  });

  it('summarizes message body chars with a compact label', () => {
    const small = summarizeSendPreview({
      providerMode: 'Local',
      messageBody: 'a'.repeat(123),
    });
    expect(small.bodyCharLabel).toBe('123 chars');

    const k = summarizeSendPreview({
      providerMode: 'Local',
      messageBody: 'a'.repeat(8500),
    });
    expect(k.bodyCharLabel).toBe('8.5k chars');
  });

  it('summarizes attachments with mime-type deduplication', () => {
    const out = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.openai.com',
      attachmentSummaries: [
        { name: 'a.png', mimeType: 'image/png' },
        { name: 'b.jpg', mimeType: 'image/jpeg' },
        { name: 'c.pdf', mimeType: 'application/pdf' },
      ],
    });
    expect(out.attachmentLabel).toBe('3 attachments (png, jpeg, pdf)');
  });

  it('falls back to plain count when no mime types are provided', () => {
    const out = summarizeSendPreview({
      providerMode: 'DirectByok',
      attachmentCount: 1,
    });
    expect(out.attachmentLabel).toBe('1 attachment');
  });

  it('includes system-prompt and context-budget labels when sized', () => {
    const out = summarizeSendPreview({
      providerMode: 'ManagedGateway',
      destinationHost: 'gateway.agi.example',
      systemPromptLength: 1700,
      estimatedInputTokens: 1200,
      contextWindowTokens: 200_000,
    });
    expect(out.systemPromptLabel).toBe('1.7k char system prompt');
    expect(out.contextLabel).toBe('≈ 1.2k / 200k tokens');
  });

  it('omits the context window slash form when the window size is unknown', () => {
    const out = summarizeSendPreview({
      providerMode: 'Local',
      estimatedInputTokens: 80,
    });
    expect(out.contextLabel).toBe('≈ 80 tokens');
  });

  it('joins distinct tool names', () => {
    const out = summarizeSendPreview({
      providerMode: 'DirectByok',
      toolNames: ['web_search', 'code_interpreter', 'web_search'],
    });
    expect(out.toolsLabel).toBe('web_search, code_interpreter');
  });

  it('keeps the modelLabel falling back to the provider-mode label when omitted', () => {
    const out = summarizeSendPreview({ providerMode: 'DirectByok' });
    expect(out.modelLabel).toBe('BYOK');
  });
});
