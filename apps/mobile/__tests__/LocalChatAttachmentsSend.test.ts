import { act, waitFor } from '@testing-library/react-native';

type LocalLlmModule = typeof import('@agiworkforce/local-llm');
type DocParserModule = typeof import('../services/docParser');
type FileSystemLegacyModule = typeof import('expo-file-system/legacy');
type LocalChatAttachmentsModule = typeof import('../services/localChatAttachments');

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

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
  cancelMobileCloudAgentRun: jest.fn(),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => 'mobile-local-only'),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual<LocalLlmModule>('@agiworkforce/local-llm'),
  localGenerate: jest.fn(),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: 'test',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier2Available: true,
    tier3Available: true,
  }),
}));

jest.mock('../services/docParser', () => ({
  ...jest.requireActual<DocParserModule>('../services/docParser'),
  parseDocument: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual<FileSystemLegacyModule>('expo-file-system/legacy'),
  documentDirectory: 'file:///documents/',
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('../services/localChatAttachments', () => ({
  ...jest.requireActual<LocalChatAttachmentsModule>('../services/localChatAttachments'),
  keepLocalChatAttachments: jest.fn(),
  releaseDeletedConversationAttachments: jest.fn(),
}));

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/features/memory/store', () => ({
  retrieveMemoryContext: jest.fn(async () => []),
}));

jest.mock('../src/features/memory/services/pastChatContext', () => ({
  retrievePastChatContext: jest.fn(async () => null),
}));

jest.mock('../src/features/memory/services/consolidation', () => ({
  consolidateFactsFromTurn: jest.fn(),
  shouldConsolidateMemoryOnClient: jest.fn(() => false),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
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

import { localGenerate } from '@agiworkforce/local-llm';
import { deleteAsync } from 'expo-file-system/legacy';
import { useChatStore } from '../stores/chatStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { managedCloudChat } from '../services/managedCloudChat';
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useSettingsStore } from '../stores/settingsStore';
import { parseDocument } from '../services/docParser';
import {
  keepLocalChatAttachments,
  releaseDeletedConversationAttachments,
} from '../services/localChatAttachments';
import { streamChat } from '../services/streaming';
import { api } from '../services/api';
import { listInstalledModels } from '../storage/installedModels';
import { requireLocalModel } from '../test-utils/modelFixtures';
import type { ChatMessage, MessageAttachment } from '../types/chat';

const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockParseDocument = parseDocument as jest.MockedFunction<typeof parseDocument>;
const mockKeep = keepLocalChatAttachments as jest.MockedFunction<typeof keepLocalChatAttachments>;
const mockRelease = releaseDeletedConversationAttachments as jest.MockedFunction<
  typeof releaseDeletedConversationAttachments
>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockDeleteAsync = deleteAsync as jest.MockedFunction<typeof deleteAsync>;
const actualRelease = jest.requireActual<LocalChatAttachmentsModule>(
  '../services/localChatAttachments',
).releaseDeletedConversationAttachments;

const CONV_ID = 'local-attachments-chat';
const LOCAL_MODEL = requireLocalModel().id;
const STAMP = '2026-11-16T10:00:00.000Z';
const PICKED = {
  id: 'picked-1',
  uri: 'file:///cache/DocumentPicker/4F2A/allocations.txt',
  mimeType: 'text/plain',
  fileName: 'allocations.txt',
  fileSize: 64,
};
const KEPT_URL = `file:///documents/chat-attachments/${CONV_ID}/copy-1/allocations.txt`;

function seed(temporary = false, messages: ChatMessage[] = []): void {
  useChatStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: 'Local document chat',
        updatedAt: STAMP,
        createdAt: STAMP,
        messageCount: 0,
        pinned: false,
        model: LOCAL_MODEL,
        provider: 'local',
        executionMode: 'local',
        ...(temporary ? { temporary: true } : {}),
      },
    ],
    messages: { [CONV_ID]: messages },
    currentConversationId: CONV_ID,
  });
}

function sentAttachments(): MessageAttachment[] | undefined {
  return (useChatStore.getState().messages[CONV_ID] ?? []).find(
    (message) => message.role === 'user',
  )?.attachments;
}

