jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      uploadFile: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));
jest.mock('../services/llmGate', () => ({
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

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

import { Alert } from 'react-native';
import { api } from '../services/api';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { managedCloudChat } from '../services/managedCloudChat';
import { syncNow } from '../services/cloudSyncEngine';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ChatMessage, MessageAttachment } from '../types/chat';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000e1';
const LIBRARY_ASSET_ID = '0190a000-0000-7000-8000-0000000000f1';
const DEVICE_ASSET_ID = '0190a000-0000-7000-8000-0000000000f2';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const QUESTION = 'What flowers are these?';

const libraryAsset = {
  id: `library-${LIBRARY_ASSET_ID}`,
  uri: `/api/files/${LIBRARY_ASSET_ID}`,
  mimeType: 'image/jpeg',
  fileName: 'flowers.jpg',
  fileSize: 2048,
  assetId: LIBRARY_ASSET_ID,
};

const uploadedDeviceFile = {
  id: 'attachment-device-1',
  uri: `/api/files/${DEVICE_ASSET_ID}`,
  mimeType: 'image/png',
  fileName: 'IMG_0042.png',
  fileSize: 4096,
  assetId: DEVICE_ASSET_ID,
};

const storedAttachments: MessageAttachment[] = [
  {
    url: libraryAsset.uri,
    mimeType: libraryAsset.mimeType,
    fileName: libraryAsset.fileName,
    fileSize: libraryAsset.fileSize,
    assetId: LIBRARY_ASSET_ID,
  },
  {
    url: uploadedDeviceFile.uri,
    mimeType: uploadedDeviceFile.mimeType,
    fileName: uploadedDeviceFile.fileName,
    fileSize: uploadedDeviceFile.fileSize,
    assetId: DEVICE_ASSET_ID,
  },
];

interface PushedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  metadata: Record<string, unknown> | null;
}

function rows(): ChatMessage[] {
  return useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function pushedMessages(): PushedMessage[] {
  return mockPost.mock.calls
    .filter(([path]) => path === '/api/chat/sync')
    .flatMap(([, body]) => (body as { messages?: PushedMessage[] }).messages ?? []);
}

async function sendAndSyncFailedTurn(attachments: unknown[]) {
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ x_stream_error: { message: 'Free usage limit reached.' } });
    callbacks.onDone();
  });
  await useChatExecutionStore
    .getState()
    .sendMessage(CONV_ID, QUESTION, CLOUD_MODEL, attachments as never);
  await waitFor(() => rows().some((m) => m.role === 'assistant' && !m.isStreaming));
  await waitFor(() => {
    void syncNow();
    return useCloudSyncStateStore.getState().dirtyMessages.length === 0;
  });
  const user = rows().find((m) => m.role === 'user')!;
  const assistant = rows().find((m) => m.role === 'assistant')!;
  return { user, assistant };
}

function serverCopy(local: ChatMessage): Record<string, unknown> {
  const pushed = pushedMessages()
    .filter((m) => m.id === local.id)
    .at(-1);
  if (!pushed) throw new Error(`message ${local.id} was never pushed`);
  return {
    id: local.id,
    conversationId: CONV_ID,
    role: pushed.role,
    content: pushed.content,
    ...(pushed.model ? { model: pushed.model } : {}),
    inputTokens: 0,
    outputTokens: 0,
    createdAt: local.createdAt,
    ...(pushed.metadata ? { metadata: pushed.metadata } : {}),
  };
}

function serveConversation(messages: Record<string, unknown>[]): void {
  jest.spyOn(managedCloudChat, 'getConversation').mockResolvedValue({
    conversation: {
      id: CONV_ID,
      title: 'Cloud Chat',
      projectId: null,
      pinned: false,
      starred: false,
      archived: false,
      isTemporary: false,
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    },
    messages,
    total: messages.length,
    hasMore: false,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearCloudExecutionState();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('attachment-persistence-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null, retryAttempts: {} });
  useChatAppModeStore.getState().setAppMode('cloud');
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
  }) as never);
  mockPost.mockImplementation((async (
    _path: string,
    body: { conversations?: Array<{ id: string }>; messages?: Array<{ id: string }> },
  ) => ({
    protocolVersion: 2,
    applied: {
      conversations: (body?.conversations ?? []).map((c) => ({ id: c.id, server_version: '1' })),
      messages: (body?.messages ?? []).map((m) => ({ id: m.id, server_version: '1' })),
      artifacts: [],
    },
    conflicts: { conversations: [], messages: [], artifacts: [] },
    cursor: '1',
  })) as never);
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    messageCount: 0,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a photo attached to a Cloud question', () => {
  it('is still on the question after the chat is reopened from the server', async () => {
    const { user, assistant } = await sendAndSyncFailedTurn([libraryAsset, uploadedDeviceFile]);
    expect(user.attachments).toEqual(storedAttachments);
    serveConversation([serverCopy(user), serverCopy(assistant)]);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    expect(rows().find((m) => m.id === user.id)?.attachments).toEqual(storedAttachments);
  });

  it('is sent again by Retry after a reopen: the Library asset and the uploaded device file, uploaded nowhere', async () => {
    const { user, assistant } = await sendAndSyncFailedTurn([libraryAsset, uploadedDeviceFile]);
    serveConversation([serverCopy(user), serverCopy(assistant)]);
    await useChatMessageStore.getState().loadMessages(CONV_ID);

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockStreamChat.mockClear();
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'Those are tulips.' });
      callbacks.onDone();
    });
    useChatExecutionStore.getState().retryMessage(CONV_ID, assistant.id);
    await waitFor(() => mockStreamChat.mock.calls.length === 1);

    expect(mockStreamChat.mock.calls[0]?.[0].messages).toContainEqual({
      role: 'user',
      content: [
        { type: 'text', text: QUESTION },
        { type: 'file', file: { asset_id: LIBRARY_ASSET_ID } },
        { type: 'file', file: { asset_id: DEVICE_ASSET_ID } },
      ],
    });
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => rows().some((m) => m.role === 'assistant' && m.content !== ''));
    expect(rows().find((m) => m.role === 'user')?.attachments).toEqual(storedAttachments);
  });

  it('puts only the stored file reference on the wire, never a path on this phone', async () => {
    const { user } = await sendAndSyncFailedTurn([
      { ...uploadedDeviceFile, uri: 'file:///var/mobile/Media/IMG_0042.png' },
    ]);

    const wire = pushedMessages()
      .filter((m) => m.id === user.id)
      .at(-1)?.metadata;
    expect(wire?.['attachments']).toEqual([
      {
        id: DEVICE_ASSET_ID,
        assetId: DEVICE_ASSET_ID,
        type: 'image',
        name: 'IMG_0042.png',
        size: 4096,
        mimeType: 'image/png',
      },
    ]);
    expect(JSON.stringify(wire)).not.toContain('file://');
  });

  it('survives a reopen even when the server row predates attachments being stored', async () => {
    const { user, assistant } = await sendAndSyncFailedTurn([libraryAsset]);
    const bareQuestion = serverCopy(user);
    delete (bareQuestion['metadata'] as Record<string, unknown>)['attachments'];
    serveConversation([bareQuestion, serverCopy(assistant)]);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    expect(rows().find((m) => m.id === user.id)?.attachments).toEqual([storedAttachments[0]]);
  });
});
