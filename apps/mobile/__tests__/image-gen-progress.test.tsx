import { render } from '@testing-library/react-native';

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('lucide-react-native', () => ({
  AlertCircle: jest.fn().mockReturnValue(null),
  ImagePlus: jest.fn().mockReturnValue(null),
  Loader2: jest.fn().mockReturnValue(null),
}));

jest.mock('react-native-reanimated', () => {
  const mockAnimatedView = jest.fn().mockImplementation(({ children, ...props }) => {
    const { View } = require('react-native');
    return require('react').createElement(View, props, children);
  });

  return {
    __esModule: true,
    default: {
      View: mockAnimatedView,
    },
    FadeInDown: {
      duration: jest.fn(() => ({
        springify: jest.fn(() => undefined),
      })),
    },
    useAnimatedStyle: jest.fn((factory) => factory()),
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    withRepeat: jest.fn((value) => value),
    withTiming: jest.fn((value) => value),
  };
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme');
  return {
    ...actual,
    useThemeColors: jest.fn(() => actual.lightColors),
  };
});

import { ImageGenProgress } from '../src/features/chat/components/ImageGenProgress';
import { lightColors } from '../src/ui/theme';

describe('ImageGenProgress', () => {
  it('renders the pending image generation card with active theme colors', () => {
    const { getByLabelText, getByText } = render(
      <ImageGenProgress prompt="Draw a clean AGI product mockup" progress={0} status="pending" />,
    );

    expect(getByLabelText('Image generation pending')).toHaveStyle({
      backgroundColor: lightColors.surfaceElevated,
      borderColor: lightColors.border,
    });
    expect(getByText('Generating Image…')).toHaveStyle({
      color: lightColors.textPrimary,
    });
    expect(getByText('Queued...')).toHaveStyle({
      color: lightColors.textMuted,
    });
  });

  it('shows an honest indeterminate state when the server exposes no progress feed', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ImageGenProgress prompt="Draw a product launch" status="generating" />,
    );

    expect(getByLabelText('Image generation generating')).toHaveAccessibilityValue({
      text: 'In progress',
    });
    expect(getByText('Generating securely in AGI Cloud…')).toBeTruthy();
    expect(queryByText('0% complete')).toBeNull();
  });
});
