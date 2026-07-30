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
    RefreshCw: Icon,
    ShieldCheck: Icon,
    Telescope: Icon,
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
import { useChatStore } from '../stores/chatStore';

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
    useChatStore.setState((state) => ({
      features: {
        ...state.features,
        imageGen: true,
        codeExecution: false,
        research: false,
      },
    }));
  });

  it('renders real Cloud preference switches and keeps automatic capabilities as status rows', () => {
    const { getByText, getByLabelText, queryAllByRole, queryByText } = render(
      <CapabilitiesScreen />,
    );

    expect(getByText('Capabilities')).toBeTruthy();
    expect(getByText('What AGI can use')).toBeTruthy();
    expect(getByText('On this device')).toBeTruthy();
    expect(getByLabelText('Local Mode. Private chat runs on this device. Active')).toBeTruthy();
    expect(
      getByLabelText(
        'Web search. Uses current web information automatically when the Cloud model supports it. Sign in',
      ),
    ).toBeTruthy();
    expect(
      getByLabelText('AGI Code. Allow supported Cloud models to execute code in a secure sandbox.'),
    ).toBeTruthy();
    expect(
      getByLabelText(
        'Deep research. Allow supported Cloud models to run multi-step research with citations.',
      ),
    ).toBeTruthy();
    expect(
      getByLabelText('Image generation. Allow eligible Cloud chats to create generated images.'),
    ).toBeTruthy();
    expect(
      getByLabelText(
        'Cross-device continuity. See how Managed Cloud tasks continue across mobile, web, and desktop. Beta',
      ),
    ).toBeTruthy();
    expect(queryAllByRole('switch')).toHaveLength(3);
    expect(
      getByLabelText('AGI Code. Allow supported Cloud models to execute code in a secure sandbox.'),
    ).toBeDisabled();
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

    fireEvent.press(
      getByLabelText(
        'Cross-device continuity. See how Managed Cloud tasks continue across mobile, web, and desktop. Beta',
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/(app)/continuity');
  });

  it('shows Cloud instead of Sign in after cloud access is unlocked', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText } = render(<CapabilitiesScreen />);

    expect(
      getByLabelText(
        'Web search. Uses current web information automatically when the Cloud model supports it. Automatic',
      ),
    ).toBeTruthy();
  });

  it('updates the persisted send-path preferences inline after Cloud unlock', () => {
    useWaitlistStore.setState({ cloudUnlocked: true });

    const { getByLabelText } = render(<CapabilitiesScreen />);
    const codeSwitch = getByLabelText(
      'AGI Code. Allow supported Cloud models to execute code in a secure sandbox.',
    );
    const researchSwitch = getByLabelText(
      'Deep research. Allow supported Cloud models to run multi-step research with citations.',
    );
    const imageSwitch = getByLabelText(
      'Image generation. Allow eligible Cloud chats to create generated images.',
    );

    fireEvent(codeSwitch, 'valueChange', true);
    fireEvent(researchSwitch, 'valueChange', true);
    fireEvent(imageSwitch, 'valueChange', false);

    expect(useChatStore.getState().features).toMatchObject({
      codeExecution: true,
      research: true,
      imageGen: false,
    });
  });
});
