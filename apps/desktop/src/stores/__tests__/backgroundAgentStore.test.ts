import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke, listen } from '../../lib/tauri-mock';
import {
  BACKGROUND_AGENT_EVENTS,
  applyBackgroundAgentEvent,
  subscribeToBackgroundAgents,
  unsubscribeFromBackgroundAgents,
  useBackgroundAgentStore,
  type BackgroundAgent,
} from '../backgroundAgentStore';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

function makeAgent(overrides: Partial<BackgroundAgent> = {}): BackgroundAgent {
  return {
    id: 'agent-1',
    conversationId: 'conv-1',
    goal: 'write tests',
    status: 'queued',
    progress: {
      currentStep: 0,
      totalSteps: 3,
      currentStepDescription: 'Starting...',
      percentage: 0,
      elapsedSecs: 0,
    },
    summary: null,
    error: null,
    createdAt: '2026-08-15T00:00:00Z',
    startedAt: null,
    completedAt: null,
    context: {
      workingDirectory: null,
      environment: {},
      conversationSnapshot: [],
      activeMcpServers: [],
      customInstructions: null,
    },
    priority: 5,
    timeoutSecs: 86400,
    ...overrides,
  };
}

describe('backgroundAgentStore command wiring', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    useBackgroundAgentStore.getState().reset();
    unsubscribeFromBackgroundAgents();
  });

  it('reaches every background_agent_* Tauri command the backend exposes', async () => {
    const agent = makeAgent();

    mockInvoke.mockImplementation(async (command: string) => {
      switch (command) {
        case 'background_agent_list':
          return { agents: [agent], activeCount: 1, maxAgents: 8 };
        case 'background_agent_get':
          return agent;
        default:
          return undefined;
      }
    });

    const store = useBackgroundAgentStore.getState();

    await store.listAgents();
    await store.getAgent('agent-1');
    await store.pauseAgent('agent-1');
    await store.resumeAgent('agent-1');
    await store.cancelAgent('agent-1');

    const invoked = new Set(mockInvoke.mock.calls.map(([command]) => command));
    expect([...invoked].sort()).toEqual([
      'background_agent_cancel',
      'background_agent_get',
      'background_agent_list',
      'background_agent_pause',
      'background_agent_resume',
    ]);

    const pauseCall = mockInvoke.mock.calls.find(([c]) => c === 'background_agent_pause');
    expect(pauseCall?.[1]).toEqual({ agentId: 'agent-1' });

    expect(useBackgroundAgentStore.getState().maxAgents).toBe(8);
  });

  it('subscribes to all eight background agent events', async () => {
    mockInvoke.mockResolvedValue(null);
    mockListen.mockResolvedValue(() => {});

    await subscribeToBackgroundAgents();

    const subscribed = mockListen.mock.calls.map(([event]) => event).sort();
    expect(subscribed).toEqual(
      [
        'background_agent:cancelled',
        'background_agent:completed',
        'background_agent:created',
        'background_agent:failed',
        'background_agent:paused',
        'background_agent:progress',
        'background_agent:resumed',
        'background_agent:started',
      ].sort(),
    );
    expect(BACKGROUND_AGENT_EVENTS).toHaveLength(8);
  });

  it('applies each status event to the tracked agent', () => {
    mockInvoke.mockResolvedValue(null);
    useBackgroundAgentStore.setState({ agents: [makeAgent()], activeCount: 1 });

    const read = () => useBackgroundAgentStore.getState().agents[0];

    applyBackgroundAgentEvent('background_agent:started', { agentId: 'agent-1' });
    expect(read()?.status).toBe('running');

    applyBackgroundAgentEvent('background_agent:paused', { agentId: 'agent-1' });
    expect(read()?.status).toBe('paused');

    applyBackgroundAgentEvent('background_agent:resumed', { agentId: 'agent-1' });
    expect(read()?.status).toBe('running');
    expect(useBackgroundAgentStore.getState().activeCount).toBe(1);

    applyBackgroundAgentEvent('background_agent:failed', {
      agentId: 'agent-1',
      message: 'provider timeout',
    });
    expect(read()?.status).toBe('failed');
    expect(read()?.error).toBe('provider timeout');
    expect(useBackgroundAgentStore.getState().activeCount).toBe(0);

    applyBackgroundAgentEvent('background_agent:cancelled', { agentId: 'agent-1' });
    expect(read()?.status).toBe('cancelled');

    applyBackgroundAgentEvent('background_agent:completed', { agentId: 'agent-1' });
    expect(read()?.status).toBe('completed');
    expect(read()?.completedAt).toBeTruthy();
  });

  it('refreshes the agent on created and progress events, which carry no state', () => {
    mockInvoke.mockResolvedValue(makeAgent({ status: 'running' }));

    applyBackgroundAgentEvent('background_agent:created', { agentId: 'agent-1' });
    applyBackgroundAgentEvent('background_agent:progress', { agentId: 'agent-1' });

    const refreshes = mockInvoke.mock.calls.filter(([c]) => c === 'background_agent_get');
    expect(refreshes).toHaveLength(2);
  });
});
