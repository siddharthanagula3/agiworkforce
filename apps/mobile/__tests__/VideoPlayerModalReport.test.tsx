import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
}));
jest.mock('lucide-react-native', () => ({
  Flag: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
}));
jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => actual.lightColors };
});

const mockReportSheet = jest.fn();
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

import { VideoPlayerModal } from '../src/features/chat/components/VideoPlayerModal';

const player = { playerUri: 'file:///tmp/player.html', directoryUri: 'file:///tmp/' };

describe('VideoPlayerModal report', () => {
  beforeEach(() => mockReportSheet.mockClear());

  it('reports the playing video without leaving the player', () => {
    const target = {
      messageId: 'vid-1',
      conversationId: 'conv-1',
      contentExcerpt: 'a waterfall',
      asset: { kind: 'video' as const, url: 'https://cdn.example.com/v.mp4' },
    };
    const { getByLabelText } = render(
      <VideoPlayerModal
        player={player as never}
        visible
        onClose={jest.fn()}
        label="Video"
        failureHint="Try again."
        reportTarget={target}
      />,
    );

    fireEvent.press(getByLabelText('Report this video'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true, target }),
    );
  });

  it('shows no Report control without a report target', () => {
    const { queryByLabelText } = render(
      <VideoPlayerModal
        player={player as never}
        visible
        onClose={jest.fn()}
        label="Video"
        failureHint="Try again."
      />,
    );

    expect(queryByLabelText('Report this video')).toBeNull();
  });
});
