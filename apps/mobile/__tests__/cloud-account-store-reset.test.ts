jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/features/schedules/service', () => ({
  fetchSchedules: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  toggleSchedule: jest.fn(),
  fetchScheduleRuns: jest.fn(),
}));

jest.mock('../src/features/messaging/service', () => ({
  getMessagingConfig: jest.fn(),
  connectMessagingPlatform: jest.fn(),
  disconnectMessagingPlatform: jest.fn(),
}));

import { useScheduleStore } from '../src/features/schedules/store';
import { useMessagingStore } from '../src/features/messaging/store';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

/* eslint-disable @typescript-eslint/no-require-imports */
const scheduleService = require('../src/features/schedules/service') as {
  fetchSchedules: jest.Mock;
};
const messagingService = require('../src/features/messaging/service') as {
  getMessagingConfig: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('Cloud account store resets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useScheduleStore.getState().clearAccountSchedules();
    useMessagingStore.getState().clearAccountMessaging();
    useChatViewStore.getState().clearCloudSearchState();
  });

  it('clears schedules, run history, and transient request state', () => {
    useScheduleStore.setState({
      schedules: [{ id: 'account-a-schedule' }] as never,
      runsBySchedule: { 'account-a-schedule': [{ id: 'run-a' }] } as never,
      runsLoadingBySchedule: { 'account-a-schedule': true },
      runsErrorBySchedule: { 'account-a-schedule': 'private error' },
      loading: true,
      error: 'private error',
    });

    useScheduleStore.getState().clearAccountSchedules();

    expect(useScheduleStore.getState()).toMatchObject({
      schedules: [],
      runsBySchedule: {},
      runsLoadingBySchedule: {},
      runsErrorBySchedule: {},
      loading: false,
      error: null,
    });
  });

  it('clears legacy messaging connection metadata and stats', () => {
    useMessagingStore.setState((state) => ({
      platforms: state.platforms.map((platform, index) =>
        index === 0
          ? {
              ...platform,
              connected: true,
              connectedAt: '2026-07-26T00:00:00.000Z',
              config: { secret: 'must-not-persist' },
              stats: { messagesSent: 7, messagesReceived: 9, lastActive: 'account-a' },
            }
          : platform,
      ),
      loading: true,
      error: 'account-a error',
    }));

    useMessagingStore.getState().clearAccountMessaging();

    expect(useMessagingStore.getState().platforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'whatsapp',
          connected: false,
          connectedAt: null,
          config: {},
          stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
        }),
      ]),
    );
    expect(useMessagingStore.getState()).toMatchObject({ loading: false, error: null });
  });

  it('cancels account search state without resetting device chat preferences', () => {
    useChatViewStore.setState({
      searchQuery: 'account A secret',
      searchResults: [
        { conversationId: 'account-a-chat', messageId: 'message-a', snippet: 'secret' },
      ],
      isSearching: true,
      chatStyle: 'detailed',
      toolAccess: 'always',
    });

    useChatViewStore.getState().clearCloudSearchState();

    expect(useChatViewStore.getState()).toMatchObject({
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      chatStyle: 'detailed',
      toolAccess: 'always',
    });
  });

  it('ignores a stale account-A schedule response after account B becomes active', async () => {
    let resolveAccountA!: (value: unknown[]) => void;
    scheduleService.fetchSchedules.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAccountA = resolve;
      }),
    );

    const pending = useScheduleStore.getState().fetchSchedules();
    activateCloudAccount('account-b');
    useScheduleStore.getState().clearAccountSchedules();
    resolveAccountA([{ id: 'account-a-schedule' }]);
    await pending;

    expect(useScheduleStore.getState()).toMatchObject({
      schedules: [],
      loading: false,
      error: null,
    });
  });

  it('ignores a stale account-A messaging response after account B becomes active', async () => {
    let resolveAccountA!: (value: unknown) => void;
    messagingService.getMessagingConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAccountA = resolve;
      }),
    );

    const pending = useMessagingStore.getState().fetchPlatforms();
    activateCloudAccount('account-b');
    useMessagingStore.getState().clearAccountMessaging();
    resolveAccountA({
      connections: [
        {
          platform: 'whatsapp',
          is_active: true,
          connected_at: '2026-07-26T00:00:00.000Z',
        },
      ],
    });
    await pending;

    expect(useMessagingStore.getState().platforms[0]).toMatchObject({
      id: 'whatsapp',
      connected: false,
      connectedAt: null,
    });
    expect(useMessagingStore.getState()).toMatchObject({ loading: false, error: null });
  });
});
