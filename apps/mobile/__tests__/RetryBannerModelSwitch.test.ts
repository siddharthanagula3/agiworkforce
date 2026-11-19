jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import {
  clearCloudExecutionState,
  noteBannerModelSwitch,
  useChatExecutionStore,
} from '../stores/chat/chatExecutionStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useModelStore } from '../src/features/model-picker/store';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import type { ChatMessage } from '../types/chat';

const FAILED_MODEL = requireMobileCloudModel().id;
const CHOSEN_MODEL = requireMobileCloudModel(
  (model) => model.id !== FAILED_MODEL,
  'second Mobile Cloud model',
).id;

const realSendMessage = useChatExecutionStore.getState().sendMessage;
const sendMessage = jest.fn(async () => true);

let conversationCount = 0;
let CONV_ID = '';

function seedFailedTurn(): void {
  const turn: ChatMessage[] = [
    {
      id: 'u1',
      conversationId: CONV_ID,
      role: 'user',
      content: 'the question',
      createdAt: '2026-11-15T00:00:00.000Z',
      model: FAILED_MODEL,
    },
    {
      id: 'a1',
      conversationId: CONV_ID,
      role: 'assistant',
      content: '',
      createdAt: '2026-11-15T00:00:01.000Z',
      model: FAILED_MODEL,
      status: 'error',
    },
  ];
  useChatMessageStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: 'Retry',
        createdAt: '2026-11-15T00:00:00.000Z',
        updatedAt: '2026-11-15T00:00:01.000Z',
        messageCount: turn.length,
        pinned: false,
        model: FAILED_MODEL,
        executionMode: 'local',
      },
    ],
    messages: { [CONV_ID]: turn },
  });
}

function retriedWith(): string | undefined {
  return (sendMessage.mock.calls.at(-1) as unknown[] | undefined)?.[2] as string | undefined;
}

describe('Retry after the failure banner offered another model', () => {
  beforeEach(() => {
    sendMessage.mockClear();
    useChatExecutionStore.setState({ sendMessage, retryAttempts: {}, error: null });
    useModelStore.setState({ selectedModel: FAILED_MODEL });
    conversationCount += 1;
    CONV_ID = `conv-retry-model-${conversationCount}`;
    seedFailedTurn();
  });

  afterAll(() => {
    useChatExecutionStore.setState({ sendMessage: realSendMessage });
  });

  it('runs on the model picked through Switch model', () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');

    expect(retriedWith()).toBe(CHOSEN_MODEL);
  });

  it('keeps the failed turn model when Retry comes before any switch', () => {
    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');
    expect(retriedWith()).toBe(FAILED_MODEL);

    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });
    seedFailedTurn();
    useChatExecutionStore.setState({ retryAttempts: {} });
    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');
    expect(retriedWith()).toBe(CHOSEN_MODEL);
  });

  it('ignores a model changed somewhere other than the banner', () => {
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');

    expect(retriedWith()).toBe(FAILED_MODEL);
  });

  it('keeps the failed turn model when the picker closed on the same model', () => {
    noteBannerModelSwitch(CONV_ID);

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');

    expect(retriedWith()).toBe(FAILED_MODEL);
  });

  it('keeps the chosen model for a second retry of the turn that still failed', () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });
    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');
    expect(retriedWith()).toBe(CHOSEN_MODEL);

    seedFailedTurn();
    useChatExecutionStore.setState({ retryAttempts: {} });
    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');
    expect(retriedWith()).toBe(CHOSEN_MODEL);
  });

  it('runs a retry of the question on the chosen model', () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'u1');

    expect(retriedWith()).toBe(CHOSEN_MODEL);
  });

  it('keeps the chosen model when the first attempt was refused before it was sent', async () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });
    sendMessage.mockResolvedValueOnce(false);
    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');
    await new Promise((resolve) => setImmediate(resolve));
    sendMessage.mockClear();

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'u1');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(retriedWith()).toBe(CHOSEN_MODEL);
  });

  it('lets an explicit model override win over the banner choice', () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1', FAILED_MODEL);

    expect(retriedWith()).toBe(FAILED_MODEL);
  });

  it('forgets the banner choice when the cloud account is cleared', () => {
    noteBannerModelSwitch(CONV_ID);
    useModelStore.setState({ selectedModel: CHOSEN_MODEL });
    clearCloudExecutionState();

    useChatExecutionStore.getState().retryMessage(CONV_ID, 'a1');

    expect(retriedWith()).toBe(FAILED_MODEL);
  });
});
