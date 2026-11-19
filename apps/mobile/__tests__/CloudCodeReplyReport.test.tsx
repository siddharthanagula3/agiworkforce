import { fireEvent, render } from '@testing-library/react-native';
import type { CodeTranscriptItem } from '@agiworkforce/cloud-contracts';

const mockReportSheet = jest.fn();

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

import { CloudCodeTranscript } from '@/src/features/cloud-code/components/CloudCodeTranscript';

const reply: CodeTranscriptItem = {
  kind: 'reply',
  id: 'turn-7',
  at: '2026-11-14T00:00:00Z',
  text: 'Done. I updated the parser.',
  stopReason: null,
  retryGoal: null,
  retryMode: 'agent',
};

describe('reporting a Code session reply', () => {
  beforeEach(() => mockReportSheet.mockClear());

  it('opens the report sheet for the reply and the session it belongs to', () => {
    const screen = render(<CloudCodeTranscript items={[reply]} sessionId="session-3" />);
    expect(mockReportSheet).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Report this reply'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this reply',
        target: {
          messageId: 'turn-7',
          conversationId: 'cloud-code:session-3',
          contentExcerpt: 'Done. I updated the parser.',
          subject: { kind: 'code-reply', id: 'turn-7' },
        },
      }),
    );
  });

  it('offers no report on a reply with no text', () => {
    const screen = render(
      <CloudCodeTranscript items={[{ ...reply, text: '   ' }]} sessionId="session-3" />,
    );

    expect(screen.queryByLabelText('Report this reply')).toBeNull();
  });
});
