import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveApprovalRequest, sendCompanionControl } = vi.hoisted(() => ({
  resolveApprovalRequest: vi.fn().mockResolvedValue(undefined),
  sendCompanionControl: vi.fn().mockResolvedValue(true),
}));

vi.mock('../approvalResolution', () => ({
  resolveApprovalRequest,
}));

vi.mock('../../stores/connectionStore', () => ({
  MOBILE_COMPANION_SESSION_ENDED_EVENT: 'mobile-companion:session-ended',
  sendCompanionControl,
}));

import {
  buildCompanionApprovalRequest,
  initializeCoworkDispatchRuntime,
  parseCompanionApprovalResponse,
  parseDispatchTaskControl,
  resetCoworkDispatchRuntimeForTests,
} from '../coworkDispatch';
import {
  type BackgroundAgent,
  type BackgroundAgentStatus,
  useBackgroundAgentStore,
} from '../../stores/backgroundAgentStore';
import { useCoworkDispatchStore } from '../../stores/coworkDispatchStore';
import { type ApprovalRequest, useToolStore } from '../../stores/chat/toolStore';

const request = {
  action: 'dispatch.task.create',
  version: 1,
  requestId: 'request-1',
  prompt: 'Prepare the release notes',
  title: 'Release notes',
  sentAt: '2026-07-30T12:00:00.000Z',
} as const;

function agent(
  id: string,
  status: BackgroundAgentStatus,
  goal = 'Background work',
  progress: Partial<BackgroundAgent['progress']> = {},
): BackgroundAgent {
  return {
    id,
    conversationId: 'conversation-1',
    goal,
    status,
    progress: {
      currentStep: 0,
      totalSteps: 0,
      currentStepDescription: '',
      percentage: 0,
      elapsedSecs: 0,
      ...progress,
    },
    summary: null,
    error: null,
    createdAt: request.sentAt,
    startedAt: status === 'queued' ? null : request.sentAt,
    completedAt: null,
    context: {
      workingDirectory: null,
      environment: {},
      conversationSnapshot: [],
      activeMcpServers: [],
      customInstructions: null,
    },
    priority: 0,
    timeoutSecs: 3_600,
  };
}

function sendControl(action: string, payload: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent('mobile-companion:control', { detail: { action, payload } }),
  );
}

let cleanupRuntime: (() => void) | undefined;

