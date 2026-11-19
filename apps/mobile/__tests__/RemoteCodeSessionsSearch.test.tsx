/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { RemoteCodeSessionSummary } from '@agiworkforce/types';

const mockPush = jest.fn();
const mockListCodeSessions = jest.fn();
const mockListAccountComputers = jest.fn();

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
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <View style={style as never}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => actual.lightColors,
    useTheme: () => ({ colors: actual.lightColors, isDark: false }),
  };
});

jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: (...args: unknown[]) => mockListCodeSessions(...args),
  startCodeSession: jest.fn(),
}));

jest.mock('../src/features/device-registry', () => ({
  listAccountComputers: (...args: unknown[]) => mockListAccountComputers(...args),
}));

jest.mock('../src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: true,
    signedIn: true,
    accountKey: 'user-1',
    activate: jest.fn(),
  }),
}));

jest.mock('../src/features/cloud-code/components/NewCloudCodeSessionSheet', () => ({
  NewCloudCodeSessionSheet: () => null,
}));

function cloudSession(
  id: string,
  title: string,
  state: string,
  updatedAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title,
    state,
    updatedAt,
    createdAt: updatedAt,
    archivedAt: null,
    repositoryUrl: null,
    repositoryBranch: null,
    workingBranch: null,
    baseBranch: null,
    ...overrides,
  };
}

let mockCloudSessions = [
  cloudSession('c1', 'Cloud running', 'running', '2026-11-12T10:00:00.000Z', {
    repositoryUrl: 'https://github.com/example/service',
  }),
  cloudSession('c2', 'Cloud ready', 'ready', '2026-11-10T10:00:00.000Z'),
  cloudSession('c3', 'Cloud failed', 'failed', '2026-11-08T10:00:00.000Z'),
];

const mockUseSessions = jest.fn((_filter: string) => ({
  status: 'ready',
  sessions: mockCloudSessions,
  availability: null,
  runtimes: [],
  error: null,
  refreshing: false,
  load: jest.fn(),
}));

jest.mock('../src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: (filter: string) => mockUseSessions(filter),
}));

import { lightColors } from '../src/ui/theme/tokens';
import { CloudCodeSessionsScreen } from '../src/features/cloud-code/CloudCodeSessionsScreen';
import {
  DEVICES_LOAD_FAILED_LINE,
  NO_DEVICE_LINE,
} from '../src/features/cloud-code/components/CodeDevicesSection';
import { useRemoteCodeStore } from '@/src/features/companion/remote-code/store';
import { useConnectionStore } from '@/stores/connectionStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';

const COMPUTER = 'Work laptop';
const SYNCED = '2026-11-13T00:00:00.000Z';

function computerSession(
  threadId: string,
  title: string,
  updatedAt: string,
  overrides: Partial<RemoteCodeSessionSummary> = {},
): RemoteCodeSessionSummary {
  return {
    rootId: 'r1',
    threadId,
    title,
    folder: 'shop',
    branch: null,
    status: 'idle',
    model: null,
    updatedAt,
    ...overrides,
  };
}

const COMPUTER_SESSIONS = [
  computerSession('t1', 'Laptop running', '2026-11-13T10:00:00.000Z', { status: 'running' }),
  computerSession('t2', 'Laptop idle', '2026-11-11T10:00:00.000Z', { folder: 'billing' }),
  computerSession('t3', 'Laptop approval', '2026-11-09T10:00:00.000Z', {
    status: 'awaiting_approval',
  }),
];

const ALL_TITLES =
  /^(Cloud running|Cloud ready|Cloud failed|Laptop running|Laptop idle|Laptop approval|Relayed)$/;

function shownTitles(screen: ReturnType<typeof render>) {
  return screen.queryAllByText(ALL_TITLES).map((node) => node.props.children as string);
}

function connect(
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' = 'connected',
) {
  useConnectionStore.setState({
    status,
    desktopName: COMPUTER,
    desktopMetadata: { capabilities: ['code-sessions'] },
  });
}

