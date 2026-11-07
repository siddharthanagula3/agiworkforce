import { describe, expect, it } from 'vitest';
import { ConversationShareListResponseSchema } from '../conversation-shares';

const share = {
  token: 'share-token',
  title: 'Shared conversation',
  shareUrl: 'https://example.com/share/share-token',
  modelId: null,
  provider: null,
  messageCount: 1,
  visibility: 'organization',
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-07-02T00:00:00.000Z',
  expired: true,
};

describe('conversation share list completeness contract', () => {
  it.each([{ shares: [] }, { shares: [share] }])(
    'defaults missing completeness to false for $shares.length shares',
    (body) => {
      expect(ConversationShareListResponseSchema.parse(body).complete).toBe(false);
    },
  );

  it('defaults explicitly undefined completeness to false', () => {
    expect(
      ConversationShareListResponseSchema.parse({ shares: [], complete: undefined }).complete,
    ).toBe(false);
  });

  it.each([true, false])(
    'preserves explicit completeness=%s and expired share metadata',
    (complete) => {
      const body = { shares: [share], workspace: { memberCount: 3 }, complete };
      expect(ConversationShareListResponseSchema.parse(body)).toEqual(body);
    },
  );

  it.each(['true', 'false', 0, 1, null, [], {}].map((complete) => ({ complete })))(
    'rejects non-boolean completeness=$complete',
    ({ complete }) => {
      expect(
        ConversationShareListResponseSchema.safeParse({ shares: [], complete }).success,
      ).toBe(false);
    },
  );
});
