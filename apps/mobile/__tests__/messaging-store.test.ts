jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  api: {
    delete: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { api } from '../services/api';
import {
  connectMessagingPlatform,
  disconnectMessagingPlatform,
  getMessagingConfig,
  getMessagingStats,
  testConnection,
} from '../src/features/messaging/service';
import { useMessagingStore } from '../src/features/messaging/store';

const mockApi = api as unknown as {
  delete: jest.Mock;
  get: jest.Mock;
  post: jest.Mock;
};

describe('messaging service v1 gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call messaging endpoints while mobile messaging is disabled', async () => {
    expect(() => getMessagingConfig()).toThrow('messaging: not available in v1');
    expect(() => connectMessagingPlatform('slack', { token: 'secret' })).toThrow(
      'messaging: not available in v1',
    );
    expect(() => disconnectMessagingPlatform('slack')).toThrow('messaging: not available in v1');
    expect(() => getMessagingStats('slack')).toThrow('messaging: not available in v1');
    expect(() => testConnection('slack', { token: 'secret' })).toThrow(
      'messaging: not available in v1',
    );

    expect(mockApi.get).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });
});

describe('messaging store persistence', () => {
  beforeEach(() => {
    useMessagingStore.setState({
      platforms: [
        {
          id: 'whatsapp',
          name: 'WhatsApp',
          connected: false,
          connectedAt: null,
          config: {},
          stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
        },
        {
          id: 'telegram',
          name: 'Telegram',
          connected: false,
          connectedAt: null,
          config: {},
          stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
        },
        {
          id: 'slack',
          name: 'Slack',
          connected: false,
          connectedAt: null,
          config: {},
          stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
        },
      ],
      loading: false,
      error: null,
    });
  });

  it('strips legacy persisted platform secrets during rehydrate merge', () => {
    const options = useMessagingStore.persist.getOptions() as {
      merge?: (persistedState: unknown, currentState: unknown) => unknown;
    };

    expect(options.merge).toEqual(expect.any(Function));

    const merged = options.merge!(
      {
        platforms: [
          {
            id: 'slack',
            name: 'Slack',
            connected: true,
            connectedAt: '2026-06-11T00:00:00.000Z',
            config: { token: 'xoxb-secret', signingSecret: 'legacy-secret' },
            stats: { messagesSent: 5, messagesReceived: 3, lastActive: '2026-06-11T00:00:00.000Z' },
          },
        ],
      },
      useMessagingStore.getState(),
    ) as ReturnType<typeof useMessagingStore.getState>;

    const slack = merged.platforms.find((platform) => platform.id === 'slack');
    expect(slack?.connected).toBe(true);
    expect(slack?.connectedAt).toBe('2026-06-11T00:00:00.000Z');
    expect(slack?.stats.messagesSent).toBe(5);
    expect(slack?.config).toEqual({});
  });

  it('does not persist platform configs on fresh writes', () => {
    const options = useMessagingStore.persist.getOptions() as {
      partialize?: (state: unknown) => unknown;
    };

    const persisted = options.partialize!({
      ...useMessagingStore.getState(),
      platforms: [
        {
          id: 'slack',
          name: 'Slack',
          connected: true,
          connectedAt: '2026-06-11T00:00:00.000Z',
          config: { token: 'xoxb-secret' },
          stats: { messagesSent: 1, messagesReceived: 2, lastActive: null },
        },
      ],
    }) as { platforms: Array<{ config: Record<string, string> }> };

    expect(persisted.platforms[0]?.config).toEqual({});
  });
});
