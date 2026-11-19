/* eslint-disable @typescript-eslint/no-require-imports */
const mockKeychain = new Map<string, string>();
const mockMmkvValues = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (name: string) => mockKeychain.get(name) ?? null),
  setItemAsync: jest.fn(async (name: string, value: string) => {
    mockKeychain.set(name, value);
  }),
  deleteItemAsync: jest.fn(async (name: string) => {
    mockKeychain.delete(name);
  }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
    getAllKeys: () => [...mockMmkvValues.keys()],
    clearAll: () => mockMmkvValues.clear(),
  })),
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    uploadFile: jest.fn(),
  },
  ApiPaywallError: class MockApiPaywallError extends Error {},
}));

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SET_ASIDE_MARKER } from '../storage/unreadableFiles';
import { SYNTHETIC_CLOUD_MODEL_ID, SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';
import type { ChatMessage } from '../types/chat';

const LOCAL_STORE_KEY = 'chat-message-store-local';
const CLOUD_STORE_KEY = 'chat-message-store-cloud';
const UNREADABLE = '{"state":';

function setAsideCopies(name: string): string[] {
  return [...mockMmkvValues.keys()].filter((key) => key.startsWith(`${name}${SET_ASIDE_MARKER}`));
}

type MmkvModule = typeof import('../lib/mmkv');
type ChatMessageStoreModule = typeof import('../stores/chat/chatMessageStore');
type CloudMessageStoreModule = typeof import('../stores/chat/chatCloudMessageStore');
type AccountSessionModule = typeof import('../src/features/auth/services/cloudAccountSession');
type HistoryLoadModule = typeof import('../stores/chat/cloudHistoryLoad');
type DeleteLocalChatsModule =
  typeof import('../src/features/settings/data-controls/deleteLocalChats');
type LocalDataSnapshotModule =
  typeof import('../src/features/settings/data-controls/localDataSnapshot');

function loadMmkv(): MmkvModule {
  jest.resetModules();
  return require('../lib/mmkv') as MmkvModule;
}

function loadLocalStore(): ChatMessageStoreModule['useChatMessageStore'] {
  return (require('../stores/chat/chatMessageStore') as ChatMessageStoreModule).useChatMessageStore;
}

function loadCloudStore(): CloudMessageStoreModule['useChatCloudMessageStore'] {
  return (require('../stores/chat/chatCloudMessageStore') as CloudMessageStoreModule)
    .useChatCloudMessageStore;
}

async function coldStart(): Promise<ChatMessageStoreModule['useChatMessageStore']> {
  const mmkv = loadMmkv();
  const store = loadLocalStore();
  await mmkv.initMmkvEncryption();
  return store;
}

function message(
  conversationId: string,
  id: string,
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
    model: SYNTHETIC_LOCAL_MODEL_ID,
    ...extra,
  };
}

async function writeLocalChat(
  store: ChatMessageStoreModule['useChatMessageStore'],
  title: string,
): Promise<string> {
  const id = await store.getState().createConversation(title);
  store.getState().appendVoiceTurn(id, {
    id: `${id}-user`,
    role: 'user',
    content: title,
    model: SYNTHETIC_LOCAL_MODEL_ID,
  });
  store.getState().appendVoiceTurn(id, {
    id: `${id}-assistant`,
    role: 'assistant',
    content: `Answer to ${title}`,
    model: SYNTHETIC_LOCAL_MODEL_ID,
  });
  return id;
}

function appendToChat(
  store: ChatMessageStoreModule['useChatMessageStore'],
  id: string,
  messages: ChatMessage[],
): void {
  store.setState((state) => ({
    messages: { ...state.messages, [id]: [...(state.messages[id] ?? []), ...messages] },
  }));
}

beforeEach(() => {
  mockKeychain.clear();
  mockMmkvValues.clear();
});

