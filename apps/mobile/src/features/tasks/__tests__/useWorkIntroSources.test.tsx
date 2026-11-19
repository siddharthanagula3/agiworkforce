/* eslint-disable @typescript-eslint/no-require-imports */
import { renderHook, waitFor } from '@testing-library/react-native';

let mockAppMode = 'cloud';
let mockSignedIn = true;
let mockCapability = true;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: { appMode: string }) => unknown) =>
    selector({ appMode: mockAppMode }),
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: { isClerkSignedIn: boolean }) => unknown) =>
    selector({ isClerkSignedIn: mockSignedIn }),
}));

jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => mockCapability }));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: true } }));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

const mockFetchDirectory = jest.fn();
const mockBrowse = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: (...args: unknown[]) => mockFetchDirectory(...args),
  browsePersonalSourceListings: (...args: unknown[]) => mockBrowse(...args),
}));

const mockCalendarStatus = jest.fn();
jest.mock('@/src/features/integrations/services/deviceIntegrations', () => ({
  getCalendarPermissionStatus: () => mockCalendarStatus(),
}));

import { useWorkIntroSources } from '../useWorkIntroSources';

function listing(id: string, name: string, personalSources: string[]) {
  return { id, name, connectable: 'connect', personalSources };
}

function serve(listings: Record<string, unknown[]>, connections: unknown[] = []) {
  mockFetchDirectory.mockResolvedValue({ connectors: connections });
  mockBrowse.mockImplementation(async (source: string) => listings[source] ?? []);
}

const GMAIL = listing('gmail', 'Gmail', ['email']);
const CALENDAR = listing('google-calendar', 'Google Calendar', ['calendar']);

describe('useWorkIntroSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockSignedIn = true;
    mockCapability = true;
    mockCalendarStatus.mockResolvedValue('denied');
  });

  it('offers connecting when a source can be connected and none is', async () => {
    serve({ email: [GMAIL], calendar: [CALENDAR] });
    const { result } = renderHook(() => useWorkIntroSources());

    await waitFor(() => expect(result.current).toEqual({ offered: true, needsConnect: true }));
  });

  it('asks for nothing once every source has a connected connector', async () => {
    serve({ email: [GMAIL], calendar: [CALENDAR] }, [
      { id: 'c-gmail', connectorId: 'gmail', source: 'managed' },
      { id: 'c-calendar', connectorId: 'google-calendar', source: 'managed' },
    ]);
    const { result } = renderHook(() => useWorkIntroSources());

    await waitFor(() => expect(result.current).toEqual({ offered: true, needsConnect: false }));
  });

  it('does not count the calendar on the phone as connected for AGI Work', async () => {
    mockCalendarStatus.mockResolvedValue('granted');
    serve({ email: [], calendar: [CALENDAR] });
    const { result } = renderHook(() => useWorkIntroSources());

    await waitFor(() => expect(result.current).toEqual({ offered: true, needsConnect: true }));
  });

  it('offers nothing when the server lists no connector for either source', async () => {
    serve({ email: [], calendar: [] });
    const { result } = renderHook(() => useWorkIntroSources());

    await waitFor(() => expect(mockBrowse).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({ offered: false, needsConnect: false });
  });

  it('offers nothing when the sources could not be loaded', async () => {
    mockFetchDirectory.mockRejectedValue(new Error('offline'));
    mockBrowse.mockResolvedValue([]);
    const { result } = renderHook(() => useWorkIntroSources());

    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual({ offered: false, needsConnect: false });
  });

  it.each([
    ['signed out', () => (mockSignedIn = false)],
    ['in Local Mode', () => (mockAppMode = 'local')],
    ['without the connectors capability', () => (mockCapability = false)],
  ])('makes no request %s', async (_name, apply) => {
    serve({ email: [GMAIL], calendar: [CALENDAR] });
    apply();
    const { result } = renderHook(() => useWorkIntroSources());

    expect(result.current).toEqual({ offered: false, needsConnect: false });
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
  });
});
