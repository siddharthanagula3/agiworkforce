/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return { FEATURES: { ...actual.FEATURES, companion: true, dispatch: true } };
});

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    createDataChannel: jest.fn().mockReturnValue({
      close: jest.fn(),
      send: jest.fn(),
      readyState: 'open',
    }),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'test-sdp' }),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),
  })),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
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

let mockSearchParams: { pairingCode?: string } = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  return { Text: (props: Record<string, unknown>) => <RN.Text {...props} /> };
});

jest.mock('@/src/features/companion/components/QRScanner', () => ({
  QRScanner: () => null,
}));
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
jest.mock('@/src/features/companion/components/ConnectionStateViews', () => {
  const RN = require('react-native');
  return {
    DisconnectedView: ({ onShowSetupSteps }: { onShowSetupSteps: () => void }) => (
      <RN.Pressable testID="disconnected-view" onPress={onShowSetupSteps} />
    ),
    OfflineDesktopView: () => null,
    ConnectingView: () => null,
    ErrorView: () => null,
    SessionExpiredView: () => null,
  };
});
jest.mock('@/src/features/companion/components/DesktopInfoCard', () => ({
  DesktopInfoCard: () => null,
}));
let mockHasSeenDispatchSetup = true;
jest.mock('@/src/features/companion/components/DesktopSetupChecklistView', () => {
  const RN = require('react-native');
  return {
    DesktopSetupChecklistView: ({ onContinue }: { onContinue: () => void }) => (
      <RN.Pressable testID="dispatch-setup-checklist" onPress={onContinue} />
    ),
    useDispatchSetupStore: (selector: (s: { hasSeenDispatchSetup: boolean }) => unknown) =>
      selector({ hasSeenDispatchSetup: mockHasSeenDispatchSetup }),
  };
});
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
  stopReconnectRecovery: jest.fn(),
  resumeReconnectCountdown: jest.fn(),
  requestAgentRefresh: jest.fn(),
  manualReconnect: jest.fn(),
}));
jest.mock('@/services/companionNotifications', () => ({
  setupCompanionNotifications: jest.fn(() => () => {}),
}));

import CompanionScreen from '../app/(app)/companion/index';
import { stopHealthChecks, stopReconnectRecovery } from '@/services/companion';
import { useAgentStore } from '../stores/agentStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useTierStore } from '../src/features/billing/store';

describe('CompanionScreen', () => {
  beforeEach(() => {
    useAgentStore.setState({ pendingApprovals: [] });
    mockHasSeenDispatchSetup = true;
  });

  it('renders without a "Maximum update depth exceeded" infinite render loop', () => {
    expect(() => render(<CompanionScreen />)).not.toThrow();
  });

  it('renders cleanly with pending approvals present (exercises the fixed selector path)', () => {
    useAgentStore.setState({
      pendingApprovals: [
        {
          id: 'req-1',
          toolName: 'shell.exec',
          status: 'pending',
          requestedAt: new Date().toISOString(),
        } as never,
      ],
    });

    expect(() => render(<CompanionScreen />)).not.toThrow();
  });
});

describe('CompanionScreen, PAR-M28 first-run setup gate', () => {
  beforeEach(() => {
    useAgentStore.setState({ pendingApprovals: [] });
    useConnectionStore.setState({ status: 'disconnected' });
  });

  it('shows the desktop setup checklist instead of the scan CTA on first entry', () => {
    mockHasSeenDispatchSetup = false;

    const screen = render(<CompanionScreen />);

    expect(screen.getByTestId('dispatch-setup-checklist')).toBeTruthy();
    expect(screen.queryByTestId('disconnected-view')).toBeNull();
  });

  it('lets returning users revisit setup and return to pairing', () => {
    mockHasSeenDispatchSetup = true;
    const screen = render(<CompanionScreen />);

    fireEvent.press(screen.getByTestId('disconnected-view'));
    expect(screen.getByTestId('dispatch-setup-checklist')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dispatch-setup-checklist'));
    expect(screen.getByTestId('disconnected-view')).toBeTruthy();
  });

  it('shows the disconnected pairing screen once the checklist has been cleared', () => {
    mockHasSeenDispatchSetup = true;

    const screen = render(<CompanionScreen />);

    expect(screen.getByTestId('disconnected-view')).toBeTruthy();
    expect(screen.queryByTestId('dispatch-setup-checklist')).toBeNull();
  });
});

describe('CompanionScreen, reconnect ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAgentStore.setState({ pendingApprovals: [] });
    mockHasSeenDispatchSetup = true;
    useConnectionStore.setState({ status: 'connected' });
  });

  it('stops health checks on a status change without stopping the reconnect countdown', () => {
    const screen = render(<CompanionScreen />);
    (stopHealthChecks as jest.Mock).mockClear();

    act(() => {
      useConnectionStore.setState({ status: 'reconnecting', reconnectCountdown: 15 });
    });

    expect(stopHealthChecks).toHaveBeenCalled();
    expect(stopReconnectRecovery).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('stops the reconnect countdown when the screen goes away', () => {
    const screen = render(<CompanionScreen />);
    expect(stopReconnectRecovery).not.toHaveBeenCalled();

    screen.unmount();

    expect(stopReconnectRecovery).toHaveBeenCalledTimes(1);
  });
});

describe('CompanionScreen, plan without remote control', () => {
  const connect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockHasSeenDispatchSetup = true;
    useAgentStore.setState({ pendingApprovals: [] });
    useConnectionStore.setState({ status: 'disconnected', pairingCode: null, connect });
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
  });

  afterAll(() => {
    mockSearchParams = {};
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
  });

  it('offers a Free plan no pairing flow, no scanner and no upgrade path', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });

    const screen = render(<CompanionScreen />);

    expect(screen.getByLabelText('unavailable-entitlement')).toBeTruthy();
    expect(screen.getByText(/isn’t included in your plan/)).toBeTruthy();
    expect(screen.queryByTestId('disconnected-view')).toBeNull();
    expect(screen.queryByTestId('dispatch-setup-checklist')).toBeNull();
    expect(screen.queryByText(/upgrade|price|\$/i)).toBeNull();
  });

  it('does not pair from a deep link while the plan lacks the capability', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });
    mockSearchParams = { pairingCode: 'ABCD1234' };

    render(<CompanionScreen />);

    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps the pairing flow for a paid plan', () => {
    useTierStore.setState({ tier: 'pro', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });
    mockSearchParams = { pairingCode: 'ABCD1234' };

    const screen = render(<CompanionScreen />);

    expect(screen.queryByLabelText('unavailable-entitlement')).toBeNull();
    expect(screen.getByTestId('disconnected-view')).toBeTruthy();
    expect(connect).toHaveBeenCalledWith('ABCD1234');
  });

  it('keeps an already paired computer reachable on a Free plan', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-11-14T00:00:00.000Z' });
    useConnectionStore.setState({ pairingCode: 'ABCD1234', desktopName: 'Studio' });

    const screen = render(<CompanionScreen />);

    expect(screen.queryByLabelText('unavailable-entitlement')).toBeNull();
  });

  it('does not flash the unavailable state while the plan is still unknown', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });

    const screen = render(<CompanionScreen />);

    expect(screen.queryByLabelText('unavailable-entitlement')).toBeNull();
    expect(screen.getByTestId('disconnected-view')).toBeTruthy();
  });
});
