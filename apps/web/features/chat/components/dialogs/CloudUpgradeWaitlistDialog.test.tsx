import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CloudUpgradeWaitlistDialog } from './CloudUpgradeWaitlistDialog';

const mockJoinWaitlist = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null }),
}));

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  joinWaitlist: (...args: unknown[]) => mockJoinWaitlist(...args),
}));

describe('CloudUpgradeWaitlistDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the mobile Cloud waitlist entry copy', () => {
    render(<CloudUpgradeWaitlistDialog open onOpenChange={vi.fn()} />);

    expect(screen.getAllByText('Managed cloud waitlist.').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /website trial uses AGI managed Auto Economy.*larger hosted models, search, tools, files, and computer-use/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/country · optional · helps us price fairly/i)).toBeInTheDocument();
  });

  it('joins the waitlist and shows the confirmed rank state', async () => {
    mockJoinWaitlist.mockResolvedValue({ success: true, rank: 12 });
    render(<CloudUpgradeWaitlistDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'Test@Example.COM' },
    });
    fireEvent.click(screen.getByRole('button', { name: /join waitlist/i }));

    await waitFor(() => {
      expect(mockJoinWaitlist).toHaveBeenCalledWith({
        email: 'test@example.com',
        referralSource: 'billing',
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText("You're confirmed.").length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('cloud-waitlist-rank')).toHaveTextContent('#13 in line');
    expect(screen.getByRole('button', { name: /back to chat/i })).toBeInTheDocument();
  });

  it('shows the service error without closing the modal', async () => {
    mockJoinWaitlist.mockResolvedValue({ success: false, error: 'Failed to join waitlist.' });
    render(<CloudUpgradeWaitlistDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /join waitlist/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to join waitlist.');
    expect(screen.getAllByText('Managed cloud waitlist.').length).toBeGreaterThan(0);
  });
});