describe('Local chats across an app restart', () => {
  it('reads a Local chat and its messages back after a cold start', async () => {
    const first = await coldStart();
    const id = await writeLocalChat(first, 'Hello!');
    expect(mockMmkvValues.get(LOCAL_STORE_KEY)).toContain('Answer to Hello!');

    const second = await coldStart();

    expect(second.getState().conversations.map((c) => c.id)).toEqual([id]);
    expect(second.getState().conversations[0]?.title).toBe('Hello!');
    expect(second.getState().messages[id]?.map((m) => m.content)).toEqual([
      'Hello!',
      'Answer to Hello!',
    ]);
    expect(second.getState().currentConversationId).toBe(id);
  });

  it('keeps a chat with a picture and a chat whose answer was stopped', async () => {
    const first = await coldStart();
    const pictureChat = await first.getState().createConversation('Picture');
    const picture = {
      url: 'file:///documents/chat-attachments/picture/a1/kite.jpg',
      mimeType: 'image/jpeg',
      fileName: 'kite.jpg',
      fileSize: 2048,
    };
    appendToChat(first, pictureChat, [
      message(pictureChat, 'picture-user', 'user', 'What is this?', { attachments: [picture] }),
      message(pictureChat, 'picture-assistant', 'assistant', 'A kite.'),
    ]);
    const stoppedChat = await first.getState().createConversation('Story');
    appendToChat(first, stoppedChat, [
      message(stoppedChat, 'story-user', 'user', 'Tell me a story'),
      message(stoppedChat, 'story-assistant', 'assistant', 'Once upon a time', {
        isStreaming: true,
      }),
    ]);

    const second = await coldStart();

    expect(
      second
        .getState()
        .conversations.map((c) => c.id)
        .sort(),
    ).toEqual([pictureChat, stoppedChat].sort());
    expect(second.getState().messages[pictureChat]?.[0]?.attachments).toEqual([picture]);
    const story = second.getState().messages[stoppedChat] ?? [];
    expect(story.map((m) => m.content)).toEqual(['Tell me a story', 'Once upon a time']);
    expect(story[1]?.isStreaming).toBe(false);
    expect(story[1]?.metadata?.finishReason).toBe('stopped');
  });

  it('keeps Local chats when the app changes account and loads history while the store opens', async () => {
    const first = await coldStart();
    const id = await writeLocalChat(first, 'Hello!');

    const mmkv = loadMmkv();
    const session =
      require('../src/features/auth/services/cloudAccountSession') as AccountSessionModule;
    const historyLoad = require('../stores/chat/cloudHistoryLoad') as HistoryLoadModule;
    mmkv.whenMmkvReady(() => {
      loadLocalStore().getState().setCurrentConversationId(null);
      historyLoad.publishCloudHistoryLoading();
    });
    const second = loadLocalStore();
    session.invalidateCloudAccount();
    void second.getState().loadConversations();
    await mmkv.initMmkvEncryption();

    expect(second.getState().conversations.map((c) => c.id)).toEqual([id]);
    expect(second.getState().messages[id]).toHaveLength(2);
    expect(
      JSON.parse(mockMmkvValues.get(LOCAL_STORE_KEY) ?? '{}').state.conversations,
    ).toHaveLength(1);
  });

  it('copies unreadable saved chats aside and keeps the chats made after', async () => {
    mockKeychain.set('agi_mmkv_encryption_key_v2', 'k'.repeat(16));
    mockMmkvValues.set(LOCAL_STORE_KEY, UNREADABLE);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const store = await coldStart();
    const id = await writeLocalChat(store, 'After a failed read');

    const copies = setAsideCopies(LOCAL_STORE_KEY);
    expect(copies.map((key) => mockMmkvValues.get(key))).toEqual([UNREADABLE]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'chat-message-store-local did not rehydrate, so its saved state was copied aside',
      ),
    );

    const second = await coldStart();
    expect(second.getState().conversations.map((c) => c.id)).toEqual([id]);
    expect(second.getState().messages[id]).toHaveLength(2);
    expect(setAsideCopies(LOCAL_STORE_KEY)).toEqual(copies);
    warn.mockRestore();
  });

  it('copies an unreadable value aside once however many launches fail to read it', async () => {
    mockKeychain.set('agi_mmkv_encryption_key_v2', 'k'.repeat(16));
    mockMmkvValues.set(LOCAL_STORE_KEY, UNREADABLE);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await coldStart();
    await coldStart();
    await coldStart();

    expect(setAsideCopies(LOCAL_STORE_KEY)).toHaveLength(1);
    expect(mockMmkvValues.get(LOCAL_STORE_KEY)).toBe(UNREADABLE);
    warn.mockRestore();
  });

  it('does not save the Local chats again when the history load state has not changed', async () => {
    const first = await coldStart();
    await writeLocalChat(first, 'Hello!');
    await coldStart();
    const historyLoad = require('../stores/chat/cloudHistoryLoad') as HistoryLoadModule;
    const set = jest.spyOn(mockMmkvValues, 'set');

    historyLoad.publishCloudHistoryLoading();

    expect(set.mock.calls.filter(([key]) => key === LOCAL_STORE_KEY)).toEqual([]);
    set.mockRestore();
  });

  it('keeps cached Cloud chats beside the Local ones', async () => {
    const mmkv = loadMmkv();
    const cloud = loadCloudStore();
    const local = loadLocalStore();
    await mmkv.initMmkvEncryption();
    const localId = await writeLocalChat(local, 'Hello!');
    const now = new Date().toISOString();
    cloud.getState().addCloudConversation({
      id: '0190a000-0000-7000-8000-0000000000c1',
      title: 'Cloud chat',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      pinned: false,
      model: SYNTHETIC_CLOUD_MODEL_ID,
      provider: 'cloud_managed',
      executionMode: 'cloud',
      temporary: false,
    });
    expect(mockMmkvValues.get(CLOUD_STORE_KEY)).toContain('Cloud chat');

    const reopened = loadMmkv();
    const cloudAgain = loadCloudStore();
    const localAgain = loadLocalStore();
    await reopened.initMmkvEncryption();

    expect(cloudAgain.getState().conversations.map((c) => c.title)).toEqual(['Cloud chat']);
    expect(localAgain.getState().conversations.map((c) => c.id)).toEqual([localId]);
  });

  it('stays empty after Delete all chats', async () => {
    const first = await coldStart();
    await writeLocalChat(first, 'First');
    await writeLocalChat(first, 'Second');
    const { deleteAllLocalChats } =
      require('../src/features/settings/data-controls/deleteLocalChats') as DeleteLocalChatsModule;

    await expect(deleteAllLocalChats()).resolves.toBe(2);

    const second = await coldStart();
    expect(second.getState().conversations).toEqual([]);
    expect(second.getState().messages).toEqual({});
  });

  it('stays empty after the Local data is erased', async () => {
    const mmkv = loadMmkv();
    const first = loadLocalStore();
    await mmkv.initMmkvEncryption();
    await writeLocalChat(first, 'Hello!');
    const { resetLocalInMemoryState } =
      require('../src/features/settings/data-controls/localDataSnapshot') as LocalDataSnapshotModule;

    mmkv.storage.clearAll();
    await resetLocalInMemoryState();

    const second = await coldStart();
    expect(second.getState().conversations).toEqual([]);
    expect(second.getState().messages).toEqual({});
  });
});

