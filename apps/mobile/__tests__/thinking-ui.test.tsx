/**
 * Tests for ThinkingLine, ThinkingBottomSheet, and StreamingIndicator.
 *
 * ThinkingLine:
 *  - Shows "Thinking..." during streaming
 *  - Shows "Thought for X.Xs" after completion
 *  - Is tappable (calls onPress)
 *
 * ThinkingBottomSheet:
 *  - Renders title "Thought process"
 *  - Shows thinking text content
 *  - Strips <thinking>/<reasoning> XML tags
 *  - Appends "..." while streaming
 *
 * StreamingIndicator:
 *  - Renders teal sparkle character
 *  - Has "Generating response" accessibility label
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — avoid React.createElement(RN.*) inside factories to prevent
// NativeWind's CSSInterop Babel transform from injecting out-of-scope vars.
// ---------------------------------------------------------------------------

jest.mock('lucide-react-native', () => ({
  Clock: jest.fn().mockReturnValue(null),
  ChevronRight: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const mockBottomSheet = jest.fn().mockImplementation(({ children }) => children);
  const mockBottomSheetScrollView = jest.fn().mockImplementation(({ children }) => children);
  return {
    __esModule: true,
    default: mockBottomSheet,
    BottomSheetBackdrop: jest.fn().mockReturnValue(null),
    BottomSheetScrollView: mockBottomSheetScrollView,
  };
});

jest.mock('react-native-reanimated', () => {
  const mockAnimatedText = jest.fn().mockImplementation(({ children, ...props }) => {
    // Return a native Text-like element via require inside the implementation
    // (not in the factory scope, so NativeWind won't transform it)
    const { Text } = require('react-native');
    return require('react').createElement(Text, props, children);
  });

  return {
    __esModule: true,
    default: {
      View: jest.fn().mockImplementation(({ children }) => children),
      Text: mockAnimatedText,
    },
    useSharedValue: jest.fn((initial) => ({ value: initial })),
    useAnimatedStyle: jest.fn((factory) => factory()),
    withRepeat: jest.fn(),
    withSequence: jest.fn(),
    withTiming: jest.fn(),
    Easing: { inOut: jest.fn(() => jest.fn()), ease: {} },
    cancelAnimation: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

import { ThinkingLine } from '../components/chat/ThinkingLine';
import { ThinkingBottomSheet } from '../components/chat/ThinkingBottomSheet';
import { StreamingIndicator } from '../components/chat/StreamingIndicator';

// ---------------------------------------------------------------------------
// ThinkingLine tests
// ---------------------------------------------------------------------------

describe('ThinkingLine', () => {
  it('shows "Thinking..." when isStreaming is true', () => {
    const { getByText } = render(<ThinkingLine isStreaming onPress={jest.fn()} />);

    expect(getByText('Thinking...')).toBeTruthy();
  });

  it('shows "Thought for X.Xs" after completion with duration', () => {
    const { getByText } = render(
      <ThinkingLine isStreaming={false} duration={3.5} onPress={jest.fn()} />,
    );

    expect(getByText('Thought for 3.5s')).toBeTruthy();
  });

  it('shows "Thought for 0.0s" for zero duration', () => {
    const { getByText } = render(
      <ThinkingLine isStreaming={false} duration={0} onPress={jest.fn()} />,
    );

    expect(getByText('Thought for 0.0s')).toBeTruthy();
  });

  it('shows "Thought process" when not streaming and no duration', () => {
    const { getByText } = render(<ThinkingLine isStreaming={false} onPress={jest.fn()} />);

    expect(getByText('Thought process')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<ThinkingLine isStreaming duration={2.0} onPress={onPress} />);

    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has the correct accessibility label when streaming', () => {
    const { getByLabelText } = render(<ThinkingLine isStreaming onPress={jest.fn()} />);

    expect(getByLabelText('Thinking.... Tap to view thought process.')).toBeTruthy();
  });

  it('has the correct accessibility label when completed', () => {
    const { getByLabelText } = render(
      <ThinkingLine isStreaming={false} duration={5.2} onPress={jest.fn()} />,
    );

    expect(getByLabelText('Thought for 5.2s. Tap to view thought process.')).toBeTruthy();
  });

  it('formats long durations correctly', () => {
    const { getByText } = render(
      <ThinkingLine isStreaming={false} duration={120.456} onPress={jest.fn()} />,
    );

    expect(getByText('Thought for 120.5s')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ThinkingBottomSheet tests
// ---------------------------------------------------------------------------

describe('ThinkingBottomSheet', () => {
  it('renders the "Thought process" title', () => {
    const { getByText } = render(
      <ThinkingBottomSheet
        thinkingText="Some reasoning"
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Thought process')).toBeTruthy();
  });

  it('shows thinking text content', () => {
    const { getByText } = render(
      <ThinkingBottomSheet
        thinkingText="Let me analyze this step by step."
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Let me analyze this step by step.')).toBeTruthy();
  });

  it('strips <thinking> XML tags from content', () => {
    const { getByText, queryByText } = render(
      <ThinkingBottomSheet
        thinkingText="<thinking>Analysis of the problem</thinking>"
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Analysis of the problem')).toBeTruthy();
    expect(queryByText('<thinking>')).toBeNull();
  });

  it('strips <reasoning> XML tags from content', () => {
    const { getByText, queryByText } = render(
      <ThinkingBottomSheet
        thinkingText="<reasoning>Deep thought here</reasoning>"
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Deep thought here')).toBeTruthy();
    expect(queryByText('<reasoning>')).toBeNull();
  });

  it('appends "..." while streaming', () => {
    const { getByText } = render(
      <ThinkingBottomSheet
        thinkingText="Working on it"
        isStreaming
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Working on it...')).toBeTruthy();
  });

  it('does not append "..." after streaming completes', () => {
    const { getByText, queryByText } = render(
      <ThinkingBottomSheet
        thinkingText="Final answer"
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Final answer')).toBeTruthy();
    expect(queryByText('Final answer...')).toBeNull();
  });

  it('has a close button with proper accessibility', () => {
    const { getByLabelText } = render(
      <ThinkingBottomSheet
        thinkingText="text"
        isStreaming={false}
        sheetIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByLabelText('Close thought process')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StreamingIndicator tests
// ---------------------------------------------------------------------------

describe('StreamingIndicator', () => {
  it('renders the sparkle character', () => {
    const { getByText } = render(<StreamingIndicator />);

    // U+2728 is the sparkle emoji
    expect(getByText('\u2728')).toBeTruthy();
  });

  it('has "Generating response" accessibility label', () => {
    const { getByLabelText } = render(<StreamingIndicator />);

    expect(getByLabelText('Generating response')).toBeTruthy();
  });

  it('has "text" accessibility role', () => {
    const { getByRole } = render(<StreamingIndicator />);

    expect(getByRole('text')).toBeTruthy();
  });
});
