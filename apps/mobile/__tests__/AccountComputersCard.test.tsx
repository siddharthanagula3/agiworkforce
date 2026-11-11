/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockConnect = jest.fn();
const mockListCodeSessions = jest.fn();
const mockListComputers = jest.fn();
let mockClerkUserId = 'user-1';
let mockCapabilities: unknown = undefined;
const mockComputers = [
  {
    id: 'a',
    kind: 'desktop',
    name: 'Studio Mac',
    platform: 'macos',
    architecture: 'arm64',
    presence: 'online',
    capabilities: null,
    lastSeenAt: null,
  },
  {
    id: 'b',
    kind: 'desktop',
    name: 'Office PC',
    platform: 'windows',
    architecture: 'x64',
    presence: 'online',
    capabilities: null,
    lastSeenAt: null,
  },
  {
    id: 'c',
    kind: 'desktop',
    name: 'Old Laptop',
    platform: 'linux',
    architecture: 'x64',
    presence: 'offline',
    capabilities: null,
    lastSeenAt: null,
  },
];

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#888888' }),
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }), isDark: true }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/src/features/device-registry', () => ({
  listAccountComputers: (...args: unknown[]) => mockListComputers(...args),
}));
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: { clerkUserId: string }) => unknown) =>
    selector({ clerkUserId: mockClerkUserId }),
}));
jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: true }),
}));
jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (selector: (s: unknown) => unknown) =>
    selector({ desktopMetadata: { capabilities: mockCapabilities }, connect: mockConnect }),
}));
jest.mock('../src/features/companion/remote-code/service', () => ({
  listCodeSessions: (...args: unknown[]) => mockListCodeSessions(...args),
}));
jest.mock('../src/features/companion/components/QRScanner', () => {
  const { Pressable } = require('react-native');
  return {
    QRScanner: ({ onScan }: { onScan: (code: string) => void }) => (
      <Pressable accessibilityLabel="scan" onPress={() => onScan('PAIR-123')} />
    ),
  };
});
jest.mock('../src/features/companion/components/CodeSessionsCard', () => {
  const { Text: MockText } = require('react-native');
  return { NewCodeSession: () => <MockText>new session form</MockText> };
});

import { AccountComputersCard } from '../src/features/companion/components/AccountComputersCard';

describe('AccountComputersCard device actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapabilities = undefined;
    mockClerkUserId = 'user-1';
    mockListComputers.mockResolvedValue(mockComputers);
  });

  it('pairs an online computer by scanning when nothing is connected', async () => {
    render(<AccountComputersCard connectedName={null} />);

    fireEvent.press(await screen.findByLabelText('Office PC, Online'));
    fireEvent.press(await screen.findByLabelText('scan'));

    expect(mockConnect).toHaveBeenCalledWith('PAIR-123');
  });

  it('keeps offline computers inert', async () => {
    render(<AccountComputersCard connectedName={null} />);

    const row = await screen.findByLabelText('Old Laptop, Offline');
    fireEvent.press(row);

    expect(screen.queryByLabelText('scan')).toBeNull();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('starts a session on the connected computer when it can start sessions', async () => {
    mockCapabilities = ['code-sessions', 'code-session-start'];
    render(<AccountComputersCard connectedName="Studio Mac" />);

    fireEvent.press(await screen.findByLabelText('Studio Mac, connected'));

    await waitFor(() => expect(screen.getByText('new session form')).toBeTruthy());
    expect(mockListCodeSessions).toHaveBeenCalled();
  });

  it('does not offer a session or another pairing while connected without start support', async () => {
    render(<AccountComputersCard connectedName="Studio Mac" />);

    fireEvent.press(await screen.findByLabelText('Studio Mac, connected'));
    fireEvent.press(await screen.findByLabelText('Office PC, Online'));

    expect(screen.queryByText('new session form')).toBeNull();
    expect(screen.queryByLabelText('scan')).toBeNull();
  });

  it('marks only one computer as connected when two registry rows share the paired name', async () => {
    mockCapabilities = ['code-sessions', 'code-session-start'];
    mockListComputers.mockResolvedValue([
      { ...mockComputers[0], id: 'a1', name: 'Work computer' },
      { ...mockComputers[1], id: 'b1', name: 'Work computer', presence: 'offline' },
    ]);
    render(<AccountComputersCard connectedName="Work computer" />);

    await screen.findByText(/More than one computer on this account has this name/);
    expect(screen.getAllByLabelText('Work computer, connected')).toHaveLength(1);
    expect(screen.getByLabelText('Work computer, Online')).toBeTruthy();
    expect(screen.getByLabelText('Work computer, Offline')).toBeTruthy();
  });

  it('does not start a session from a row whose name is shared with the paired computer', async () => {
    mockCapabilities = ['code-sessions', 'code-session-start'];
    mockListComputers.mockResolvedValue([
      { ...mockComputers[0], id: 'a1', name: 'Work computer' },
      { ...mockComputers[1], id: 'b1', name: 'Work computer', presence: 'offline' },
    ]);
    render(<AccountComputersCard connectedName="Work computer" />);

    fireEvent.press(await screen.findByLabelText('Work computer, Offline'));
    fireEvent.press(screen.getByLabelText('Work computer, Online'));

    expect(screen.queryByText('new session form')).toBeNull();
    expect(mockListCodeSessions).not.toHaveBeenCalled();
  });

  it('closes the session sheet when the paired computer changes', async () => {
    mockCapabilities = ['code-sessions', 'code-session-start'];
    const { rerender } = render(<AccountComputersCard connectedName="Studio Mac" />);

    fireEvent.press(await screen.findByLabelText('Studio Mac, connected'));
    await waitFor(() => expect(screen.getByText('new session form')).toBeTruthy());

    rerender(<AccountComputersCard connectedName={null} />);

    await waitFor(() => expect(screen.queryByText('new session form')).toBeNull());
  });

  it('keeps the loaded list and says so when a refresh fails', async () => {
    render(<AccountComputersCard connectedName={null} />);
    await screen.findByLabelText('Office PC, Online');

    mockListComputers.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByLabelText('Refresh your computers'));

    await screen.findByText('Could not refresh. This is the list from your last successful load.');
    expect(screen.getByLabelText('Office PC, Online')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Refresh your computers'));
    });
    expect(
      screen.queryByText('Could not refresh. This is the list from your last successful load.'),
    ).toBeNull();
    expect(screen.getByLabelText('Office PC, Online')).toBeTruthy();
  });

  it('does not report an empty account as current after a failed refresh', async () => {
    mockListComputers.mockResolvedValueOnce([]);
    render(<AccountComputersCard connectedName={null} />);
    await screen.findByText(/No computer is signed in to this account yet/);

    mockListComputers.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByLabelText('Refresh your computers'));

    await screen.findByText('Could not refresh your computers. The last load found none.');
    expect(screen.queryByText(/No computer is signed in to this account yet/)).toBeNull();
  });

  it('drops the previous account list when the account changes and ignores its late response', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    mockListComputers.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const { rerender } = render(<AccountComputersCard connectedName={null} />);

    mockClerkUserId = 'user-2';
    mockListComputers.mockResolvedValueOnce([{ ...mockComputers[2], id: 'z', name: 'Second PC' }]);
    rerender(<AccountComputersCard connectedName={null} />);
    await screen.findByLabelText('Second PC, Offline');

    await act(async () => {
      resolveFirst(mockComputers);
    });

    expect(screen.queryByLabelText('Office PC, Online')).toBeNull();
    expect(screen.getByLabelText('Second PC, Offline')).toBeTruthy();
  });
});