function seedComputer(sessions: RemoteCodeSessionSummary[] = COMPUTER_SESSIONS) {
  useRemoteCodeStore.setState({ sessions, roots: [], sessionsSyncedAt: SYNCED });
}

function iconColor(screen: ReturnType<typeof render>, testID: string): unknown {
  return screen.getAllByTestId(testID)[0]?.props.color;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListAccountComputers.mockResolvedValue([]);
  useWaitlistStore.setState({ cloudUnlocked: true });
  useConnectionStore.setState({ status: 'disconnected', desktopName: null, desktopMetadata: null });
  useRemoteCodeStore.getState().reset();
});

afterEach(() => {
  mockCloudSessions = mockCloudSessions.slice(0, 3);
});

async function renderScreen() {
  const screen = render(<CloudCodeSessionsScreen />);
  await waitFor(() => expect(mockListAccountComputers).toHaveBeenCalled());
  await act(async () => undefined);
  return screen;
}

describe('AGI Code merged sessions list', () => {
  it('lists computer and Cloud sessions together, newest first', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    expect(shownTitles(screen)).toEqual([
      'Laptop running',
      'Cloud running',
      'Laptop idle',
      'Cloud ready',
      'Laptop approval',
      'Cloud failed',
    ]);
  });

  it('marks computer rows with the laptop and Cloud rows with the cloud outline', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    expect(screen.getAllByTestId('code-session-location-computer')).toHaveLength(3);
    expect(screen.getAllByTestId('code-session-location-cloud')).toHaveLength(3);
    expect(screen.getByLabelText(/^Laptop running\. Running\. On Work laptop\./)).toBeTruthy();
    expect(screen.getByLabelText(/^Cloud running\. .*\. In the cloud\./)).toBeTruthy();
    expect(iconColor(screen, 'code-session-location-computer')).toBe(lightColors.agentSuccess);
    expect(iconColor(screen, 'code-session-location-cloud')).toBe(lightColors.textMuted);
  });

  it('greys the laptop while the computer is reconnecting', async () => {
    connect('reconnecting');
    seedComputer();
    const screen = await renderScreen();

    expect(iconColor(screen, 'code-session-location-computer')).toBe(lightColors.textMuted);
  });

  it('sorts both kinds together oldest first', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    fireEvent.press(screen.getByLabelText('Sort sessions: Most recent'));
    fireEvent.press(screen.getByLabelText('Oldest first'));

    expect(shownTitles(screen)).toEqual([
      'Cloud failed',
      'Laptop approval',
      'Cloud ready',
      'Laptop idle',
      'Cloud running',
      'Laptop running',
    ]);
  });

  it('searches computer folders and Cloud repositories in one box', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    fireEvent.changeText(screen.getByLabelText('Search sessions'), 'billing');
    expect(shownTitles(screen)).toEqual(['Laptop idle']);

    fireEvent.changeText(screen.getByLabelText('Search sessions'), 'example/service');
    expect(shownTitles(screen)).toEqual(['Cloud running']);

    fireEvent.changeText(screen.getByLabelText('Search sessions'), 'running');
    expect(shownTitles(screen)).toEqual(['Laptop running', 'Cloud running']);
  });

  it.each([
    ['Running', ['Laptop running', 'Cloud running']],
    ['Ready', ['Laptop idle', 'Cloud ready']],
    ['Needs attention', ['Laptop approval', 'Cloud failed']],
    ['Provisioning', []],
  ])('filters both kinds by the %s state', async (label, expected) => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    fireEvent.press(screen.getByLabelText(`Filter sessions: ${label}`));

    expect(shownTitles(screen)).toEqual(expected);
  });

  it('keeps computer sessions out of Closed and Archived, which only Cloud sessions reach', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    fireEvent.press(screen.getByLabelText('Filter sessions: Closed'));
    expect(mockUseSessions).toHaveBeenLastCalledWith('closed');
    expect(screen.queryAllByTestId('code-session-location-computer')).toHaveLength(0);

    fireEvent.press(screen.getByLabelText('Filter sessions: All'));
    expect(screen.getAllByTestId('code-session-location-computer')).toHaveLength(3);
  });

  it('leaves a Cloud session the computer relays to the Cloud rows', async () => {
    connect();
    seedComputer([
      ...COMPUTER_SESSIONS,
      computerSession('cloud:c1', 'Relayed', '2026-11-13T11:00:00.000Z', { location: 'cloud' }),
    ]);
    const screen = await renderScreen();

    expect(shownTitles(screen)).not.toContain('Relayed');
  });

  it('opens each row at its own session screen', async () => {
    connect();
    seedComputer();
    const screen = await renderScreen();

    fireEvent.press(screen.getByLabelText(/^Laptop idle\./));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/companion/code/t2?rootId=r1');

    fireEvent.press(screen.getByLabelText(/^Cloud ready\./));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/cloud-code/[sessionId]',
      params: { sessionId: 'c2' },
    });
  });

  it('asks a connected computer for its sessions without the Remote page', async () => {
    connect();
    await renderScreen();

    expect(mockListCodeSessions).toHaveBeenCalledTimes(1);
  });

  it('does not ask a computer that cannot list sessions', async () => {
    useConnectionStore.setState({
      status: 'connected',
      desktopName: COMPUTER,
      desktopMetadata: { capabilities: [] },
    });
    seedComputer();
    const screen = await renderScreen();

    expect(mockListCodeSessions).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('code-session-location-computer')).toHaveLength(0);
  });

  it('shows only Cloud sessions when no computer is paired', async () => {
    const screen = await renderScreen();

    expect(shownTitles(screen)).toEqual(['Cloud running', 'Cloud ready', 'Cloud failed']);
    expect(mockListCodeSessions).not.toHaveBeenCalled();
  });

  it('has no note or link pointing to a separate Remote destination', async () => {
    const screen = await renderScreen();

    expect(screen.queryByText(/Sessions running on your computer/)).toBeNull();
    expect(screen.queryByLabelText('Open Remote')).toBeNull();
  });
});

