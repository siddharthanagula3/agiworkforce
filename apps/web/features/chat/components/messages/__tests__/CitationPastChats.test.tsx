import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CitationPastChats, pastChatCitationHref } from '../CitationPastChats';

const CITATION = {
  id: 'past_chat:web_messages/message-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  title: 'Sailing notes',
  createdAt: '2026-09-08T10:00:00.000Z',
};

describe('CitationPastChats', () => {
  it('links each cited chat to the message it came from', () => {
    render(<CitationPastChats citations={[CITATION]} />);

    const link = screen.getByRole('link', { name: /Open the source conversation Sailing notes/ });
    expect(link).toHaveAttribute('href', '/chat/conversation-1?highlightMessage=message-1');
    expect(screen.getByLabelText('Previous chats this answer used')).toBeInTheDocument();
  });

  it('renders nothing when the answer used no previous chat', () => {
    const { container } = render(<CitationPastChats citations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('escapes ids that would otherwise leave the chat route', () => {
    expect(
      pastChatCitationHref({ ...CITATION, conversationId: '../admin', messageId: 'a b' }),
    ).toBe('/chat/..%2Fadmin?highlightMessage=a+b');
  });
});
