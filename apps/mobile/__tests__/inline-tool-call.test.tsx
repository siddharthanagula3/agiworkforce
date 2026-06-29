/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * InlineToolCall — tool-calling UI verification (QA Round 2, Phase 11, deterministic path)
 *
 * Drives the real InlineToolCall component from known ToolCall fixtures (not a
 * live model) so coverage of the tool-call card is not hostage to model
 * behaviour. Verifies the parity rubric:
 *   - icon + tool name rendered
 *   - status: running -> "Running", completed -> "Done", failed -> "Error"
 *   - input/command preview drives an expandable (chevron + a11y hint) body
 *   - NO raw JSON in the collapsed bar (input lives in the expandable sheet)
 *   - accessibility label per tool call
 */

import { render } from '@testing-library/react-native';
import { InlineToolCall } from '../src/features/chat/components/InlineToolCall';
import type { ToolCall } from '../types/chat';

// Render every lucide icon (including the dynamic ones toolIconRN resolves) as a
// labelled Text node so we can assert which status glyph appears.
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        const Icon = () => <Text testID={`icon-${String(name)}`}>{String(name)}</Text>;
        Icon.displayName = String(name);
        return Icon;
      },
    },
  );
});

// The real BottomSheet starts at index={-1} (collapsed) so its children — the
// input/output detail body — are NOT visible until the user expands it. Model the
// mock the same way (render nothing) so assertions reflect the COLLAPSED bar only.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const BottomSheet = React.forwardRef((_props: unknown, _ref: React.Ref<unknown>) => null);
  BottomSheet.displayName = 'BottomSheet';
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: () => null,
  };
});

const baseFixture: ToolCall = {
  id: 'tc-1',
  name: 'web_search',
  input: '{"query":"weather in Paris today","max_results":5}',
  output: 'Paris: 18°C, partly cloudy.',
  status: 'running',
};

describe('InlineToolCall — tool-calling UI rubric', () => {
  it('running: shows the tool name, a "Running" status label, and the loader glyph', () => {
    const { getByText, queryAllByTestId, getByLabelText } = render(
      <InlineToolCall toolCall={{ ...baseFixture, status: 'running' }} />,
    );
    expect(getByText('web_search')).toBeTruthy();
    expect(getByText('Running')).toBeTruthy();
    expect(queryAllByTestId('icon-Loader2').length).toBeGreaterThan(0);
    expect(getByLabelText('Tool call: web_search')).toBeTruthy();
  });

  it('completed: shows a "Done" status label and the success check glyph', () => {
    const { getByText, queryAllByTestId } = render(
      <InlineToolCall toolCall={{ ...baseFixture, status: 'completed' }} />,
    );
    expect(getByText('Done')).toBeTruthy();
    expect(queryAllByTestId('icon-CircleCheck').length).toBeGreaterThan(0);
  });

  it('failed: shows an "Error" status label and the error glyph', () => {
    const { getByText, queryAllByTestId } = render(
      <InlineToolCall toolCall={{ ...baseFixture, status: 'failed' }} />,
    );
    expect(getByText('Error')).toBeTruthy();
    expect(queryAllByTestId('icon-CircleX').length).toBeGreaterThan(0);
  });

  it('exposes an expandable body (chevron + a11y hint) when there is input/output/command', () => {
    const { getByLabelText, queryAllByTestId } = render(<InlineToolCall toolCall={baseFixture} />);
    const bar = getByLabelText('Tool call: web_search');
    expect(bar.props.accessibilityHint).toBe('Double tap to expand details');
    // chevron present
    expect(queryAllByTestId('icon-ChevronRight').length).toBeGreaterThan(0);
  });

  it('does NOT expose an expand affordance when there is no body', () => {
    const { getByLabelText } = render(
      <InlineToolCall toolCall={{ id: 'x', name: 'noop', status: 'completed' }} />,
    );
    const bar = getByLabelText('Tool call: noop');
    expect(bar.props.accessibilityHint).toBeUndefined();
  });

  it('does NOT render raw input JSON in the collapsed bar', () => {
    // The collapsed bar shows name (+ optional command/filePath), never the raw
    // JSON input blob. Use a command fixture so the collapsed subtitle is human text.
    const { queryByText } = render(
      <InlineToolCall
        toolCall={{
          id: 'tc-2',
          name: 'run_command',
          command: 'npm test',
          input: '{"args":["--runInBand"]}',
          status: 'running',
        }}
      />,
    );
    // Human-readable command shows; the raw JSON input string must not appear as a
    // visible collapsed-bar label.
    expect(queryByText('npm test')).toBeTruthy();
    expect(queryByText('{"args":["--runInBand"]}')).toBeNull();
  });
});
