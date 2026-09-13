import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function assistantTurn(metadata: Record<string, unknown>) {
  return {
    id: 'm1',
    role: 'assistant' as const,
    content: 'Answered here.',
    timestamp: new Date('2026-09-13T00:00:00.000Z'),
    metadata,
  };
}

describe('the Local label on an answered turn', () => {
  it('marks a turn answered on this device', () => {
    render(
      <MessageBubble message={assistantTurn({ privacyMode: 'local', providerMode: 'Local' })} />,
    );
    const badge = screen.getByTestId('message-local-boundary');
    expect(badge.textContent).toBe('Local');
    expect(badge.getAttribute('title')).toContain('running on this device');
  });

  it('leaves a managed turn unmarked', () => {
    render(<MessageBubble message={assistantTurn({ privacyMode: 'managed' })} />);
    expect(screen.queryByTestId('message-local-boundary')).not.toBeInTheDocument();
  });

  it('never marks the user own message', () => {
    render(
      <MessageBubble
        message={{ ...assistantTurn({ privacyMode: 'local' }), role: 'user' as const }}
      />,
    );
    expect(screen.queryByTestId('message-local-boundary')).not.toBeInTheDocument();
  });
});
