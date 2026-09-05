import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue(null),
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

import { subscribeToComputerUseEvents, useComputerUseStore } from '../computerUseStore';

function emit(event: string, payload: unknown): void {
  const handler = tauriMock.handlers.get(event);
  if (!handler) throw new Error(`nothing subscribed to ${event}`);
  handler({ payload });
}

describe('computer-use routing and approval records', () => {
  let unsubscribe: () => void;

  beforeAll(() => {
    unsubscribe = subscribeToComputerUseEvents();
  });

  afterAll(() => unsubscribe());

  beforeEach(() => {
    useComputerUseStore.getState().reset();
  });

  it('records which tier took the action and why the earlier tiers declined', () => {
    emit('computer_use:action_routed', {
      sessionId: 'session-1',
      decision: {
        selected: 'ui',
        call: { tier: 'ui', tool: 'ui_click', parameters: {} },
        declined: [{ tier: 'api', decline: { decline: 'out_of_scope' } }],
      },
    });

    const routing = useComputerUseStore.getState().lastRouting;
    expect(routing?.selected).toBe('ui');
    expect(routing?.tool).toBe('ui_click');
    expect(routing?.declined).toEqual([{ tier: 'api', decline: { decline: 'out_of_scope' } }]);
  });

  it('records a fallthrough to the visual loop with every decline that led there', () => {
    emit('computer_use:action_routed', {
      sessionId: 'session-2',
      decision: {
        selected: 'visual',
        call: null,
        declined: [
          { tier: 'api', decline: { decline: 'out_of_scope' } },
          { tier: 'ui', decline: { decline: 'target_not_found', query: 'Send' } },
          { tier: 'browser', decline: { decline: 'out_of_scope' } },
        ],
      },
    });

    const routing = useComputerUseStore.getState().lastRouting;
    expect(routing?.selected).toBe('visual');
    expect(routing?.tool).toBeNull();
    expect(routing?.declined.map((assessment) => assessment.tier)).toEqual([
      'api',
      'ui',
      'browser',
    ]);
  });

  it('keeps the harness approval request for the consent prompt to read', () => {
    emit('computer_use:approval_required', {
      sessionId: 'session-3',
      approval: {
        requestId: 'req-1',
        callId: 'session-3',
        tool: 'computer_use_click',
        actionClass: 'execute',
        arguments: { x: 4, y: 8 },
        reason: 'policy_hard_block',
        riskLevel: 'high',
        reversible: false,
        unattended: true,
        rememberable: false,
      },
    });

    const approval = useComputerUseStore.getState().pendingApproval;
    expect(approval?.reason).toBe('policy_hard_block');
    expect(approval?.rememberable).toBe(false);

    useComputerUseStore.getState().clearPendingApproval();
    expect(useComputerUseStore.getState().pendingApproval).toBeNull();
  });
});
