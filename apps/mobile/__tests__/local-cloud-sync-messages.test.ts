jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  apiFetch: jest.fn(),
}));

import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';
import { api, apiFetch } from '../services/api';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { prepareLocalCloudSync, syncLocalConversationsToCloud } from '../src/features/settings/data-controls/localCloudSyncService';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import { activateCloudAccount, __resetCloudAccountSessionForTests } from '../src/features/auth/services/cloudAccountSession';

const mockPost = api.post as jest.Mock;
const mockFetch = apiFetch as jest.Mock;
const localId = 'conv_123_fixture';
const cloudId = '0190a000-0000-7000-8000-000000000f51';
const conversation: ConversationSummary = {
  id: localId, title: 'Local chat', updatedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z', messageCount: 2, pinned: false, executionMode: 'local',
};
const messages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'Hello' } as ChatMessage,
  { id: 'm2', role: 'assistant', content: 'Hi', model: SYNTHETIC_LOCAL_MODEL_ID } as ChatMessage,
];
function run(plan = prepareLocalCloudSync(), controller = new AbortController()) {
  return syncLocalConversationsToCloud(plan, controller.signal, () => {});
}

beforeEach(() => {
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useChatMessageStore.setState({ conversations: [conversation], messages: { [localId]: messages } });
  mockPost.mockReset().mockResolvedValue({ saved: 2 });
  mockFetch.mockReset().mockImplementation(async (_path: string, init: RequestInit) => ({
    ok: true, status: 201,
    json: async () => ({ conversation: {
      id: JSON.parse(init.body as string).id, title: 'Local chat', model: null, project_id: null,
      pinned: false, starred: false, archived: false, is_temporary: false,
      created_at: conversation.createdAt, updated_at: conversation.updatedAt,
    } }),
  } as Response));
});

it('freezes ordinary non-UUID local data and binds the original epoch through both transports', async () => {
  const plan = prepareLocalCloudSync();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  const result = await run(plan);
  expect(result).toEqual({ conversationsSynced: 1, messagesSynced: 2, errors: [], outcomeUnknown: false });
  expect(plan.conversations[0].id).not.toBe(localId);
  expect(Object.isFrozen(plan.conversations[0].messages[0])).toBe(true);
  expect(mockFetch).toHaveBeenCalledWith('/api/chat/conversations', expect.anything(), {
    accountEpoch: plan.account, signal: expect.anything(),
  });
  expect(mockPost).toHaveBeenCalledWith(`/api/chat/conversations/${plan.conversations[0].id}/messages/bulk`, {
    messages: [{ role: 'user', content: 'Hello', model: undefined }, { role: 'assistant', content: 'Hi', model: SYNTHETIC_LOCAL_MODEL_ID }],
  }, { accountEpoch: plan.account, signal: expect.anything() });
  await expect(run(plan)).rejects.toThrow('already been started');
});

it('refuses Local mode without changing mode or dispatching', () => {
  useChatAppModeStore.setState({ appMode: 'local' });
  expect(() => prepareLocalCloudSync()).toThrow('Switch chat');
  expect(mockFetch).not.toHaveBeenCalled();
});

it('rejects an old plan after account A to B to A', async () => {
  const plan = prepareLocalCloudSync();
  activateCloudAccount('account-b');
  activateCloudAccount('account-a');
  await expect(run(plan)).rejects.toThrow('Cloud account changed');
  expect(mockFetch).not.toHaveBeenCalled();
});

it('blocks the real shared-client header await boundary before apiFetch', async () => {
  const pending = run();
  activateCloudAccount('account-b');
  await expect(pending).rejects.toThrow('Cloud account changed');
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

it('does not revive an aborted operation after mode returns to Cloud', async () => {
  const controller = new AbortController();
  const pending = run(prepareLocalCloudSync(), controller);
  useChatAppModeStore.setState({ appMode: 'local' });
  controller.abort();
  useChatAppModeStore.setState({ appMode: 'cloud' });
  await expect(pending).rejects.toThrow();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('excludes temporary chats and counts capped and ineligible content without editing originals', () => {
  const originals = Array.from({ length: 52 }, (_, i) => ({ ...conversation, id: `conv_${i}`, temporary: i === 0 }));
  const many = Array.from({ length: 101 }, (_, i) => ({ ...messages[0], id: `m${i}` }));
  useChatMessageStore.setState({ conversations: originals, messages: { conv_1: [...many, { ...messages[0], isStreaming: true }] } });
  const plan = prepareLocalCloudSync();
  expect(plan.temporaryChatsExcluded).toBe(1);
  expect(plan.conversationsOmitted).toBe(1);
  expect(plan.conversations).toHaveLength(1);
  expect(plan.emptyChatsExcluded).toBe(49);
  expect(plan.messageCount).toBe(100);
  expect(plan.messagesOmitted).toBe(2);
  expect(useChatMessageStore.getState().conversations).toBe(originals);
});

it('counts acknowledged partial messages separately from fully copied chats', async () => {
  mockPost.mockResolvedValue({ saved: 1 });
  const result = await run();
  expect(result.conversationsSynced).toBe(0);
  expect(result.messagesSynced).toBe(1);
  expect(result.errors).toHaveLength(1);
  expect(result.outcomeUnknown).toBe(false);
});

it.each([undefined, null, {}, { saved: -1 }, { saved: 3 }, { saved: 0.5 }, { saved: '2' }, { saved: NaN }])('treats malformed receipt %p as unknown without retrying', async (receipt) => {
  mockPost.mockResolvedValue(receipt);
  const result = await run();
  expect(result.outcomeUnknown).toBe(true);
  expect(result.messagesSynced).toBe(0);
  expect(result.conversationsSynced).toBe(0);
  expect(mockPost).toHaveBeenCalledTimes(1);
});

it('preserves Local data and hides diagnostics on an interrupted response', async () => {
  mockPost.mockRejectedValue(new Error('private provider diagnostics'));
  const result = await run();
  expect(result.outcomeUnknown).toBe(true);
  expect(result.errors.join(' ')).not.toContain('private provider');
  expect(useChatMessageStore.getState().messages[localId]).toBe(messages);
});

it('stops on an unexpected create destination without uploading or retrying', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 201,
    json: async () => ({ conversation: {
      id: cloudId, title: 'Unexpected destination', model: null, project_id: null,
      pinned: false, starred: false, archived: false, is_temporary: false,
      created_at: conversation.createdAt, updated_at: conversation.updatedAt,
    } }),
  } as Response);
  const result = await run();
  expect(result.outcomeUnknown).toBe(true);
  expect(result.conversationsSynced).toBe(0);
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
