import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../lib/types';
import { MessageBubble } from '../MessageBubble';

/**
 * DES-C23 — a failed assistant turn used to render a completely blank bubble:
 * `message.error` was written by useChat and never read, and the list-level
 * notice only covers the LAST message.
 * DES-C22 — a managed quota refusal showed a disappearing toast over that same
 * blank bubble.
 */
function assistantMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    timestamp: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble — failed turn (DES-C23)', () => {
  it('renders the live failure in the transcript', () => {
    render(<MessageBubble message={assistantMessage({ error: 'Provider stream collapsed' })} />);

    expect(screen.getByTestId('message-error').textContent).toContain('Provider stream collapsed');
  });

  it('renders the PERSISTED failure after a reload, when only metadata survives', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          metadata: { finishReason: 'error', streamError: { message: 'Upstream timed out' } },
        })}
      />,
    );

    expect(screen.getByTestId('message-error').textContent).toContain('Upstream timed out');
  });

  it('offers a working Retry when the host wired regenerate', async () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble message={assistantMessage({ error: 'Request failed' })} onRetry={onRetry} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry this response' }));
    expect(onRetry).toHaveBeenCalledWith('assistant-1');
  });

  it('omits Retry rather than rendering a dead control when regenerate is unwired', () => {
    render(<MessageBubble message={assistantMessage({ error: 'Request failed' })} />);

    expect(screen.queryByRole('button', { name: 'Retry this response' })).toBeNull();
    expect(screen.getByTestId('message-error')).toBeTruthy();
  });

  it('shows no failure block while the turn is still streaming', () => {
    render(<MessageBubble message={assistantMessage({ error: 'stale', isStreaming: true })} />);

    expect(screen.queryByTestId('message-error')).toBeNull();
  });
});

describe('MessageBubble — managed quota refusal (DES-C22)', () => {
  const paywallMessage = assistantMessage({
    metadata: {
      paywall: {
        feature: 'rolling_capacity',
        requiredTier: 'pro',
        reason: 'You have used your capacity for this window.',
        showUpgradeCta: true,
        showResetTime: true,
        suggestStandardModel: true,
        resetAt: '2026-08-01T12:00:00.000Z',
      },
    },
  });

  it('renders an in-transcript limit card instead of a blank bubble', () => {
    render(<MessageBubble message={paywallMessage} />);

    const card = screen.getByTestId('message-limit-card');
    expect(card.textContent).toContain('You have used your capacity for this window.');
    expect(card.textContent).toContain(
      'Switching to a standard (non-flagship) model clears this now.',
    );
    expect(card.textContent).toContain('Clears at');
  });

  it('renders no upgrade CTA when the host exposes no checkout path', () => {
    render(<MessageBubble message={paywallMessage} />);

    expect(screen.queryByRole('button', { name: /^Upgrade to/ })).toBeNull();
  });

  it('prefers the limit card over the generic failure block', () => {
    render(<MessageBubble message={{ ...paywallMessage, error: 'Request failed' }} />);

    expect(screen.getByTestId('message-limit-card')).toBeTruthy();
    expect(screen.queryByTestId('message-error')).toBeNull();
  });
});
