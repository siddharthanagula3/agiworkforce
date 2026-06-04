import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: mocks.invoke,
}));

import { useCustomAgentsStore, type CustomAgentConfig } from '../customAgentsStore';

const agent: CustomAgentConfig = {
  name: 'frontend-engineer',
  description: 'Builds UI surfaces',
  systemPrompt: 'You are a frontend engineer.',
  scope: 'global',
};

describe('customAgentsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCustomAgentsStore.setState({
      agents: [],
      isLoading: false,
      error: null,
    });
  });

  it('loads custom agents through the Tauri command wrapper', async () => {
    mocks.invoke.mockResolvedValueOnce([agent]);

    await useCustomAgentsStore.getState().fetchAgents();

    expect(mocks.invoke).toHaveBeenCalledWith('list_custom_agents');
    expect(useCustomAgentsStore.getState().agents).toEqual([agent]);
    expect(useCustomAgentsStore.getState().error).toBeNull();
  });

  it('saves an agent then reloads the authoritative backend list', async () => {
    mocks.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce([agent]);

    await useCustomAgentsStore.getState().saveAgent(agent);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'save_custom_agent', { config: agent });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'list_custom_agents');
    expect(useCustomAgentsStore.getState().agents).toEqual([agent]);
  });

  it('deletes an agent then reloads the authoritative backend list', async () => {
    mocks.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);

    await useCustomAgentsStore.getState().deleteAgent(agent.name, agent.scope);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'delete_custom_agent', {
      name: agent.name,
      scope: agent.scope,
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'list_custom_agents');
    expect(useCustomAgentsStore.getState().agents).toEqual([]);
  });
});
