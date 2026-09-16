jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/managedCloudChat', () => ({
  managedCloudChat: {
    listConversations: jest.fn(),
    createConversation: jest.fn(),
    getConversation: jest.fn(),
    updateConversation: jest.fn(),
    deleteConversation: jest.fn(),
  },
}));

import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import { requireLocalModel } from '../test-utils/modelFixtures';

const T = '2026-06-20T00:00:00.000Z';
const LOCAL_MODEL_ID = requireLocalModel().id;

interface PersistedLocalState {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
}

function localConversation(id: string): ConversationSummary {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: T,
    updatedAt: T,
    messageCount: 0,
    pinned: false,
    model: LOCAL_MODEL_ID,
    provider: 'local',
    executionMode: 'local',
  };
}

function message(
  id: string,
  conversationId: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    conversationId,
    role: 'assistant',
    content: `body ${id}`,
    createdAt: T,
    model: LOCAL_MODEL_ID,
    ...extra,
  };
}

function persistedLocal(): PersistedLocalState {
  const partialize = useChatMessageStore.persist.getOptions().partialize;
  if (!partialize) throw new Error('local store persistence must define partialize');
  return partialize(useChatMessageStore.getState()) as unknown as PersistedLocalState;
}

function persistedCloud(): PersistedLocalState {
  const partialize = useChatCloudMessageStore.persist.getOptions().partialize;
  if (!partialize) throw new Error('cloud store persistence must define partialize');
  return partialize(useChatCloudMessageStore.getState()) as unknown as PersistedLocalState;
}

beforeEach(() => {
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
});

describe('local chat persistence never drops data silently', () => {
  it('persists every local conversation, past the old 200 cap', () => {
    const conversations = Array.from({ length: 260 }, (_, index) =>
      localConversation(`c-${index}`),
    );
    useChatMessageStore.setState({ conversations, messages: {} });

    const persisted = persistedLocal();

    expect(persisted.conversations).toHaveLength(260);
    expect(persisted.conversations.map((c) => c.id)).toContain('c-259');
  });

  it('persists every message in a conversation, past the old 100 cap', () => {
    const messages = Array.from({ length: 180 }, (_, index) => message(`m-${index}`, 'c-1'));
    useChatMessageStore.setState({
      conversations: [localConversation('c-1')],
      messages: { 'c-1': messages },
    });

    const persisted = persistedLocal();

    expect(persisted.messages['c-1']).toHaveLength(180);
    expect(persisted.messages['c-1'][0].id).toBe('m-0');
  });

  it('still leaves temporary and cloud conversations out of local storage', () => {
    useChatMessageStore.setState({
      conversations: [
        localConversation('keep'),
        { ...localConversation('temp'), temporary: true },
        { ...localConversation('cloud'), provider: 'agi-cloud', executionMode: 'cloud' },
      ],
      messages: {},
    });

    expect(persistedLocal().conversations.map((c) => c.id)).toEqual(['keep']);
  });
});

describe('an interrupted media generation resolves on relaunch', () => {
  it('writes an in-flight local image generation as failed with an error to show', () => {
    useChatMessageStore.setState({
      conversations: [localConversation('c-1')],
      messages: {
        'c-1': [
          message('m-1', 'c-1', {
            isGeneratingImage: true,
            imageGenStatus: 'generating',
            imageGenPrompt: 'a cat',
          }),
        ],
      },
    });

    const persistedMessage = persistedLocal().messages['c-1'][0];

    expect(persistedMessage.isGeneratingImage).toBe(false);
    expect(persistedMessage.imageGenStatus).toBe('failed');
    expect(persistedMessage.imageGenError).toEqual(expect.stringContaining('app closed'));
  });

  it('writes an in-flight cloud video generation as failed instead of a frozen bar', () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: 'cloud-1',
      title: 'Cloud',
      createdAt: T,
      updatedAt: T,
      messageCount: 0,
      pinned: false,
    });
    useChatCloudMessageStore.getState().setCloudMessages('cloud-1', [
      message('m-1', 'cloud-1', {
        isGeneratingVideo: true,
        videoGenStatus: 'processing',
        videoGenProgress: 40,
        videoGenCancelRequested: true,
      }),
    ]);

    const persistedMessage = persistedCloud().messages['cloud-1'][0];

    expect(persistedMessage.isGeneratingVideo).toBe(false);
    expect(persistedMessage.videoGenStatus).toBe('failed');
    expect(persistedMessage.videoGenCancelRequested).toBe(false);
    expect(persistedMessage.videoGenError).toEqual(expect.stringContaining('app closed'));
  });

  it('leaves a settled generation untouched', () => {
    useChatMessageStore.setState({
      conversations: [localConversation('c-1')],
      messages: {
        'c-1': [
          message('m-1', 'c-1', {
            isGeneratingImage: false,
            imageGenStatus: 'completed',
            imageUrl: 'file:///image.png',
          }),
        ],
      },
    });

    const persistedMessage = persistedLocal().messages['c-1'][0];

    expect(persistedMessage.imageGenStatus).toBe('completed');
    expect(persistedMessage.imageGenError).toBeUndefined();
  });
});

describe('stopping an image generation', () => {
  it('settles the message and refuses a late completion for it', () => {
    useChatMessageStore.setState({
      conversations: [localConversation('c-1')],
      messages: {
        'c-1': [message('m-1', 'c-1', { isGeneratingImage: true, imageGenStatus: 'generating' })],
      },
    });

    useChatMessageStore.getState().stopImageGeneration('c-1', 'm-1');

    const stopped = useChatMessageStore.getState().messages['c-1'][0];
    expect(stopped.isGeneratingImage).toBe(false);
    expect(stopped.imageGenStatus).toBe('failed');

    useChatMessageStore
      .getState()
      .completeImageGeneration('c-1', 'm-1', { imageUrl: 'file:///late.png' });

    expect(useChatMessageStore.getState().messages['c-1'][0].imageUrl).toBeUndefined();
  });
});
