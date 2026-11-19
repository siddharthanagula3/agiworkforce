jest.mock('../lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useAgentControlStore } from '../stores/agentControlStore';

describe('agent control conversation overrides', () => {
  beforeEach(() => {
    useAgentControlStore.setState({
      byConversation: {},
      byProject: {
        __default__: { mode: 'plan', effort: 'high', temporaryChat: true },
      },
    });
  });

  it('keeps inherited effort and temporary chat when only the mode is overridden', () => {
    useAgentControlStore.getState().setMode('conv-1', 'ask');

    expect(useAgentControlStore.getState().resolve('conv-1', null)).toEqual({
      mode: 'ask',
      effort: 'high',
      temporaryChat: true,
      source: 'conversation-override',
    });
  });

  it('keeps inherited mode and temporary chat when only the effort is overridden', () => {
    useAgentControlStore.getState().setEffort('conv-1', 'low');

    expect(useAgentControlStore.getState().resolve('conv-1', null)).toEqual({
      mode: 'plan',
      effort: 'low',
      temporaryChat: true,
      source: 'conversation-override',
    });
  });

  it('keeps inherited mode and effort when only temporary chat is overridden', () => {
    useAgentControlStore.getState().setTemporaryChat('conv-1', false);

    expect(useAgentControlStore.getState().resolve('conv-1', null)).toEqual({
      mode: 'plan',
      effort: 'high',
      temporaryChat: false,
      source: 'conversation-override',
    });
  });

  it('keeps an existing override intact on later edits', () => {
    useAgentControlStore.getState().setMode('conv-1', 'ask');
    useAgentControlStore.setState({
      byProject: { __default__: { mode: 'auto', effort: 'low', temporaryChat: false } },
    });
    useAgentControlStore.getState().setEffort('conv-1', 'max');

    expect(useAgentControlStore.getState().resolve('conv-1', null)).toMatchObject({
      mode: 'ask',
      effort: 'max',
      temporaryChat: true,
    });
  });
});
