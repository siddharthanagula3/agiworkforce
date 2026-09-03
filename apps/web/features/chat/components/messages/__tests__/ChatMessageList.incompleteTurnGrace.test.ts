import { describe, expect, it } from 'vitest';
import { INCOMPLETE_TURN_GRACE_MS, isWithinIncompleteTurnGracePeriod } from '../ChatMessageList';
import type { ChatMessage } from '@agiworkforce/unified-chat';

function userMessage(createdAt: string | undefined): ChatMessage {
  return { id: 'user-1', role: 'user', content: 'hello', createdAt };
}

describe('isWithinIncompleteTurnGracePeriod', () => {
  const now = 1_000_000;

  it('is within grace for a user message sent moments ago with no reply yet', () => {
    const sentAt = new Date(now - 2_000).toISOString();
    expect(isWithinIncompleteTurnGracePeriod(userMessage(sentAt), now)).toBe(true);
  });

  it('is past grace once the window has elapsed', () => {
    const sentAt = new Date(now - (INCOMPLETE_TURN_GRACE_MS + 1)).toISOString();
    expect(isWithinIncompleteTurnGracePeriod(userMessage(sentAt), now)).toBe(false);
  });

  it('never applies to an assistant message', () => {
    const recent = new Date(now - 100).toISOString();
    expect(
      isWithinIncompleteTurnGracePeriod(
        { id: 'a-1', role: 'assistant', content: '', createdAt: recent },
        now,
      ),
    ).toBe(false);
  });

  it('is false when the message has no timestamp to reason about', () => {
    expect(isWithinIncompleteTurnGracePeriod(userMessage(undefined), now)).toBe(false);
  });

  it('is false for a missing message', () => {
    expect(isWithinIncompleteTurnGracePeriod(undefined, now)).toBe(false);
    expect(isWithinIncompleteTurnGracePeriod(null, now)).toBe(false);
  });
});
