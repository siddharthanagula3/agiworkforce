import { act, fireEvent, render } from '@testing-library/react-native';

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
    Easing: { linear: (value: number) => value },
    cancelAnimation: jest.fn(),
    useAnimatedProps: (factory: () => unknown) => factory(),
    default: { createAnimatedComponent: (component: unknown) => component, View: mockAnimatedView },
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
  it('draws no prompt line when there is no prompt', () => {
    const withPrompt = render(
      <ImageGenProgress
        prompt="a red circle"
        progress={0}
        status="failed"
        errorMessage="Failed."
      />,
    );
    expect(withPrompt.UNSAFE_queryAllByProps({ numberOfLines: 2 })).not.toHaveLength(0);
    withPrompt.unmount();

    const withoutPrompt = render(
      <ImageGenProgress prompt="" progress={0} status="failed" errorMessage="Failed." />,
    );
    expect(withoutPrompt.UNSAFE_queryAllByProps({ numberOfLines: 2 })).toHaveLength(0);
    expect(withoutPrompt.getByText('Failed.')).toBeTruthy();
  });

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

describe('ImageGenProgress frame', () => {
  it('takes the requested aspect ratio so the card matches the finished image', () => {
    const { getByLabelText } = render(
      <ImageGenProgress prompt="A harbour" status="generating" aspectRatio="16:9" />,
    );

    expect(getByLabelText('Image generation generating')).toHaveStyle({ aspectRatio: 16 / 9 });
  });

  it('falls back to a square when the ratio is auto or malformed', () => {
    const auto = render(
      <ImageGenProgress prompt="A harbour" status="generating" aspectRatio="auto" />,
    );
    expect(auto.getByLabelText('Image generation generating')).toHaveStyle({ aspectRatio: 1 });
    const none = render(<ImageGenProgress prompt="A harbour" status="pending" />);
    expect(none.getByLabelText('Image generation pending')).toHaveStyle({ aspectRatio: 1 });
  });

  it('sizes to the same frame the finished image uses when the width is known', () => {
    const { getByLabelText } = render(
      <ImageGenProgress prompt="A harbour" status="generating" aspectRatio="2:1" width={300} />,
    );

    expect(getByLabelText('Image generation generating')).toHaveStyle({
      width: 300,
      minHeight: 150,
    });
  });

  it('holds the height of a tall portrait frame so the transcript does not jump', () => {
    const { getByLabelText } = render(
      <ImageGenProgress prompt="A harbour" status="generating" aspectRatio="9:16" width={300} />,
    );

    expect(getByLabelText('Image generation generating').props.style.minHeight).toBe(512);
  });

  it('holds the height of a wide frame', () => {
    const { getByLabelText } = render(
      <ImageGenProgress prompt="A harbour" status="pending" aspectRatio="16:9" width={300} />,
    );

    expect(getByLabelText('Image generation pending').props.style.minHeight).toBe(168.75);
  });

  it('lets the card grow past the frame when its content needs more room', () => {
    const { getByLabelText } = render(
      <ImageGenProgress
        prompt="A harbour"
        status="generating"
        progress={40}
        aspectRatio="16:9"
        width={300}
      />,
    );

    expect(getByLabelText('Image generation generating').props.style.height).toBeUndefined();
  });

  it('keeps the failed card compact', () => {
    const { getByLabelText } = render(
      <ImageGenProgress prompt="A harbour" status="failed" aspectRatio="16:9" width={300} />,
    );

    const style = getByLabelText('Image generation failed').props.style;
    expect(style.aspectRatio).toBeUndefined();
    expect(style.height).toBeUndefined();
  });
});

describe('ImageGenProgress timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-14T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts the time the image has been generating, each second', () => {
    const { getByTestId } = render(<ImageGenProgress prompt="A lighthouse" status="generating" />);

    expect(getByTestId('image-gen-elapsed')).toHaveTextContent('0:00');
    act(() => {
      jest.advanceTimersByTime(65_000);
    });
    expect(getByTestId('image-gen-elapsed')).toHaveTextContent('1:05');
  });

  it('counts from when the generation started', () => {
    const { getByTestId } = render(
      <ImageGenProgress prompt="A lighthouse" status="pending" startedAt={Date.now() - 12_000} />,
    );

    expect(getByTestId('image-gen-elapsed')).toHaveTextContent('0:12');
  });

  it('restarts the elapsed time when a recycled row gets another image start time', () => {
    const { getByTestId, rerender } = render(
      <ImageGenProgress
        prompt="A lighthouse"
        status="generating"
        startedAt={Date.now() - 90_000}
      />,
    );

    expect(getByTestId('image-gen-elapsed')).toHaveTextContent('1:30');
    rerender(
      <ImageGenProgress prompt="A harbour" status="generating" startedAt={Date.now() - 5_000} />,
    );
    expect(getByTestId('image-gen-elapsed')).toHaveTextContent('0:05');
  });

  it('holds Retry until the provider says to try again, counting down', () => {
    const onRetry = jest.fn();
    const { getByLabelText, queryByTestId } = render(
      <ImageGenProgress
        prompt="A lighthouse"
        status="failed"
        errorMessage="Too many requests."
        onRetry={onRetry}
        retryAt={Date.now() + 3_000}
      />,
    );

    expect(queryByTestId('image-gen-elapsed')).toBeNull();
    expect(getByLabelText('Retry in 0:03')).toBeDisabled();
    fireEvent.press(getByLabelText('Retry in 0:03'));
    expect(onRetry).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(getByLabelText('Retry in 0:02')).toBeDisabled();
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    fireEvent.press(getByLabelText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
