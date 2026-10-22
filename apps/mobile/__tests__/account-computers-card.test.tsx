/* eslint-disable @typescript-eslint/no-require-imports */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockConnect = jest.fn();
const mockListCodeSessions = jest.fn();
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
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/src/features/device-registry', () => ({
  listAccountComputers: jest.fn(async () => mockComputers),
}));
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: { clerkUserId: string }) => unknown) =>
    selector({ clerkUserId: 'user-1' }),
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
});
