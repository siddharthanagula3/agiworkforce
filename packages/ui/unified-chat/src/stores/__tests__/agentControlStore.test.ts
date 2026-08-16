import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentControlStore } from '../agentControlStore';

describe('agentControlStore — safe default (UI-AGENTMODE-DEFAULT-01)', () => {
  beforeEach(() => {
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  it('defaults a fresh conversation to "ask" (require explicit intent), never "auto"', () => {
    const resolved = useAgentControlStore.getState().resolve('fresh-conversation', null);
    expect(resolved.mode).toBe('ask');
    expect(resolved.mode).not.toBe('auto');
  });

  it('still honors an explicit user opt-in to auto', () => {
    useAgentControlStore.getState().setMode('c1', 'auto');
    expect(useAgentControlStore.getState().resolve('c1', null).mode).toBe('auto');
  });
});
