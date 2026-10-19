import { describe, expect, it } from 'vitest';

import { promptBeforeReply, scheduleFromPromptHref } from './schedule-from-turn';

describe('turning a finished chat turn into a schedule', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'First question' },
    { id: 'a1', role: 'assistant', content: 'First answer' },
    { id: 'u2', role: 'user', content: '  Draft the Monday status email  ' },
    { id: 't1', role: 'tool', content: '{}' },
    { id: 'a2', role: 'assistant', content: 'Here is the draft.' },
  ];

  it('takes the request that produced the reply, skipping tool rows', () => {
    expect(promptBeforeReply(messages, 'a2')).toBe('Draft the Monday status email');
    expect(promptBeforeReply(messages, 'a1')).toBe('First question');
    expect(promptBeforeReply(messages, 'missing')).toBeNull();
  });

  it('hands the request to the schedules page in the URL', () => {
    expect(scheduleFromPromptHref('Draft & send')).toBe(
      '/chat/schedules?fromPrompt=Draft%20%26%20send',
    );
  });
});
