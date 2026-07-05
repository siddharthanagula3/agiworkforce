/**
 * Tests for ToolCallTimeline (chat transcript tool-use timeline).
 *
 * - Renders inline with a collapsible group header (no nested scrolling)
 * - Rows expand to show Request/Response details
 * - A long tool output offers a "View full output" fullscreen affordance;
 *   the fullscreen modal closes back to the transcript (composer reachable)
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#111',
    surfaceOverlay: '#222',
    border: '#333',
    borderLight: '#444',
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    agentActive: '#1e90ff',
  }),
}));

import { ToolCallTimeline } from '../src/features/chat/components/ToolCallTimeline';
import type { ToolCall } from '../types/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tool-1',
    name: 'web_search',
    status: 'completed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolCallTimeline', () => {
  it('renders nothing for an empty tool list', () => {
    const { toJSON } = render(<ToolCallTimeline toolCalls={[]} summary="No tools" />);
    expect(toJSON()).toBeNull();
  });

  it('renders the group summary and collapses/expands on tap', () => {
    const tools = [makeTool({ output: 'result text' })];
    const { getByText, queryByText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    expect(getByText('Used 1 tool')).toBeTruthy();
    // Collapse hides the rows (the "Done" footer disappears).
    fireEvent.press(getByText('Used 1 tool'));
    expect(queryByText('Done')).toBeNull();
    // Expand brings them back.
    fireEvent.press(getByText('Used 1 tool'));
    expect(queryByText('Done')).toBeTruthy();
  });

  it('expands a row inline to show the response body', () => {
    const tools = [makeTool({ output: 'short output' })];
    const { getByText, queryByText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    expect(queryByText('short output')).toBeNull();
    // Tap the row (its accessible pressable carries the tool label text).
    fireEvent.press(getByText(/web search|searched/i));
    expect(getByText('short output')).toBeTruthy();
  });

  it('offers "View full output" for long outputs and opens/closes the fullscreen viewer', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i}: output data`).join('\n');
    const tools = [makeTool({ output: longOutput })];
    const { getByText, queryByLabelText, getByLabelText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText(/web search|searched/i));
    const opener = getByText('View full output');
    expect(opener).toBeTruthy();

    fireEvent.press(opener);
    // Fullscreen modal is open — it has a close affordance.
    const close = getByLabelText('Close tool details');
    expect(close).toBeTruthy();

    fireEvent.press(close);
    expect(queryByLabelText('Close tool details')).toBeNull();
  });

  it('does not offer fullscreen for short outputs', () => {
    const tools = [makeTool({ output: 'tiny' })];
    const { getByText, queryByText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText(/web search|searched/i));
    expect(queryByText('View full output')).toBeNull();
  });
});
