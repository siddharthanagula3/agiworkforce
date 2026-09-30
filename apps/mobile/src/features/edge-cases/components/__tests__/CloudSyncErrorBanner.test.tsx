import { fireEvent, render } from '@testing-library/react-native';
import { CloudSyncErrorBanner } from '../CloudSyncErrorBanner';

const mockSyncNow = jest.fn().mockResolvedValue(undefined);
let mockStatus: 'idle' | 'syncing' | 'error' = 'error';
let mockLastError: string | null = 'Settings request failed';
let mockAppMode: 'local' | 'cloud' = 'cloud';
let mockIsSignedIn = true;
let mockIsOnline = true;

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: () => mockSyncNow(),
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('CloudSyncErrorBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'error';
    mockLastError = 'Settings request failed';
    mockAppMode = 'cloud';
    mockIsSignedIn = true;
    mockIsOnline = true;
  });

  it('makes a Cloud sync failure visible and retries the sync engine', () => {
    const screen = render(<CloudSyncErrorBanner />);

    expect(
      screen.getByText('Cloud changes haven’t synced. Check your connection and retry.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry Cloud sync'));
    expect(mockSyncNow).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Dismiss Cloud sync error'));
    expect(screen.queryByLabelText('Retry Cloud sync')).toBeNull();
  });

  it('does not show the Cloud error over Local Mode or the offline banner', () => {
    mockAppMode = 'local';
    const screen = render(<CloudSyncErrorBanner />);
    expect(screen.queryByLabelText('Retry Cloud sync')).toBeNull();

    mockAppMode = 'cloud';
    mockIsOnline = false;
    screen.rerender(<CloudSyncErrorBanner />);
    expect(screen.queryByLabelText('Retry Cloud sync')).toBeNull();
  });
});
