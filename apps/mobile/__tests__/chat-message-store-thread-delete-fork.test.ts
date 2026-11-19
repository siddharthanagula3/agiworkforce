import { Alert } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';

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

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
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
  };
});

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

import {
  managedCloudConversationBranchesPath,
  resolveLeafForSibling,
  resolveSurvivingLeaf,
  resolveVisibleThread,
  variantInfoByMessage,
} from '@agiworkforce/cloud-contracts';
import { beginCloudHistoryLoad, finishCloudHistoryLoad } from '../stores/chat/cloudHistoryLoad';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { localGenerate, type GenerateResult } from '@agiworkforce/local-llm';
import { useChatCloudMessageStore, useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { api } from '../services/api';
import { listInstalledModels } from '../storage/installedModels';
import { useSettingsStore } from '../stores/settingsStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { requireFreeMobileCloudModel, requireLocalModel } from '../test-utils/modelFixtures';
import type { ChatMessage, ConversationSummary } from '../types/chat';

const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONV_ID = 'thread-delete-fork-local';
const LOCAL_MODEL = requireLocalModel().id;
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

function at(minute: number): string {
  return `2026-11-15T10:${String(minute).padStart(2, '0')}:00.000Z`;
}

function row(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  minute: number,
  parentId?: string,
): ChatMessage {
  return {
    id,
    conversationId: CONV_ID,
    role,
    content,
    createdAt: at(minute),
    isStreaming: false,
    ...(parentId ? { parentId } : {}),
  };
}

const LINEAR = [
  row('z-u1', 'user', 'first question', 0),
  row('y-a1', 'assistant', 'first answer', 1),
  row('x-u2', 'user', 'second question', 2),
  row('w-a2', 'assistant', 'second answer', 3),
  row('v-u3', 'user', 'third question', 4),
  row('u-a3', 'assistant', 'third answer', 5),
];

const EDITED = [
  row('u1', 'user', 'first question', 0),
  row('a1', 'assistant', 'first answer', 1, 'u1'),
  row('u2', 'user', 'second question', 2, 'a1'),
  row('a2', 'assistant', 'second answer', 3, 'u2'),
  row('u3', 'user', 'third question', 4, 'a2'),
  row('a3', 'assistant', 'third answer', 5, 'u3'),
  row('u2b', 'user', 'revised second question', 6, 'a1'),
  row('a2b', 'assistant', 'answer to the revision', 7, 'u2b'),
];

const ORIGINAL_THREAD = [
  'first question',
  'first answer',
  'second question',
  'second answer',
  'third question',
  'third answer',
];

function rows(conversationId = CONV_ID): ChatMessage[] {
  return useChatStore.getState().messages[conversationId] ?? [];
}

function conversationOf(conversationId: string): ConversationSummary | undefined {
  return useChatStore.getState().conversations.find((c) => c.id === conversationId);
}

function leaf(): string | null | undefined {
  return conversationOf(CONV_ID)?.activeLeafMessageId;
}

function visibleContents(): string[] {
  return resolveVisibleThread(rows(), leaf()).map((message) => message.content);
}

function orphans(): ChatMessage[] {
  const ids = new Set(rows().map((message) => message.id));
  return rows().filter((message) => message.parentId != null && !ids.has(message.parentId));
}

function seed(messages: ChatMessage[], activeLeafMessageId?: string): void {
  useChatStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: 'Local versions',
        updatedAt: at(0),
        createdAt: at(0),
        messageCount: messages.length,
        pinned: false,
        model: LOCAL_MODEL,
        provider: 'local',
        executionMode: 'local',
        ...(activeLeafMessageId !== undefined ? { activeLeafMessageId } : {}),
      },
    ],
    messages: { [CONV_ID]: messages },
    currentConversationId: CONV_ID,
  });
}

