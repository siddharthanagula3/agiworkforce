import { describe, expect, it } from 'vitest';

import { retryableUserMessageId, type RetryableTurnMessage } from '../retryable-turn';

const user = (id: string): RetryableTurnMessage => ({ id, role: 'user' });
const reply = (id: string): RetryableTurnMessage => ({ id, role: 'assistant' });
const failedReply = (id: string): RetryableTurnMessage => ({
  id,
  role: 'assistant',
  error: 'Could not reach the server.',
});

describe('retryableUserMessageId', () => {
  it('offers the trailing user turn when the send never produced a reply', () => {
    expect(retryableUserMessageId([user('u1'), reply('a1'), user('u2')], false)).toBe('u2');
  });

  it('offers the user turn behind a reply that failed', () => {
    expect(retryableUserMessageId([user('u1'), failedReply('a1')], false)).toBe('u1');
  });

  it('offers nothing once a reply has landed, so retrying cannot discard it', () => {
    expect(retryableUserMessageId([user('u1'), reply('a1')], false)).toBeNull();
  });

  it('stops at the most recent successful reply rather than reaching past it', () => {
    const messages = [user('u1'), failedReply('a1'), user('u2'), reply('a2')];
    expect(retryableUserMessageId(messages, false)).toBeNull();
  });

  it('offers nothing while a turn is still streaming', () => {
    expect(retryableUserMessageId([user('u1')], true)).toBeNull();
  });

  it('offers nothing in an empty conversation', () => {
    expect(retryableUserMessageId([], false)).toBeNull();
  });

  it('ignores roles it does not own, such as a system turn', () => {
    const messages = [user('u1'), { id: 's1', role: 'system' }, failedReply('a1')];
    expect(retryableUserMessageId(messages, false)).toBe('u1');
  });

  it('survives a sparse list without throwing', () => {
    const sparse = [undefined, user('u1')] as unknown as RetryableTurnMessage[];
    expect(retryableUserMessageId(sparse, false)).toBe('u1');
  });
});
