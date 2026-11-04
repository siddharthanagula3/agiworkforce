import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('lucide-react-native', () => ({
  Download: () => null, Film: () => null, Play: () => null,
}));
jest.mock('@/components/ui/PressableBox', () => ({
  PressableBox: jest.requireActual('react-native').Pressable,
}));
jest.mock('@/components/ui/Text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return { useThemeColors: () => tokens.lightColors, radii: tokens.radii };
});
const mockPrepare = jest.fn();
const mockShare = jest.fn();
const mockModal = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  prepareLocalVideoPlayer: (...args: unknown[]) => mockPrepare(...args),
  shareFile: (...args: unknown[]) => mockShare(...args),
}));
jest.mock('@/src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: (props: unknown) => { mockModal(props); return null; },
}));

import { GeneratedVideo } from '@/src/features/chat/components/GeneratedVideo';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const player = (id: string) => ({
  videoUri: `file:///${id}/video.mp4`,
  playerUri: `file:///${id}/player.html`,
  directoryUri: `file:///${id}/`,
});
const video = (url: string) => <GeneratedVideo videoUrl={url} width={240} />;

describe('GeneratedVideo operation ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShare.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('does not publish an old preparation after URL replacement', async () => {
    const pending = deferred<ReturnType<typeof player>>();
    mockPrepare.mockReturnValueOnce(pending.promise);
    const screen = render(video('https://example.com/a.mp4'));
    fireEvent.press(screen.getByLabelText('Play generated video'));
    screen.rerender(video('https://example.com/b.mp4'));
    await act(async () => { pending.resolve(player('a')); });
    expect(mockModal).toHaveBeenLastCalledWith(expect.objectContaining({ player: null, visible: false }));
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('does not revive an earlier A action after A/B/A remounts', async () => {
    const pending = deferred<ReturnType<typeof player>>();
    mockPrepare.mockReturnValueOnce(pending.promise);
    const screen = render(video('https://example.com/a.mp4'));
    fireEvent.press(screen.getByLabelText('Play generated video'));
    screen.rerender(video('https://example.com/b.mp4'));
    screen.rerender(video('https://example.com/a.mp4'));
    await act(async () => { pending.resolve(player('old-a')); });
    expect(mockModal).toHaveBeenLastCalledWith(expect.objectContaining({ player: null, visible: false }));
  });

  it('does not share or alert after unmount during preparation', async () => {
    const pending = deferred<ReturnType<typeof player>>();
    mockPrepare.mockReturnValueOnce(pending.promise);
    const screen = render(video('https://example.com/a.mp4'));
    fireEvent.press(screen.getByLabelText('Save video'));
    screen.unmount();
    await act(async () => { pending.resolve(player('a')); });
    expect(mockShare).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('suppresses a stale rejection without releasing the replacement operation', async () => {
    const old = deferred<ReturnType<typeof player>>();
    const current = deferred<ReturnType<typeof player>>();
    mockPrepare.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const screen = render(video('https://example.com/a.mp4'));
    fireEvent.press(screen.getByLabelText('Play generated video'));
    screen.rerender(video('https://example.com/b.mp4'));
    fireEvent.press(screen.getByLabelText('Play generated video'));
    await act(async () => { old.reject(new Error('late A')); });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Play generated video').props.accessibilityState.busy).toBe(true);
    await act(async () => { current.resolve(player('b')); });
    expect(mockModal).toHaveBeenLastCalledWith(expect.objectContaining({ player: player('b'), visible: true }));
  });

  it('locks synchronously against duplicate action handlers', async () => {
    const pending = deferred<ReturnType<typeof player>>();
    mockPrepare.mockReturnValueOnce(pending.promise);
    const screen = render(video('https://example.com/a.mp4'));
    const play = screen.getByLabelText('Play generated video').props.onPress;
    const save = screen.getByLabelText('Save video').props.onPress;
    act(() => { play(); save(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(player('a')); });
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('reuses its active player and retires the sharing predicate on replacement', async () => {
    mockPrepare.mockResolvedValueOnce(player('a'));
    const sharing = deferred<void>();
    mockShare.mockReturnValueOnce(sharing.promise);
    const screen = render(video('https://example.com/a.mp4'));
    await act(async () => { fireEvent.press(screen.getByLabelText('Play generated video')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Save video')); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(player('a').videoUri, expect.objectContaining({ isCurrent: expect.any(Function) }));
    expect(mockShare.mock.calls[0][1].isCurrent()).toBe(true);
    screen.rerender(video('https://example.com/b.mp4'));
    expect(mockShare.mock.calls[0][1].isCurrent()).toBe(false);
    await act(async () => { sharing.resolve(undefined); });
  });
});
