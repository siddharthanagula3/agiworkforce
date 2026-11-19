jest.mock('../services/api', () => ({
  api: { delete: jest.fn(), patch: jest.fn() },
  apiFetch: jest.fn(),
}));
jest.mock('../src/features/feedback/clientContext', () => ({
  feedbackClientContext: jest.fn(() => ({
    appVersion: '0.0.1',
    appBuild: '7',
    platform: 'ios',
    osVersion: '26.1',
    deviceClass: 'phone',
    appMode: 'cloud',
  })),
}));
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  assertCloudAccountEpochCurrent: jest.fn(),
}));

import {
  MOBILE_RESPONSE_RATING_MESSAGE,
  RESPONSE_RATING_COMMENT_MAX_CHARS,
} from '@agiworkforce/cloud-contracts';
import { api, apiFetch } from '../services/api';
import { ApiHttpError } from '../services/apiErrors';
import { assertCloudAccountEpochCurrent } from '../src/features/auth/services/cloudAccountSession';
import {
  deleteCloudMessagesRemote,
  recordResponseRatingRemote,
  setCloudMessageReactionRemote,
} from '../src/features/chat/services/cloudMessageMutations';

const mockDelete = api.delete as jest.MockedFunction<typeof api.delete>;
const mockPatch = api.patch as jest.MockedFunction<typeof api.patch>;
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
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
    mockDelete.mockRejectedValueOnce(new ApiHttpError('Message not found', 404));
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

  it('reports a 404 instead of treating a rating the server did not store as saved', async () => {
    mockPatch.mockRejectedValueOnce(new ApiHttpError('Message not found', 404));

    await expect(setCloudMessageReactionRemote('c1', 'm1', 'thumbsDown')).rejects.toMatchObject({
      status: 404,
    });
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

describe('recordResponseRatingRemote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it('posts a mobile response rating with no answer text', async () => {
    await recordResponseRatingRemote('conversation-1', 'answer-1', 'down');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/feedback');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      subject: 'Response rated down',
      message: MOBILE_RESPONSE_RATING_MESSAGE,
      metadata: {
        source: 'mobile',
        platform: 'ios',
        version: '0.0.1',
        user_agent: 'ios 26.1 phone',
        feedback_context: 'response_rating',
        rating: 'down',
        message_id: 'answer-1',
        conversation_id: 'conversation-1',
      },
    });
  });

  it('sends the chosen reason and the details trimmed to the shared limit', async () => {
    const details = `  ${'x'.repeat(RESPONSE_RATING_COMMENT_MAX_CHARS + 50)}  `;

    await recordResponseRatingRemote('conversation-1', 'answer-1', 'down', undefined, {
      reason: 'incomplete',
      comment: details,
    });

    const [, init] = mockApiFetch.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.subject).toBe('Response rated down: Incomplete response');
    expect(body.metadata.reason).toBe('incomplete');
    expect(body.metadata.comment).toBe('x'.repeat(RESPONSE_RATING_COMMENT_MAX_CHARS));
  });

  it('leaves out an empty reason and empty details', async () => {
    await recordResponseRatingRemote('conversation-1', 'answer-1', 'down', undefined, {
      reason: null,
      comment: '   ',
    });

    const [, init] = mockApiFetch.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.subject).toBe('Response rated down');
    expect(body.metadata).not.toHaveProperty('reason');
    expect(body.metadata).not.toHaveProperty('comment');
  });

  it('removes the rating through the shared removal path when it is cleared', async () => {
    await recordResponseRatingRemote('conversation-1', 'answer/1', null);

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/feedback?message_id=answer%2F1',
      { method: 'DELETE' },
      {},
    );
  });

  it('reports the status of a refused rating', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response('{}', { status: 429 }));

    await expect(recordResponseRatingRemote('c1', 'm1', 'up')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('sends nothing once its account is no longer active', async () => {
    mockAssertAccount.mockImplementationOnce(() => {
      throw new Error('Cloud account changed');
    });

    await expect(
      recordResponseRatingRemote('c1', 'm1', 'up', { ownerId: 'first-account', epoch: 1 }),
    ).rejects.toThrow('Cloud account changed');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
