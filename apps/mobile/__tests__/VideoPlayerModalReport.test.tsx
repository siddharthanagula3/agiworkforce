import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockWebView = jest.fn();
jest.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => {
    mockWebView(props);
    return null;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('lucide-react-native', () => ({
  Download: jest.fn().mockReturnValue(null),
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

describe('VideoPlayerModal save and failure', () => {
  beforeEach(() => mockWebView.mockClear());

  it('saves the playing video without leaving the player', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <VideoPlayerModal
        player={player as never}
        visible
        onClose={onClose}
        label="Video"
        failureHint="Try again."
        onSave={onSave}
      />,
    );

    fireEvent.press(getByLabelText('Save video'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows no Save control when the caller cannot save', () => {
    const { queryByLabelText } = render(
      <VideoPlayerModal
        player={player as never}
        visible
        onClose={jest.fn()}
        label="Video"
        failureHint="Try again."
      />,
    );

    expect(queryByLabelText('Save video')).toBeNull();
  });

  it('hands a playback failure to the tile instead of a passing alert', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const onPlaybackError = jest.fn();
      render(
        <VideoPlayerModal
          player={player as never}
          visible
          onClose={jest.fn()}
          label="Video"
          failureHint="Try again."
          onPlaybackError={onPlaybackError}
        />,
      );

      act(() => (mockWebView.mock.calls.at(-1)![0].onError as () => void)());

      expect(onPlaybackError).toHaveBeenCalledTimes(1);
      expect(alert).not.toHaveBeenCalled();
    } finally {
      alert.mockRestore();
    }
  });
});
