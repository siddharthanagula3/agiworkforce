import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendCompanionControl } = vi.hoisted(() => ({
  sendCompanionControl: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../stores/connectionStore', () => ({
  sendCompanionControl,
}));

import {
  initializeCoworkDispatchRuntime,
  parseDispatchTaskControl,
  resetCoworkDispatchRuntimeForTests,
} from '../coworkDispatch';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { useCoworkDispatchStore } from '../../stores/coworkDispatchStore';

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
      expect(useAgentTaskStore.getState().submitGoal).toHaveBeenCalledWith(request.prompt);
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
    });
  });
});
