import { api } from '@/services/api';
import { archiveConversation, restoreArchivedConversation } from '@/src/features/archived-chats/service';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

jest.mock('@/services/api', () => ({ api: { put: jest.fn() } }));

const response = { conversation: {
  id: 'chat-original', title: 'Original chat', model: null, project_id: null,
  pinned: false, starred: false, archived: true, is_temporary: false,
  created_at: '2026-11-04T00:00:00.000Z', updated_at: '2026-11-04T00:00:00.000Z',
} };

let account: CloudAccountEpoch;
beforeEach(() => {
  jest.mocked(api.put).mockReset();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('original-account');
  const captured = captureCloudAccountEpoch();
  if (!captured) throw new Error('Missing fixture account');
  account = captured;
});

it.each([
  ['archive', archiveConversation, true],
  ['restore', restoreArchivedConversation, false],
] as const)('%s passes the original epoch to the canonical API boundary', async (_label, mutate, archived) => {
  jest.mocked(api.put).mockResolvedValueOnce({ conversation: { ...response.conversation, archived } });
  await mutate('chat-original', account);
  expect(api.put).toHaveBeenCalledWith('/api/chat/conversations/chat-original',
    { archived }, { accountEpoch: account });
});

it.each([archiveConversation, restoreArchivedConversation])('refuses an old account before dispatch', async (mutate) => {
  activateCloudAccount('replacement-account');
  await expect(mutate('chat-original', account)).rejects.toMatchObject({
    name: 'StaleCloudAccountOperationError',
  });
  expect(api.put).not.toHaveBeenCalled();
});

it.each([archiveConversation, restoreArchivedConversation])('refuses a receipt after the captured epoch retires', async (mutate) => {
  let resolve!: (value: typeof response) => void;
  jest.mocked(api.put).mockReturnValueOnce(new Promise<typeof response>((yes) => { resolve = yes; }));
  const settled = mutate('chat-original', account).catch((error: unknown) => error);
  activateCloudAccount('replacement-account');
  resolve(response);
  expect(await settled).toMatchObject({ name: 'StaleCloudAccountOperationError' });
});
