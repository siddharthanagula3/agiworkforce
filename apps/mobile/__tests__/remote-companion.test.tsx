/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { agiMobileColors } from '@agiworkforce/design-tokens';
import { PRODUCT_NAMES, type RemoteCodeSessionSummary } from '@agiworkforce/types';

const mockPush = jest.fn();

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
    push: mockPush,
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
        return (props: Record<string, unknown>) => <RN.View testID={`icon-${name}`} {...props} />;
      },
    },
  );
});

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

jest.mock('@/services/companion', () => ({
  manualReconnect: jest.fn(),
  isValidPairingCode: jest.fn(() => true),
}));

jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));

import { manualReconnect } from '@/services/companion';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useConnectionStore } from '@/stores/connectionStore';
import {
  useRemoteCodePreferences,
  useRemoteCodeStore,
} from '@/src/features/companion/remote-code/store';
import { OfflineDesktopView } from '@/src/features/companion/components/ConnectionStateViews';
import { offlineStatusLine } from '@/src/features/companion/components/StatusBanners';
import { PairingStatus } from '@/src/features/companion/components/PairingStatus';
import { DesktopInfoCard } from '@/src/features/companion/components/DesktopInfoCard';
import {
  CodeSessionsCard,
  groupSessionsByProject,
} from '@/src/features/companion/components/CodeSessionsCard';
import { QRScanner } from '@/src/features/companion/components/QRScanner';
import RemoteControlSettingsScreen from '../app/(app)/settings/remote-control';

jest.mock('@/src/features/companion/components/AgentDashboard', () => ({
  AgentDashboard: () => null,
}));
jest.mock('@/src/features/companion/components/DispatchTaskComposer', () => ({
  DispatchTaskComposer: () => null,
}));

function session(
  rootId: string,
  threadId: string,
  title: string,
  folder = rootId,
): RemoteCodeSessionSummary {
  return {
    rootId,
    threadId,
    title,
    folder,
    branch: null,
    status: 'idle',
    model: null,
    updatedAt: '2026-10-22T00:00:00.000Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatAppModeStore.setState({ appMode: 'local' });
  useLocalSettingsStore.setState({ themeMode: 'dark' });
  useConnectionStore.setState({
    status: 'disconnected',
    desktopName: null,
    pairingCode: null,
    lastHeartbeatAt: null,
  });
  useRemoteCodeStore.getState().reset();
  useRemoteCodePreferences.setState({ followUpBehavior: 'queue' });
});

describe('offline desktop view', () => {
  it('shows the remembered desktop, its last-seen line, one helper sentence and Reconnect', () => {
    const onReconnect = jest.fn();
    const onScanPress = jest.fn();
    const { getByText, getByLabelText, getByTestId } = render(
      <OfflineDesktopView
        desktopName="Studio-Mac.local"
        lastSeenAt={Date.now() - 5 * 60 * 60_000}
        onReconnect={onReconnect}
        onScanPress={onScanPress}
      />,
    );
    expect(getByTestId('icon-Laptop')).toBeTruthy();
    expect(getByText('Studio-Mac.local')).toBeTruthy();
    expect(getByText('Offline · Last seen 5h ago')).toBeTruthy();
    expect(
      getByText(`Make sure ${PRODUCT_NAMES.desktop} is running on this computer.`),
    ).toBeTruthy();
    fireEvent.press(getByLabelText('Reconnect to desktop'));
    expect(onReconnect).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('Scan a new pairing code'));
    expect(onScanPress).toHaveBeenCalledTimes(1);
  });

  it('says only Offline when no heartbeat was ever seen', () => {
    expect(offlineStatusLine(null)).toBe('Offline');
  });
});

describe('pairing status subtitle', () => {
  it('keeps the last known desktop name when disconnected', () => {
    const { getByText, rerender } = render(
      <PairingStatus status="disconnected" desktopName="Studio-Mac.local" error={null} />,
    );
    expect(getByText('Studio-Mac.local, offline')).toBeTruthy();
    rerender(<PairingStatus status="disconnected" desktopName={null} error={null} />);
    expect(getByText('Not connected')).toBeTruthy();
  });
});

