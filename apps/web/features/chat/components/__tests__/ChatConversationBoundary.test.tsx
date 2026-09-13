import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ChatConversationBoundary } from '../ChatConversationBoundary';

/**
 * The defect this covers: a transcript that threw reached Next's route
 * boundary, which replaces everything the chat layout renders. The user lost
 * the sidebar, the header and every other conversation along with the one that
 * broke. The shell must survive, and the failure must stay in its own column.
 */
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Cannot read properties of undefined');
  return <p>Transcript</p>;
}

function Shell({ shouldThrow }: { shouldThrow: boolean }) {
  return (
    <div>
      <nav aria-label="Conversations">Sidebar</nav>
      <header>Header</header>
      <ChatConversationBoundary>
        <Boom shouldThrow={shouldThrow} />
      </ChatConversationBoundary>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatConversationBoundary', () => {
  it('keeps the sidebar and the header when the conversation throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<Shell shouldThrow />);

    expect(screen.getByRole('navigation', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('rendering this conversation');
    expect(screen.queryByText('Transcript')).toBeNull();
  });

  it('offers the same two ways out the route boundary offers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<Shell shouldThrow />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat');
  });

  it('re-renders the column rather than the page when the retry succeeds', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { rerender } = render(<Shell shouldThrow />);
    rerender(<Shell shouldThrow={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Transcript')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the conversation untouched when nothing throws', () => {
    render(<Shell shouldThrow={false} />);

    expect(screen.getByText('Transcript')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
