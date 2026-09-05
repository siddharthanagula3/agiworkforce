import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolApprovalRequest } from '@agiworkforce/types';

const tauriMock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: tauriMock.invoke,
  isTauri: false,
  isTauriContext: () => false,
  listen: (event: string, handler: (payload: { payload: unknown }) => void) => {
    tauriMock.handlers.set(event, handler);
    return Promise.resolve(() => tauriMock.handlers.delete(event));
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

import {
  formatOpaCompletionReason,
  parseOpaTaskResult,
  subscribeToComputerUseEvents,
  useComputerUseStore,
} from '../computerUseStore';

const SESSION = 'session-4';
const REQUEST = 'req-4';
const STEP_INDEX = 2;
const RESPOND_COMMAND = 'respond_tool_confirmation';

function approval(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    requestId: REQUEST,
    callId: SESSION,
    tool: 'computer_use_hotkey',
    actionClass: 'execute',
    arguments: { key: 'f4' },
    reason: 'user_requires_approval',
    riskLevel: 'high',
    reversible: false,
    unattended: false,
    rememberable: true,
    ...overrides,
  };
}

function emit(event: string, payload: unknown): void {
  const handler = tauriMock.handlers.get(event);
  if (!handler) throw new Error(`nothing subscribed to ${event}`);
  handler({ payload });
}

function pause(request: ToolApprovalRequest = approval()): void {
  emit('computer_use:confirmation_required', {
    sessionId: SESSION,
    stepIndex: STEP_INDEX,
    approval: request,
  });
}

describe('computer-use paused step', () => {
  let unsubscribe: () => void;

  beforeAll(() => {
    unsubscribe = subscribeToComputerUseEvents();
  });

  afterAll(() => unsubscribe());

  beforeEach(() => {
    tauriMock.invoke.mockClear();
    tauriMock.invoke.mockResolvedValue(null);
    useComputerUseStore.getState().reset();
  });

  it('holds the paused step and the request it is waiting on', () => {
    pause();

    const state = useComputerUseStore.getState();
    expect(state.pausedConfirmation).toEqual({
      sessionId: SESSION,
      stepIndex: STEP_INDEX,
      approval: approval(),
    });
    expect(state.pendingApproval?.requestId).toBe(REQUEST);
  });

  it('keeps holding across a window blur, and still answers afterwards', async () => {
    pause();

    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(useComputerUseStore.getState().pausedConfirmation?.approval.requestId).toBe(REQUEST);

    await useComputerUseStore.getState().resolveConfirmation(true);

    expect(tauriMock.invoke).toHaveBeenCalledWith(RESPOND_COMMAND, {
      requestId: REQUEST,
      approved: true,
      rememberChoice: false,
      rememberForSession: false,
    });
    expect(useComputerUseStore.getState().pausedConfirmation).toBeNull();
  });

  it('asks for a session-scoped grant only when the tool allows one', async () => {
    pause();
    await useComputerUseStore.getState().resolveConfirmation(true, true);

    expect(tauriMock.invoke).toHaveBeenLastCalledWith(
      RESPOND_COMMAND,
      expect.objectContaining({ rememberForSession: true, rememberChoice: false }),
    );

    useComputerUseStore.getState().reset();
    tauriMock.invoke.mockClear();

    pause(approval({ rememberable: false }));
    await useComputerUseStore.getState().resolveConfirmation(true, true);

    expect(tauriMock.invoke).toHaveBeenLastCalledWith(
      RESPOND_COMMAND,
      expect.objectContaining({ rememberForSession: false }),
    );
  });

  it('sends a denial as an answer rather than a cancellation', async () => {
    pause();
    await useComputerUseStore.getState().resolveConfirmation(false);

    expect(tauriMock.invoke).toHaveBeenCalledWith(
      RESPOND_COMMAND,
      expect.objectContaining({ approved: false }),
    );
    expect(useComputerUseStore.getState().pausedConfirmation).toBeNull();
  });

  it('answers once even if the control is pressed twice', async () => {
    pause();

    const first = useComputerUseStore.getState().resolveConfirmation(true);
    const second = useComputerUseStore.getState().resolveConfirmation(true);

    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(tauriMock.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps the step paused and says why when the answer cannot be delivered', async () => {
    tauriMock.invoke.mockRejectedValueOnce(new Error('channel closed'));
    pause();

    expect(await useComputerUseStore.getState().resolveConfirmation(true)).toBe(false);

    const state = useComputerUseStore.getState();
    expect(state.pausedConfirmation?.approval.requestId).toBe(REQUEST);
    expect(state.isResolvingConfirmation).toBe(false);
    expect(state.error).toContain('channel closed');
  });

  it('clears the pause when the task resolves it elsewhere', () => {
    pause();

    emit('computer_use:confirmation_resolved', {
      sessionId: SESSION,
      stepIndex: STEP_INDEX,
      outcome: 'expired',
    });

    expect(useComputerUseStore.getState().pausedConfirmation).toBeNull();
  });

  it('records which step of the plan the router settled', () => {
    emit('computer_use:action_routed', {
      sessionId: SESSION,
      stepIndex: STEP_INDEX,
      decision: {
        selected: 'ui',
        driver: 'macos_accessibility',
        call: { tier: 'ui', driver: 'macos_accessibility', tool: 'ui_click', parameters: {} },
        declined: [{ tier: 'api', decline: { decline: 'out_of_scope' } }],
      },
    });

    expect(useComputerUseStore.getState().lastRouting?.stepIndex).toBe(STEP_INDEX);
  });

  it('reads a task the user declined and one nobody answered as their own outcomes', () => {
    const denied = parseOpaTaskResult({
      success: false,
      reason: { type: 'confirmation_denied', tool: 'computer_use_hotkey' },
    });
    const expired = parseOpaTaskResult({
      success: false,
      reason: { type: 'confirmation_timed_out', tool: 'computer_use_hotkey', seconds: 120 },
    });

    expect(formatOpaCompletionReason(denied.reason)).toContain('You declined this step');
    expect(formatOpaCompletionReason(expired.reason)).toContain('120 seconds');
  });

  it('refuses a confirmation outcome the native side could not have produced', () => {
    expect(() =>
      parseOpaTaskResult({
        success: false,
        reason: { type: 'confirmation_timed_out', tool: 'computer_use_hotkey', seconds: 0 },
      }),
    ).toThrow('invalid confirmation bound');
  });
});