async function send(content: string, attachments?: (typeof PICKED)[]): Promise<void> {
  await act(async () => {
    await useChatStore.getState().sendMessage(CONV_ID, content, LOCAL_MODEL, attachments);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ reduceSensitiveContent: false, isTemporaryChat: false });
  mockListInstalledModels.mockResolvedValue([
    {
      id: LOCAL_MODEL,
      display_name: 'AGI Lite',
      runtime: 'local',
      format: 'pte',
      size_bytes: 1_181_116_006,
      sha256: null,
      local_path: null,
      installed_at: 1,
      last_used_at: null,
      capabilities: null,
    },
  ]);
  mockLocalGenerate.mockImplementation(async () => ({
    text: 'Answer',
    runtime: 'executorch',
    aborted: false,
  }));
  mockParseDocument.mockResolvedValue({
    text: 'Alpha allocation: 10',
    metadata: { docType: 'txt' },
  } as Awaited<ReturnType<typeof parseDocument>>);
  mockKeep.mockImplementation(async (_conversationId, attachments) =>
    attachments.map((attachment) => ({ ...attachment, url: KEPT_URL })),
  );
  mockRelease.mockResolvedValue(undefined);
  useChatCloudMessageStore.getState().clearCloudData();
  seed();
});

describe('sending a file in a Local chat', () => {
  it('stores the kept copy on the message instead of the picker cache file', async () => {
    await send('What is the Alpha allocation?', [PICKED]);

    expect(mockKeep).toHaveBeenCalledWith(CONV_ID, [
      {
        url: PICKED.uri,
        mimeType: 'text/plain',
        fileName: 'allocations.txt',
        fileSize: 64,
      },
    ]);
    expect(sentAttachments()).toEqual([
      { url: KEPT_URL, mimeType: 'text/plain', fileName: 'allocations.txt', fileSize: 64 },
    ]);
    expect(mockParseDocument).toHaveBeenCalledWith(KEPT_URL, 'text/plain');
  });

  it('reads the kept copy again for a follow-up question', async () => {
    await send('What is the Alpha allocation?', [PICKED]);
    mockParseDocument.mockClear();

    await send('And again?');

    expect(mockParseDocument).toHaveBeenCalledWith(KEPT_URL, 'text/plain');
    expect(mockKeep).toHaveBeenCalledTimes(1);
  });

  it('sends with the picker file when the copy could not be made', async () => {
    mockKeep.mockImplementation(async (_conversationId, attachments) => attachments);

    await send('What is the Alpha allocation?', [PICKED]);

    expect(sentAttachments()?.[0]?.url).toBe(PICKED.uri);
    expect(mockLocalGenerate).toHaveBeenCalledTimes(1);
  });

  it('keeps no copy for a temporary chat', async () => {
    seed(true);

    await send('What is the Alpha allocation?', [PICKED]);

    expect(mockKeep).not.toHaveBeenCalled();
    expect(sentAttachments()?.[0]?.url).toBe(PICKED.uri);
  });

  it('never sends the file to Cloud', async () => {
    await send('What is the Alpha allocation?', [PICKED]);

    expect(streamChat).not.toHaveBeenCalled();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });
});

describe('a Local chat file after the first send', () => {
  const question: ChatMessage = {
    id: 'msg-question',
    conversationId: CONV_ID,
    role: 'user',
    content: 'What is the Alpha allocation?',
    createdAt: STAMP,
    model: LOCAL_MODEL,
    attachments: [
      { url: PICKED.uri, mimeType: 'text/plain', fileName: 'allocations.txt', fileSize: 64 },
    ],
  };
  const answer: ChatMessage = {
    id: 'msg-answer',
    conversationId: CONV_ID,
    role: 'assistant',
    content: 'Answer',
    createdAt: STAMP,
    model: LOCAL_MODEL,
  };

  it('makes no copy when an answer is regenerated, because no new message keeps it', async () => {
    seed(false, [question, answer]);

    await act(async () => {
      useChatStore.getState().retryMessage(CONV_ID, answer.id);
    });
    await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(1));

    expect(mockKeep).not.toHaveBeenCalled();
    expect(mockParseDocument).toHaveBeenCalledWith(PICKED.uri, 'text/plain');
  });

  it('reads a copy kept before an app update from the current documents folder', async () => {
    seed(false, [
      {
        ...question,
        attachments: [
          {
            url: `file:///var/old-container/documents/chat-attachments/${CONV_ID}/copy-9/allocations.txt`,
            mimeType: 'text/plain',
            fileName: 'allocations.txt',
          },
        ],
      },
      answer,
    ]);

    await send('And again?');

    expect(mockParseDocument).toHaveBeenCalledWith(
      `file:///documents/chat-attachments/${CONV_ID}/copy-9/allocations.txt`,
      'text/plain',
    );
  });

  it('removes the kept copies when the chat is deleted', async () => {
    await send('What is the Alpha allocation?', [PICKED]);
    const sent = useChatStore.getState().messages[CONV_ID];

    await act(async () => {
      await useChatStore.getState().deleteConversation(CONV_ID);
    });

    expect(mockRelease).toHaveBeenCalledWith(sent, {});
    expect(useChatStore.getState().conversations).toEqual([]);
  });
});