describe('Cowork Dispatch runtime', () => {
  beforeEach(() => {
    resolveApprovalRequest.mockClear();
    sendCompanionControl.mockClear();
    resetCoworkDispatchRuntimeForTests();
    useCoworkDispatchStore.setState({ enabled: false });
    useBackgroundAgentStore.setState({
      agents: [],
      activeCount: 0,
      error: null,
      startAgent: vi.fn().mockResolvedValue('agent-1'),
      listAgents: vi.fn(async () => useBackgroundAgentStore.getState().agents),
      cancelAgent: vi.fn().mockResolvedValue(undefined),
      pauseAgent: vi.fn().mockResolvedValue(undefined),
      resumeAgent: vi.fn().mockResolvedValue(undefined),
    });
    useToolStore.setState({ pendingApprovals: [] });
    cleanupRuntime = initializeCoworkDispatchRuntime();
  });

  afterEach(() => {
    cleanupRuntime?.();
    cleanupRuntime = undefined;
  });

  it('validates the versioned create and cancel payloads', () => {
    expect(parseDispatchTaskControl(request.action, request)).toEqual(request);
    expect(
      parseDispatchTaskControl('dispatch.task.cancel', {
        action: 'dispatch.task.cancel',
        version: 1,
        requestId: 'request-1',
        taskId: 'goal-1',
        sentAt: request.sentAt,
      }),
    ).toEqual({
      action: 'dispatch.task.cancel',
      version: 1,
      requestId: 'request-1',
      taskId: 'goal-1',
      sentAt: request.sentAt,
    });
    expect(
      parseDispatchTaskControl(request.action, {
        ...request,
        prompt: 'x'.repeat(20_001),
      }),
    ).toBeNull();
  });

  it('rejects new tasks while Dispatch is disabled', async () => {
    sendControl(request.action, request);

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ requestId: 'request-1', status: 'rejected' }),
      );
    });
    expect(useBackgroundAgentStore.getState().startAgent).not.toHaveBeenCalled();
  });

  it('starts a background run and mirrors its lifecycle to Mobile', async () => {
    useCoworkDispatchStore.setState({ enabled: true });
    sendControl(request.action, request);

    await vi.waitFor(() => {
      expect(useBackgroundAgentStore.getState().startAgent).toHaveBeenCalledWith(request.prompt);
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: request.requestId,
          taskId: 'agent-1',
          status: 'accepted',
        }),
      );
    });

    useBackgroundAgentStore.setState({ agents: [agent('agent-1', 'running', request.prompt)] });
    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: request.requestId,
          taskId: 'agent-1',
          status: 'running',
        }),
      );
    });

    useBackgroundAgentStore.setState({
      agents: [
        {
          ...agent('agent-1', 'completed', request.prompt),
          summary: {
            description: 'Release notes drafted.',
            filesChanged: [],
            actionsTaken: [],
            warnings: [],
            goalAchieved: true,
          },
        },
      ],
    });
    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          taskId: 'agent-1',
          status: 'completed',
          result: 'Release notes drafted.',
        }),
      );
    });
  });

  it('reports a run Desktop could not start as failed', async () => {
    useCoworkDispatchStore.setState({ enabled: true });
    useBackgroundAgentStore.setState({
      startAgent: vi.fn().mockRejectedValue(new Error('Too many background agents are running.')),
    });
    sendControl(request.action, request);

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: request.requestId,
          status: 'failed',
          error: 'Too many background agents are running.',
        }),
      );
    });
  });

  it('does not install a task mapping after the companion session ends', async () => {
    let resolveStart!: (agentId: string) => void;
    const pendingStart = new Promise<string>((resolve) => {
      resolveStart = resolve;
    });
    useCoworkDispatchStore.setState({ enabled: true });
    useBackgroundAgentStore.setState({ startAgent: vi.fn().mockReturnValue(pendingStart) });

    sendControl(request.action, request);
    await vi.waitFor(() =>
      expect(useBackgroundAgentStore.getState().startAgent).toHaveBeenCalledOnce(),
    );

    window.dispatchEvent(new Event('mobile-companion:session-ended'));
    resolveStart('agent-stale');
    await pendingStart;
    await Promise.resolve();

    expect(sendCompanionControl).not.toHaveBeenCalledWith(
      'dispatch.task.status',
      expect.objectContaining({ status: 'accepted', taskId: 'agent-stale' }),
    );

    sendControl('dispatch.task.cancel', {
      action: 'dispatch.task.cancel',
      version: 1,
      requestId: request.requestId,
      taskId: 'agent-stale',
      sentAt: request.sentAt,
    });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ status: 'rejected', requestId: request.requestId }),
      );
    });
    expect(useBackgroundAgentStore.getState().cancelAgent).not.toHaveBeenCalled();
  });

  it('cancels the run started by a Dispatch request even after disabling new work', async () => {
    useCoworkDispatchStore.setState({ enabled: true });
    sendControl(request.action, request);
    await vi.waitFor(() =>
      expect(useBackgroundAgentStore.getState().startAgent).toHaveBeenCalled(),
    );
    await vi.waitFor(() =>
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ status: 'accepted', taskId: 'agent-1' }),
      ),
    );

    useCoworkDispatchStore.setState({ enabled: false });
    sendControl('dispatch.task.cancel', {
      action: 'dispatch.task.cancel',
      version: 1,
      requestId: request.requestId,
      taskId: 'agent-1',
      sentAt: request.sentAt,
    });

    await vi.waitFor(() => {
      expect(useBackgroundAgentStore.getState().cancelAgent).toHaveBeenCalledWith('agent-1');
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ status: 'cancelled', taskId: 'agent-1' }),
      );
    });
  });

  it('does not let a Dispatch cancel reach an arbitrary Desktop agent', async () => {
    useBackgroundAgentStore.setState({ agents: [agent('agent-existing', 'running')] });

    sendControl('dispatch.task.cancel', {
      action: 'dispatch.task.cancel',
      version: 1,
      requestId: 'unknown-request',
      taskId: 'agent-existing',
      sentAt: request.sentAt,
    });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ requestId: 'unknown-request', status: 'rejected' }),
      );
    });
    expect(useBackgroundAgentStore.getState().cancelAgent).not.toHaveBeenCalled();
  });

  it('cancels every unfinished background agent when Mobile sends the Emergency Stop control', async () => {
    const cancelAgent = vi.fn().mockResolvedValue(undefined);
    useBackgroundAgentStore.setState({
      cancelAgent,
      agents: [
        agent('agent-queued', 'queued'),
        agent('agent-running', 'running'),
        agent('agent-paused', 'paused'),
        agent('agent-done', 'completed'),
      ],
    });
    sendCompanionControl.mockClear();

    sendControl('cancel', { action: 'cancel', scope: 'all', sentAt: request.sentAt });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'emergency_stop',
        expect.objectContaining({
          scope: 'all',
          requested: 3,
          cancelled: 3,
          failed: 0,
        }),
      );
    });
    expect(useBackgroundAgentStore.getState().listAgents).toHaveBeenCalled();
    expect(cancelAgent.mock.calls.map(([agentId]) => agentId)).toEqual([
      'agent-running',
      'agent-queued',
      'agent-paused',
    ]);
    expect(cancelAgent).not.toHaveBeenCalledWith('agent-done');
  });

  it('keeps cancelling the remaining agents when one Emergency Stop cancellation throws', async () => {
    const cancelAgent = vi.fn(async (agentId: string) => {
      if (agentId === 'agent-a') throw new Error('backend refused');
    });
    useBackgroundAgentStore.setState({
      cancelAgent,
      agents: [
        agent('agent-a', 'running'),
        agent('agent-b', 'running'),
        agent('agent-c', 'running'),
      ],
    });
    sendCompanionControl.mockClear();

    sendControl('cancel', { action: 'cancel', scope: 'all', sentAt: request.sentAt });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'emergency_stop',
        expect.objectContaining({
          requested: 3,
          cancelled: 2,
          failed: 1,
          failedTaskIds: ['agent-a'],
          cancelledTaskIds: ['agent-b', 'agent-c'],
        }),
      );
    });
    expect(cancelAgent.mock.calls.map(([agentId]) => agentId)).toEqual([
      'agent-a',
      'agent-b',
      'agent-c',
    ]);
  });

  it('reports an honest Emergency Stop result when nothing is running', async () => {
    useBackgroundAgentStore.setState({ agents: [agent('agent-done', 'completed')] });
    sendCompanionControl.mockClear();

    sendControl('cancel', { action: 'cancel', scope: 'all', sentAt: request.sentAt });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'emergency_stop',
        expect.objectContaining({
          requested: 0,
          cancelled: 0,
          failed: 0,
          message: 'No tasks were running on Desktop.',
        }),
      );
    });
    expect(useBackgroundAgentStore.getState().cancelAgent).not.toHaveBeenCalled();
  });

  it('does not claim nothing was running when Desktop cannot read its agents', async () => {
    useBackgroundAgentStore.setState({
      agents: [],
      listAgents: vi.fn(async () => {
        useBackgroundAgentStore.setState({ error: 'database locked' });
        return [];
      }),
    });
    sendCompanionControl.mockClear();

    sendControl('cancel', { action: 'cancel', scope: 'all', sentAt: request.sentAt });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'emergency_stop',
        expect.objectContaining({
          requested: 0,
          errorMessage: expect.stringContaining('database locked'),
        }),
      );
    });
    expect(sendCompanionControl).not.toHaveBeenCalledWith(
      'emergency_stop',
      expect.objectContaining({ message: 'No tasks were running on Desktop.' }),
    );
  });

  it('routes a single-agent remote cancel to that one background agent', async () => {
    useBackgroundAgentStore.setState({
      agents: [agent('agent-running', 'running'), agent('agent-other', 'running')],
    });

    sendControl('cancel', {
      kind: 'agent_command',
      agentId: 'agent-running',
      command: 'cancel',
      sentAt: request.sentAt,
    });

    await vi.waitFor(() => {
      expect(useBackgroundAgentStore.getState().cancelAgent).toHaveBeenCalledWith('agent-running');
    });
    expect(useBackgroundAgentStore.getState().cancelAgent).toHaveBeenCalledTimes(1);
  });

  it('answers Mobile refresh requests with a bounded agent snapshot', async () => {
    useBackgroundAgentStore.setState({
      agents: [
        agent('agent-existing', 'running', 'Review the release candidate', {
          currentStep: 2,
          totalSteps: 4,
          percentage: 50,
          currentStepDescription: 'Running read_file',
        }),
      ],
    });
    sendCompanionControl.mockClear();

    sendControl('sync_request', { reason: 'agent_refresh' });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith('agents_update', {
        agents: [
          expect.objectContaining({
            id: 'agent-existing',
            name: 'Review the release candidate',
            status: 'running',
            currentStep: 'Running read_file',
            progress: 50,
          }),
        ],
      });
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'approval_snapshot',
        expect.objectContaining({
          version: 1,
          pendingRequestIds: [],
        }),
      );
    });
    expect(useBackgroundAgentStore.getState().listAgents).toHaveBeenCalled();
  });

  it('builds a bounded versioned approval request from authoritative Desktop state', () => {
    const createdAt = new Date('2026-07-30T12:00:00.000Z');
    const approval: ApprovalRequest = {
      id: 'approval-1',
      type: 'mcp_tool',
      description: 'Delete the generated archive',
      riskLevel: 'high',
      details: {
        tool: 'Delete file',
        toolName: 'delete_file',
      },
      status: 'pending',
      timeoutSeconds: 120,
      createdAt,
    };

    expect(buildCompanionApprovalRequest(approval, createdAt.getTime() + 30_000)).toEqual({
      action: 'approval_request',
      version: 1,
      requestId: 'approval-1',
      toolName: 'Delete file',
      description: 'Delete the generated archive',
      riskLevel: 'high',
      type: 'other',
      createdAt: '2026-07-30T12:00:00.000Z',
      expiresAt: '2026-07-30T12:02:00.000Z',
      countdown: 90,
    });
    expect(buildCompanionApprovalRequest(approval, createdAt.getTime() + 121_000)).toMatchObject({
      requestId: 'approval-1',
      countdown: 0,
    });
  });

  it('relays each new Desktop approval and closes it when Desktop removes it', async () => {
    useToolStore.setState({
      pendingApprovals: [
        {
          id: 'approval-2',
          type: 'terminal_command',
          description: 'Run the release command',
          riskLevel: 'medium',
          details: { command: 'pnpm release' },
          status: 'pending',
          createdAt: new Date(),
          timeoutSeconds: 300,
        },
      ],
    });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'approval_request',
        expect.objectContaining({
          version: 1,
          requestId: 'approval-2',
          type: 'command',
        }),
      );
    });
    expect(
      sendCompanionControl.mock.calls.filter(([action]) => action === 'approval_request'),
    ).toHaveLength(1);

    useToolStore.setState({ pendingApprovals: [] });
    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'approval_closed',
        expect.objectContaining({
          version: 1,
          requestId: 'approval-2',
        }),
      );
    });
  });

  it('resolves a signed Mobile decision against the matching pending Desktop approval', async () => {
    const approval: ApprovalRequest = {
      id: 'approval-3',
      type: 'mcp_tool',
      description: 'Write the release manifest',
      riskLevel: 'medium',
      details: { toolName: 'write_file' },
      status: 'pending',
      createdAt: new Date(),
      timeoutSeconds: 120,
    };
    useToolStore.setState({ pendingApprovals: [approval] });
    await vi.waitFor(() =>
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'approval_request',
        expect.objectContaining({ requestId: approval.id }),
      ),
    );

    resolveApprovalRequest.mockImplementationOnce(async () => {
      useToolStore.setState({ pendingApprovals: [] });
      return undefined;
    });
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'approval_response',
          payload: {
            action: 'approval_response',
            version: 1,
            requestId: approval.id,
            approved: false,
            reason: 'Not from my phone',
            respondedAt: '2026-07-30T12:01:00.000Z',
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(resolveApprovalRequest).toHaveBeenCalledWith(approval, 'reject', {
        trust: false,
        reason: 'Not from my phone',
      });
    });
  });

  it('rejects malformed or unknown Mobile approval decisions', async () => {
    expect(
      parseCompanionApprovalResponse({
        version: 2,
        requestId: 'approval-4',
        approved: true,
        respondedAt: request.sentAt,
      }),
    ).toBeNull();

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'approval_response',
          payload: {
            version: 1,
            requestId: 'unknown-approval',
            approved: true,
            respondedAt: request.sentAt,
          },
        },
      }),
    );
    await Promise.resolve();
    expect(resolveApprovalRequest).not.toHaveBeenCalled();
  });
});