function deleteMessage(messageId: string): void {
  act(() => useChatStore.getState().deleteMessage(CONV_ID, messageId));
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('thread-delete-fork-user');
  useChatCloudMessageStore.getState().clearCloudData();
  useSettingsStore.setState({ reduceSensitiveContent: false, isTemporaryChat: false });
  useChatExecutionStore.setState({ isEditing: false, retryAttempts: {}, error: null });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
    text: 'new answer',
    runtime: 'executorch',
    aborted: false,
  }));
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('deleting a message in a Local chat with versions', () => {
  it('keeps every earlier and later turn when a middle answer is deleted', () => {
    seed(EDITED, 'a3');

    deleteMessage('a1');

    expect(visibleContents()).toEqual([
      'first question',
      'second question',
      'second answer',
      'third question',
      'third answer',
    ]);
    expect(orphans()).toEqual([]);
    expect(leaf()).toBe('a3');
    expect(variantInfoByMessage(rows(), leaf())['u2']).toMatchObject({
      index: 0,
      total: 2,
      nextId: 'u2b',
    });
    expect(
      resolveVisibleThread(rows(), resolveLeafForSibling(rows(), 'u2b')).map((m) => m.content),
    ).toEqual(['first question', 'revised second question', 'answer to the revision']);
  });

  it('closes the gap when the only version of a turn is deleted', () => {
    seed(EDITED, 'a3');

    deleteMessage('a2');

    expect(visibleContents()).toEqual([
      'first question',
      'first answer',
      'second question',
      'third question',
      'third answer',
    ]);
    expect(rows().find((message) => message.id === 'u3')?.parentId).toBe('u2');
    expect(orphans()).toEqual([]);
    expect(variantInfoByMessage(rows(), leaf())['u2']).toMatchObject({ index: 0, total: 2 });
  });

  it('shows the remaining version when the version on screen is the one deleted', () => {
    seed([...EDITED, row('a3b', 'assistant', 'regenerated third answer', 8, 'u3')], 'a3b');
    expect(variantInfoByMessage(rows(), leaf())['a3b']).toMatchObject({ index: 1, total: 2 });

    deleteMessage('a3b');

    expect(leaf()).toBe('a3');
    expect(visibleContents()).toEqual(ORIGINAL_THREAD);
    expect(variantInfoByMessage(rows(), leaf())['a3']).toBeUndefined();
    expect(orphans()).toEqual([]);
  });

  it('keeps the other version reachable when a question with versions is deleted', () => {
    seed(EDITED, 'a3');

    deleteMessage('u2');

    expect(visibleContents()).toEqual([
      'first question',
      'first answer',
      'second answer',
      'third question',
      'third answer',
    ]);
    expect(orphans()).toEqual([]);
    expect(variantInfoByMessage(rows(), leaf())['a2']).toMatchObject({
      total: 2,
      nextId: 'u2b',
    });
    expect(
      resolveVisibleThread(rows(), resolveLeafForSibling(rows(), 'u2b')).map((m) => m.content),
    ).toEqual([
      'first question',
      'first answer',
      'revised second question',
      'answer to the revision',
    ]);
  });

  it('groups the next question with the other answer version when a mid-thread answer with versions is deleted', () => {
    seed(
      [
        row('u1', 'user', 'first question', 0),
        row('a1', 'assistant', 'first answer', 1, 'u1'),
        row('u2', 'user', 'second question', 2, 'a1'),
        row('a2', 'assistant', 'second answer', 3, 'u2'),
        row('u3', 'user', 'third question', 4, 'a2'),
        row('a3', 'assistant', 'third answer', 5, 'u3'),
        row('a2b', 'assistant', 'regenerated second answer', 6, 'u2'),
      ],
      'a3',
    );

    deleteMessage('a2');

    expect(leaf()).toBe('a3');
    expect(visibleContents()).toEqual([
      'first question',
      'first answer',
      'second question',
      'third question',
      'third answer',
    ]);
    expect(rows().find((message) => message.id === 'u3')?.parentId).toBe('u2');
    expect(orphans()).toEqual([]);
    expect(variantInfoByMessage(rows(), leaf())['u3']).toMatchObject({
      index: 0,
      total: 2,
      nextId: 'a2b',
    });
    expect(
      resolveVisibleThread(rows(), resolveLeafForSibling(rows(), 'a2b')).map((m) => m.content),
    ).toEqual(['first question', 'first answer', 'second question', 'regenerated second answer']);
  });

  it('keeps the rest of the chat when the first message is deleted', () => {
    seed(EDITED, 'a3');

    deleteMessage('u1');

    expect(visibleContents()).toEqual(ORIGINAL_THREAD.slice(1));
    expect(rows().find((message) => message.id === 'a1')?.parentId).toBeNull();
    expect(orphans()).toEqual([]);
  });

  it('moves the leaf to the question when its only answer is deleted', () => {
    seed(EDITED, 'a3');

    deleteMessage('a3');

    expect(leaf()).toBe('u3');
    expect(visibleContents()).toEqual(ORIGINAL_THREAD.slice(0, 5));
    expect(orphans()).toEqual([]);
  });

  it('deletes from a chat without versions exactly as before', () => {
    seed(LINEAR);

    deleteMessage('y-a1');

    expect(rows()).toEqual(LINEAR.filter((message) => message.id !== 'y-a1'));
    expect(leaf()).toBeUndefined();
  });

  it('keeps every turn and the answer being written when an earlier message is deleted mid-answer', async () => {
    seed(EDITED, 'a3');
    let finish: (result: GenerateResult) => void = () => {};
    mockLocalGenerate.mockImplementationOnce(
      () =>
        new Promise<GenerateResult>((resolve) => {
          finish = resolve;
        }),
    );

    let sending: Promise<unknown> = Promise.resolve();
    act(() => {
      sending = useChatStore.getState().sendMessage(CONV_ID, 'fourth question', LOCAL_MODEL);
    });
    await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalled());
    const streaming = rows().find((message) => message.isStreaming);
    expect(streaming).toBeDefined();
    expect(leaf()).toBe(streaming?.id);

    deleteMessage('a1');

    expect(leaf()).toBe(streaming?.id);
    expect(visibleContents()).toEqual([
      'first question',
      'second question',
      'second answer',
      'third question',
      'third answer',
      'fourth question',
      '',
    ]);

    await act(async () => {
      finish({ text: 'fourth answer', runtime: 'executorch', aborted: false });
      await sending;
    });

    expect(visibleContents()).toEqual([
      'first question',
      'second question',
      'second answer',
      'third question',
      'third answer',
      'fourth question',
      'fourth answer',
    ]);
    expect(orphans()).toEqual([]);
  });

  it('still sends the turns before a deleted answer after the last answer was regenerated', async () => {
    seed(LINEAR);
    act(() => useChatStore.getState().retryMessage(CONV_ID, 'u-a3'));
    await waitFor(() => expect(visibleContents()).toContain('new answer'));

    deleteMessage('y-a1');

    expect(visibleContents()).toEqual([
      'first question',
      'second question',
      'second answer',
      'third question',
      'new answer',
    ]);
    expect(orphans()).toEqual([]);

    mockLocalGenerate.mockImplementationOnce(async () => ({
      text: 'fourth answer',
      runtime: 'executorch',
      aborted: false,
    }));
    await act(async () => {
      await useChatStore.getState().sendMessage(CONV_ID, 'fourth question', LOCAL_MODEL);
    });

    const sent = (mockLocalGenerate.mock.calls.at(-1)?.[1].messages ?? []).map((m) => m.content);
    expect(sent).toContain('first question');
    expect(sent).toContain('second answer');
    expect(sent).not.toContain('third answer');
    expect(sent).not.toContain('first answer');
  });
});

