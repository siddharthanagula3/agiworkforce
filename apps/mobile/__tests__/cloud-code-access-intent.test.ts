import { renderHook } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetAppMode = jest.fn();
let mockCloudUnlocked = false;
let mockAppMode = 'local';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (
    selector: (state: { appMode: string; setAppMode: typeof mockSetAppMode }) => unknown,
  ) => selector({ appMode: mockAppMode, setAppMode: mockSetAppMode }),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (state: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: mockCloudUnlocked }),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: string | null }) => unknown) =>
    selector({ clerkUserId: mockCloudUnlocked ? 'user_a' : null }),
}));

import { useCloudCodeAccess } from '@/src/features/cloud-code/useCloudCodeAccess';
import {
  clearPostAuthIntent,
  consumePostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';

describe('Cloud code access gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPostAuthIntent();
    mockCloudUnlocked = false;
    mockAppMode = 'local';
  });

  it('signs a signed-out person in with an intent that returns to Cloud code', () => {
    const { result } = renderHook(() => useCloudCodeAccess());

    result.current.activate();

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-code' },
    });
    expect(consumePostAuthIntent()).toBe('cloud-code');
    expect(mockSetAppMode).not.toHaveBeenCalled();
  });

  it('switches a signed-in Local Mode account to Cloud without another sign-in', () => {
    mockCloudUnlocked = true;
    const { result } = renderHook(() => useCloudCodeAccess());

    result.current.activate();

    expect(mockSetAppMode).toHaveBeenCalledWith('cloud');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
