import React from 'react';
import { Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';

const mockRemove = jest.fn();
const mockAddRevokeListener = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  addRevokeListener: (...args: unknown[]) => mockAddRevokeListener(...args),
}));

import { AppleRevokeListener } from '@/src/features/auth/components/AppleRevokeListener';
import { useAuthStore } from '@/src/features/auth/store';

const originalOS = Platform.OS;
const signOut = jest.fn();

function runOn(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

function revoke() {
  const listener = mockAddRevokeListener.mock.calls.at(-1)?.[0] as () => void;
  act(() => listener());
}

describe('AppleRevokeListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddRevokeListener.mockReturnValue({ remove: mockRemove });
    signOut.mockResolvedValue(undefined);
    useAuthStore.setState({ isClerkSignedIn: true, signOut });
    runOn('ios');
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  it('signs the person out when Apple reports the credential revoked', () => {
    render(<AppleRevokeListener />);

    expect(mockAddRevokeListener).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    revoke();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription when it unmounts', () => {
    const view = render(<AppleRevokeListener />);

    view.unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('subscribes only while someone is signed in', () => {
    useAuthStore.setState({ isClerkSignedIn: false });
    const view = render(<AppleRevokeListener />);

    expect(mockAddRevokeListener).not.toHaveBeenCalled();

    act(() => useAuthStore.setState({ isClerkSignedIn: true }));
    expect(mockAddRevokeListener).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState({ isClerkSignedIn: false }));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Android', () => {
    runOn('android');

    render(<AppleRevokeListener />);

    expect(mockAddRevokeListener).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does nothing when the native module is unavailable', () => {
    mockAddRevokeListener.mockReturnValue(undefined);

    const view = render(<AppleRevokeListener />);

    expect(() => view.unmount()).not.toThrow();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('survives the module throwing while it subscribes', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAddRevokeListener.mockImplementation(() => {
      throw new Error('module missing');
    });

    const view = render(<AppleRevokeListener />);

    expect(() => view.unmount()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports a failed sign-out without crashing the app', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    signOut.mockRejectedValue(new Error('network'));
    render(<AppleRevokeListener />);

    revoke();
    await act(async () => undefined);

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
