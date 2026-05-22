/**
 * CloudWaitlistSheet rank display — unit tests
 *
 * Verifies the confirmed state renders rank+1 (1-indexed display) given the
 * 0-indexed rank value returned by the server RPC.
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
    surfaceHover: '#eee',
    white: '#fff',
    surface: '#fff',
    background: '#fff',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CloudWaitlistSheet } from '@/src/features/waitlist';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(rank: number) {
  return {
    visible: true,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue({ rank }),
    defaultCountry: { code: 'US', name: 'United States', flag: '🇺🇸' },
  };
}

async function renderConfirmed(rank: number) {
  const props = makeProps(rank);
  const utils = render(<CloudWaitlistSheet {...props} />);

  // Fill in a valid email so the submit button is enabled
  fireEvent.changeText(utils.getByPlaceholderText('you@example.com'), 'test@example.com');

  // Press submit and wait for the async onSubmit to resolve → confirmed state
  await act(async () => {
    fireEvent.press(utils.getByTestId('cloud-waitlist-submit-btn'));
  });

  return utils;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CloudWaitlistSheet rank display', () => {
  it('keeps submit disabled until the email is valid', () => {
    const props = makeProps(0);
    const { getByTestId, getByPlaceholderText } = render(<CloudWaitlistSheet {...props} />);

    fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    expect(props.onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'not-an-email');
    fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    expect(props.onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    expect(getByTestId('cloud-waitlist-submit-btn')).toBeTruthy();
  });

  it('normalises the submitted email and includes the selected country', async () => {
    const props = makeProps(0);
    const { getByPlaceholderText, getByTestId } = render(<CloudWaitlistSheet {...props} />);

    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  Test@Example.COM  ');

    await act(async () => {
      fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    });

    expect(props.onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      country: 'US',
    });
  });

  it('notifies the caller when a confirmed user continues on-device', async () => {
    const props = {
      ...makeProps(3),
      onJoined: jest.fn(),
    };
    const { getByPlaceholderText, getByTestId } = render(<CloudWaitlistSheet {...props} />);

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com');
    await act(async () => {
      fireEvent.press(getByTestId('cloud-waitlist-submit-btn'));
    });

    fireEvent.press(getByTestId('cloud-waitlist-continue-btn'));

    expect(props.onJoined).toHaveBeenCalledWith({ rank: 3 });
    expect(props.onClose).toHaveBeenCalledTimes(1);
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