describe('branching a Local chat', () => {
  const REGENERATED = [
    row('u1', 'user', 'first question', 0),
    row('a1', 'assistant', 'first answer', 1, 'u1'),
    row('u2', 'user', 'second question', 2, 'a1'),
    row('a2', 'assistant', 'second answer', 3, 'u2'),
    row('a2b', 'assistant', 'regenerated second answer', 4, 'u2'),
  ];

  function forkedRows(forkId: string): ChatMessage[] {
    return rows(forkId);
  }

  function expectPlainThread(forkId: string, contents: string[]): void {
    expect(forkedRows(forkId).map((message) => message.content)).toEqual(contents);
    expect(forkedRows(forkId).every((message) => message.parentId === undefined)).toBe(true);
    expect(conversationOf(forkId)?.activeLeafMessageId).toBeUndefined();
    expect(variantInfoByMessage(forkedRows(forkId), undefined)).toEqual({});
  }

  it('carries only the answer that was shown when an answer has two versions', async () => {
    seed(REGENERATED, 'a2b');

    const forkId = await useChatStore
      .getState()
      .forkConversation(CONV_ID, { forkPointMessageId: 'a2b', title: 'Local versions (branch)' });

    expectPlainThread(forkId, [
      'first question',
      'first answer',
      'second question',
      'regenerated second answer',
    ]);
    expect(conversationOf(forkId)?.forkPointMessageId).toBe('a2b');
  });

  it('duplicates the version on screen after the person pages back to the original', async () => {
    seed(REGENERATED, 'a2');

    const forkId = await useChatStore.getState().forkConversation(CONV_ID);

    expectPlainThread(forkId, [
      'first question',
      'first answer',
      'second question',
      'second answer',
    ]);
    expect(conversationOf(forkId)?.forkPointMessageId).toBe('a2');
  });

  it('carries only the revised question and its answer when a question was edited', async () => {
    seed(EDITED, 'a2b');

    const branchId = await useChatStore
      .getState()
      .forkConversation(CONV_ID, { forkPointMessageId: 'a2b' });
    const duplicateId = await useChatStore.getState().forkConversation(CONV_ID);

    const shown = [
      'first question',
      'first answer',
      'revised second question',
      'answer to the revision',
    ];
    expectPlainThread(branchId, shown);
    expectPlainThread(duplicateId, shown);
  });

  it('branches a chat without versions exactly as before', async () => {
    seed(LINEAR);

    const branchId = await useChatStore
      .getState()
      .forkConversation(CONV_ID, { forkPointMessageId: 'x-u2' });
    const duplicateId = await useChatStore.getState().forkConversation(CONV_ID);

    expect(forkedRows(branchId).map(({ role, content }) => ({ role, content }))).toEqual(
      LINEAR.slice(0, 3).map(({ role, content }) => ({ role, content })),
    );
    expect(forkedRows(duplicateId).map((message) => message.content)).toEqual(ORIGINAL_THREAD);
    expect(conversationOf(branchId)?.forkPointMessageId).toBe('x-u2');
    expect(conversationOf(duplicateId)?.forkPointMessageId).toBe('u-a3');
    expect(rows()).toEqual(LINEAR);
  });
});

