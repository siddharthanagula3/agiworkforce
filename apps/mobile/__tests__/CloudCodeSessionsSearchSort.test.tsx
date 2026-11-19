/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
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
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => actual.lightColors,
    useTheme: () => ({ colors: actual.lightColors, isDark: false }),
  };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
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

jest.mock('../src/features/device-registry', () => ({
  listAccountComputers: () => new Promise(() => undefined),
}));

jest.mock('../src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
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

function mockSession(
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

const ALL_SESSIONS = [
  mockSession('s1', 'Fix parser', 'running', '2026-11-10T10:00:00.000Z', {
    repositoryUrl: 'https://github.com/acme/web',
    workingBranch: 'agi/fix-parser',
  }),
  mockSession('s2', 'Add billing page', 'ready', '2026-11-12T10:00:00.000Z', {
    repositoryUrl: 'https://github.com/acme/api',
    workingBranch: 'agi/billing',
  }),
  mockSession('s3', 'Refactor auth', 'failed', '2026-11-11T10:00:00.000Z', {
    repositoryUrl: 'https://github.com/acme/web',
    workingBranch: 'agi/auth',
  }),
  mockSession('s4', 'Write docs', 'provisioning', '2026-11-01T10:00:00.000Z'),
];

let mockSessions = ALL_SESSIONS;

const mockUseSessions = jest.fn((_filter: string) => ({
  status: 'ready',
  sessions: mockSessions,
  availability: null,
  runtimes: [],
  error: null,
  refreshing: false,
  load: jest.fn(),
}));

jest.mock('../src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: (filter: string) => mockUseSessions(filter),
}));

import { CloudCodeSessionsScreen } from '../src/features/cloud-code/CloudCodeSessionsScreen';

function shownTitles(screen: ReturnType<typeof render>) {
  return screen
    .queryAllByText(/^(Fix parser|Add billing page|Refactor auth|Write docs)$/)
    .map((node) => node.props.children as string);
}

function search(screen: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(screen.getByLabelText('Search sessions'), text);
}

afterEach(() => {
  mockSessions = ALL_SESSIONS;
});

describe('AGI Code sessions search', () => {
  beforeEach(() => {
    mockUseSessions.mockClear();
  });

  it('lists every open session, most recent first, when nothing is typed', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    expect(shownTitles(screen)).toEqual([
      'Add billing page',
      'Refactor auth',
      'Fix parser',
      'Write docs',
    ]);
    expect(mockUseSessions).toHaveBeenLastCalledWith('open');
  });

  it('narrows the list by title', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    search(screen, 'parser');

    expect(shownTitles(screen)).toEqual(['Fix parser']);
  });

  it('narrows the list by repository', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    search(screen, 'acme/api');

    expect(shownTitles(screen)).toEqual(['Add billing page']);
  });

  it('narrows the list by branch', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    search(screen, 'agi/auth');

    expect(shownTitles(screen)).toEqual(['Refactor auth']);
  });

  it('matches every word typed, in any order and case', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    search(screen, 'ACME  web');

    expect(shownTitles(screen)).toEqual(['Refactor auth', 'Fix parser']);
  });

  it('says nothing matches and brings the list back when the search is cleared', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    search(screen, 'zzz');

    expect(shownTitles(screen)).toEqual([]);
    expect(screen.getByText('No sessions match your search')).toBeTruthy();
    expect(screen.queryByText(/Start one with New session/)).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear session search'));

    expect(shownTitles(screen)).toHaveLength(ALL_SESSIONS.length);
  });
});

describe('AGI Code sessions sort', () => {
  it('switches between most recent and oldest first', () => {
    const screen = render(<CloudCodeSessionsScreen />);
    expect(screen.queryByLabelText('Oldest first')).toBeNull();

    fireEvent.press(screen.getByLabelText('Sort sessions: Most recent'));
    expect(screen.getByLabelText('Most recent').props.accessibilityState).toMatchObject({
      checked: true,
    });
    fireEvent.press(screen.getByLabelText('Oldest first'));

    expect(shownTitles(screen)).toEqual([
      'Write docs',
      'Fix parser',
      'Refactor auth',
      'Add billing page',
    ]);
    expect(screen.queryByLabelText('Oldest first')).toBeNull();
    expect(screen.getByLabelText('Sort sessions: Oldest first')).toBeTruthy();
  });

  it('keeps the sort while searching', () => {
    const screen = render(<CloudCodeSessionsScreen />);
    fireEvent.press(screen.getByLabelText('Sort sessions: Most recent'));
    fireEvent.press(screen.getByLabelText('Oldest first'));

    search(screen, 'acme/web');

    expect(shownTitles(screen)).toEqual(['Fix parser', 'Refactor auth']);
  });
});

describe('AGI Code sessions state filter', () => {
  beforeEach(() => {
    mockUseSessions.mockClear();
  });

  it('offers every state the sessions have, and archived', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    for (const label of [
      'Open',
      'Running',
      'Ready',
      'Provisioning',
      'Needs attention',
      'Closed',
      'Archived',
      'All',
    ]) {
      expect(screen.getByLabelText(`Filter sessions: ${label}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Filter sessions: Needs input')).toBeNull();
    expect(screen.queryByLabelText('Filter sessions: Ready for review')).toBeNull();
  });

  it.each([
    ['Running', ['Fix parser']],
    ['Ready', ['Add billing page']],
    ['Provisioning', ['Write docs']],
    ['Needs attention', ['Refactor auth']],
  ])('shows only the %s sessions without asking the server again', (label, expected) => {
    const screen = render(<CloudCodeSessionsScreen />);

    fireEvent.press(screen.getByLabelText(`Filter sessions: ${label}`));

    expect(shownTitles(screen)).toEqual(expected);
    expect(
      screen.getByLabelText(`Filter sessions: ${label}`).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(mockUseSessions).toHaveBeenLastCalledWith('open');
  });

  it.each([
    ['Closed', 'closed'],
    ['Archived', 'archived'],
    ['All', 'all'],
  ])('asks the server for %s sessions', (label, filter) => {
    const screen = render(<CloudCodeSessionsScreen />);

    fireEvent.press(screen.getByLabelText(`Filter sessions: ${label}`));

    expect(mockUseSessions).toHaveBeenLastCalledWith(filter);
  });

  it('combines a state with a search', () => {
    const screen = render(<CloudCodeSessionsScreen />);

    fireEvent.press(screen.getByLabelText('Filter sessions: Running'));
    search(screen, 'billing');

    expect(shownTitles(screen)).toEqual([]);
    expect(screen.getByText('No sessions match your search')).toBeTruthy();
  });

  it('says the filter matched nothing when no search is typed', () => {
    const screen = render(<CloudCodeSessionsScreen />);
    fireEvent.press(screen.getByLabelText('Filter sessions: Running'));
    expect(shownTitles(screen)).toEqual(['Fix parser']);

    mockSessions = ALL_SESSIONS.filter((session) => session.state !== 'running');
    screen.rerender(<CloudCodeSessionsScreen />);

    expect(screen.getByText('No sessions match this filter')).toBeTruthy();
  });
});