describe('a persisted store around its rehydrate', () => {
  const FIXTURE_KEY = 'fixture-counter-store';

  function counterStore(mmkv: MmkvModule) {
    const store = create<{ count: number }>()(
      persist(() => ({ count: 0 }), {
        name: FIXTURE_KEY,
        version: 1,
        storage: createJSONStorage(() => mmkv.mmkvStorage),
        skipHydration: true,
        migrate: (persisted) => ({ count: (persisted as { count: number }).count + 10 }),
      }),
    );
    mmkv.rehydrateWhenMmkvReady(store, FIXTURE_KEY);
    return store;
  }

  it('saves the migrated state once the rehydrate succeeds', async () => {
    mockMmkvValues.set(FIXTURE_KEY, JSON.stringify({ state: { count: 1 }, version: 0 }));
    const mmkv = loadMmkv();
    const early: { writer?: ReturnType<typeof counterStore> } = {};
    mmkv.whenMmkvReady(() => early.writer?.setState({ count: 0 }));
    const store = counterStore(mmkv);
    early.writer = store;

    await mmkv.initMmkvEncryption();

    expect(store.getState().count).toBe(11);
    expect(JSON.parse(mockMmkvValues.get(FIXTURE_KEY) ?? '{}')).toEqual({
      state: { count: 11 },
      version: 1,
    });
    store.setState({ count: 12 });
    expect(JSON.parse(mockMmkvValues.get(FIXTURE_KEY) ?? '{}').state.count).toBe(12);
  });

  it('copies aside a state its migration rejects and opens the stores queued after it', async () => {
    const stored = JSON.stringify({ state: { count: 1 }, version: 0 });
    mockMmkvValues.set(FIXTURE_KEY, stored);
    mockMmkvValues.set('fixture-after', JSON.stringify({ state: { count: 7 }, version: 0 }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mmkv = loadMmkv();
    const failing = create<{ count: number }>()(
      persist(() => ({ count: 0 }), {
        name: FIXTURE_KEY,
        version: 1,
        storage: createJSONStorage(() => mmkv.mmkvStorage),
        skipHydration: true,
        migrate: () => {
          throw new Error('cannot migrate');
        },
        onRehydrateStorage: () => (_state, error) => {
          if (error) throw error;
        },
      }),
    );
    mmkv.rehydrateWhenMmkvReady(failing, FIXTURE_KEY);
    const after = create<{ count: number }>()(
      persist(() => ({ count: 0 }), {
        name: 'fixture-after',
        storage: createJSONStorage(() => mmkv.mmkvStorage),
        skipHydration: true,
      }),
    );
    mmkv.rehydrateWhenMmkvReady(after, 'fixture-after');

    await mmkv.initMmkvEncryption();

    expect(after.getState().count).toBe(7);
    expect(setAsideCopies(FIXTURE_KEY).map((key) => mockMmkvValues.get(key))).toEqual([stored]);
    failing.setState({ count: 3 });
    expect(JSON.parse(mockMmkvValues.get(FIXTURE_KEY) ?? '{}')).toEqual({
      state: { count: 3 },
      version: 1,
    });
    warn.mockRestore();
  });
});
