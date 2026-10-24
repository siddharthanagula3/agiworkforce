/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import 'react-native-gesture-handler/jestSetup';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.lightColors,
  };
});

jest.mock('@/components/ui/Text', () => {
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
  return { Brain: Icon, Clock: Icon, ChevronRight: Icon, Globe: Icon, X: Icon };
});

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(async () => true),
}));

import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { buildThinkingSteps, ThinkingChip } from '@/src/features/chat/components/ThinkingChip';

function searchActivity(): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 's1',
    turnId: 't1',
    lastSequence: 3,
    status: 'completed',
    startedAtMs: 0,
    updatedAtMs: 10,
    entries: [
      {
        kind: 'tool',
        id: 'e1',
        toolCallId: 'call-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching',
        status: 'completed',
        startedAtMs: 0,
        query: 'event schedule',
        sources: [{ url: 'https://www.luma.com/e/1', title: 'Luma event' }],
      },
      {
        kind: 'sources',
        id: 'e2',
        toolCallId: 'call-1',
        sources: [
          { url: 'https://www.luma.com/e/1', title: 'Luma event' },
          { url: 'https://ataconference.org/', title: 'ATA' },
        ],
        emittedAtMs: 5,
      },
      {
        kind: 'sources',
        id: 'e3',
        sources: [{ url: 'https://example.org/x', title: 'Example' }],
        emittedAtMs: 6,
      },
      {
        kind: 'tool',
        id: 'e4',
        toolCallId: 'call-2',
        name: 'web_search',
        category: 'web-search',
        summary: 'Unavailable',
        status: 'failed',
        unavailable: true,
        startedAtMs: 0,
      },
      {
        kind: 'tool',
        id: 'e5',
        toolCallId: 'call-3',
        name: 'shell',
        category: 'shell',
        summary: 'ls',
        status: 'completed',
        startedAtMs: 0,
      },
    ],
  };
}

describe('ThinkingChip', () => {
  it('keeps the reasoning text out of the transcript while streaming', () => {
    const { queryByText, getByLabelText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming />,
    );

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

  it('announces the sheet title as a heading', () => {
    const { getByLabelText, getByRole } = render(
      <ThinkingChip thinkingText="Considering." isStreaming />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));
    expect(getByRole('header').props.children).toBe('Thinking');
  });

  it('dismisses the sheet when the header is dragged down past the threshold', () => {
    const { getByLabelText, queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));
    expect(queryByText('Considering the options.')).toBeTruthy();

    act(() => {
      fireGestureHandler(getByGestureTestId('thinking-sheet-drag'), [
        { translationY: 0 },
        { translationY: 40 },
        { translationY: 140, velocityY: 200 },
      ]);
    });
    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('dismisses the sheet on a fast downward flick', () => {
    const { getByLabelText, queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));
    act(() => {
      fireGestureHandler(getByGestureTestId('thinking-sheet-drag'), [
        { translationY: 0 },
        { translationY: 30, velocityY: 1500 },
      ]);
    });
    expect(queryByText('Considering the options.')).toBeNull();
  });

  it('keeps the sheet open when the drag is short and slow', () => {
    const { getByLabelText, queryByText } = render(
      <ThinkingChip thinkingText="Considering the options." isStreaming={false} duration={4} />,
    );

    fireEvent.press(getByLabelText('Show reasoning'));
    act(() => {
      fireGestureHandler(getByGestureTestId('thinking-sheet-drag'), [
        { translationY: 0 },
        { translationY: 30, velocityY: 100 },
      ]);
    });
    expect(queryByText('Considering the options.')).toBeTruthy();
  });

  it('lists titled reasoning sections as ordered steps joined by a connector', () => {
    const text =
      '**Reviewing event details**\nChecking the dates.\n\n**Clarifying the prize**\nConfirming it.';
    const steps = buildThinkingSteps(text);
    expect(steps.map((step) => step.title)).toEqual([
      'Reviewing event details',
      'Clarifying the prize',
    ]);
    expect(steps.every((step) => step.kind === 'thought')).toBe(true);

    const { getByLabelText, getByText, getAllByTestId } = render(
      <ThinkingChip thinkingText={text} isStreaming={false} duration={4} />,
    );
    fireEvent.press(getByLabelText('Show reasoning'));

    expect(getByText('Reviewing event details')).toBeTruthy();
    expect(getByText('Checking the dates.')).toBeTruthy();
    expect(getByText('Clarifying the prize')).toBeTruthy();
    expect(getAllByTestId('thinking-step-connector')).toHaveLength(1);
  });

  it('shows untitled reasoning as one step with no connector', () => {
    const { getByLabelText, getByText, queryAllByTestId } = render(
      <ThinkingChip thinkingText="Just thinking aloud." isStreaming={false} duration={4} />,
    );
    fireEvent.press(getByLabelText('Show reasoning'));

    expect(getByText('Reasoning')).toBeTruthy();
    expect(getByText('Just thinking aloud.')).toBeTruthy();
    expect(queryAllByTestId('thinking-step-connector')).toHaveLength(0);
  });

  it('adds web search steps with deduplicated source chips after the reasoning', () => {
    const steps = buildThinkingSteps('Plan it.', searchActivity());
    expect(steps.map((step) => [step.kind, step.title])).toEqual([
      ['thought', 'Reasoning'],
      ['search', 'Searching the web'],
      ['search', 'Searching the web'],
    ]);
    const first = steps[1];
    expect(first?.kind === 'search' && first.sources.map((source) => source.url)).toEqual([
      'https://www.luma.com/e/1',
      'https://ataconference.org/',
    ]);
    expect(first?.kind === 'search' && first.body).toBe('event schedule');
  });

  it('renders the search step in the sheet and opens a source chip', () => {
    const { getByLabelText, getAllByText, getByText } = render(
      <ThinkingChip
        thinkingText="Plan it."
        isStreaming={false}
        duration={4}
        activity={searchActivity()}
      />,
    );
    fireEvent.press(getByLabelText('Show reasoning'));

    expect(getAllByText('Searching the web')).toHaveLength(2);
    expect(getByText('luma.com')).toBeTruthy();
    fireEvent.press(getByText('ataconference.org'));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith('https://ataconference.org/');
  });
});
