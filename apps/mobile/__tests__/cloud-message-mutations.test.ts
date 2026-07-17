jest.mock('../services/api', () => ({
  api: { delete: jest.fn() },
}));

import { api } from '../services/api';
import { deleteCloudMessagesRemote } from '../src/features/chat/services/cloudMessageMutations';

const mockDelete = api.delete as jest.MockedFunction<typeof api.delete>;

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
});
