/**
 * InviteCodeModal — waitlist tab rank display tests
 *
 * Verifies the WaitlistTab confirmed state renders rank+1 (1-indexed display)
 * given the 0-indexed rank value returned by the server RPC.
 *
 * Replaces the old CloudWaitlistSheet rank test after consolidation into InviteCodeModal.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#000',
    textSecondary: '#666',
    textMuted: '#999',
    teal: '#00bcd4',
    border: '#ddd',
    agentSuccess: '#4caf50',
    agentError: '#f44336',
    surfaceHover: '#eee',
    surfaceElevated: '#f5f5f5',
    background: '#fff',
    white: '#fff',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/features/waitlist/service', () => ({
  redeemInviteCode: jest.fn(),
  joinWaitlist: jest.fn(),
}));

jest.mock('@/src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (s: { markJoined: jest.Mock }) => unknown) =>
    selector({ markJoined: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { InviteCodeModal } from '@/src/features/cloud-bridge';

// We need to reach the service mock for assertion
import { joinWaitlist } from '@/src/features/waitlist/service';
const mockJoinWaitlist = joinWaitlist as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(rank: number) {
  mockJoinWaitlist.mockResolvedValue({ rank });
  return {
    open: true,
    onClose: jest.fn(),
    source: 'other' as const,
    defaultTab: 'waitlist' as const,
  };
}

async function renderConfirmed(rank: number) {
  const props = makeProps(rank);
  const utils = render(<InviteCodeModal {...props} />);

  // Fill in a valid email so the submit button is enabled
  fireEvent.changeText(utils.getByPlaceholderText('you@example.com'), 'test@example.com');

  // Press submit and wait for the async joinWaitlist to resolve → confirmed state
  await act(async () => {
    fireEvent.press(utils.getByTestId('cloud-waitlist-submit-btn'));
  });

  return utils;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InviteCodeModal — waitlist tab rank display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps submit disabled until the email is valid', () => {
    const props = makeProps(0);
    const { getByTestId, getByPlaceholderText } = render(<InviteCodeModal {...props} />);

    // Press without email — joinWaitlist should not be called
    fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    expect(mockJoinWaitlist).not.toHaveBeenCalled();

    // Invalid email — still no call
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'not-an-email');
    fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    expect(mockJoinWaitlist).not.toHaveBeenCalled();

    // Valid email — button now reachable
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    expect(getByTestId('cloud-waitlist-submit-btn')).toBeTruthy();
  });

  it('normalises the submitted email (lowercase + trim)', async () => {
    const props = makeProps(0);
    const { getByPlaceholderText, getByTestId } = render(<InviteCodeModal {...props} />);

    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  Test@Example.COM  ');

    await act(async () => {
      fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    });

    expect(mockJoinWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('renders #1 in line when server returns rank=0', async () => {
    const { getByTestId } = await renderConfirmed(0);
    const rankEl = getByTestId('cloud-waitlist-rank');
    expect(rankEl.children.join('')).toContain('#1 in line');
  });

  it('renders #1,247 in line when server returns rank=1246', async () => {
    const { getByTestId } = await renderConfirmed(1246);
    const rankEl = getByTestId('cloud-waitlist-rank');
    expect(rankEl.children.join('')).toContain('#1,247 in line');
  });
});
