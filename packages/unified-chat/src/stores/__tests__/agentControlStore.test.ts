import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentControlStore } from '../agentControlStore';

// UI-AGENTMODE-DEFAULT-01 (founder decision): agent edits must always require
// explicit user intent. A fresh conversation must default to 'ask' (confirm
// every edit), never 'auto' (edits run without confirmation).
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
