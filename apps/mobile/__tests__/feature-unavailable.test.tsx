/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return { Sparkles: Icon, ArrowLeft: Icon };
});

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => <RN.View {...props} /> };
});

import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

describe('FeatureUnavailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('exposes exactly one "Go back" accessible control, not a duplicated/split one', () => {
    const { getAllByLabelText } = render(<FeatureUnavailable feature="Scheduled tasks" />);

    expect(getAllByLabelText('Go back')).toHaveLength(1);
  });

  it('shows the feature-specific unavailable message', () => {
    const { getByText } = render(<FeatureUnavailable feature="Scheduled tasks" />);
    expect(getByText('Scheduled tasks isn’t available yet')).toBeTruthy();
    expect(
      getByText('This feature is coming in a future update. It isn’t enabled in this build.'),
    ).toBeTruthy();
  });

  it('falls back to a generic message when no feature name is given', () => {
    const { getByText } = render(<FeatureUnavailable />);
    expect(getByText('Not available in this version')).toBeTruthy();
  });

  it('calls router.back() when history exists', () => {
    const { getByLabelText } = render(<FeatureUnavailable feature="Desktop companion" />);
    fireEvent.press(getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the chat tab when there is no history to go back to', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText } = render(<FeatureUnavailable feature="Desktop companion" />);
    fireEvent.press(getByLabelText('Go back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });
});
