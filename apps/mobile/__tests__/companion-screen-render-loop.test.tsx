/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('@/components/ui/text', () => {
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
    DisconnectedView: () => <RN.View testID="disconnected-view" />,
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
    DesktopSetupChecklistView: () => <RN.View testID="dispatch-setup-checklist" />,
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
  requestAgentRefresh: jest.fn(),
  manualReconnect: jest.fn(),
}));
jest.mock('@/services/companionNotifications', () => ({
  setupCompanionNotifications: jest.fn(() => () => {}),
}));
jest.mock('@/services/heartbeat', () => ({
  startMobileHeartbeat: jest.fn(() => () => {}),
  logApprovalDecision: jest.fn(),
}));
jest.mock('@/services/authSession', () => ({
  getCurrentUserId: jest.fn(async () => null),
}));

import CompanionScreen from '../app/(app)/companion/index';
import { useAgentStore } from '../stores/agentStore';
import { useConnectionStore } from '../stores/connectionStore';

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

  it('shows the disconnected pairing screen once the checklist has been cleared', () => {
    mockHasSeenDispatchSetup = true;

    const screen = render(<CompanionScreen />);

    expect(screen.getByTestId('disconnected-view')).toBeTruthy();
    expect(screen.queryByTestId('dispatch-setup-checklist')).toBeNull();
  });
});
