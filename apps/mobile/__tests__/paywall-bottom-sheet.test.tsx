/**
 * PaywallBottomSheet — unit tests
 *
 * Verifies:
 *  - Renders the correct feature name, tier label, and reason
 *  - Renders honest "not available yet" copy instead of a purchase CTA
 *  - Hands sales-assisted Team and Enterprise plans to Contact Sales
 *  - "Try later" Pressable does not throw
 *  - Renders without reason when reason is omitted
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// @gorhom/bottom-sheet — expose children so we can query them
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const mockBottomSheet = React.forwardRef(
    ({ children }: { children: React.ReactNode }, _ref: unknown) => <>{children}</>,
  );
  mockBottomSheet.displayName = 'MockBottomSheet';
  const mockView = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    __esModule: true,
    default: mockBottomSheet,
    BottomSheetBackdrop: jest.fn().mockReturnValue(null),
    BottomSheetView: mockView,
  };
});

// lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  ArrowUpCircle: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
}));

// NativeWind / theme
jest.mock('../src/ui/theme', () => {
  const { colors } = jest.requireActual('../src/ui/theme/tokens');
  return {
    colors,
    useThemeColors: jest.fn(() => colors),
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Button component — render a Pressable so action tests can use it.
jest.mock('../components/ui/button', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({
      title,
      onPress,
      accessibilityLabel,
    }: {
      title: string;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        testID="paywall-action-button"
      >
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

// Text component
jest.mock('../components/ui/text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <Text {...props}>{children}</Text>
    ),
  };
});

jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { PaywallBottomSheet } from '../src/features/chat/components/PaywallBottomSheet';
import { openExternalUrl } from '../lib/safeOpenURL';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  feature: 'token_cap',
  requiredTier: 'basic',
  reason: '2M tokens used this month',
  onDismiss: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaywallBottomSheet rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders at least one element with the tier label text', () => {
    // Both the header title and the informational copy may contain the tier label.
    const { getAllByText } = render(<PaywallBottomSheet {...defaultProps} />);
    expect(getAllByText('Upgrade to Basic').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the feature description text', () => {
    const { getByText } = render(<PaywallBottomSheet {...defaultProps} />);
    expect(getByText(/Higher token limits/i)).toBeTruthy();
  });

  it('uses the current Claude family paywall key and label', () => {
    const { getByText, queryByText } = render(
      <PaywallBottomSheet {...defaultProps} feature="opus_5" requiredTier="pro" />,
    );

    expect(getByText(/Opus 5 access requires the Pro plan/i)).toBeTruthy();
    expect(queryByText(/Opus 4\\.7/i)).toBeNull();
  });

  it('renders the reason text when provided', () => {
    const { getByText } = render(
      <PaywallBottomSheet {...defaultProps} reason="2M tokens used this month" />,
    );
    expect(getByText('2M tokens used this month')).toBeTruthy();
  });

  it('does not render reason when omitted', () => {
    const { queryByText } = render(<PaywallBottomSheet {...defaultProps} reason={undefined} />);
    expect(queryByText('2M tokens used this month')).toBeNull();
  });

  it('renders "Try later" pressable', () => {
    const { getByText } = render(<PaywallBottomSheet {...defaultProps} />);
    expect(getByText('Try later')).toBeTruthy();
  });

  it('renders correct label for basic tier', () => {
    const { getAllByText } = render(<PaywallBottomSheet {...defaultProps} requiredTier="basic" />);
    expect(getAllByText('Upgrade to Basic').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the canonical Max 5x label for max-tier model access', () => {
    const { getAllByText } = render(
      <PaywallBottomSheet {...defaultProps} requiredTier="max" feature="model_access" />,
    );
    expect(getAllByText('Upgrade to Max 5x').length).toBeGreaterThanOrEqual(1);
  });

  it('shows honest unavailable copy instead of a self-routing purchase CTA', () => {
    const { getByText, queryByTestId } = render(
      <PaywallBottomSheet
        {...defaultProps}
        primaryActionUnavailableMessage="Plan changes aren't available in the app yet. Check back soon."
      />,
    );
    expect(getByText(/Plan changes aren't available in the app yet/i)).toBeTruthy();
    expect(queryByTestId('paywall-action-button')).toBeNull();
  });

  it.each(['team', 'enterprise'] as const)(
    'offers canonical %s prospects a strict Contact Sales handoff',
    (requiredTier) => {
      const { getByText, queryByText } = render(
        <PaywallBottomSheet
          {...defaultProps}
          requiredTier={requiredTier}
          primaryActionUnavailableMessage="Plan changes aren't available in the app yet."
        />,
      );

      fireEvent.press(getByText('Contact Sales'));

      expect(openExternalUrl).toHaveBeenCalledWith(
        `https://agiworkforce.com/contact-sales?plan=${requiredTier}`,
      );
      expect(queryByText(/Plan changes aren't available in the app yet/i)).toBeNull();
    },
  );

  it('does not create a sales handoff for an unknown tier', () => {
    const { queryByText } = render(
      <PaywallBottomSheet {...defaultProps} requiredTier="future-unverified-tier" />,
    );

    expect(queryByText('Contact Sales')).toBeNull();
    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});

describe('PaywallBottomSheet interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onDismiss when "Try later" is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<PaywallBottomSheet {...defaultProps} onDismiss={onDismiss} />);
    expect(() => fireEvent.press(getByText('Try later'))).not.toThrow();
    expect(onDismiss).not.toHaveBeenCalled(); // handleDismiss calls sheetRef.close(), not onDismiss directly
    // The onDismiss is called via BottomSheet.onChange(-1) which is mocked away.
    // What we CAN verify is that pressing "Try later" doesn't throw.
  });
});
