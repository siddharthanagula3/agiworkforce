import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { WaitlistModalProvider, WaitlistTrigger } from './WaitlistModal';

const mockJoinPublicWaitlist = vi.fn();

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  joinPublicWaitlist: (...args: unknown[]) => mockJoinPublicWaitlist(...args),
}));

const WITHDRAWAL_ROUTE = '/privacy/requests';
const BARE_UNSUBSCRIBE_PROMISE = /unsubscribe anytime/i;

function openModal() {
  fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
}

describe('waitlist surfaces point their off-the-list promise at a route that exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives the modal fine print a link to the withdrawal route instead of a bare promise', () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );
    openModal();

    const finePrint = document.querySelector('.agi-waitlist-finePrint');
    expect(finePrint).not.toBeNull();
    expect(finePrint?.textContent).not.toMatch(BARE_UNSUBSCRIBE_PROMISE);
    expect(finePrint?.querySelector(`a[href="${WITHDRAWAL_ROUTE}"]`)).not.toBeNull();
  });

  it('keeps the withdrawal route reachable from the success state, where the consent notice is gone', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );
    openModal();

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /store my email address/i }));
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(screen.getByText(/you.re on the list/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('link', { name: WITHDRAWAL_ROUTE })).toHaveAttribute(
      'href',
      WITHDRAWAL_ROUTE,
    );
  });

  it('does not promise an unsubscribe the product cannot perform on the waitlist page', () => {
    const source = readFileSync(join(__dirname, '../../../app/waitlist/page.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );

    expect(source).not.toMatch(BARE_UNSUBSCRIBE_PROMISE);
    expect(source).toContain(`href="${WITHDRAWAL_ROUTE}"`);
  });
});
