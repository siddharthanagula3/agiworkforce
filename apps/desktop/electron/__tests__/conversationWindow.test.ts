import { describe, expect, it } from 'vitest';
import { planOpenConversationInNewWindow, publicConversationUrl } from '../conversationWindow';

const CONVERSATION = '/chat/11111111-1111-4111-8111-111111111111';

describe('Copy URL', () => {
  it('copies the public address of the open chat', () => {
    expect(publicConversationUrl('https://agiworkforce.com', CONVERSATION)).toBe(
      `https://agiworkforce.com${CONVERSATION}`,
    );
    expect(publicConversationUrl('https://agiworkforce.com/', CONVERSATION)).toBe(
      `https://agiworkforce.com${CONVERSATION}`,
    );
    expect(publicConversationUrl('https://agiworkforce.com', '/chat')).toBeNull();
    expect(publicConversationUrl('https://agiworkforce.com', null)).toBeNull();
  });
});

describe('Open in New Window', () => {
  it('opens the current chat in a second window and leaves it in this one', () => {
    expect(planOpenConversationInNewWindow('/chat/notes')).toEqual({
      keepOnCurrentWindow: '/chat/notes',
      openInNewWindow: '/chat/notes',
    });
  });
});
