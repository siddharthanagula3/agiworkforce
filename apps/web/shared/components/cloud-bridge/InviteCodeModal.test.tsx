import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteCodeModal } from './InviteCodeModal';
import * as serviceClient from '@/lib/services/waitlistServiceClient';

vi.mock('@/lib/services/waitlistServiceClient', () => ({
  redeemInviteCode: vi.fn(),
  joinWaitlist: vi.fn(),
}));

const mockRedeem = vi.mocked(serviceClient.redeemInviteCode);
const mockJoin = vi.mocked(serviceClient.joinWaitlist);

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  source: 'connectors' as const,
};

describe('InviteCodeModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('open/close', () => {
    it('renders when open=true', () => {
      render(<InviteCodeModal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render when open=false', () => {
      render(<InviteCodeModal {...defaultProps} open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('calls onClose when dialog close button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      render(<InviteCodeModal {...defaultProps} onClose={onClose} />);
      await user.click(screen.getByRole('button', { name: /close dialog/i }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
  });

  describe('tab switching', () => {
    it('shows invite tab by default', () => {
      render(<InviteCodeModal {...defaultProps} />);
      expect(screen.getByPlaceholderText('XXXXXXXX')).toBeInTheDocument();
    });

    it('shows waitlist tab when defaultTab="waitlist"', () => {
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" />);
      expect(screen.getByLabelText(/email.*required/i)).toBeInTheDocument();
    });

    it('switches to waitlist tab via link', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /join the waitlist/i }));
      expect(screen.getByLabelText(/email.*required/i)).toBeInTheDocument();
    });

    it('switches to invite tab via tab trigger', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" />);
      await user.click(screen.getByRole('tab', { name: /enter invitation code/i }));
      expect(screen.getByPlaceholderText('XXXXXXXX')).toBeInTheDocument();
    });

    it('resets to defaultTab when modal re-opens', async () => {
      const { rerender } = render(
        <InviteCodeModal {...defaultProps} defaultTab="invite" open={false} />,
      );
      rerender(<InviteCodeModal {...defaultProps} defaultTab="invite" open={true} />);
      expect(screen.getByPlaceholderText('XXXXXXXX')).toBeInTheDocument();
    });
  });

  describe('invite tab - submission', () => {
    it('disables submit button when code is shorter than 6 chars', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      const input = screen.getByPlaceholderText('XXXXXXXX');
      await user.type(input, 'AB');
      expect(screen.getByRole('button', { name: /unlock cloud/i })).toBeDisabled();
    });

    it('enables submit button when code is 6+ chars', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      const input = screen.getByPlaceholderText('XXXXXXXX');
      await user.type(input, 'ABCDEF');
      expect(screen.getByRole('button', { name: /unlock cloud/i })).toBeEnabled();
    });

    it('calls redeemInviteCode with uppercased code and source', async () => {
      mockRedeem.mockResolvedValue({ success: true, inviteId: 'inv-123' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      const input = screen.getByPlaceholderText('XXXXXXXX');
      await user.type(input, 'abcdef');
      await user.click(screen.getByRole('button', { name: /unlock cloud/i }));
      expect(mockRedeem).toHaveBeenCalledWith('ABCDEF', 'connectors');
    });

    it('shows success state and calls onRedeemed on success', async () => {
      mockRedeem.mockResolvedValue({ success: true, inviteId: 'inv-123' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onRedeemed = vi.fn();
      render(<InviteCodeModal {...defaultProps} onRedeemed={onRedeemed} />);
      await user.type(screen.getByPlaceholderText('XXXXXXXX'), 'ABCDEF');
      await user.click(screen.getByRole('button', { name: /unlock cloud/i }));
      await waitFor(() => expect(screen.getByText('Cloud unlocked!')).toBeInTheDocument());
      expect(onRedeemed).toHaveBeenCalledWith('inv-123');
    });

    it('closes automatically after 1.5s on success', async () => {
      mockRedeem.mockResolvedValue({ success: true, inviteId: 'inv-999' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      render(<InviteCodeModal {...defaultProps} onClose={onClose} />);
      await user.type(screen.getByPlaceholderText('XXXXXXXX'), 'ABCDEF');
      await user.click(screen.getByRole('button', { name: /unlock cloud/i }));
      await waitFor(() => screen.getByText('Cloud unlocked!'));
      vi.advanceTimersByTime(1500);
      expect(onClose).toHaveBeenCalled();
    });

    it('shows typed error message on rpc_error', async () => {
      mockRedeem.mockResolvedValue({ success: false, error: 'rpc_error' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      await user.type(screen.getByPlaceholderText('XXXXXXXX'), 'ABCDEF');
      await user.click(screen.getByRole('button', { name: /unlock cloud/i }));
      await waitFor(() =>
        expect(screen.getByText(/something went wrong on our end/i)).toBeInTheDocument(),
      );
    });

    it('shows expired error message', async () => {
      mockRedeem.mockResolvedValue({ success: false, error: 'expired' });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} />);
      await user.type(screen.getByPlaceholderText('XXXXXXXX'), 'ABCDEF');
      await user.click(screen.getByRole('button', { name: /unlock cloud/i }));
      await waitFor(() => expect(screen.getByText(/that code has expired/i)).toBeInTheDocument());
    });
  });

  describe('waitlist tab - submission', () => {
    it('disables submit when email is invalid', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" />);
      await user.type(screen.getByPlaceholderText('you@example.com'), 'notanemail');
      expect(screen.getByRole('button', { name: /join waitlist/i })).toBeDisabled();
    });

    it('enables submit with valid email', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" />);
      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      expect(screen.getByRole('button', { name: /join waitlist/i })).toBeEnabled();
    });

    it('calls joinWaitlist with email, optional name, and source', async () => {
      mockJoin.mockResolvedValue({ success: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" />);
      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Your name'), 'Alice');
      await user.click(screen.getByRole('button', { name: /join waitlist/i }));
      expect(mockJoin).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Alice',
        referralSource: 'connectors',
      });
    });

    it('shows success and calls onWaitlisted', async () => {
      mockJoin.mockResolvedValue({ success: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onWaitlisted = vi.fn();
      render(
        <InviteCodeModal {...defaultProps} defaultTab="waitlist" onWaitlisted={onWaitlisted} />,
      );
      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /join waitlist/i }));
      await waitFor(() => expect(screen.getByText(/you're on the list/i)).toBeInTheDocument());
      expect(onWaitlisted).toHaveBeenCalledWith('test@example.com');
    });

    it('closes automatically after 2s on waitlist success', async () => {
      mockJoin.mockResolvedValue({ success: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      render(<InviteCodeModal {...defaultProps} defaultTab="waitlist" onClose={onClose} />);
      await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /join waitlist/i }));
      await waitFor(() => screen.getByText(/you're on the list/i));
      vi.advanceTimersByTime(2000);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
