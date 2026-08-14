import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WaitlistModalProvider, WaitlistTrigger } from './WaitlistModal';

const mockJoinPublicWaitlist = vi.fn();

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  joinPublicWaitlist: (...args: unknown[]) => mockJoinPublicWaitlist(...args),
}));

/**
 * Tick the consent box that makes storing the address lawful (DPDP s.6).
 *
 * The modal will not submit without it, by design: `/api/waitlist/public`
 * refuses to store an address with no consent row, so a form that could submit
 * without this would just produce a 400. Tests that expect a successful submit
 * therefore have to tick it, exactly as a person does.
 *
 * Queried by role rather than by label text: the consent label contains the
 * words "email address", which is what made `getByLabelText(/email address/i)`
 * ambiguous the moment these checkboxes shipped.
 */
function grantRequiredConsent() {
  fireEvent.click(screen.getByRole('checkbox', { name: /store my email address/i }));
}

describe('WaitlistModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('never interrupts a visitor with an automatic modal', () => {
    vi.useFakeTimers();
    try {
      render(
        <WaitlistModalProvider>
          <span>app</span>
        </WaitlistModalProvider>,
      );
      act(() => {
        vi.advanceTimersByTime(120_000);
      });
      expect(screen.queryByText(/discuss enterprise access/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a /waitlist link fallback when no provider is mounted', () => {
    render(<WaitlistTrigger label="Join Cloud waitlist" />);

    const link = screen.getByRole('link', { name: /join cloud waitlist/i });
    expect(link).toHaveAttribute('href', '/waitlist');
  });

  it('opens the modal from a trigger and submits an anonymous signup', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" source="website" />
      </WaitlistModalProvider>,
    );

    // Modal closed initially
    expect(screen.queryByText(/discuss enterprise access/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    expect(screen.getByText(/discuss enterprise access/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: '  Visitor@Example.COM ' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'website',
        consentSurface: 'web-waitlist-modal',
        // Both purposes travel, ticked and unticked. An unticked box is a
        // recorded decision, not an omission.
        consent: [
          { purpose: 'enterprise_waitlist', granted: true },
          { purpose: 'product_updates', granted: false },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/you.re on the list/i)).toBeInTheDocument();
    });
  });

  it('closes from its visible close control', () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Team access" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /team access/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close waitlist dialog/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('validates the email locally before calling the service', async () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(mockJoinPublicWaitlist).not.toHaveBeenCalled();
  });

  it('surfaces a service error without closing the modal', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({
      success: false,
      error: 'Failed to join waitlist. Please try again.',
    });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to join/i);
    // Modal still open with the form visible for retry
    expect(screen.getByText(/discuss enterprise access/i)).toBeInTheDocument();
  });

  /**
   * The consent gate itself (DPDP s.6). Submitting without the required purpose
   * must not reach the service at all — the server would refuse it anyway, so a
   * form that posts regardless is just a wasted 400 and a worse error message.
   */
  it('refuses to submit until the required consent is ticked', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    // Deliberately no consent.
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tick the box/i);
    expect(mockJoinPublicWaitlist).not.toHaveBeenCalled();
  });

  it('renders both consent purposes unticked, and requires only the necessary one', () => {
    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Join Cloud waitlist" />
      </WaitlistModalProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /join cloud waitlist/i }));

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    // Unticked on first paint is the whole point — consent needs a clear
    // affirmative action, so a pre-ticked box would not be consent at all.
    for (const box of boxes) expect(box).not.toBeChecked();
  });

  it('passes a non-default source through to the service', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Request cloud" source="byok" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /request cloud/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /email address/i }), {
      target: { value: 'visitor@example.com' },
    });
    grantRequiredConsent();
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'byok',
        consentSurface: 'web-waitlist-modal',
        consent: [
          { purpose: 'enterprise_waitlist', granted: true },
          { purpose: 'product_updates', granted: false },
        ],
      });
    });
  });
});