describe('duplicating a Cloud chat with versions', () => {
  const CLOUD_ID = '0190a000-0000-7000-8000-000000000101';
  const BRANCH_ID = '0190a000-0000-7000-8000-0000000001b1';

  it('asks the server to branch from the last message on screen, not the newest version', async () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CLOUD_ID,
      title: 'Cloud versions',
      createdAt: at(0),
      updatedAt: at(0),
      messageCount: 3,
      pinned: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
      activeLeafMessageId: 'cloud-a1',
    });
    useChatCloudMessageStore.getState().setCloudMessages(CLOUD_ID, [
      { ...row('cloud-u1', 'user', 'question', 0), conversationId: CLOUD_ID },
      { ...row('cloud-a1', 'assistant', 'answer', 1, 'cloud-u1'), conversationId: CLOUD_ID },
      { ...row('cloud-a1b', 'assistant', 'newer answer', 2, 'cloud-u1'), conversationId: CLOUD_ID },
    ]);
    mockPost.mockResolvedValueOnce({
      conversation: {
        id: BRANCH_ID,
        title: 'Cloud versions (branch)',
        created_at: at(3),
        updated_at: at(3),
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        model: CLOUD_MODEL,
      },
    });

    const forkId = await useChatStore.getState().forkConversation(CLOUD_ID);

    expect(forkId).toBe(BRANCH_ID);
    const [path, body] = mockPost.mock.calls.at(-1) as [string, { messageId: string }];
    expect(path).toBe(managedCloudConversationBranchesPath(CLOUD_ID));
    expect(body.messageId).toBe('cloud-a1');
  });
});

