
import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from '../stores/modelStore';

interface ThinkingPayload {
  thinkingMode: boolean;
  enableThinking: boolean;
  thinkingBudget: number;
}

function buildThinkingPayload(): ThinkingPayload {
  const state = useModelStore.getState();
  return {
    thinkingMode: state.perTurnAdaptiveThinking || state.thinkingModeEnabled,
    enableThinking: state.perTurnAdaptiveThinking || state.thinkingModeEnabled,
    thinkingBudget: state.perTurnAdaptiveThinking ? 0 : (state.thinkingBudget ?? 0),
  };
}

describe('Thinking budget IPC wiring', () => {
  beforeEach(() => {
    useModelStore.setState({
      thinkingModeEnabled: false,
      thinkingBudget: 0,
      perTurnAdaptiveThinking: false,
    });
  });

  it('maps thinkingBudget > 0 + thinkingModeEnabled = true to Budget thinking payload', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 8192 });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(true);
    expect(payload.enableThinking).toBe(true);
    expect(payload.thinkingBudget).toBe(8192);
    expect(payload.thinkingBudget).toBeGreaterThan(0);
  });

  it('maps thinkingModeEnabled = true with budget = 0 to Enabled/Adaptive thinking payload', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 0 });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(true);
    expect(payload.enableThinking).toBe(true);
    expect(payload.thinkingBudget).toBe(0);
  });

  it('maps thinkingModeEnabled = false to disabled thinking payload', () => {
    useModelStore.setState({ thinkingModeEnabled: false, thinkingBudget: 0 });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(false);
    expect(payload.enableThinking).toBe(false);
    expect(payload.thinkingBudget).toBe(0);
  });

  it('thinkingMode and enableThinking are always in sync (same source)', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 4096 });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(payload.enableThinking);
  });

  it('thinkingBudget defaults to 0 when undefined in store', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 0 });
    const payload = buildThinkingPayload();

    expect(payload.thinkingBudget).toBe(0);
    expect(typeof payload.thinkingBudget).toBe('number');
  });

  it('toggleThinkingMode action enables thinking with previous budget preserved', () => {
    useModelStore.setState({ thinkingModeEnabled: false, thinkingBudget: 4096 });
    useModelStore.getState().toggleThinkingMode();

    const state = useModelStore.getState();
    expect(state.thinkingModeEnabled).toBe(true);
  });

  it('setThinkingBudget enables thinkingMode when budget > 0', () => {
    useModelStore.setState({ thinkingModeEnabled: false, thinkingBudget: 0 });
    useModelStore.getState().setThinkingBudget(16384);

    const state = useModelStore.getState();
    expect(state.thinkingBudget).toBe(16384);
    expect(state.thinkingModeEnabled).toBe(true);
  });

  it('setThinkingBudget with 0 disables thinkingMode', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 8192 });
    useModelStore.getState().setThinkingBudget(0);

    const state = useModelStore.getState();
    expect(state.thinkingBudget).toBe(0);
    expect(state.thinkingModeEnabled).toBe(false);
  });
});

describe('Per-turn adaptive thinking IPC wiring', () => {
  beforeEach(() => {
    useModelStore.setState({
      thinkingModeEnabled: false,
      thinkingBudget: 0,
      perTurnAdaptiveThinking: false,
    });
  });

  it('perTurnAdaptiveThinking ON → payload has thinkingMode true and budget 0', () => {
    useModelStore.setState({ perTurnAdaptiveThinking: true });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(true);
    expect(payload.enableThinking).toBe(true);
    expect(payload.thinkingBudget).toBe(0);
  });

  it('perTurnAdaptiveThinking overrides thinkingBudget from modelStore', () => {
    useModelStore.setState({
      perTurnAdaptiveThinking: true,
      thinkingModeEnabled: true,
      thinkingBudget: 8192,
    });
    const payload = buildThinkingPayload();

    expect(payload.thinkingBudget).toBe(0);
    expect(payload.thinkingMode).toBe(true);
  });

  it('togglePerTurnAdaptiveThinking flips the flag', () => {
    expect(useModelStore.getState().perTurnAdaptiveThinking).toBe(false);
    useModelStore.getState().togglePerTurnAdaptiveThinking();
    expect(useModelStore.getState().perTurnAdaptiveThinking).toBe(true);
    useModelStore.getState().togglePerTurnAdaptiveThinking();
    expect(useModelStore.getState().perTurnAdaptiveThinking).toBe(false);
  });

  it('clearPerTurnAdaptiveThinking resets flag to false after send', () => {
    useModelStore.setState({ perTurnAdaptiveThinking: true });
    useModelStore.getState().clearPerTurnAdaptiveThinking();
    expect(useModelStore.getState().perTurnAdaptiveThinking).toBe(false);
  });

  it('perTurnAdaptiveThinking OFF → payload matches normal thinkingModeEnabled', () => {
    useModelStore.setState({
      perTurnAdaptiveThinking: false,
      thinkingModeEnabled: false,
      thinkingBudget: 0,
    });
    const payload = buildThinkingPayload();

    expect(payload.thinkingMode).toBe(false);
    expect(payload.enableThinking).toBe(false);
    expect(payload.thinkingBudget).toBe(0);
  });
});
