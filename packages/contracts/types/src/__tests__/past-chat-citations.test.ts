import { describe, expect, it } from 'vitest';
import {
  PAST_CHAT_CITATIONS_METADATA_KEY,
  parsePastChatCitations,
  pastChatCitationDate,
  pastChatCitationsFromMetadata,
} from '../index';

const citation = {
  id: 'source-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  title: 'Trip planning',
  createdAt: '2026-03-04T10:00:00.000Z',
};

describe('parsePastChatCitations', () => {
  it('keeps well-formed rows with only the known fields', () => {
    expect(parsePastChatCitations([{ ...citation, extra: 'x' }])).toEqual([citation]);
  });

  it('drops rows without a chat or message to open', () => {
    expect(
      parsePastChatCitations([
        { ...citation, conversationId: '' },
        { ...citation, messageId: '' },
        { ...citation, title: 7 },
        null,
        'row',
        citation,
      ]),
    ).toEqual([citation]);
  });

  it('reads nothing from a value that is not a list', () => {
    expect(parsePastChatCitations({ citation })).toEqual([]);
    expect(parsePastChatCitations(undefined)).toEqual([]);
  });

  it('reads the list from message metadata', () => {
    expect(
      pastChatCitationsFromMetadata({ [PAST_CHAT_CITATIONS_METADATA_KEY]: [citation] }),
    ).toEqual([citation]);
    expect(pastChatCitationsFromMetadata(null)).toEqual([]);
  });
});

describe('pastChatCitationDate', () => {
  it('shows a short month and day', () => {
    expect(pastChatCitationDate('2026-03-04T10:00:00.000Z', 'en-US')).toBe('Mar 4');
  });

  it('shows no date for an unreadable value', () => {
    expect(pastChatCitationDate('not a date')).toBeNull();
  });
});
