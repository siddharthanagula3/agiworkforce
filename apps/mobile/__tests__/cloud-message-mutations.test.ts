jest.mock('../services/api', () => ({
  api: { delete: jest.fn(), patch: jest.fn() },
}));
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  assertCloudAccountEpochCurrent: jest.fn(),
}));

import { api } from '../services/api';
import { assertCloudAccountEpochCurrent } from '../src/features/auth/services/cloudAccountSession';
import {
  deleteCloudMessagesRemote,
  setCloudMessageReactionRemote,
} from '../src/features/chat/services/cloudMessageMutations';

const mockDelete = api.delete as jest.MockedFunction<typeof api.delete>;
const mockPatch = api.patch as jest.MockedFunction<typeof api.patch>;
const mockAssertAccount = assertCloudAccountEpochCurrent as jest.MockedFunction<
  typeof assertCloudAccountEpochCurrent
>;

describe('deleteCloudMessagesRemote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes every replaced message through the ownership-scoped endpoint', async () => {
    mockDelete.mockResolvedValue(undefined);

    await deleteCloudMessagesRemote('conversation/id', ['user id', 'assistant/id']);

    expect(mockDelete.mock.calls.map(([path]) => path)).toEqual([
      '/api/chat/conversations/conversation%2Fid/messages/user%20id',
      '/api/chat/conversations/conversation%2Fid/messages/assistant%2Fid',
    ]);
  });

  it('treats an already-deleted message as idempotent success', async () => {
    mockDelete.mockRejectedValueOnce(new Error('HTTP 404: Not found'));
    mockDelete.mockResolvedValueOnce(undefined);

    await expect(deleteCloudMessagesRemote('c1', ['gone', 'present'])).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('stops on a real server failure', async () => {
    mockDelete.mockRejectedValueOnce(new Error('HTTP 503: unavailable'));

    await expect(deleteCloudMessagesRemote('c1', ['m1', 'm2'])).rejects.toThrow('503');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('stops deleting when the account changes between messages', async () => {
    mockDelete.mockResolvedValue(undefined);
    mockAssertAccount
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Cloud account changed');
      });
    const accountEpoch = { ownerId: 'first-account', epoch: 1 };

    await expect(deleteCloudMessagesRemote('c1', ['m1', 'm2'], accountEpoch)).rejects.toThrow(
      'Cloud account changed',
    );
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockAssertAccount).toHaveBeenCalledWith(accountEpoch);
  });
});

describe('setCloudMessageReactionRemote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PATCHes the ownership-scoped message endpoint with the reaction (web-parity shape)', async () => {
    mockPatch.mockResolvedValue(undefined);

    await setCloudMessageReactionRemote('conversation/id', 'assistant/id', 'thumbsUp');

    expect(mockPatch).toHaveBeenCalledWith(
      '/api/chat/conversations/conversation%2Fid/messages/assistant%2Fid',
      { reaction: 'thumbsUp' },
    );
  });

  it('sends a null reaction when the rating is cleared', async () => {
    mockPatch.mockResolvedValue(undefined);

    await setCloudMessageReactionRemote('c1', 'm1', null);

    expect(mockPatch).toHaveBeenCalledWith(expect.any(String), { reaction: null });
  });

  it('treats a 404 (message already deleted) as idempotent success', async () => {
    mockPatch.mockRejectedValueOnce(new Error('HTTP 404: Not found'));

    await expect(setCloudMessageReactionRemote('c1', 'm1', 'thumbsDown')).resolves.toBeUndefined();
  });

  it('propagates a real server failure', async () => {
    mockPatch.mockRejectedValueOnce(new Error('HTTP 503: unavailable'));

    await expect(setCloudMessageReactionRemote('c1', 'm1', 'thumbsUp')).rejects.toThrow('503');
  });

  it('does not PATCH a rating after its account epoch becomes stale', async () => {
    mockAssertAccount.mockImplementationOnce(() => {
      throw new Error('Cloud account changed');
    });

    await expect(
      setCloudMessageReactionRemote('c1', 'm1', 'thumbsUp', {
        ownerId: 'first-account',
        epoch: 1,
      }),
    ).rejects.toThrow('Cloud account changed');
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