describe('deleting a chat that holds kept files', () => {
  const CLOUD_ID = '0190a000-0000-7000-8000-000000000077';
  const keptQuestion: ChatMessage = {
    id: 'msg-kept',
    conversationId: CONV_ID,
    role: 'user',
    content: 'What is the Alpha allocation?',
    createdAt: STAMP,
    attachments: [
      { url: KEPT_URL, mimeType: 'text/plain', fileName: 'allocations.txt', fileSize: 64 },
    ],
  };

  function seedCloudChat(messages: ChatMessage[]): void {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CLOUD_ID,
      title: 'Cloud chat',
      updatedAt: STAMP,
      createdAt: STAMP,
      messageCount: messages.length,
      pinned: false,
      executionMode: 'cloud',
    });
    useChatCloudMessageStore.setState((state) => ({
      messages: { ...state.messages, [CLOUD_ID]: messages },
    }));
  }

  async function deleteChat(id: string): Promise<void> {
    await act(async () => {
      await useChatStore.getState().deleteConversation(id);
    });
  }

  beforeEach(() => {
    mockRelease.mockImplementation(actualRelease);
  });

  it('removes the folder of a copy only the deleted chat used', async () => {
    seed(false, [keptQuestion]);

    await deleteChat(CONV_ID);

    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      `file:///documents/chat-attachments/${CONV_ID}/copy-1/`,
      { idempotent: true },
    );
  });

  it('keeps a copy that a chat in the other mode still shows', async () => {
    seed(false, [keptQuestion]);
    seedCloudChat([{ ...keptQuestion, id: 'msg-cloud', conversationId: CLOUD_ID }]);

    await deleteChat(CONV_ID);

    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([CLOUD_ID]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('keeps a copy that a Local fork of the chat still shows', async () => {
    const FORK_ID = '0190a000-0000-7000-8000-000000000078';
    seed(false, [keptQuestion]);
    const [original] = useChatStore.getState().conversations;
    useChatStore.setState({
      conversations: [original!, { ...original!, id: FORK_ID, title: 'Local document chat fork' }],
      messages: {
        [CONV_ID]: [keptQuestion],
        [FORK_ID]: [{ ...keptQuestion, id: 'msg-fork', conversationId: FORK_ID }],
      },
    });

    await deleteChat(CONV_ID);

    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([FORK_ID]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('removes no kept file when a Cloud chat is deleted', async () => {
    activateCloudAccount('attachment-deletion-test-account');
    const deleteRemote = jest
      .spyOn(managedCloudChat, 'deleteConversation')
      .mockResolvedValue(undefined);
    seed(false, [keptQuestion]);
    seedCloudChat([{ ...keptQuestion, id: 'msg-cloud', conversationId: CLOUD_ID }]);

    try {
      await deleteChat(CLOUD_ID);
      expect(useChatCloudMessageStore.getState().conversations).toEqual([]);
      expect(mockRelease).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    } finally {
      invalidateCloudAccount();
      deleteRemote.mockRestore();
    }
  });

  it('still deletes the chat when its files cannot be removed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDeleteAsync.mockRejectedValueOnce(new Error('Permission denied'));
    seed(false, [keptQuestion]);

    await expect(useChatStore.getState().deleteConversation(CONV_ID)).resolves.toBe(true);

    expect(useChatStore.getState().conversations).toEqual([]);
    expect(useChatStore.getState().messages[CONV_ID]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[chatMessageStore] Could not remove the files of a deleted chat:',
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
