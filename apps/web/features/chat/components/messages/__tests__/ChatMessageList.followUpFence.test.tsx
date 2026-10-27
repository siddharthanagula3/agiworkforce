import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';

const transcript = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Draft the next step.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: ['Here is a next step.', '', '```followups', '- Show the document', '```'].join('\n'),
    createdAt: new Date().toISOString(),
  },
] as unknown as ChatMessage[];

describe('assistant follow-up fence', () => {
  it('submits the suggestion as the next turn', async () => {
    const onSubmitPrompt = vi.fn();
    const onSendMessage = vi.fn();
    render(
      <ChatMessageList
        messages={transcript}
        onRegenerate={vi.fn()}
        onSendMessage={onSendMessage}
        onSubmitPrompt={onSubmitPrompt}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Show the document' }));

    expect(onSubmitPrompt).toHaveBeenCalledWith('Show the document');
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
