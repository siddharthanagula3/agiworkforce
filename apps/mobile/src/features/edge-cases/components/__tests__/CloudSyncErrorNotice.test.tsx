import { render } from '@testing-library/react-native';
import { CLOUD_SYNC_FAILED_MESSAGE, CloudSyncErrorNotice } from '../CloudSyncErrorNotice';

const mockSyncNow = jest.fn().mockResolvedValue(undefined);
const mockShowToast = jest.fn();
let mockStatus: 'idle' | 'syncing' | 'error' = 'error';
let mockLastError: string | null = 'Settings request failed';
let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockIsSignedIn = true;
let mockIsOnline = true;

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: () => mockSyncNow(),
}));
jest.mock('@/src/shared/components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock('@/stores/chat/cloudSyncStateStore', () => ({
  useCloudSyncStateStore: (selector: (state: unknown) => unknown) =>
    selector({ status: mockStatus, lastError: mockLastError }),
}));
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: unknown) => unknown) =>
    selector({ appMode: mockAppMode }),
}));
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isClerkSignedIn: mockIsSignedIn }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline }),
}));

describe('CloudSyncErrorNotice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'error';
    mockLastError = 'Settings request failed';
    mockAppMode = 'cloud';
    mockIsSignedIn = true;
    mockIsOnline = true;
  });

  it('announces a Cloud sync failure once with Retry instead of covering the header', () => {
    const screen = render(<CloudSyncErrorNotice />);

    expect(screen.toJSON()).toBeNull();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(CLOUD_SYNC_FAILED_MESSAGE, {
      label: 'Retry',
      onPress: expect.any(Function),
    });
    mockShowToast.mock.calls[0]![1].onPress();
    expect(mockSyncNow).toHaveBeenCalledTimes(1);

    screen.rerender(<CloudSyncErrorNotice />);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });

  it('announces again after a sync recovers and then fails', () => {
    const screen = render(<CloudSyncErrorNotice />);
    mockStatus = 'idle';
    screen.rerender(<CloudSyncErrorNotice />);
    mockStatus = 'error';
    screen.rerender(<CloudSyncErrorNotice />);

    expect(mockShowToast).toHaveBeenCalledTimes(2);
  });

  it('stays quiet in Local Mode and while offline', () => {
    mockAppMode = 'local';
    const screen = render(<CloudSyncErrorNotice />);
    mockAppMode = 'cloud';
    mockIsOnline = false;
    screen.rerender(<CloudSyncErrorNotice />);

    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
