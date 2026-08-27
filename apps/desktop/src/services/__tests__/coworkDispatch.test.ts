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
import { useAgentTaskStore } from '../../stores/agentTaskStore';
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

let cleanupRuntime: (() => void) | undefined;

describe('Cowork Dispatch runtime', () => {
  beforeEach(() => {
    resolveApprovalRequest.mockClear();
    sendCompanionControl.mockClear();
    resetCoworkDispatchRuntimeForTests();
    useCoworkDispatchStore.setState({ enabled: false });
    useAgentTaskStore.setState({
      tasks: [],
      loading: false,
      liveStepsByTask: {},
      liveProgressByTask: {},
      submitGoal: vi.fn().mockResolvedValue('goal-1'),
      cancelTask: vi.fn().mockResolvedValue(undefined),
      pauseTask: vi.fn().mockResolvedValue(undefined),
      resumeTask: vi.fn().mockResolvedValue(undefined),
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
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: { action: request.action, payload: request },
      }),
    );

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: 'request-1',
          status: 'rejected',
        }),
      );
    });
    expect(useAgentTaskStore.getState().submitGoal).not.toHaveBeenCalled();
  });

  it('starts a real AGI task and mirrors its lifecycle to Mobile', async () => {
    useCoworkDispatchStore.setState({ enabled: true });
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: { action: request.action, payload: request },
      }),
    );

    await vi.waitFor(() => {
      expect(useAgentTaskStore.getState().submitGoal).toHaveBeenCalledWith(request.prompt, {
        assertCurrent: expect.any(Function),
      });
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: request.requestId,
          taskId: 'goal-1',
          status: 'accepted',
        }),
      );
    });

    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'goal-1',
          goal: request.prompt,
          status: 'running',
          createdAt: request.sentAt,
        },
      ],
    });

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: request.requestId,
          taskId: 'goal-1',
          status: 'running',
        }),
      );
    });
  });

  it('does not install a deferred task mapping after the companion session ends', async () => {
    let resolveGoal!: (taskId: string) => void;
    const pendingGoal = new Promise<string>((resolve) => {
      resolveGoal = resolve;
    });
    useCoworkDispatchStore.setState({ enabled: true });
    useAgentTaskStore.setState({ submitGoal: vi.fn().mockReturnValue(pendingGoal) });

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: { action: request.action, payload: request },
      }),
    );
    await vi.waitFor(() => expect(useAgentTaskStore.getState().submitGoal).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event('mobile-companion:session-ended'));
    const authority = vi.mocked(useAgentTaskStore.getState().submitGoal).mock.calls[0]?.[1]
      ?.assertCurrent;
    expect(authority).toBeTypeOf('function');
    expect(() => authority?.()).toThrow(expect.objectContaining({ name: 'AbortError' }));
    resolveGoal('goal-stale');
    await pendingGoal;
    await Promise.resolve();

    expect(sendCompanionControl).not.toHaveBeenCalledWith(
      'dispatch.task.status',
      expect.objectContaining({ status: 'accepted', taskId: 'goal-stale' }),
    );

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'dispatch.task.cancel',
          payload: {
            action: 'dispatch.task.cancel',
            version: 1,
            requestId: request.requestId,
            taskId: 'goal-stale',
            sentAt: request.sentAt,
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(useAgentTaskStore.getState().cancelTask).not.toHaveBeenCalled();
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ status: 'rejected', requestId: request.requestId }),
      );
    });
  });

  it('cancels the task associated with a Dispatch request even after disabling new work', async () => {
    useCoworkDispatchStore.setState({ enabled: true });
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: { action: request.action, payload: request },
      }),
    );
    await vi.waitFor(() => expect(useAgentTaskStore.getState().submitGoal).toHaveBeenCalled());

    useCoworkDispatchStore.setState({ enabled: false });
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'dispatch.task.cancel',
          payload: {
            action: 'dispatch.task.cancel',
            version: 1,
            requestId: request.requestId,
            taskId: 'goal-1',
            sentAt: request.sentAt,
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(useAgentTaskStore.getState().cancelTask).toHaveBeenCalledWith('goal-1');
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({ status: 'cancelled', taskId: 'goal-1' }),
      );
    });
  });

  it('does not let an untracked request cancel an arbitrary Desktop task', async () => {
    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'dispatch.task.cancel',
          payload: {
            action: 'dispatch.task.cancel',
            version: 1,
            requestId: 'unknown-request',
            taskId: 'goal-existing',
            sentAt: request.sentAt,
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(useAgentTaskStore.getState().cancelTask).not.toHaveBeenCalled();
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'dispatch.task.status',
        expect.objectContaining({
          requestId: 'unknown-request',
          status: 'rejected',
        }),
      );
    });
  });

  it('cancels every running Desktop task when Mobile sends the Emergency Stop control', async () => {
    const cancelTask = vi.fn().mockResolvedValue(undefined);
    useAgentTaskStore.setState({
      cancelTask,
      tasks: [
        { id: 'goal-queued', goal: 'Queued work', status: 'queued', createdAt: request.sentAt },
        { id: 'goal-running', goal: 'Shell loop', status: 'running', createdAt: request.sentAt },
        { id: 'goal-paused', goal: 'Paused work', status: 'paused', createdAt: request.sentAt },
        { id: 'goal-done', goal: 'Finished work', status: 'completed', createdAt: request.sentAt },
      ],
    });
    sendCompanionControl.mockClear();

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'cancel',
          payload: { action: 'cancel', scope: 'all', sentAt: request.sentAt },
        },
      }),
    );

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
    expect(cancelTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      'goal-running',
      'goal-queued',
      'goal-paused',
    ]);
    expect(cancelTask).not.toHaveBeenCalledWith('goal-done');
  });

  it('keeps cancelling the remaining tasks when one Emergency Stop cancellation throws', async () => {
    const cancelTask = vi.fn(async (taskId: string) => {
      if (taskId === 'goal-running-a') throw new Error('backend refused');
    });
    useAgentTaskStore.setState({
      cancelTask,
      tasks: [
        { id: 'goal-running-a', goal: 'First', status: 'running', createdAt: request.sentAt },
        { id: 'goal-running-b', goal: 'Second', status: 'running', createdAt: request.sentAt },
        { id: 'goal-running-c', goal: 'Third', status: 'running', createdAt: request.sentAt },
      ],
    });
    sendCompanionControl.mockClear();

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'cancel',
          payload: { action: 'cancel', scope: 'all', sentAt: request.sentAt },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith(
        'emergency_stop',
        expect.objectContaining({
          requested: 3,
          cancelled: 2,
          failed: 1,
          failedTaskIds: ['goal-running-a'],
          cancelledTaskIds: ['goal-running-b', 'goal-running-c'],
        }),
      );
    });
    expect(cancelTask.mock.calls.map(([taskId]) => taskId)).toEqual([
      'goal-running-a',
      'goal-running-b',
      'goal-running-c',
    ]);
  });

  it('reports an honest Emergency Stop result when nothing is running', async () => {
    useAgentTaskStore.setState({
      tasks: [
        { id: 'goal-done', goal: 'Finished work', status: 'completed', createdAt: request.sentAt },
      ],
    });
    sendCompanionControl.mockClear();

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'cancel',
          payload: { action: 'cancel', scope: 'all', sentAt: request.sentAt },
        },
      }),
    );

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
    expect(useAgentTaskStore.getState().cancelTask).not.toHaveBeenCalled();
  });

  it('still routes a single-agent remote cancel to that one task', async () => {
    useAgentTaskStore.setState({
      tasks: [
        { id: 'goal-running', goal: 'Shell loop', status: 'running', createdAt: request.sentAt },
        { id: 'goal-other', goal: 'Other work', status: 'running', createdAt: request.sentAt },
      ],
    });

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: {
          action: 'cancel',
          payload: {
            kind: 'agent_command',
            agentId: 'goal-running',
            command: 'cancel',
            sentAt: request.sentAt,
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(useAgentTaskStore.getState().cancelTask).toHaveBeenCalledWith('goal-running');
    });
    expect(useAgentTaskStore.getState().cancelTask).toHaveBeenCalledTimes(1);
  });

  it('answers Mobile refresh requests with a bounded agent snapshot', async () => {
    useAgentTaskStore.setState({
      tasks: [
        {
          id: 'goal-existing',
          goal: 'Review the release candidate',
          status: 'running',
          createdAt: request.sentAt,
        },
      ],
      liveProgressByTask: {
        'goal-existing': { step: 2, total: 4 },
      },
    });
    sendCompanionControl.mockClear();

    window.dispatchEvent(
      new CustomEvent('mobile-companion:control', {
        detail: { action: 'sync_request', payload: { reason: 'agent_refresh' } },
      }),
    );

    await vi.waitFor(() => {
      expect(sendCompanionControl).toHaveBeenCalledWith('agents_update', {
        agents: [
          expect.objectContaining({
            id: 'goal-existing',
            name: 'Review the release candidate',
            status: 'running',
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
