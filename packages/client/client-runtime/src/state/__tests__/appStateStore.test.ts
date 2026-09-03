import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appStateStore, registerModelSwitchListener, registerTelemetryHandler } from '../index';
import { initialAppState } from '../AppStateStore';

beforeEach(() => {
  appStateStore.setState(() => initialAppState);
});

describe('appStateStore, singleton integration', () => {
  it('starts with initialAppState', () => {
    const state = appStateStore.getState();
    expect(state.auth.isAuthenticated).toBe(false);
    expect(state.auth.userId).toBeNull();
    expect(state.chat.activeModelId).toBeNull();
    expect(state.settings.theme).toBe('system');
  });

  it('setState updates the store state', () => {
    appStateStore.setState((prev) => ({
      ...prev,
      auth: { ...prev.auth, isAuthenticated: true, userId: 'test-user' },
    }));

    const state = appStateStore.getState();
    expect(state.auth.isAuthenticated).toBe(true);
    expect(state.auth.userId).toBe('test-user');
  });

  it('subscribers are notified on mutation', () => {
    const listener = vi.fn();
    const unsub = appStateStore.subscribe(listener);

    appStateStore.setState((prev) => ({
      ...prev,
      chat: { ...prev.chat, isStreaming: true },
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('no-op setState does not notify subscribers', () => {
    const listener = vi.fn();
    const unsub = appStateStore.subscribe(listener);

    appStateStore.setState((s) => s);

    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('model switch fires the model-switch broadcast channel', () => {
    const listener = vi.fn();
    const unsub = registerModelSwitchListener(listener);

    appStateStore.setState((prev) => ({
      ...prev,
      chat: { ...prev.chat, activeModelId: 'runtime-model-id-from-json' },
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];
    expect(event?.prevModelId).toBeNull();
    expect(event?.nextModelId).toBe('runtime-model-id-from-json');

    unsub();
  });

  it('auth change fires telemetry', () => {
    const handler = vi.fn();
    const unsub = registerTelemetryHandler(handler);

    appStateStore.setState((prev) => ({
      ...prev,
      auth: {
        ...prev.auth,
        userId: 'telemetry-user',
        isAuthenticated: true,
        planTier: 'hobby',
      },
    }));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0];
    expect(event?.changedFields).toContain('auth.userId');
    expect(event?.changedFields).toContain('auth.isAuthenticated');
    expect(event?.changedFields).toContain('auth.planTier');

    unsub();
  });

  it('render-storm test: single boolean flip → exactly 1 notification', () => {
    let renderCount = 0;
    const unsub = appStateStore.subscribe(() => {
      renderCount++;
    });

    appStateStore.setState((prev) => ({
      ...prev,
      chat: { ...prev.chat, isStreaming: true },
    }));

    expect(renderCount).toBe(1);
    expect(renderCount).toBeLessThan(5);
    unsub();
  });

  it('plan tier is one of the 6 canonical values (or legacy free)', () => {
    const valid = new Set(['local-only', 'byok', 'hobby', 'pro', 'max', 'enterprise', 'free']);
    expect(valid.has(appStateStore.getState().auth.planTier)).toBe(true);
    expect(valid.has(appStateStore.getState().subscriptions.planTier)).toBe(true);
  });
});
