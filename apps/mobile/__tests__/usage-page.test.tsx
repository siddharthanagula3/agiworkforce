/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockFetchUsageSummary = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: mockBack,
  }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({
  FEATURES: {
    billing: true,
  },
}));

jest.mock('@/services/usage', () => ({
  fetchUsageSummary: (...args: unknown[]) => mockFetchUsageSummary(...args),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const animation = {
    duration: jest.fn(() => animation),
    delay: jest.fn(() => animation),
  };

  return {
    __esModule: true,
    default: {
      View: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    },
    FadeInDown: animation,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    BarChart3: icon,
    CreditCard: icon,
    RotateCcw: icon,
    ChevronRight: icon,
    Cpu: icon,
    MessageSquare: icon,
    TrendingUp: icon,
  };
});

import UsageScreen from '../app/(app)/usage';

describe('Usage screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchUsageSummary.mockResolvedValue({
      period: 'June 2026',
      totalInputTokens: 900,
      totalOutputTokens: 300,
      totalTokens: 1200,
      totalCost: 0.42,
      conversationCount: 6,
      modelBreakdown: [],
      dailyUsage: [],
    });
  });

  it('does not render fabricated quota numbers when usage API has no limits', async () => {
    const { findByText, queryByText } = render(<UsageScreen />);

    await waitFor(() => expect(mockFetchUsageSummary).toHaveBeenCalledTimes(1));
    expect(await findByText('Usage This Period')).toBeTruthy();

    await waitFor(() => {
      expect(queryByText('Monthly quota')).toBeNull();
      expect(queryByText(/100\.0K tokens/)).toBeNull();
      expect(queryByText(/\/ \$50/)).toBeNull();
    });
  });
});
