import { SHARED_ATTACHMENTS_NOT_COPIED } from '@agiworkforce/cloud-contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function continuedTurn(metadata: Record<string, unknown>) {
  return {
    id: 'm1',
    role: 'user' as const,
    content: 'Compare these two reports.',
    timestamp: new Date('2026-09-13T00:00:00.000Z'),
    metadata,
  };
}

describe('attachments a continued shared chat did not copy', () => {
  it('names them after the shared notice', () => {
    render(
      <MessageBubble
        message={continuedTurn({
          sharedAttachments: [{ name: 'q3.pdf' }, { name: 'q4.pdf', mimeType: 'application/pdf' }],
        })}
      />,
    );
    expect(screen.getByTestId('message-shared-attachments').textContent).toBe(
      `${SHARED_ATTACHMENTS_NOT_COPIED} q3.pdf, q4.pdf`,
    );
  });

  it('shows nothing when the shared turn had no attachments', () => {
    render(<MessageBubble message={continuedTurn({})} />);
    expect(screen.queryByTestId('message-shared-attachments')).not.toBeInTheDocument();
  });
});
