/**
 * ProPlusPaywall — unit tests
 *
 * Verifies:
 *  - Renders the correct headline "Pro+ unlocks multi-provider chat"
 *  - Renders the $49.99/mo price in the CTA
 *  - Renders benefit pills
 *  - Upgrade button calls openExternalUrl with the correct URL
 *  - URL contains from=mobile-provider-switch and tier=pro_plus
 *  - "Maybe later" pressable does not throw
 *  - Dismiss icon is accessible
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

jest.mock('lucide-react-native', () => ({
  ArrowUpCircle: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
  Shuffle: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: jest.fn().mockReturnValue(true),
}));

jest.mock('../lib/theme', () => ({
  colors: {
    surfaceElevated: '#1e2025',
    textPrimary: '#ffffff',
    textSecondary: '#9ca3af',
    border: 'rgba(255,255,255,0.1)',
    teal: '#00b8a9',
    textMuted: '#6b7280',
  },
}));

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
        testID="pro-plus-upgrade-button"
      >
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../components/ui/text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <Text {...props}>{children}</Text>
    ),
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ProPlusPaywall } from '../components/Paywall/ProPlusPaywall';
import { openExternalUrl } from '@/lib/safeOpenURL';

const mockOpenExternalUrl = openExternalUrl as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  onDismiss: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProPlusPaywall rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the headline', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText('Pro+ unlocks multi-provider chat')).toBeTruthy();
  });

  it('renders the $49.99/mo price in the CTA button', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText(/\$49\.99\/mo/)).toBeTruthy();
  });

  it('renders the "Maybe later" secondary CTA', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText('Maybe later')).toBeTruthy();
  });

  it('renders the benefit pill "10+ providers"', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText('10+ providers')).toBeTruthy();
  });

  it('renders the benefit pill "Mid-thread switching"', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText('Mid-thread switching')).toBeTruthy();
  });

  it('renders the benefit pill "Cross-provider context"', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText('Cross-provider context')).toBeTruthy();
  });

  it('renders a dismiss button with correct accessibility label', () => {
    const { getByLabelText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByLabelText('Dismiss')).toBeTruthy();
  });

  it('renders body copy mentioning multi-provider chat', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(getByText(/Multi-provider chat requires the Pro\+ plan/)).toBeTruthy();
  });
});

describe('ProPlusPaywall interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls openExternalUrl when upgrade button is tapped', async () => {
    const { getByTestId } = render(<ProPlusPaywall {...defaultProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('pro-plus-upgrade-button'));
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledTimes(1);
  });

  it('opens the /pricing URL with from=mobile-provider-switch', async () => {
    const { getByTestId } = render(<ProPlusPaywall {...defaultProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('pro-plus-upgrade-button'));
    });
    const calledUrl: string = mockOpenExternalUrl.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('from=mobile-provider-switch');
    expect(calledUrl).toContain('tier=pro_plus');
    expect(calledUrl).toMatch(/^https:\/\/agiworkforce\.com\/pricing/);
  });

  it('opens URL with feature=multi_provider', async () => {
    const { getByTestId } = render(<ProPlusPaywall {...defaultProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('pro-plus-upgrade-button'));
    });
    const calledUrl: string = mockOpenExternalUrl.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('feature=multi_provider');
  });

  it('pressing "Maybe later" does not throw', () => {
    const { getByText } = render(<ProPlusPaywall {...defaultProps} />);
    expect(() => fireEvent.press(getByText('Maybe later'))).not.toThrow();
  });

  it('pressing upgrade button calls openExternalUrl exactly once', async () => {
    const { getByTestId } = render(<ProPlusPaywall {...defaultProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('pro-plus-upgrade-button'));
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledTimes(1);
  });
});
