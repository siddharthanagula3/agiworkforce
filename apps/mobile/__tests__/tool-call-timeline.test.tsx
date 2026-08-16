
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
    agentWarning: '#f90',
    warningSurface: '#332200',
  }),
}));

import { ToolCallTimeline } from '../src/features/chat/components/ToolCallTimeline';
import type { ToolCall } from '../types/chat';

function makeTool(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tool-1',
    name: 'web_search',
    status: 'completed',
    ...overrides,
  };
}

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
    expect(queryByText('Done')).toBeNull();
    fireEvent.press(getByText('Used 1 tool'));
    expect(queryByText('Done')).toBeTruthy();
    fireEvent.press(getByText('Used 1 tool'));
    expect(queryByText('Done')).toBeNull();
  });

  it('expands a row inline to show the response body', () => {
    const tools = [makeTool({ output: 'short output' })];
    const { getByText, queryByText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    expect(queryByText('short output')).toBeNull();
    fireEvent.press(getByText('Used 1 tool'));
    fireEvent.press(getByText(/web search|searched/i));
    expect(getByText('short output')).toBeTruthy();
  });

  it('offers "View full output" for long outputs and opens/closes the fullscreen viewer', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i}: output data`).join('\n');
    const tools = [makeTool({ output: longOutput })];
    const { getByText, queryByLabelText, getByLabelText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText('Used 1 tool'));
    fireEvent.press(getByText(/web search|searched/i));
    const opener = getByText('View full output');
    expect(opener).toBeTruthy();

    fireEvent.press(opener);
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

    fireEvent.press(getByText('Used 1 tool'));
    fireEvent.press(getByText(/web search|searched/i));
    expect(queryByText('View full output')).toBeNull();
  });

  it('shows a persisted partial approval decision while waiting on other calls', () => {
    const onResolveApproval = jest.fn();
    const tools = [
      makeTool({
        id: 'id:call_1',
        name: 'mcp__github__create_comment',
        toolCallId: 'call_1',
        requiresApproval: true,
        approvalDecision: 'approved',
        status: 'running',
      }),
    ];
    const { getByText } = render(
      <ToolCallTimeline
        toolCalls={tools}
        summary="Used 1 tool"
        onResolveApproval={onResolveApproval}
      />,
    );

    expect(getByText('Decision saved: allow')).toBeTruthy();
    expect(getByText('Allowed')).toBeTruthy();
  });

  it('surfaces failure and supplied duration in the compact row', () => {
    const tools = [makeTool({ status: 'failed', duration: 1_250, output: 'Provider timed out' })];
    const { getByText, getByLabelText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText('Used 1 tool'));
    expect(getByText('Failed · 1.3s')).toBeTruthy();
    expect(getByLabelText(/failed/i)).toBeTruthy();
  });
});

describe('ToolCallTimeline auto-collapse', () => {
  it('stays expanded while a tool is still running', () => {
    const tools = [makeTool({ status: 'running' })];
    const { getByLabelText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Using 1 tool" />,
    );

    expect(getByLabelText('Using 1 tool, expanded')).toBeTruthy();
  });

  it('collapses once every tool has finished', () => {
    const tools = [makeTool({ output: 'result text' })];
    const { queryByText } = render(<ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />);

    expect(queryByText('Done')).toBeNull();
  });

  it('does not re-collapse a group the user deliberately opened', () => {
    const tools = [makeTool({ output: 'result text' })];
    const { getByText, queryByText, rerender } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText('Used 1 tool'));
    expect(queryByText('Done')).toBeTruthy();

    rerender(<ToolCallTimeline toolCalls={[...tools]} summary="Used 1 tool" />);
    expect(queryByText('Done')).toBeTruthy();
  });
});
