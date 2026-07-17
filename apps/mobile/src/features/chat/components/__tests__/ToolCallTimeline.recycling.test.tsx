/**
 * ToolCallTimeline — FlashList v2 component recycling (streaming/approval
 * cluster Finding 6). FlashList reuses mounted component instances across
 * list items for performance; a bare useState for UI-only toggle state would
 * bleed a PRIOR message's collapsed/expanded state onto whichever message
 * this instance now renders after a recycle. `rerender`ing the SAME instance
 * with a different `messageId` (without unmounting) is exactly what a
 * recycle does from React's point of view -- this pins that the collapsed
 * state resets when that happens instead of carrying over.
 */
import { render, fireEvent } from '@testing-library/react-native';
import { ToolCallTimeline } from '../ToolCallTimeline';
import type { ToolCall } from '@/types/chat';

const manyTools: ToolCall[] = Array.from({ length: 5 }, (_, i) => ({
  id: `tool-${i}`,
  name: 'read_file',
  status: 'completed',
}));

function toggleLabel(summary: string, collapsed: boolean) {
  return `${summary}${collapsed ? ', collapsed' : ', expanded'}`;
}

describe('ToolCallTimeline — recycling state reset', () => {
  it('resets collapsed state when the SAME component instance is recycled onto a different message', () => {
    const summary = 'Read 5 files';
    const { getByLabelText, rerender } = render(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary={summary} />,
    );

    // Collapse it for message A.
    fireEvent.press(getByLabelText(toggleLabel(summary, false)));
    expect(() => getByLabelText(toggleLabel(summary, true))).not.toThrow();

    // FlashList recycles this SAME component instance onto a different
    // message (no unmount/remount -- that's the whole point of recycling).
    rerender(<ToolCallTimeline messageId="msg-b" toolCalls={manyTools} summary={summary} />);

    // Message B must start expanded (the default), not inherit A's collapse.
    expect(() => getByLabelText(toggleLabel(summary, false))).not.toThrow();
  });

  it('does NOT reset when re-rendered with the SAME messageId (only identity changes reset it)', () => {
    const summary = 'Read 5 files';
    const { getByLabelText, rerender } = render(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary={summary} />,
    );

    fireEvent.press(getByLabelText(toggleLabel(summary, false)));
    expect(() => getByLabelText(toggleLabel(summary, true))).not.toThrow();

    // Same message, e.g. a streaming delta added a new tool call -- must
    // stay collapsed (a real user toggle must survive unrelated re-renders).
    rerender(
      <ToolCallTimeline messageId="msg-a" toolCalls={manyTools} summary="Read 5 files, updated" />,
    );

    expect(() => getByLabelText(toggleLabel('Read 5 files, updated', true))).not.toThrow();
  });
});
