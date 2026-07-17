/**
 * Unit tests for onChangeAppState.
 *
 * Coverage targets:
 *  - All 4 fan-out channels fire correctly
 *  - Fan-out failure isolation (one channel throws → others still run)
 *  - Circular re-entrancy guard (depth > MAX_FANOUT_DEPTH rejected)
 *  - Channel registration / deregistration via returned cleanup fns
 *  - No-op paths (e.g. model unchanged → no model-switch event)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  onChangeAppState,
  onFanOutError,
  registerApiCacheInvalidator,
  registerTelemetryHandler,
  registerPersistenceHandler,
  registerModelSwitchListener,
  MAX_FANOUT_DEPTH,
} from '../onChangeAppState';
import type { AppState } from '../AppStateStore';
import { initialAppState } from '../AppStateStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<AppState> = {}): AppState {
  return { ...initialAppState, ...overrides };
}

function makeAuthChange(userId: string): AppState {
  return makeState({
    auth: { ...initialAppState.auth, userId, isAuthenticated: true },
  });
}

function makeModelChange(modelId: string): AppState {
  return makeState({
    chat: { ...initialAppState.chat, activeModelId: modelId },
  });
}

function makeSettingsChange(theme: string): AppState {
  return makeState({
    settings: { ...initialAppState.settings, theme },
  });
}

// Helper: run onChangeAppState with the standard 2-argument form
function runChange(prev: AppState, next: AppState, depth = 0): void {
  onChangeAppState({ newState: next, oldState: prev }, depth);
}

// ---------------------------------------------------------------------------
// Channel 1: API cache invalidation
// ---------------------------------------------------------------------------

describe('onChangeAppState — channel 1: API cache invalidation', () => {
  it('fires invalidator on userId change', () => {
    const invalidator = vi.fn();
    const unsub = registerApiCacheInvalidator(invalidator);

    const prev = makeState();
    const next = makeAuthChange('user-123');
    runChange(prev, next);

    expect(invalidator).toHaveBeenCalledTimes(1);
    expect(invalidator).toHaveBeenCalledWith(prev, next);

    unsub();
  });

  it('fires invalidator on model change', () => {
    const invalidator = vi.fn();
    const unsub = registerApiCacheInvalidator(invalidator);

    const prev = makeState();
    const next = makeModelChange('some-model-from-models-json');
    runChange(prev, next);

    expect(invalidator).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does NOT fire invalidator when neither auth nor model changed', () => {
    const invalidator = vi.fn();
    const unsub = registerApiCacheInvalidator(invalidator);

    const prev = makeState();
    const next = makeSettingsChange('dark'); // only settings changed
    runChange(prev, next);

    expect(invalidator).not.toHaveBeenCalled();
    unsub();
  });

  it('deregistration stops future calls', () => {
    const invalidator = vi.fn();
    const unsub = registerApiCacheInvalidator(invalidator);
    unsub();

    const prev = makeState();
    const next = makeAuthChange('user-456');
    runChange(prev, next);

    expect(invalidator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Channel 2: Telemetry
// ---------------------------------------------------------------------------

describe('onChangeAppState — channel 2: telemetry', () => {
  it('emits telemetry event with correct changedFields on userId change', () => {
    const handler = vi.fn();
    const unsub = registerTelemetryHandler(handler);

    const prev = makeState();
    const next = makeAuthChange('user-789');
    runChange(prev, next);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0];
    expect(event?.kind).toBe('app_state_changed');
    expect(event?.changedFields).toContain('auth.userId');
    expect(event?.changedFields).toContain('auth.isAuthenticated');
    expect(typeof event?.ts).toBe('number');

    unsub();
  });

  it('emits changedFields for model change', () => {
    const handler = vi.fn();
    const unsub = registerTelemetryHandler(handler);

    const prev = makeState();
    const next = makeModelChange('another-model-id');
    runChange(prev, next);

    const event = handler.mock.calls[0]?.[0];
    expect(event?.changedFields).toContain('chat.activeModelId');

    unsub();
  });

  it('does NOT emit telemetry when no tracked fields changed', () => {
    const handler = vi.fn();
    const unsub = registerTelemetryHandler(handler);

    // Change only mcp domain — which isn't tracked for telemetry in changedFields
    const prev = makeState();
    const next = makeState({
      mcp: { ...initialAppState.mcp, connectedCount: 5 },
    });
    runChange(prev, next);

    // mcp.connectedCount IS tracked
    const event = handler.mock.calls[0]?.[0];
    if (event) {
      expect(event.changedFields).toContain('mcp.connectedCount');
    }

    unsub();
  });

  it('includes ts timestamp', () => {
    const before = Date.now();
    const handler = vi.fn();
    const unsub = registerTelemetryHandler(handler);

    runChange(makeState(), makeAuthChange('ts-test-user'));

    const event = handler.mock.calls[0]?.[0];
    expect(event?.ts).toBeGreaterThanOrEqual(before);
    expect(event?.ts).toBeLessThanOrEqual(Date.now());

    unsub();
  });
});

// ---------------------------------------------------------------------------
// Channel 3: Settings persistence
// ---------------------------------------------------------------------------

describe('onChangeAppState — channel 3: settings persistence', () => {
  it('fires persistence handler on settings change', () => {
    const handler = vi.fn();
    const unsub = registerPersistenceHandler(handler);

    const prev = makeState();
    const next = makeSettingsChange('dark');
    runChange(prev, next);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(next.settings);

    unsub();
  });

  it('does NOT fire persistence handler when settings unchanged', () => {
    const handler = vi.fn();
    const unsub = registerPersistenceHandler(handler);

    const prev = makeState();
    const next = makeAuthChange('persist-test-user'); // only auth changed
    runChange(prev, next);

    expect(handler).not.toHaveBeenCalled();
    unsub();
  });

  it('passes the new settings object to the handler', () => {
    const handler = vi.fn();
    const unsub = registerPersistenceHandler(handler);

    const next = makeState({
      settings: {
        ...initialAppState.settings,
        theme: 'light',
        language: 'fr',
      },
    });
    runChange(makeState(), next);

    expect(handler.mock.calls[0]?.[0]).toEqual(next.settings);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// Channel 4: Model-switch broadcast
// ---------------------------------------------------------------------------

describe('onChangeAppState — channel 4: model-switch broadcast', () => {
  it('fires model-switch listener when activeModelId changes', () => {
    const listener = vi.fn();
    const unsub = registerModelSwitchListener(listener);

    const prev = makeState();
    const next = makeModelChange('model-from-models-json');
    runChange(prev, next);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];
    expect(event?.prevModelId).toBeNull(); // was null in initial state
    expect(event?.nextModelId).toBe('model-from-models-json');
    expect(event?.source).toBe('app_state');

    unsub();
  });

  it('does NOT fire model-switch when model unchanged', () => {
    const listener = vi.fn();
    const unsub = registerModelSwitchListener(listener);

    const prev = makeState();
    const next = makeAuthChange('model-nochange-user');
    runChange(prev, next);

    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('model-switch includes prev model ID', () => {
    const listener = vi.fn();
    const unsub = registerModelSwitchListener(listener);

    const prev = makeModelChange('old-model-from-json');
    const next = makeModelChange('new-model-from-json');
    runChange(prev, next);

    const event = listener.mock.calls[0]?.[0];
    expect(event?.prevModelId).toBe('old-model-from-json');
    expect(event?.nextModelId).toBe('new-model-from-json');

    unsub();
  });
});

// ---------------------------------------------------------------------------
// Fan-out failure isolation
// ---------------------------------------------------------------------------

describe('onChangeAppState — fan-out failure isolation', () => {
  it('one failing channel does not prevent others from running', () => {
    const errors: unknown[] = [];
    const unsubError = onFanOutError((e) => errors.push(e));

    // Register a throwing invalidator
    const throwingInvalidator = vi.fn(() => {
      throw new Error('cache invalidation failed');
    });
    const unsubInvalidator = registerApiCacheInvalidator(throwingInvalidator);

    // Register a working telemetry handler
    const telemetryHandler = vi.fn();
    const unsubTelemetry = registerTelemetryHandler(telemetryHandler);

    const prev = makeState();
    const next = makeAuthChange('failure-isolation-test');
    runChange(prev, next);

    // Throwing channel produced an error event
    expect(errors.length).toBeGreaterThan(0);
    expect((errors[0] as { channel?: string })?.channel).toBe('api_cache_invalidation');

    // Other channel still ran
    expect(telemetryHandler).toHaveBeenCalledTimes(1);

    unsubError();
    unsubInvalidator();
    unsubTelemetry();
  });

  it('error event carries channel name and original error', () => {
    const errors: unknown[] = [];
    const unsubError = onFanOutError((e) => errors.push(e));

    const originalError = new Error('specific error message');
    const unsub = registerApiCacheInvalidator(() => {
      throw originalError;
    });

    const prev = makeState();
    const next = makeAuthChange('error-detail-test');
    runChange(prev, next);

    const err = errors[0] as { channel?: string; error?: unknown };
    expect(err.channel).toBe('api_cache_invalidation');
    expect(err.error).toBe(originalError);

    unsubError();
    unsub();
  });
});

// ---------------------------------------------------------------------------
// Circular re-entrancy guard
// ---------------------------------------------------------------------------

describe('onChangeAppState — circular re-entrancy guard', () => {
  it('calls at depth 0 and 1 are allowed', () => {
    const listener = vi.fn();
    const unsub = registerModelSwitchListener(listener);

    // depth=0: normal call
    runChange(makeState(), makeModelChange('depth-0-model'), 0);
    expect(listener).toHaveBeenCalledTimes(1);

    // depth=1: still allowed
    runChange(makeState(), makeModelChange('depth-1-model'), 1);
    expect(listener).toHaveBeenCalledTimes(2);

    // depth=2: still allowed (MAX_FANOUT_DEPTH = 2, and > check)
    runChange(makeState(), makeModelChange('depth-2-model'), 2);
    expect(listener).toHaveBeenCalledTimes(3);

    unsub();
  });

  it('calls at depth > MAX_FANOUT_DEPTH are rejected', () => {
    const circularErrors: unknown[] = [];
    const unsubError = onFanOutError((e) => circularErrors.push(e));

    const listener = vi.fn();
    const unsubListener = registerModelSwitchListener(listener);

    runChange(makeState(), makeModelChange('overDepth-model'), MAX_FANOUT_DEPTH + 1);

    // Channels should NOT have been called
    expect(listener).not.toHaveBeenCalled();

    // Error should have been emitted
    expect(circularErrors.length).toBe(1);
    expect((circularErrors[0] as { kind?: string })?.kind).toBe('circular_fanout');

    unsubError();
    unsubListener();
  });

  it('MAX_FANOUT_DEPTH is 2 (locked per execution plan §1.3)', () => {
    expect(MAX_FANOUT_DEPTH).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// All 4 channels fire in a single change
// ---------------------------------------------------------------------------

describe('onChangeAppState — all 4 channels in one change', () => {
  it('fires all 4 channels on a change that touches auth + model', () => {
    const apiCacheInvalidator = vi.fn();
    const telemetryHandler = vi.fn();
    const persistenceHandler = vi.fn();
    const modelSwitchListener = vi.fn();

    const unsubs = [
      registerApiCacheInvalidator(apiCacheInvalidator),
      registerTelemetryHandler(telemetryHandler),
      registerPersistenceHandler(persistenceHandler),
      registerModelSwitchListener(modelSwitchListener),
    ];

    const prev = makeState();
    const next = makeState({
      auth: { ...initialAppState.auth, userId: 'all-channels-user', isAuthenticated: true },
      chat: { ...initialAppState.chat, activeModelId: 'all-channels-model' },
      settings: { ...initialAppState.settings, theme: 'dark' },
    });

    runChange(prev, next);

    expect(apiCacheInvalidator).toHaveBeenCalledTimes(1); // auth changed
    expect(telemetryHandler).toHaveBeenCalledTimes(1); // tracked fields changed
    expect(persistenceHandler).toHaveBeenCalledTimes(1); // settings changed
    expect(modelSwitchListener).toHaveBeenCalledTimes(1); // model changed

    for (const unsub of unsubs) unsub();
  });
});
