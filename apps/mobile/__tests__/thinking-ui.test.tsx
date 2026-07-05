/**
 * Tests for ThinkingChip and StreamingIndicator.
 *
 * ThinkingChip:
 *  - Ticks a LIVE "Thinking for Xs" timer while reasoning streams (real
 *    interval-driven state, not a static label)
 *  - Collapses to a static "Thought for Xs" once streaming completes
 *  - Tap expands the raw reasoning text
 *
 * StreamingIndicator:
 *  - Renders with "Generating response" accessibility label
 *  - Has "progressbar" accessibility role
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — avoid React.createElement(RN.*) inside factories to prevent
// NativeWind's CSSInterop Babel transform from injecting out-of-scope vars.
// ---------------------------------------------------------------------------

jest.mock('lucide-react-native', () => ({
  Clock: jest.fn().mockReturnValue(null),
  ChevronDown: jest.fn().mockReturnValue(null),
  ChevronRight: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
}));

jest.mock('react-native-reanimated', () => {
  const mockAnimated = jest.fn().mockImplementation(({ children, ...props }) => {
    const { View } = require('react-native');
    return require('react').createElement(View, props, children);
  });
  const mockAnimatedText = jest.fn().mockImplementation(({ children, ...props }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, props, children);
  });

  return {
    __esModule: true,
    default: {
      View: mockAnimated,
      Text: mockAnimatedText,
    },
    FadeIn: { duration: jest.fn(() => ({})) },
    FadeOut: { duration: jest.fn(() => ({})) },
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((factory) => factory()),
    withRepeat: jest.fn(),
    withSequence: jest.fn(),
    withTiming: jest.fn((v) => v),
    Easing: { inOut: jest.fn(() => jest.fn()), ease: {} },
    cancelAnimation: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

import { ThinkingChip } from '../src/features/chat/components/ThinkingChip';
import { StreamingIndicator } from '../src/features/chat/components/StreamingIndicator';

// ---------------------------------------------------------------------------
// ThinkingChip tests
// ---------------------------------------------------------------------------

describe('ThinkingChip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ticks a live "Thinking for Xs" timer while streaming', () => {
    const startedAt = Date.now();
    const { getByText } = render(
      <ThinkingChip thinkingText="Analyzing the request" isStreaming startedAtMs={startedAt} />,
    );

    expect(getByText(/Thinking for 0s/)).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(getByText(/Thinking for 3s/)).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(getByText(/Thinking for 7s/)).toBeTruthy();
  });

  it('stops ticking and shows the static measured duration once done', () => {
    const startedAt = Date.now();
    const { getByText, rerender } = render(
      <ThinkingChip thinkingText="Analyzing" isStreaming startedAtMs={startedAt} />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    rerender(
      <ThinkingChip
        thinkingText="Analyzing"
        isStreaming={false}
        duration={2.4}
        startedAtMs={startedAt}
      />,
    );

    expect(getByText('Thought for 2s')).toBeTruthy();
    // No interval keeps running after completion.
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(getByText('Thought for 2s')).toBeTruthy();
  });

  it('falls back to the reasoning phrase while streaming without a start timestamp', () => {
    const { queryByText } = render(<ThinkingChip thinkingText="Analyzing the data" isStreaming />);

    expect(queryByText(/Thinking for/)).toBeNull();
  });

  it('expands to show the raw reasoning text on tap after completion', () => {
    const { getByText, queryByText, getByRole } = render(
      <ThinkingChip
        thinkingText="Step 1: consider the constraints"
        isStreaming={false}
        duration={3}
      />,
    );

    // Collapsed by default once done.
    expect(queryByText('Step 1: consider the constraints')).toBeNull();

    fireEvent.press(getByRole('button'));
    expect(getByText('Step 1: consider the constraints')).toBeTruthy();
  });

  it('renders nothing for an empty completed thinking block', () => {
    const { toJSON } = render(<ThinkingChip thinkingText="   " isStreaming={false} />);

    expect(toJSON()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StreamingIndicator tests
// ---------------------------------------------------------------------------

describe('StreamingIndicator', () => {
  it('has "Generating response" accessibility label', () => {
    const { getByLabelText } = render(<StreamingIndicator />);

    expect(getByLabelText('Generating response')).toBeTruthy();
  });

  it('has "progressbar" accessibility role', () => {
    // The indicator wraps an animated SVG mark, so it must be a <View> (a <Text>
    // wrapper renders nothing on iOS). "progressbar" is the correct role for a
    // loading spinner — matching the sibling TypingIndicator.
    const { getByRole } = render(<StreamingIndicator />);

    expect(getByRole('progressbar')).toBeTruthy();
  });
});
