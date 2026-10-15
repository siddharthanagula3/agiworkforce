import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageBubble, type ChatMessage } from '@agiworkforce/unified-chat';
import { messageDetailFromRow } from '../localChatTurn';

describe('a reopened Local message', () => {
  afterEach(cleanup);

  it('renders the sources stored with it as links, once', () => {
    const message: ChatMessage = {
      id: '32',
      role: 'assistant',
      content: 'Tauri builds small desktop apps.',
      createdAt: '2026-10-11T00:00:00.000Z',
      ...messageDetailFromRow({
        tool_calls: [
          { id: 'tool-1', name: 'search_web', args: { query: 'tauri' }, status: 'completed' },
        ],
        sources: [
          {
            id: 'tool-1',
            query: 'tauri',
            results: [
              { url: 'https://tauri.app/', title: 'Tauri' },
              { url: 'https://docs.rs/tauri', title: 'tauri on docs.rs' },
            ],
            resultCount: 2,
          },
        ],
      }),
    };

    render(<MessageBubble message={message} />);

    expect(
      screen
        .getAllByRole('button', { name: /^Open citation:/ })
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Open citation: Tauri', 'Open citation: tauri on docs.rs']);
    expect(screen.queryByRole('button', { name: /^Web search:/ })).toBeNull();
  });

  it('shows no source list when none was stored', () => {
    render(
      <MessageBubble
        message={{
          id: '33',
          role: 'assistant',
          content: 'No search ran.',
          ...messageDetailFromRow({}),
        }}
      />,
    );

    expect(screen.queryByTestId('message-citations')).toBeNull();
  });
});
