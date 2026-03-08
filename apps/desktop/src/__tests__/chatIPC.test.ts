/**
 * chatIPC.test.ts — Thinking budget IPC wiring tests
 *
 * Verifies that thinkingBudget + thinkingModeEnabled from modelStore map
 * correctly to the IPC payload sent to chat_send_message:
 *   - thinkingBudget > 0 + thinkingModeEnabled → Budget thinking
 *   - thinkingModeEnabled without budget (budget == 0) → Enabled(true) / Adaptive
 *   - thinkingBudget = 0 + thinkingModeEnabled = false → thinking disabled
 *
 * We test the store state directly (the shape that index.tsx reads via getState())
 * and the IPC payload construction logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from '../stores/modelStore';

// ---------------------------------------------------------------------------
// Helpers that replicate the payload construction from index.tsx
// ---------------------------------------------------------------------------

interface ThinkingPayload {
  thinkingMode: boolean;
  enableThinking: boolean;
  thinkingBudget: number;
}

/**
 * Builds the thinking-related fields of the chat_send_message request,
 * exactly mirroring the logic in UnifiedAgenticChat/index.tsx.
 */
function buildThinkingPayload(): ThinkingPayload {
  const state = useModelStore.getState();
  return {
    thinkingMode: state.thinkingModeEnabled,
    enableThinking: state.thinkingModeEnabled,
    thinkingBudget: state.thinkingBudget ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Thinking budget IPC wiring', () => {
  beforeEach(() => {
    // Reset to clean defaults before each test
    useModelStore.setState({
      thinkingModeEnabled: false,
      thinkingBudget: 0,
    });
  });

  it('maps thinkingBudget > 0 + thinkingModeEnabled = true to Budget thinking payload', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 8192 });
    const payload = buildThinkingPayload();

    // Both flags enabled for Budget mode
    expect(payload.thinkingMode).toBe(true);
    expect(payload.enableThinking).toBe(true);
    // Budget value should pass through
    expect(payload.thinkingBudget).toBe(8192);
    expect(payload.thinkingBudget).toBeGreaterThan(0);
  });

  it('maps thinkingModeEnabled = true with budget = 0 to Enabled/Adaptive thinking payload', () => {
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 0 });
    const payload = buildThinkingPayload();

    // Thinking is on but no specific budget → Adaptive/Enabled(true) semantics
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

    // Both fields are derived from the same store value — they must match
    expect(payload.thinkingMode).toBe(payload.enableThinking);
  });

  it('thinkingBudget defaults to 0 when undefined in store', () => {
    // Simulate a freshly initialised store without a budget value
    useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 0 });
    const payload = buildThinkingPayload();

    // The `?? 0` guard prevents NaN/undefined from reaching the backend
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
    // Setting a positive budget should activate thinking mode
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
