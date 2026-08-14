/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Tests for ThinkingChip — the reasoning status line and its detail sheet.
 *
 * History: this was a status-only chip, then an inline accordion that
 * auto-expanded while streaming. On a phone that unfolded a wall of
 * chain-of-thought above the answer and reflowed the list on every token, so
 * the transcript now carries ONE muted status line and the reasoning text
 * lives in a bottom sheet opened by tapping it. These tests pin that: the
 * text is never inline, tapping opens it, and closing puts it away.
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

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  const SafeAreaView = (props: Record<string, unknown>) => <RN.View {...props} />;
  SafeAreaView.displayName = 'SafeAreaView';
  return { SafeAreaView };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return { Clock: Icon, ChevronRight: Icon, X: Icon };
});

import { ThinkingChip } from '@/src/features/chat/components/ThinkingChip';

describe('ThinkingChip', () => {
  it('keeps the reasoning text out of the transcript while streaming', () => {
    const { queryByText, getByLabelText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming />,
    );

    // The status line is there; the chain-of-thought is not inline.
    expect(getByLabelText('Show reasoning')).toBeTruthy();
    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('keeps the reasoning text out of the transcript once done', () => {
    const { queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('opens the detail sheet on tap and closes it again', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));
    expect(getByText('Considering the options.')).toBeTruthy();

    fireEvent.press(getByLabelText('Close reasoning'));
    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('shows "Thought for Xs" once done with a duration', () => {
    const { getByText } = render(
      <ThinkingChip thinkingText="Done thinking." isStreaming={false} duration={4} />,
    );

    expect(getByText('Thought for 4s')).toBeTruthy();
  });

  it('states the plain label instead of "Thought for 0s" when no duration was reported', () => {
    const { getByText } = render(
      <ThinkingChip thinkingText="Done thinking." isStreaming={false} duration={0} />,
    );

    expect(getByText('Thought process')).toBeTruthy();
  });

  it('does not render for an empty completed reasoning block', () => {
    const { queryByLabelText } = render(
      <ThinkingChip thinkingText="" isStreaming={false} duration={0} />,
    );

    expect(queryByLabelText('Show reasoning')).toBeNull();
  });
});
