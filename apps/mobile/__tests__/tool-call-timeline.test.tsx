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

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#111',
    surfaceOverlay: '#222',
    surfaceHover: '#252525',
    border: '#333',
    borderLight: '#444',
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    accentText: '#000',
    transparent: 'transparent',
    agentActive: '#1e90ff',
    agentSuccess: '#10a37f',
    agentError: '#f87171',
    agentThinking: '#a78bfa',
    agentWarning: '#f90',
    warningSurface: '#332200',
  }),
}));

import { ToolCallTimeline } from '../src/features/chat/components/ToolCallTimeline';
import type { ToolCall } from '../types/chat';
import type { ToolStatus } from '@agiworkforce/types';

function makeTool(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tool-1',
    name: 'web_search',
    status: 'succeeded',
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

    expect(getByText('Decision saved: Allowed')).toBeTruthy();
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

describe('ToolCallTimeline, the seven tool statuses', () => {
  const STATUS_GLYPHS = [
    'icon-Clock',
    'icon-ShieldAlert',
    'icon-Loader2',
    'icon-CircleDashed',
    'icon-CircleSlash',
    'icon-AlertCircle',
  ];

  const EXPECTED: ReadonlyArray<[ToolStatus, string, string | null]> = [
    ['pending', 'Queued', 'icon-Clock'],
    ['awaiting-approval', 'Needs approval', 'icon-ShieldAlert'],
    ['running', 'Running', 'icon-Loader2'],
    ['succeeded', 'Done', null],
    ['partial', 'Partial result', 'icon-CircleDashed'],
    ['canceled', 'Canceled', 'icon-CircleSlash'],
    ['failed', 'Failed', 'icon-AlertCircle'],
  ];

  function renderStatus(status: ToolStatus) {
    const view = render(
      <ToolCallTimeline
        toolCalls={[makeTool({ status, name: 'read_file', output: 'body' })]}
        summary="Used 1 tool"
      />,
    );
    if (view.queryByLabelText('Used 1 tool, collapsed')) {
      fireEvent.press(view.getByText('Used 1 tool'));
    }
    return view;
  }

  it.each(EXPECTED)('renders %s with its own glyph and label', (status, label, iconTestId) => {
    const view = renderStatus(status);

    for (const glyph of STATUS_GLYPHS) {
      if (glyph === iconTestId) expect(view.getAllByTestId(glyph).length).toBeGreaterThan(0);
      else expect(view.queryByTestId(glyph)).toBeNull();
    }
    expect(view.getByLabelText(new RegExp(label, 'i'))).toBeTruthy();
  });

  it('gives every status a distinct row rendering', () => {
    const rendered = EXPECTED.map(([status]) => {
      const view = renderStatus(status);
      const snapshot = JSON.stringify(view.toJSON());
      view.unmount();
      return snapshot;
    });
    expect(new Set(rendered).size).toBe(EXPECTED.length);
  });

  it('keeps the group open while a call waits on approval', () => {
    const { getByLabelText } = render(
      <ToolCallTimeline
        toolCalls={[makeTool({ status: 'awaiting-approval' })]}
        summary="Using 1 tool"
      />,
    );
    expect(getByLabelText('Using 1 tool, expanded')).toBeTruthy();
  });

  it('closes a group whose worst outcome was a cancellation with that word, not Done', () => {
    const { getAllByText, getByText, queryByText } = render(
      <ToolCallTimeline
        toolCalls={[makeTool({ status: 'canceled' }), makeTool({ id: 't2', status: 'succeeded' })]}
        summary="Used 2 tools"
      />,
    );

    fireEvent.press(getByText('Used 2 tools'));
    expect(getAllByText('Canceled').length).toBeGreaterThan(0);
    expect(queryByText('Done')).toBeNull();
  });
});

describe('WebSearchToolCard inside the timeline', () => {
  it('shows the search query as progress while the search runs', () => {
    const tools = [makeTool({ status: 'running', input: '{"query":"AGI Workforce pricing"}' })];
    const { getByText } = render(<ToolCallTimeline toolCalls={tools} summary="Using 1 tool" />);

    expect(getByText('Searching the web\u2026')).toBeTruthy();
    expect(getByText('Searching for \u201cAGI Workforce pricing\u201d')).toBeTruthy();
  });

  it('lists the sources as openable citation chips once the search succeeds', async () => {
    const tools = [
      makeTool({
        searchResults: [
          { url: 'https://example.com/a', title: 'A' },
          { url: 'https://docs.example.org/b', title: 'B' },
        ],
      }),
    ];
    const { getByText, getByLabelText } = render(
      <ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />,
    );

    fireEvent.press(getByText('Used 1 tool'));
    expect(getByText('2 sources')).toBeTruthy();

    fireEvent.press(getByLabelText('Open source example.com, A'));
    await Promise.resolve();
    expect(require('expo-web-browser').openBrowserAsync).toHaveBeenCalledWith(
      'https://example.com/a',
      expect.anything(),
    );
  });

  it('names the failure instead of the sources when the search fails', () => {
    const tools = [makeTool({ status: 'failed', output: 'Upstream search provider refused' })];
    const { getByText } = render(<ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />);

    fireEvent.press(getByText('Used 1 tool'));
    expect(getByText('Upstream search provider refused')).toBeTruthy();
  });

  it('says the result set is incomplete when the search is partial', () => {
    const tools = [
      makeTool({ status: 'partial', searchResults: [{ url: 'https://example.com', title: 'A' }] }),
    ];
    const { getByText } = render(<ToolCallTimeline toolCalls={tools} summary="Used 1 tool" />);

    fireEvent.press(getByText('Used 1 tool'));
    expect(getByText('The search stopped early, these sources are incomplete.')).toBeTruthy();
  });
});