describe('desktop info card', () => {
  it('truncates a long device name to one line', () => {
    const name = 'Siddharthas-MacBook-Air-with-a-very-long-host-name.local';
    const { getByText } = render(
      <DesktopInfoCard desktopName={name} desktopMetadata={null} onDisconnect={jest.fn()} />,
    );
    const text = getByText(name);
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe('tail');
  });
});

describe('remote projects', () => {
  const roots = [
    { rootId: 'r1', name: 'agiworkforce', branch: 'main', available: true },
    { rootId: 'r2', name: 'website', branch: null, available: true },
  ];

  it('groups sessions under their project root and keeps empty roots', () => {
    const groups = groupSessionsByProject(
      [session('r1', 't1', 'Audit fix'), session('r3', 't3', 'Loose', 'scratch')],
      roots,
    );
    expect(groups.map((g) => [g.name, g.sessions.length])).toEqual([
      ['agiworkforce', 1],
      ['website', 0],
      ['scratch', 1],
    ]);
  });

  it('expands a project to its sessions and collapses it again', () => {
    useRemoteCodeStore.setState({
      roots,
      sessions: [session('r1', 't1', 'Audit fix'), session('r2', 't2', 'Hero copy')],
      sessionsSyncedAt: '2026-10-22T00:00:00.000Z',
    });
    const { getByText, queryByText, getByLabelText, getAllByTestId } = render(
      <CodeSessionsCard canStart={false} />,
    );
    expect(getByText('Projects')).toBeTruthy();
    expect(queryByText('Audit fix')).toBeNull();
    expect(getAllByTestId('icon-Folder')).toHaveLength(2);

    const project = getByLabelText('agiworkforce, 1 session');
    expect(project.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(project);
    expect(getByText('Audit fix')).toBeTruthy();
    expect(getByLabelText('agiworkforce, 1 session').props.accessibilityState).toMatchObject({
      expanded: true,
    });
    expect(getAllByTestId('icon-FolderOpen')).toHaveLength(1);
    expect(getAllByTestId('icon-ChevronDown')).toHaveLength(1);

    fireEvent.press(getByLabelText('Open Audit fix'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/companion/code/t1?rootId=r1');

    fireEvent.press(getByLabelText('agiworkforce, 1 session'));
    expect(queryByText('Audit fix')).toBeNull();
  });

  it('keeps the flat session list when the desktop reports one project', () => {
    useRemoteCodeStore.setState({
      roots: [roots[0]],
      sessions: [session('r1', 't1', 'Audit fix')],
      sessionsSyncedAt: '2026-10-22T00:00:00.000Z',
    });
    const { getByText, queryByText } = render(<CodeSessionsCard canStart={false} />);
    expect(queryByText('Projects')).toBeNull();
    expect(getByText('Audit fix')).toBeTruthy();
  });
});

describe('sessions list', () => {
  const synced = '2026-10-22T00:00:00.000Z';

  function seed(sessions: RemoteCodeSessionSummary[]) {
    useRemoteCodeStore.setState({
      roots: [{ rootId: 'r1', name: 'agiworkforce', branch: 'main', available: true }],
      sessions,
      sessionsSyncedAt: synced,
    });
  }

  it('shows a Sessions header, an All filter and each session with its age', () => {
    seed([
      {
        ...session('r1', 't1', 'Audit fix'),
        updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
    ]);
    const { getByText, getByLabelText } = render(<CodeSessionsCard canStart={false} />);
    expect(getByText('Sessions')).toBeTruthy();
    expect(getByLabelText('Filter sessions: All')).toBeTruthy();
    expect(getByText('5d ago · r1')).toBeTruthy();
  });

  it('filters the list by status and says when nothing matches', () => {
    seed([
      { ...session('r1', 't1', 'Audit fix'), status: 'running' },
      { ...session('r1', 't2', 'Hero copy'), status: 'idle' },
    ]);
    const { getByText, queryByText, getByLabelText } = render(
      <CodeSessionsCard canStart={false} />,
    );

    fireEvent.press(getByLabelText('Filter sessions: All'));
    fireEvent.press(getByLabelText('Running'));
    expect(getByText('Audit fix')).toBeTruthy();
    expect(queryByText('Hero copy')).toBeNull();
    expect(getByLabelText('Filter sessions: Running')).toBeTruthy();

    fireEvent.press(getByLabelText('Filter sessions: Running'));
    fireEvent.press(getByLabelText('Failed'));
    expect(getByText('No sessions match this filter.')).toBeTruthy();

    fireEvent.press(getByLabelText('Filter sessions: Failed'));
    fireEvent.press(getByLabelText('All'));
    expect(getByText('Hero copy')).toBeTruthy();
  });

  it('offers no filter before there is a session to filter', () => {
    seed([]);
    const { queryByLabelText } = render(<CodeSessionsCard canStart={false} />);
    expect(queryByLabelText('Filter sessions: All')).toBeNull();
  });
});

describe('remote control settings page', () => {
  it('shows a connected desktop with Open Remote and a confirmed Disconnect', () => {
    const disconnect = jest.fn();
    useConnectionStore.setState({
      status: 'connected',
      desktopName: 'Studio-Mac.local',
      pairingCode: 'ABC123',
      lastHeartbeatAt: Date.now(),
      disconnect,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, getByLabelText, queryByLabelText } = render(<RemoteControlSettingsScreen />);
    expect(getByText('Remote control')).toBeTruthy();
    expect(getByText(PRODUCT_NAMES.desktop)).toBeTruthy();
    expect(getByText('Studio-Mac.local').props.numberOfLines).toBe(1);
    expect(getByText('Connected')).toBeTruthy();
    expect(queryByLabelText('Reconnect')).toBeNull();

    fireEvent.press(getByLabelText('Open Remote'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/companion');

    fireEvent.press(getByLabelText('Disconnect'));
    expect(disconnect).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(alert.mock.calls[0]?.[0]).toBe('Disconnect from Studio-Mac.local?');
    buttons.find((b) => b.text === 'Disconnect')?.onPress?.();
    expect(disconnect).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('offers Reconnect for a paired desktop that went offline', () => {
    useConnectionStore.setState({
      status: 'disconnected',
      desktopName: 'Studio-Mac.local',
      pairingCode: 'ABC123',
      lastHeartbeatAt: Date.now() - 10 * 60_000,
    });
    const { getByText, getByLabelText } = render(<RemoteControlSettingsScreen />);
    expect(getByText('Offline · Last seen 10m ago')).toBeTruthy();
    fireEvent.press(getByLabelText('Reconnect'));
    expect(manualReconnect).toHaveBeenCalledTimes(1);
  });

  it('offers pairing when no computer is paired', () => {
    const { getByText, getByLabelText, queryByLabelText } = render(<RemoteControlSettingsScreen />);
    expect(getByText('No computer paired')).toBeTruthy();
    expect(getByText('Not connected')).toBeTruthy();
    expect(queryByLabelText('Disconnect')).toBeNull();
    fireEvent.press(getByLabelText('Pair a computer'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/companion');
  });
});

describe('follow-up behavior picker', () => {
  it('defaults to Queue and stores Steer when chosen', () => {
    const { getByLabelText } = render(<RemoteControlSettingsScreen />);
    const queue = getByLabelText('Queue. Send after the current turn finishes.');
    const steer = getByLabelText('Steer. Stop the current turn and send now.');
    expect(queue.props.accessibilityState).toMatchObject({ checked: true });
    expect(steer.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(steer);
    expect(useRemoteCodePreferences.getState().followUpBehavior).toBe('steer');
    expect(
      getByLabelText('Steer. Stop the current turn and send now.').props.accessibilityState,
    ).toMatchObject({ checked: true });
  });
});

describe('QR scanner page root', () => {
  function rootBackground(): unknown {
    const { getByText } = render(<QRScanner onScan={jest.fn()} onClose={jest.fn()} />);
    let node = getByText('Camera access is required to scan QR codes').parent;
    while (node?.parent) node = node.parent;
    const styled = [node, ...(node?.findAll(() => true) ?? [])].find(
      (n) => StyleSheet.flatten(n.props.style)?.backgroundColor !== undefined,
    );
    return StyleSheet.flatten(styled?.props.style).backgroundColor;
  }

  it('paints pure black in dark mode', () => {
    expect(rootBackground()).toBe(agiMobileColors.dark.background);
  });

  it('keeps surfaceBase in light mode', () => {
    useLocalSettingsStore.setState({ themeMode: 'light' });
    expect(rootBackground()).toBe(agiMobileColors.light.surfaceBase);
  });
});
