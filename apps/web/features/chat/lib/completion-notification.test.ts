import { describe, expect, it } from 'vitest';

import {
  AGI_WORK_DONE_TITLE,
  completionNotificationBody,
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

describe('completionNotificationBody', () => {
  it('shows the start of the reply as plain text, capped at 100 characters', () => {
    expect(completionNotificationBody('**Saturn** has the most moons.')).toBe(
      'Saturn has the most moons.',
    );
    const long = completionNotificationBody(`Answer ${'x'.repeat(200)}`);
    expect(long).toHaveLength(100);
    expect(long?.endsWith('…')).toBe(true);
  });

  it('drops code blocks and gives no body for an empty reply', () => {
    expect(completionNotificationBody('Run this:\n```sh\nnpm test\n```')).toBe('Run this:');
    expect(completionNotificationBody('   ')).toBeNull();
    expect(completionNotificationBody(undefined)).toBeNull();
  });
});
