/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    ArrowLeft: Icon,
    Brain: Icon,
    Camera: Icon,
    ChevronRight: Icon,
    Cloud: Icon,
    FileCode: Icon,
    Globe: Icon,
    Layout: Icon,
    LockKeyhole: Icon,
    Mic: Icon,
    ShieldCheck: Icon,
  };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import CapabilitiesScreen from '../src/features/settings/capabilities';
import { useWaitlistStore } from '../src/features/waitlist/store';

describe('Capabilities settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: false,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: undefined,
    });
  });

  it('renders AGI-owned status rows instead of unwired switches', () => {
    const { getByText, getByLabelText, queryAllByRole, queryByText } = render(
      <CapabilitiesScreen />,
    );

    expect(getByText('Capabilities')).toBeTruthy();
    expect(getByText('What AGI can use')).toBeTruthy();
    expect(getByText('On this device')).toBeTruthy();
    expect(getByLabelText('Local Mode. Private chat runs on this device. Active')).toBeTruthy();
    expect(
      getByLabelText('Web search. Search current web information in Cloud sessions. Sign in'),
    ).toBeTruthy();
    expect(
      getByLabelText(
        'AGI Code. Run code from Cloud chat; generated files appear in Artifacts. Sign in',
      ),
    ).toBeTruthy();
    expect(queryAllByRole('switch')).toHaveLength(0);
    expect(queryByText(/Claude/i)).toBeNull();
    expect(queryByText(/ChatGPT/i)).toBeNull();
    expect(queryByText(/future/i)).toBeNull();
  });

  it('navigates status rows to real settings surfaces', () => {
    const { getByLabelText } = render(<CapabilitiesScreen />);

    fireEvent.press(
      getByLabelText('Memory. View and manage local memory saved on this device. Local'),
    );

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/memory');
  });

  it('shows Cloud instead of Sign in after cloud access is unlocked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText } = render(<CapabilitiesScreen />);

    expect(
      getByLabelText('Web search. Search current web information in Cloud sessions. Cloud'),
    ).toBeTruthy();
  });
});
