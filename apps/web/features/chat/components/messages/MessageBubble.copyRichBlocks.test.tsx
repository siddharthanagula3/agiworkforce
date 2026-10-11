import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<UnifiedChatModule>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

const writeText = vi.fn();

const ANSWER = [
  'Here is the draft and the note.',
  '',
  '```email',
  'To: jane@example.com',
  'Subject: Thursday review',
  '',
  'Hi Jane,',
  '',
  'Can we move it to 3pm?',
  '```',
  '',
  '```writing',
  'Launch note for the team.',
  '```',
  '',
  '```python',
  'print("kept")',
  '```',
].join('\n');

function message(role: 'assistant' | 'user', content: string) {
  return {
    id: `msg-${role}`,
    role,
    content,
    timestamp: new Date('2026-10-10T12:00:00Z'),
    isStreaming: false,
  };
}

async function copyMessage() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
  });
}

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('MessageBubble copy with email and writing blocks', () => {
  it('copies cards as their text and leaves ordinary code fences as written', async () => {
    render(<MessageBubble message={message('assistant', ANSWER)} />);
    await copyMessage();

    expect(writeText).toHaveBeenCalledWith(
      [
        'Here is the draft and the note.',
        '',
        'To: jane@example.com',
        'Subject: Thursday review',
        '',
        'Hi Jane,',
        '',
        'Can we move it to 3pm?',
        '',
        'Launch note for the team.',
        '',
        '```python',
        'print("kept")',
        '```',
      ].join('\n'),
    );
  });

  it('copies what the user typed exactly, fences included', async () => {
    const typed = '```email\nTo: a@x.com\n\nHi\n```';
    render(<MessageBubble message={message('user', typed)} />);
    await copyMessage();

    expect(writeText).toHaveBeenCalledWith(typed);
  });
});
