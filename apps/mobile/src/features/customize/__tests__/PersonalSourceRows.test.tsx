/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockAppMode = 'cloud';
let mockSignedIn = true;
let mockCapability = true;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
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

import { PersonalSourceRows } from '../PersonalSourceRows';

function listing(id: string, name: string, personalSources: string[] | undefined) {
  return {
    id,
    name,
    connectable: 'connect',
    ...(personalSources ? { personalSources } : {}),
  };
}

function connection(connectorId: string, overrides = {}) {
  return { id: `c-${connectorId}`, connectorId, source: 'managed', ...overrides };
}

function serve(listings: Record<string, unknown[]>, connections: unknown[] = []) {
  mockFetchDirectory.mockResolvedValue({ connectors: connections });
  mockBrowse.mockImplementation(async (source: string) => listings[source] ?? []);
}

describe('personal source rows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockSignedIn = true;
    mockCapability = true;
    mockCalendarStatus.mockResolvedValue('denied');
  });

  it('shows Email and Calendar as Connect when nothing is connected', async () => {
    serve({
      email: [listing('gmail', 'Gmail', ['email'])],
      calendar: [listing('google-calendar', 'Google Calendar', ['calendar'])],
    });
    const screen = render(<PersonalSourceRows />);
    expect(await screen.findByLabelText('Email. Connect')).toBeTruthy();
    expect(screen.getByLabelText('Calendar. Connect')).toBeTruthy();
  });

  it('shows Connected when a matching connector is connected and opens it directly', async () => {
    serve({ email: [listing('gmail', 'Gmail', ['email'])], calendar: [] }, [connection('gmail')]);
    const screen = render(<PersonalSourceRows />);
    fireEvent.press(await screen.findByLabelText('Email. Connected'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'gmail' },
    });
  });

  it('does not count a connection that needs reauthorization as connected', async () => {
    serve({ email: [listing('gmail', 'Gmail', ['email'])], calendar: [] }, [
      connection('gmail', { needsReauthorization: true }),
    ]);
    const screen = render(<PersonalSourceRows />);
    expect(await screen.findByLabelText('Email. Connect')).toBeTruthy();
  });

  it('offers a choice when several sources match', async () => {
    serve({
      email: [listing('gmail', 'Gmail', ['email']), listing('outlook', 'Outlook', ['email'])],
      calendar: [],
    });
    const screen = render(<PersonalSourceRows />);
    fireEvent.press(await screen.findByLabelText('Email. Connect'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Email: Outlook. Not connected'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/connectors/[id]',
      params: { id: 'outlook' },
    });
  });

  it('counts the phone calendar permission as a calendar source', async () => {
    mockCalendarStatus.mockResolvedValue('granted');
    serve({ email: [], calendar: [listing('google-calendar', 'Google Calendar', ['calendar'])] });
    const screen = render(<PersonalSourceRows />);
    fireEvent.press(await screen.findByLabelText('Calendar. Connected'));
    fireEvent.press(screen.getByLabelText('Calendar: Calendar on this phone. Connected'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/integrations');
  });

  it('shows neither row when the server sends no personal source field', async () => {
    serve({
      email: [listing('gmail', 'Gmail', undefined)],
      calendar: [listing('google-calendar', 'Google Calendar', undefined)],
    });
    const screen = render(<PersonalSourceRows />);
    await waitFor(() => expect(mockBrowse).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText(/^Email\./)).toBeNull();
    expect(screen.queryByLabelText(/^Calendar\./)).toBeNull();
  });

  it('shows an error with a retry when loading fails', async () => {
    mockFetchDirectory.mockRejectedValueOnce(new Error('offline'));
    mockBrowse.mockResolvedValue([]);
    const screen = render(<PersonalSourceRows />);
    expect(await screen.findByText('Could not load your email and calendar sources.')).toBeTruthy();
    serve({ email: [listing('gmail', 'Gmail', ['email'])], calendar: [] });
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('Email. Connect')).toBeTruthy();
  });

  it('fetches nothing and shows nothing in Local mode', async () => {
    mockAppMode = 'local';
    const screen = render(<PersonalSourceRows />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(screen.toJSON()).toBeNull();
  });

  it('shows nothing when connectors are not allowed for the account', async () => {
    mockCapability = false;
    const screen = render(<PersonalSourceRows />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(screen.toJSON()).toBeNull();
  });
});
