import { describe, expect, it } from 'vitest';
import {
  RESPONSE_RATING_REASON_LABELS,
  RESPONSE_RATING_REASONS,
  answerlessResponseRatingMessage,
  responseRatingFeedbackBody,
  responseRatingRemovePath,
} from '../response-rating';
import * as root from '../index';

describe('response rating contract', () => {
  it('labels every reason', () => {
    expect(Object.keys(RESPONSE_RATING_REASON_LABELS).sort()).toEqual(
      [...RESPONSE_RATING_REASONS].sort(),
    );
  });

  it('builds the thumbs-down body web sends, with the surface note instead of the answer', () => {
    expect(
      responseRatingFeedbackBody({
        rating: 'down',
        messageId: 'msg-1',
        conversationId: 'c-1',
        reason: 'inaccurate',
        comment: 'Wrong year.',
        surface: 'web',
        platform: 'web',
        version: 'web',
        userAgent: 'x'.repeat(600),
      }),
    ).toEqual({
      subject: 'Response rated down: Not factually correct',
      message: 'An answer in web chat. The answer text is not attached.',
      metadata: {
        source: 'web',
        platform: 'web',
        version: 'web',
        user_agent: 'x'.repeat(500),
        feedback_context: 'response_rating',
        rating: 'down',
        message_id: 'msg-1',
        conversation_id: 'c-1',
        reason: 'inaccurate',
        comment: 'Wrong year.',
      },
    });
  });

  it('leaves out what a thumbs-up does not carry', () => {
    const body = responseRatingFeedbackBody({
      rating: 'up',
      messageId: 'msg-2',
      surface: 'mobile',
      platform: 'ios',
      version: '0.0.1',
      userAgent: 'mobile',
    });
    expect(body.subject).toBe('Response rated up');
    expect(body.message).toBe('An answer in the mobile app. The answer text is not attached.');
    for (const key of ['conversation_id', 'reason', 'comment']) {
      expect(body.metadata).not.toHaveProperty(key);
    }
  });

  it('names the removal path and the surfaces that store a note', () => {
    expect(responseRatingRemovePath('a b/c')).toBe('/api/feedback?message_id=a%20b%2Fc');
    expect(answerlessResponseRatingMessage('desktop')).toBeUndefined();
    expect(answerlessResponseRatingMessage('chrome')).toContain('Chrome extension');
    expect(root.responseRatingFeedbackBody).toBe(responseRatingFeedbackBody);
  });
});
