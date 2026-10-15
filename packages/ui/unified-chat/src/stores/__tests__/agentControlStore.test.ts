import { beforeEach, describe, expect, it } from 'vitest';

import { ALL_AGENT_MODES, useAgentControlStore } from '../agentControlStore';

describe('agentControlStore, safe default (UI-AGENTMODE-DEFAULT-01)', () => {
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

describe('agentControlStore, host-enforced modes', () => {
  beforeEach(() => {
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  it('offers every mode until a host narrows them', () => {
    useAgentControlStore.getState().setAvailableModes(ALL_AGENT_MODES);
    expect(useAgentControlStore.getState().availableModes).toEqual([
      'ask',
      'auto',
      'plan',
      'bypass',
    ]);
  });

  it('keeps only the modes the host enforces', () => {
    useAgentControlStore.getState().setAvailableModes(['ask', 'plan']);
    expect(useAgentControlStore.getState().availableModes).toEqual(['ask', 'plan']);
    useAgentControlStore.getState().setAvailableModes(ALL_AGENT_MODES);
  });

  it('resolves a stored mode the host does not enforce to ask', () => {
    useAgentControlStore.getState().setMode('c1', 'auto');
    useAgentControlStore.getState().setMode('c2', 'bypass');
    useAgentControlStore.getState().setAvailableModes(['ask', 'plan']);

    const first = useAgentControlStore.getState().resolve('c1', null);
    expect(first.mode).toBe('ask');
    expect(useAgentControlStore.getState().resolve('c1', null)).toBe(first);
    expect(useAgentControlStore.getState().resolve('c2', null).mode).toBe('ask');

    useAgentControlStore.getState().setAvailableModes(ALL_AGENT_MODES);
    expect(useAgentControlStore.getState().resolve('c1', null).mode).toBe('auto');
  });

  it('returns the same object for an unchanged project default, so a selector settles', () => {
    useAgentControlStore.getState().setProjectDefault('p1', { mode: 'plan' });

    const first = useAgentControlStore.getState().resolve('c-new', 'p1');
    expect(first).toMatchObject({ mode: 'plan', source: 'project-default' });
    expect(useAgentControlStore.getState().resolve('c-new', 'p1')).toBe(first);

    useAgentControlStore.getState().setProjectDefault('p1', { mode: 'auto' });
    expect(useAgentControlStore.getState().resolve('c-new', 'p1')).not.toBe(first);
  });
});
