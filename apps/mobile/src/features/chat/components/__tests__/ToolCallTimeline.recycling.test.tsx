import { render, fireEvent } from '@testing-library/react-native';
import { ToolCallTimeline } from '../ToolCallTimeline';
import type { ToolCall } from '@/types/chat';

const manyTools: ToolCall[] = Array.from({ length: 5 }, (_, i) => ({
  id: `tool-${i}`,
  name: 'read_file',
  status: 'running',
}));

function toggleLabel(summary: string, collapsed: boolean) {
  return `${summary}${collapsed ? ', collapsed' : ', expanded'}`;
}

describe('ToolCallTimeline, recycling state reset', () => {
  it('resets collapsed state when the SAME component instance is recycled onto a different message', () => {
    const summary = 'Read 5 files';
    const { getByLabelText, rerender } = render(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary={summary} />,
    );

    fireEvent.press(getByLabelText(toggleLabel(summary, false)));
    expect(() => getByLabelText(toggleLabel(summary, true))).not.toThrow();

    rerender(<ToolCallTimeline messageId="msg-b" toolCalls={manyTools} summary={summary} />);

    expect(() => getByLabelText(toggleLabel(summary, false))).not.toThrow();
  });

  it('does NOT reset when re-rendered with the SAME messageId (only identity changes reset it)', () => {
    const summary = 'Read 5 files';
    const { getByLabelText, rerender } = render(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary={summary} />,
    );

    fireEvent.press(getByLabelText(toggleLabel(summary, false)));
    expect(() => getByLabelText(toggleLabel(summary, true))).not.toThrow();

    rerender(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary="Read 5 files, updated" />,
    );

    expect(() => getByLabelText(toggleLabel('Read 5 files, updated', true))).not.toThrow();
  });
});
