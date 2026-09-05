import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';

const DAY_MS = 86_400_000;

function twoDayTranscript(): ChatMessage[] {
  return [
    {
      id: 'user-old',
      role: 'user',
      content: 'Yesterday I asked about rain.',
      createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    },
    {
      id: 'assistant-old',
      role: 'assistant',
      content: 'Rain falls when droplets grow heavy enough.',
      createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    },
    {
      id: 'user-new',
      role: 'user',
      content: 'Today I am asking about snow.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'assistant-new',
      role: 'assistant',
      content: 'Snow forms when water vapour freezes directly onto ice crystals.',
      createdAt: new Date().toISOString(),
    },
  ] as unknown as ChatMessage[];
}

describe('transcript date grouping', () => {
  it('renders no date divider above the first turn', () => {
    render(<ChatMessageList messages={twoDayTranscript()} onRegenerate={vi.fn()} />);

    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText('Yesterday')).toBeNull();
  });

  it('renders no separator role in the transcript', () => {
    render(<ChatMessageList messages={twoDayTranscript()} onRegenerate={vi.fn()} />);

    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });
});