describe('AGI Code devices section', () => {
  it('with no device shows the heading, one line and Add device', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Devices')).toBeTruthy();
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText(NO_DEVICE_LINE)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Add device'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/companion');
  });

  it('says the computers could not be loaded instead of claiming there are none', async () => {
    mockListAccountComputers.mockRejectedValue(new Error('offline'));
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText(DEVICES_LOAD_FAILED_LINE)).toBeTruthy());
    expect(screen.queryByText(NO_DEVICE_LINE)).toBeNull();
    expect(screen.getByLabelText('Add device')).toBeTruthy();
  });

  it('shows a remembered computer as not connected with a grey laptop', async () => {
    connect('disconnected');
    const screen = await renderScreen();

    const row = screen.getByLabelText(`${COMPUTER}, Not connected`);
    expect(screen.queryByText(NO_DEVICE_LINE)).toBeNull();
    expect(iconColor(screen, 'code-device-icon-paired')).toBe(lightColors.textMuted);

    fireEvent.press(row);
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/companion');
  });

  it('marks the connected computer green and lists the other computers on the account', async () => {
    mockListAccountComputers.mockResolvedValue([
      { id: 'd1', kind: 'desktop', name: 'Home desktop', presence: 'online' },
      { id: 'd2', kind: 'desktop', name: COMPUTER, presence: 'online' },
    ]);
    connect();
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByLabelText('Home desktop, Not connected')).toBeTruthy());
    expect(screen.getByLabelText(`${COMPUTER}, Connected`)).toBeTruthy();
    expect(screen.queryByLabelText(`${COMPUTER}, Not connected`)).toBeNull();
    expect(iconColor(screen, 'code-device-icon-d2')).toBe(lightColors.agentSuccess);
    expect(iconColor(screen, 'code-device-icon-d1')).toBe(lightColors.textMuted);
  });

  it.each(['connected', 'connecting', 'reconnecting'] as const)(
    'offers no Add device while a pairing is %s, since a phone holds one at a time',
    async (status) => {
      connect(status);
      const screen = await renderScreen();

      expect(screen.queryByLabelText('Add device')).toBeNull();
    },
  );
});
