jest.mock('@/services/api', () => ({ api: { post: jest.fn() } }));

import { api } from '@/services/api';
import { fetchFollowUpSuggestions, followUpsPath } from '../followUps';

const mockPost = api.post as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('follow-up suggestions service', () => {
  it('asks the answer route for follow-ups and keeps only non-empty text', async () => {
    mockPost.mockResolvedValue({ suggestions: ['What does it cost?', ' ', 7, 'Who makes it?'] });
    const signal = new AbortController().signal;

    await expect(fetchFollowUpSuggestions('c-1', 'm-9', signal)).resolves.toEqual([
      'What does it cost?',
      'Who makes it?',
    ]);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/chat/conversations/c-1/messages/m-9/follow-ups',
      undefined,
      { signal },
    );
  });

  it('reads a body without suggestions as none', async () => {
    mockPost.mockResolvedValue(null);
    await expect(
      fetchFollowUpSuggestions('c-1', 'm-9', new AbortController().signal),
    ).resolves.toEqual([]);
  });

  it('encodes both identifiers into the path', () => {
    expect(followUpsPath('a b', 'm/1')).toBe(
      '/api/chat/conversations/a%20b/messages/m%2F1/follow-ups',
    );
  });
});