describe('deleting a placeholder in a Cloud chat with versions', () => {
  const CLOUD_ID = '0190a000-0000-7000-8000-000000000201';

  function cloudRow(
    id: string,
    role: 'user' | 'assistant',
    content: string,
    minute: number,
    parentId?: string,
  ): ChatMessage {
    return { ...row(id, role, content, minute, parentId), conversationId: CLOUD_ID };
  }

  function seedCloud(messages: ChatMessage[], activeLeafMessageId: string): void {
    useChatMessageStore.setState({ conversations: [], messages: {} });
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CLOUD_ID,
      title: 'Cloud versions',
      createdAt: at(0),
      updatedAt: at(0),
      messageCount: messages.length,
      pinned: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
      activeLeafMessageId,
    });
    useChatCloudMessageStore.getState().setCloudMessages(CLOUD_ID, messages);
  }

  function cloudRows(): ChatMessage[] {
    return useChatCloudMessageStore.getState().messages[CLOUD_ID] ?? [];
  }

  function cloudLeaf(): string | null | undefined {
    return useChatCloudMessageStore.getState().conversations.find((c) => c.id === CLOUD_ID)
      ?.activeLeafMessageId;
  }

  function cloudOrphans(): ChatMessage[] {
    const ids = new Set(cloudRows().map((message) => message.id));
    return cloudRows().filter((message) => message.parentId != null && !ids.has(message.parentId));
  }

  it('hands the leaf to the other version through the Cloud store', () => {
    const messages = [
      cloudRow('cloud-u1', 'user', 'question', 0),
      cloudRow('cloud-a1', 'assistant', 'answer', 1, 'cloud-u1'),
      cloudRow('cloud-u2', 'user', 'follow-up', 2, 'cloud-a1'),
      cloudRow('cloud-a1b', 'assistant', '', 3, 'cloud-u1'),
    ];
    seedCloud(messages, 'cloud-a1b');
    const expectedLeaf = resolveSurvivingLeaf(messages, 'cloud-a1b');
    const load = beginCloudHistoryLoad(CLOUD_ID);

    act(() => useChatStore.getState().deleteMessage(CLOUD_ID, 'cloud-a1b'));

    expect(expectedLeaf).toBe('cloud-u2');
    expect(cloudLeaf()).toBe(expectedLeaf);
    expect(load.leafChanged).toBe(true);
    expect(cloudRows().map((message) => message.id)).toEqual(['cloud-u1', 'cloud-a1', 'cloud-u2']);
    expect(cloudOrphans()).toEqual([]);
    expect(useChatMessageStore.getState().messages[CLOUD_ID]).toBeUndefined();
    expect(useChatMessageStore.getState().conversations).toEqual([]);
    finishCloudHistoryLoad(load);
  });

  it('moves the leaf to the question when a placeholder still being written is deleted', () => {
    seedCloud(
      [
        cloudRow('cloud-u1', 'user', 'question', 0),
        cloudRow('cloud-a1', 'assistant', 'answer', 1, 'cloud-u1'),
        cloudRow('cloud-u2', 'user', 'make an image', 2, 'cloud-a1'),
        { ...cloudRow('cloud-a2', 'assistant', '', 3, 'cloud-u2'), isStreaming: true },
      ],
      'cloud-a2',
    );

    act(() => useChatStore.getState().deleteMessage(CLOUD_ID, 'cloud-a2'));

    expect(cloudLeaf()).toBe('cloud-u2');
    expect(resolveVisibleThread(cloudRows(), cloudLeaf()).map((m) => m.content)).toEqual([
      'question',
      'answer',
      'make an image',
    ]);
    expect(cloudOrphans()).toEqual([]);
  });

  it('gives the children of a deleted Cloud row its parent', () => {
    seedCloud(
      [
        cloudRow('cloud-u1', 'user', 'question', 0),
        cloudRow('cloud-a1', 'assistant', '', 1, 'cloud-u1'),
        cloudRow('cloud-u2', 'user', 'follow-up', 2, 'cloud-a1'),
        cloudRow('cloud-a2', 'assistant', 'second answer', 3, 'cloud-u2'),
      ],
      'cloud-a2',
    );

    act(() => useChatStore.getState().deleteMessage(CLOUD_ID, 'cloud-a1'));

    expect(cloudLeaf()).toBe('cloud-a2');
    expect(cloudRows().find((message) => message.id === 'cloud-u2')?.parentId).toBe('cloud-u1');
    expect(cloudOrphans()).toEqual([]);
    expect(resolveVisibleThread(cloudRows(), cloudLeaf()).map((m) => m.content)).toEqual([
      'question',
      'follow-up',
      'second answer',
    ]);
  });
});
