/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { agiMobileColors } from '@agiworkforce/design-tokens';

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) => (
      <RN.View testID="page-root" {...props}>
        {children as React.ReactNode}
      </RN.View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => <RN.View {...props} />;
      },
    },
  );
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '1' } } },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn(),
  openInAppBrowser: jest.fn(),
}));

jest.mock('@clerk/expo', () => ({
  useUser: () => ({
    user: { id: 'user_test', primaryEmailAddress: { emailAddress: 'person@example.com' } },
    isLoaded: true,
  }),
}));

jest.mock('@/src/features/auth/store', () => {
  const state = {
    user: null,
    signOut: jest.fn(),
    isClerkLoaded: true,
    isClerkSignedIn: true,
    clerkUserId: 'user_test',
  };
  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state);
  useAuthStore.getState = () => state;
  useAuthStore.subscribe = () => () => {};
  return { useAuthStore };
});

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: true }),
}));

jest.mock('@/src/features/companion/components/QRScanner', () => ({ QRScanner: () => null }));
jest.mock('@/src/features/companion/components/PairingStatus', () => ({
  PairingStatus: () => null,
}));
jest.mock('@/src/features/companion/components/CompanionDemoWalkthrough', () => ({
  CompanionDemoWalkthrough: () => null,
  useDemoStore: (selector: (s: { hasSeenDemo: boolean }) => unknown) =>
    selector({ hasSeenDemo: true }),
}));
jest.mock('@/src/features/companion/components/StatusBanners', () => ({
  StaleApprovalBanner: () => null,
  DisconnectedDesktopBanner: () => null,
  ReconnectingBanner: () => null,
}));
jest.mock('@/src/features/companion/components/ConnectionStateViews', () => ({
  DisconnectedView: () => {
    const RN = require('react-native');
    return <RN.View testID="pairing-view" />;
  },
  OfflineDesktopView: () => {
    const RN = require('react-native');
    return <RN.View testID="offline-desktop-view" />;
  },
  ConnectingView: () => null,
  ErrorView: () => null,
  SessionExpiredView: () => null,
}));
jest.mock('@/src/features/companion/components/DesktopInfoCard', () => ({
  DesktopInfoCard: () => null,
}));
jest.mock('@/src/features/companion/components/DesktopSetupChecklistView', () => ({
  DesktopSetupChecklistView: () => null,
  useDispatchSetupStore: (selector: (s: { hasSeenDispatchSetup: boolean }) => unknown) =>
    selector({ hasSeenDispatchSetup: true }),
}));
jest.mock('@/src/shared/components/ApprovalModal', () => ({
  ApprovalModal: () => null,
  useApprovalModal: () => ({
    currentApproval: null,
    showApproval: jest.fn(),
    handleApprove: jest.fn(),
    handleReject: jest.fn(),
    handleDismiss: jest.fn(),
  }),
}));
jest.mock('@/services/companion', () => ({
  startHealthChecks: jest.fn(),
  stopHealthChecks: jest.fn(),
  requestAgentRefresh: jest.fn(),
  manualReconnect: jest.fn(),
}));
jest.mock('@/services/companionNotifications', () => ({
  setupCompanionNotifications: jest.fn(() => () => {}),
}));

import CompanionScreen from '../app/(app)/companion/index';
import SettingsTabScreen from '@/src/features/settings';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useConnectionStore } from '@/stores/connectionStore';

const screens: Array<[string, React.ComponentType]> = [
  ['Remote', CompanionScreen],
  ['Settings root', SettingsTabScreen],
];

function pageBackground(Screen: React.ComponentType): unknown {
  const { getAllByTestId } = render(<Screen />);
  return StyleSheet.flatten(getAllByTestId('page-root')[0].props.style).backgroundColor;
}

describe('page background surface', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it.each(screens)('%s paints the pure black background token in dark mode', (_name, Screen) => {
    useLocalSettingsStore.setState({ themeMode: 'dark' });
    expect(agiMobileColors.dark.background).toBe('#000000');
    expect(pageBackground(Screen)).toBe(agiMobileColors.dark.background);
  });

  it.each(screens)('%s keeps the light surfaceBase in light mode', (_name, Screen) => {
    useLocalSettingsStore.setState({ themeMode: 'light' });
    expect(pageBackground(Screen)).toBe(agiMobileColors.light.surfaceBase);
  });
});

describe('Remote header and offline state', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useConnectionStore.setState({ status: 'disconnected', pairingCode: null, desktopName: null });
  });

  it('centres the title between equal sides with 44pt header buttons', () => {
    const { getByTestId, getByLabelText } = render(<CompanionScreen />);
    expect(getByTestId('remote-header-title').props.className).toContain('text-center');
    for (const label of ['Go back', 'Show companion walkthrough']) {
      const style = StyleSheet.flatten(getByLabelText(label).props.style);
      expect(style.width).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeGreaterThanOrEqual(44);
    }
  });

  it('shows the offline view while a pairing is kept and the pairing view after it ends', () => {
    useConnectionStore.setState({ pairingCode: 'ABC123', desktopName: 'Studio-Mac.local' });
    const first = render(<CompanionScreen />);
    expect(first.getByTestId('offline-desktop-view')).toBeTruthy();
    expect(first.queryByTestId('pairing-view')).toBeNull();
    first.unmount();

    useConnectionStore.setState({ pairingCode: null });
    const second = render(<CompanionScreen />);
    expect(second.getByTestId('pairing-view')).toBeTruthy();
    expect(second.queryByTestId('offline-desktop-view')).toBeNull();
  });
});
