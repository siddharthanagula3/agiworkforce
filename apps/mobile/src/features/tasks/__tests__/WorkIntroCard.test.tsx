/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

let mockAppMode = 'cloud';
let mockSignedIn = true;
let mockCapability = true;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
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

import { WorkIntroCard } from '../components/WorkIntroCard';

const READ_LINE = 'AGI Work can read your email and calendar when you connect them';

function listing(id: string, name: string, personalSources: string[]) {
  return { id, name, connectable: 'connect', personalSources };
}

function connection(connectorId: string, overrides = {}) {
  return { id: `c-${connectorId}`, connectorId, source: 'managed', ...overrides };
}

function serve(listings: Record<string, unknown[]>, connections: unknown[] = []) {
  mockFetchDirectory.mockResolvedValue({ connectors: connections });
  mockBrowse.mockImplementation(async (source: string) => listings[source] ?? []);
}

const GMAIL = listing('gmail', 'Gmail', ['email']);
const GOOGLE_CALENDAR = listing('google-calendar', 'Google Calendar', ['calendar']);

function renderCard() {
  const onNewTask = jest.fn();
  const onConnectSources = jest.fn();
  const screen = render(
    <WorkIntroCard onNewTask={onNewTask} onConnectSources={onConnectSources} />,
  );
  return { ...screen, onNewTask, onConnectSources };
}

describe('AGI Work intro card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppMode = 'cloud';
    mockSignedIn = true;
    mockCapability = true;
    mockCalendarStatus.mockResolvedValue('denied');
  });

  it('hands off a task and offers to connect email and calendar when neither is connected', async () => {
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] });
    const screen = renderCard();

    expect(screen.getByText('Hand off a task')).toBeTruthy();
    expect(await screen.findByText(READ_LINE)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('New task'));
    expect(screen.onNewTask).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Connect email and calendar'));
    expect(screen.onConnectSources).toHaveBeenCalledTimes(1);
  });

  it('keeps offering the connection while only one of the two is connected', async () => {
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] }, [connection('gmail')]);
    const screen = renderCard();

    expect(await screen.findByLabelText('Connect email and calendar')).toBeTruthy();
  });

  it('drops the connect control once both are connected', async () => {
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] }, [
      connection('gmail'),
      connection('google-calendar'),
    ]);
    const screen = renderCard();

    expect(await screen.findByText(READ_LINE)).toBeTruthy();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
    expect(screen.getByLabelText('New task')).toBeTruthy();
  });

  it('keeps offering the connection when only the calendar on the phone is allowed, because AGI Work cannot read it', async () => {
    mockCalendarStatus.mockResolvedValue('granted');
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] }, [connection('gmail')]);
    const screen = renderCard();

    expect(await screen.findByLabelText('Connect email and calendar')).toBeTruthy();
  });

  it('claims nothing when the only calendar option is the phone itself', async () => {
    mockCalendarStatus.mockResolvedValue('granted');
    serve({ email: [], calendar: [{ ...GOOGLE_CALENDAR, connectable: 'unavailable' }] });
    const screen = renderCard();

    await waitFor(() => expect(mockBrowse).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(READ_LINE)).toBeNull();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
  });

  it('does not count a connection that needs reauthorization as connected', async () => {
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] }, [
      connection('gmail', { needsReauthorization: true }),
      connection('google-calendar'),
    ]);
    const screen = renderCard();

    expect(await screen.findByLabelText('Connect email and calendar')).toBeTruthy();
  });

  it('shows only the heading and New task until the sources are known', async () => {
    serve({ email: [GMAIL], calendar: [GOOGLE_CALENDAR] });
    const screen = renderCard();

    expect(screen.queryByText(READ_LINE)).toBeNull();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
    expect(screen.getByLabelText('New task')).toBeTruthy();
    await screen.findByText(READ_LINE);
  });

  it('claims nothing about email and calendar when the sources cannot be loaded', async () => {
    mockFetchDirectory.mockRejectedValue(new Error('offline'));
    mockBrowse.mockResolvedValue([]);
    const screen = renderCard();

    await waitFor(() => expect(mockFetchDirectory).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(READ_LINE)).toBeNull();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
    expect(screen.getByLabelText('New task')).toBeTruthy();
  });

  it('claims nothing when the server offers no email or calendar source', async () => {
    serve({ email: [], calendar: [] });
    mockCalendarStatus.mockResolvedValue('undetermined');
    const screen = renderCard();

    await waitFor(() => expect(mockBrowse).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(READ_LINE)).toBeNull();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
  });

  it.each([
    ['Local mode', () => (mockAppMode = 'local')],
    ['a signed-out account', () => (mockSignedIn = false)],
    ['an account without connectors', () => (mockCapability = false)],
  ])('reads no sources and offers no connection in %s', async (_name, apply) => {
    apply();
    const screen = renderCard();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchDirectory).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(screen.queryByText(READ_LINE)).toBeNull();
    expect(screen.queryByLabelText('Connect email and calendar')).toBeNull();
    expect(screen.getByText('Hand off a task')).toBeTruthy();
  });
});
