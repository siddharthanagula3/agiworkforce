/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Tests for ThinkingChip — the collapsible reasoning/thinking status block.
 *
 * Rewritten from a status-only, non-expandable chip ("Mobile intentionally
 * does not expose chain-of-thought text") into a collapsible block matching
 * apps/web's ThinkingBlock: action-status header (Clock icon + "REASONING"
 * label + live status) with a chevron that expands to show the full
 * reasoning text — auto-expanded while streaming, auto-collapsing once done
 * unless the user has manually toggled it.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
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
  return { Clock: Icon, ChevronDown: Icon };
});

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (value: unknown) => value,
  };
});

import { ThinkingChip } from '@/src/features/chat/components/ThinkingChip';

describe('ThinkingChip', () => {
  it('is expanded by default while streaming, showing the reasoning text', () => {
    const { getByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming />,
    );

    expect(getByText('Considering the options.')).toBeTruthy();
  });

  it('is collapsed by default once done, hiding the reasoning text', () => {
    const { queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('expands and collapses the reasoning text on tap', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    fireEvent.press(getByLabelText('Expand reasoning block'));
    expect(getByText('Considering the options.')).toBeTruthy();

    fireEvent.press(getByLabelText('Collapse reasoning block'));
    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('shows "Thought for Xs" once done with a duration', () => {
    const { getByText } = render(
      <ThinkingChip thinkingText="Done thinking." isStreaming={false} duration={4} />,
    );

    expect(getByText('Thought for 4s')).toBeTruthy();
  });

  it('does not render for an empty completed reasoning block', () => {
    const { queryByLabelText } = render(
      <ThinkingChip thinkingText="" isStreaming={false} duration={0} />,
    );

    expect(queryByLabelText('Expand reasoning block')).toBeNull();
  });

  it('does not auto-collapse after the user manually expands a completed block', () => {
    const { getByLabelText, rerender, getByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming duration={2} />,
    );

    // Streaming ends — chip auto-collapses (no manual toggle yet).
    rerender(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={3} />,
    );

    // User manually expands the completed block.
    fireEvent.press(getByLabelText('Expand reasoning block'));
    expect(getByText('Considering the options.')).toBeTruthy();

    // A re-render with the same completed state must not auto-collapse it again.
    rerender(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={3} />,
    );
    expect(getByText('Considering the options.')).toBeTruthy();
  });
});
