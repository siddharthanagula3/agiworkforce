/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockHasHardware = jest.fn();
const mockIsEnrolled = jest.fn();
const mockAuthenticate = jest.fn();
const mockSetEnabled = jest.fn();
const mockMarkPrompted = jest.fn();
let mockOwnerId = 'account-a';
let mockAuthState = { isClerkSignedIn: true, clerkUserId: 'account-a' };
let mockCloudUnlocked = true;
let mockBiometricState = { hydrated: true, enabled: false, prompted: false };
let mockContinuityAcknowledged = true;
let mockPathname = '/';

jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('@/src/features/continuity/continuity-onboarding', () => ({
  hasAcknowledgedContinuityOnboarding: () => mockContinuityAcknowledged,
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: (...args: unknown[]) => mockHasHardware(...args),
  isEnrolledAsync: (...args: unknown[]) => mockIsEnrolled(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticate(...args),
}));
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));
jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: Object.assign(
    (selector: (state: { cloudUnlocked: boolean }) => unknown) =>
      selector({ cloudUnlocked: mockCloudUnlocked }),
    { getState: () => ({ cloudUnlocked: mockCloudUnlocked }) },
  ),
}));
jest.mock('@/lib/biometricFlagStore', () => ({
  useBiometricFlag: Object.assign(
    (selector: (state: typeof mockBiometricState) => unknown) => selector(mockBiometricState),
    { getState: () => ({ setEnabled: mockSetEnabled, markPrompted: mockMarkPrompted }) },
  ),
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockOwnerId, epoch: 1 }),
  isCloudAccountEpochCurrent: (account: { ownerId: string } | null) =>
    account !== null && account.ownerId === mockOwnerId,
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return { Fingerprint: () => <RN.View /> };
});
jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    scrim: '#0008',
    surfaceElevated: '#222',
    surfaceBase: '#000',
    teal: '#0aa',
    textPrimary: '#fff',
    textSecondary: '#aaa',
  }),
}));

import { AppLockOffer } from '@/src/features/auth/components/AppLockOffer';

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnerId = 'account-a';
  mockAuthState = { isClerkSignedIn: true, clerkUserId: 'account-a' };
  mockCloudUnlocked = true;
  mockBiometricState = { hydrated: true, enabled: false, prompted: false };
  mockContinuityAcknowledged = true;
  mockPathname = '/';
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockAuthenticate.mockResolvedValue({ success: true });
  mockSetEnabled.mockResolvedValue(undefined);
  mockMarkPrompted.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('App Lock offer', () => {
  it('does not appear before Cloud access or on devices without enrolled authentication', async () => {
    mockCloudUnlocked = false;
    const locked = render(<AppLockOffer />);
    expect(mockHasHardware).not.toHaveBeenCalled();
    expect(locked.queryByLabelText('Turn on App Lock')).toBeNull();
    locked.unmount();

    mockCloudUnlocked = true;
    mockIsEnrolled.mockResolvedValue(false);
    const unenrolled = render(<AppLockOffer />);
    await waitFor(() => expect(mockIsEnrolled).toHaveBeenCalled());
    expect(unenrolled.queryByLabelText('Turn on App Lock')).toBeNull();
  });

  it('waits until first Cloud continuity onboarding is finished', async () => {
    mockContinuityAcknowledged = false;
    const screen = render(<AppLockOffer />);
    expect(mockHasHardware).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Turn on App Lock')).toBeNull();
  });

  it('hides an open offer immediately when continuity onboarding opens', async () => {
    const screen = render(<AppLockOffer />);
    await screen.findByLabelText('Turn on App Lock');

    mockPathname = '/continuity';
    screen.rerender(<AppLockOffer />);

    expect(screen.queryByLabelText('Turn on App Lock')).toBeNull();
  });

  it('saves Skip without enabling or authenticating', async () => {
    const screen = render(<AppLockOffer />);
    const skip = await screen.findByLabelText('Skip App Lock');
    fireEvent.press(skip);
    await waitFor(() => expect(mockMarkPrompted).toHaveBeenCalledTimes(1));
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  it('enables only after successful device authentication', async () => {
    const screen = render(<AppLockOffer />);
    fireEvent.press(await screen.findByLabelText('Turn on App Lock'));
    await waitFor(() => expect(mockSetEnabled).toHaveBeenCalledWith(true));
    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Turn On AGI App Lock' }),
    );
    expect(mockMarkPrompted).toHaveBeenCalledTimes(1);
  });

  it('does not enable for a different account while authentication is in flight', async () => {
    let resolveAuthentication!: (result: { success: boolean }) => void;
    mockAuthenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuthentication = resolve;
        }),
    );
    const screen = render(<AppLockOffer />);
    fireEvent.press(await screen.findByLabelText('Turn on App Lock'));
    mockOwnerId = 'account-b';
    mockAuthState = { isClerkSignedIn: true, clerkUserId: 'account-b' };
    await act(async () => resolveAuthentication({ success: true }));

    expect(mockSetEnabled).not.toHaveBeenCalled();
    expect(mockMarkPrompted).not.toHaveBeenCalled();
  });
});
