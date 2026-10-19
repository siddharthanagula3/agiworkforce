import { describe, expect, it } from 'vitest';

import {
  AGI_WORK_DONE_TITLE,
  REPLY_DONE_TITLE,
  RESEARCH_DONE_TITLE,
  completionNotificationTitle,
} from './completion-notification';

const UNTITLED = 'New Chat';
const ANSWER = { role: 'assistant', content: 'Here is the answer.' };

describe('completionNotificationTitle', () => {
  it('announces an ordinary reply under the conversation title', () => {
    expect(
      completionNotificationTitle({
        reply: ANSWER,
        conversationTitle: 'Trip plan',
        untitled: UNTITLED,
      }),
    ).toBe('Trip plan');
  });

  it('falls back to a plain heading for an untitled conversation', () => {
    expect(
      completionNotificationTitle({
        reply: ANSWER,
        conversationTitle: UNTITLED,
        untitled: UNTITLED,
      }),
    ).toBe(REPLY_DONE_TITLE);
  });

  it('stays silent when the turn failed or produced nothing', () => {
    expect(
      completionNotificationTitle({ reply: { ...ANSWER, error: true }, untitled: UNTITLED }),
    ).toBeNull();
    expect(
      completionNotificationTitle({
        reply: { role: 'assistant', content: '' },
        untitled: UNTITLED,
      }),
    ).toBeNull();
    expect(
      completionNotificationTitle({ reply: { role: 'user', content: 'hi' }, untitled: UNTITLED }),
    ).toBeNull();
  });

  it('keeps the AGI Work and research headings', () => {
    expect(completionNotificationTitle({ workMode: 'agiwork', untitled: UNTITLED })).toBe(
      AGI_WORK_DONE_TITLE,
    );
    expect(completionNotificationTitle({ research: true, untitled: UNTITLED })).toBe(
      RESEARCH_DONE_TITLE,
    );
  });
});
