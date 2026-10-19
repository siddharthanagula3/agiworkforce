import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeveloperRuntimeModels } from '@agiworkforce/local-runtime-contract';
import { useLocalTurnOptions } from './use-local-turn-options';

const runtime = { defaultAgentMode: 'auto' } as DeveloperRuntimeModels;

beforeEach(() => {
  window.localStorage.clear();
});

describe('the posture a thread opens in', () => {
  it('never opens in bypass after a bypass turn, whatever was stored', () => {
    window.localStorage.setItem('agi.code.local.agentMode.thread-1', 'bypass');
    const first = renderHook(() => useLocalTurnOptions('thread-1', runtime));
    expect(first.result.current.agentMode).toBe('auto');

    act(() => first.result.current.chooseMode('plan'));
    act(() => first.result.current.chooseMode('bypass'));
    expect(first.result.current.agentMode).toBe('bypass');
    first.unmount();

    const reopened = renderHook(() => useLocalTurnOptions('thread-1', runtime));
    expect(reopened.result.current.agentMode).toBe('plan');
    expect(window.localStorage.getItem('agi.code.local.agentMode.thread-1')).toBe('plan');
  });

  it('goes back to the posture before bypass when bypass is not allowed', () => {
    const { result } = renderHook(() => useLocalTurnOptions('thread-2', runtime));

    act(() => result.current.chooseMode('ask'));
    act(() => result.current.chooseMode('bypass'));
    act(() => result.current.leaveBypass());

    expect(result.current.agentMode).toBe('ask');
  });

  it('opens a thread that never chose a posture in the runtime default, or in Ask', () => {
    expect(
      renderHook(() => useLocalTurnOptions('thread-3', runtime)).result.current.agentMode,
    ).toBe('auto');
    expect(renderHook(() => useLocalTurnOptions('thread-4', null)).result.current.agentMode).toBe(
      'ask',
    );
  });
});
