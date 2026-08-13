import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WaitlistModalProvider, WaitlistTrigger } from './WaitlistModal';

const mockJoinPublicWaitlist = vi.fn();

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  joinPublicWaitlist: (...args: unknown[]) => mockJoinPublicWaitlist(...args),
}));

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

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: '  Visitor@Example.COM ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'website',
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
    fireEvent.change(screen.getByLabelText(/email address/i), {
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
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to join/i);
    // Modal still open with the form visible for retry
    expect(screen.getByText(/discuss enterprise access/i)).toBeInTheDocument();
  });

  it('passes a non-default source through to the service', async () => {
    mockJoinPublicWaitlist.mockResolvedValue({ success: true });

    render(
      <WaitlistModalProvider>
        <WaitlistTrigger label="Request cloud" source="byok" />
      </WaitlistModalProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /request cloud/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^join waitlist$/i }));

    await waitFor(() => {
      expect(mockJoinPublicWaitlist).toHaveBeenCalledWith({
        email: 'visitor@example.com',
        referralSource: 'byok',
      });
    });
  });
});
