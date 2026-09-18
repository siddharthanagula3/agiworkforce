import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

const mockGet = jest.fn();
jest.mock('@/services/api', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }));

import {
  CapabilityProvider,
  capabilityFlagKey,
  refreshRemoteCapabilities,
  useCapabilities,
  useCapability,
  useRemoteCapabilityStore,
} from './capabilities';

function wrapper({ children }: { children: React.ReactNode }) {
  return <CapabilityProvider platform="mobile">{children}</CapabilityProvider>;
}

function meResponse(featureFlags: Record<string, boolean>) {
  return {
    id: 'user_1',
    email: null,
    name: 'QA user',
    avatar_url: null,
    created_at: null,
    updated_at: 0,
    plan: { tier: 'pro', display_name: 'Pro', status: 'active', current_period_end: null },
    feature_flags: { advanced_model_access: true, ...featureFlags },
    routing_preferences: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useRemoteCapabilityStore.setState({ switchedOff: {}, loadedAt: null });
  mockGet.mockResolvedValue(meResponse({}));
});

describe('server-driven mobile capabilities', () => {
  it('names the switch the server uses for a capability', () => {
    expect(capabilityFlagKey('canUseVoice')).toBe('capability.can_use_voice');
    expect(capabilityFlagKey('canUseCamera')).toBe('capability.can_use_camera');
  });

  it('keeps the shipped matrix while the server switches nothing off', async () => {
    const { result } = renderHook(() => useCapability('canUseVoice'), { wrapper });

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/me?surface=mobile'));
    expect(result.current).toBe(true);
  });

  it('switches a capability off without a new build', async () => {
    mockGet.mockResolvedValue(meResponse({ 'capability.can_use_voice': false }));

    const { result } = renderHook(
      () => ({ voice: useCapability('canUseVoice'), camera: useCapability('canUseCamera') }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.voice).toBe(false));
    expect(result.current.camera).toBe(true);
  });

  it('never turns on something this platform cannot do', async () => {
    mockGet.mockResolvedValue(meResponse({ 'capability.can_use_terminal': true }));

    const { result } = renderHook(() => useCapability('canUseTerminal'), { wrapper });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('reports the whole switched capability set to a consumer reading them together', async () => {
    mockGet.mockResolvedValue(meResponse({ 'capability.can_use_connectors': false }));

    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.canUseConnectors).toBe(false));
    expect(result.current.canUseCamera).toBe(true);
  });

  it('re-reads the switches when the app comes back to the foreground', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const subscription = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type: string, listener: (state: AppStateStatus) => void) => {
        listeners.push(listener);
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });

    const { result } = renderHook(() => useCapability('canUseCamera'), { wrapper });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    mockGet.mockResolvedValue(meResponse({ 'capability.can_use_camera': false }));
    act(() => listeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(result.current).toBe(false));
    subscription.mockRestore();
  });

  it('leaves every capability alone when the server cannot be reached', async () => {
    useRemoteCapabilityStore.setState({ switchedOff: {}, loadedAt: null });
    mockGet.mockRejectedValue(new Error('offline'));

    await refreshRemoteCapabilities();

    expect(useRemoteCapabilityStore.getState().switchedOff).toEqual({});
  });
});
