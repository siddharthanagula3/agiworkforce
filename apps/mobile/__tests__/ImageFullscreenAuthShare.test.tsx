/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockExpoImage = jest.fn();
const mockShareGeneratedImage = jest.fn();
const mockSaveGeneratedImage = jest.fn();
const mockCopyGeneratedImage = jest.fn();
const mockImageAreaEditor = jest.fn();
jest.mock('../src/features/image/components/ImageAreaEditor', () => ({
  ImageAreaEditor: (props: Record<string, unknown>) => {
    mockImageAreaEditor(props);
    return null;
  },
}));
const mockUseGeneratedImageSource = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (...args: unknown[]) => mockUseGeneratedImageSource(...args),
}));

jest.mock('@/services/fileCreation', () => ({
  shareGeneratedImage: (...args: unknown[]) => mockShareGeneratedImage(...args),
  saveGeneratedImageToPhotos: (...args: unknown[]) => mockSaveGeneratedImage(...args),
  copyGeneratedImage: (...args: unknown[]) => mockCopyGeneratedImage(...args),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('lucide-react-native', () => ({
  Check: jest.fn().mockReturnValue(null),
  Copy: jest.fn().mockReturnValue(null),
  X: jest.fn().mockReturnValue(null),
  Share2: jest.fn().mockReturnValue(null),
  Download: jest.fn().mockReturnValue(null),
  Paintbrush: jest.fn().mockReturnValue(null),
  Trash2: jest.fn().mockReturnValue(null),
  Flag: jest.fn().mockReturnValue(null),
}));

const mockReportSheet = jest.fn();
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const value: Record<string, jest.Mock> = {};
    for (const method of ['onUpdate', 'onEnd', 'minPointers', 'numberOfTaps']) {
      value[method] = jest.fn(() => value);
    }
    return value;
  };
  return {
    Gesture: {
      Pinch: chain,
      Pan: chain,
      Tap: chain,
      Simultaneous: jest.fn(() => chain()),
    },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  };
});

import { ImageFullScreen } from '../src/features/chat/components/ImageFullScreen';

const durablePath = '/api/files/22222222-2222-4222-8222-222222222222';

describe('ImageFullScreen generated-media boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({
      status: 'ready',
      source: {
        uri: 'https://agiworkforce.com/api/files/22222222-2222-4222-8222-222222222222',
        headers: { Authorization: 'Bearer short-lived-token' },
      },
    });
    mockShareGeneratedImage.mockResolvedValue(undefined);
  });

  it('uses the authenticated in-memory source and memory-only cache', () => {
    render(<ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />);

    expect(mockUseGeneratedImageSource).toHaveBeenCalledWith(durablePath, false);
    expect(mockExpoImage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          headers: { Authorization: 'Bearer short-lived-token' },
        }),
        cachePolicy: 'memory',
      }),
    );
  });

  it('shares by materializing the durable path instead of exporting an authenticated URL', () => {
    const { getByLabelText } = render(
      <ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('Share image'));

    expect(mockShareGeneratedImage).toHaveBeenCalledWith(durablePath, undefined, {
      isCurrent: expect.any(Function),
    });
  });
});

describe('ImageFullScreen on-device attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
    mockShareGeneratedImage.mockResolvedValue(undefined);
  });

  it.each([
    ['a document-picker file', 'file:///var/mobile/Containers/Data/tmp/photo.png'],
    ['a photo-library asset', 'ph://A1B2C3D4-0000-4000-8000-00000000ABCD/L0/001'],
    ['an Android content URI', 'content://media/external/images/media/42'],
    ['an inline data payload', 'data:image/png;base64,iVBORw0KGgo='],
    ['a remote https image', 'https://cdn.example.com/cat.png'],
  ])('renders %s directly instead of the unavailable panel', (_label, uri) => {
    const { queryByText } = render(<ImageFullScreen imageUrl={uri} visible onClose={jest.fn()} />);

    expect(mockExpoImage).toHaveBeenCalledWith(expect.objectContaining({ source: { uri } }));
    expect(queryByText('Generated image unavailable')).toBeNull();
  });

  it('never asks Cloud to authorize an on-device attachment', () => {
    render(
      <ImageFullScreen imageUrl="file:///var/mobile/tmp/private.png" visible onClose={jest.fn()} />,
    );

    expect(mockUseGeneratedImageSource).toHaveBeenCalledWith('', false);
  });

  it('still routes a durable generated path through the authenticated resolver', () => {
    mockUseGeneratedImageSource.mockReturnValue({
      status: 'ready',
      source: {
        uri: 'https://agiworkforce.com' + durablePath,
        headers: { Authorization: 'Bearer t' },
      },
    });

    render(<ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />);

    expect(mockUseGeneratedImageSource).toHaveBeenCalledWith(durablePath, false);
  });
});

describe('ImageFullScreen report', () => {
  const target = {
    messageId: 'img-1',
    conversationId: 'conv-1',
    contentExcerpt: 'a red fox',
    asset: { kind: 'image' as const, url: 'https://cdn.example.com/fox.png' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
  });

  it('reports the viewed image without leaving the viewer', () => {
    const { getByLabelText } = render(
      <ImageFullScreen
        imageUrl="https://cdn.example.com/fox.png"
        visible
        onClose={jest.fn()}
        reportTarget={target}
      />,
    );

    expect(mockReportSheet).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Report this image'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true, target }),
    );
  });

  it('shows no Report control for an image with no report target', () => {
    const { queryByLabelText } = render(
      <ImageFullScreen imageUrl="https://cdn.example.com/cat.png" visible onClose={jest.fn()} />,
    );

    expect(queryByLabelText('Report this image')).toBeNull();
  });
});

describe('ImageFullScreen action ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'ready', source: { uri: durablePath } });
    mockShareGeneratedImage.mockResolvedValue(undefined);
    mockSaveGeneratedImage.mockResolvedValue(undefined);
    mockCopyGeneratedImage.mockResolvedValue(undefined);
  });

  it('retires a pending action when hidden and gives same-URL reopen a fresh owner', async () => {
    let resolve!: () => void;
    mockShareGeneratedImage.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const onClose = jest.fn();
    const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Share image'));
    fireEvent.press(view.getByLabelText('Share image'));
    expect(mockShareGeneratedImage).toHaveBeenCalledTimes(1);
    const oldCurrent = mockShareGeneratedImage.mock.calls[0]![2].isCurrent;
    view.rerender(<ImageFullScreen imageUrl={durablePath} visible={false} onClose={onClose} />);
    expect(oldCurrent()).toBe(false);
    view.rerender(<ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />);
    fireEvent.press(view.getByLabelText('Share image'));
    await act(async () => {
      resolve();
    });
    expect(mockShareGeneratedImage).toHaveBeenCalledTimes(2);
    expect(oldCurrent()).toBe(false);
  });

  it('retires synchronously on close even before the parent hides the modal', () => {
    mockShareGeneratedImage.mockReturnValueOnce(new Promise(() => {}));
    const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />);
    fireEvent.press(view.getByLabelText('Share image'));
    const isCurrent = mockShareGeneratedImage.mock.calls[0]![2].isCurrent;
    fireEvent.press(view.getByLabelText('Close'));
    expect(isCurrent()).toBe(false);
    fireEvent.press(view.getByLabelText('Share image'));
    expect(mockShareGeneratedImage).toHaveBeenCalledTimes(1);
  });

  it('rejects an old edit submission after cancel and reopen', () => {
    const onEditArea = jest.fn();
    const view = render(
      <ImageFullScreen
        imageUrl={durablePath}
        visible
        onClose={jest.fn()}
        onEditArea={onEditArea}
      />,
    );
    fireEvent.press(view.getByLabelText('Edit an area of this image'));
    const oldEditor = mockImageAreaEditor.mock.calls.at(-1)![0];
    act(() => oldEditor.onCancel());
    fireEvent.press(view.getByLabelText('Edit an area of this image'));
    const editor = mockImageAreaEditor.mock.calls.at(-1)![0];
    const edit = { prompt: 'Change it', sourceBase64: 'source', maskBase64: 'mask' };
    act(() => oldEditor.onSubmit(edit));
    expect(onEditArea).not.toHaveBeenCalled();
    act(() => editor.onSubmit(edit));
    act(() => editor.onSubmit(edit));
    expect(onEditArea).toHaveBeenCalledTimes(1);
    expect(onEditArea).toHaveBeenCalledWith(edit);
  });

  it('clears successful feedback after its timer and clears timers on hide', async () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />);
      await act(async () => {
        fireEvent.press(view.getByLabelText('Save image to Photos'));
      });
      expect(view.getByLabelText('Image saved to Photos')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.getByLabelText('Save image to Photos')).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByLabelText('Copy image'));
      });
      expect(view.getByLabelText('Image copied')).toBeTruthy();
      view.rerender(<ImageFullScreen imageUrl={durablePath} visible={false} onClose={onClose} />);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it('suppresses a rejected old action after replacing the image', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      let reject!: (error: Error) => void;
      mockShareGeneratedImage.mockReturnValueOnce(
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
      );
      const onClose = jest.fn();
      const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />);
      fireEvent.press(view.getByLabelText('Share image'));
      view.rerender(
        <ImageFullScreen
          imageUrl="/api/files/33333333-3333-4333-8333-333333333333"
          visible
          onClose={onClose}
        />,
      );
      await act(async () => {
        reject(new Error('Old download failed'));
      });
      expect(alert).not.toHaveBeenCalled();
    } finally {
      alert.mockRestore();
    }
  });

  it('rejects old delete confirmation and releases the current dialog on cancel', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const onDelete = jest.fn();
      const onClose = jest.fn();
      const view = render(
        <ImageFullScreen imageUrl={durablePath} visible onClose={onClose} onDelete={onDelete} />,
      );
      fireEvent.press(view.getByLabelText('Delete image'));
      const oldDelete = alert.mock.calls.at(-1)![2]![1]!.onPress!;
      view.rerender(
        <ImageFullScreen
          imageUrl={durablePath}
          visible={false}
          onClose={onClose}
          onDelete={onDelete}
        />,
      );
      view.rerender(
        <ImageFullScreen imageUrl={durablePath} visible onClose={onClose} onDelete={onDelete} />,
      );
      act(() => oldDelete());
      expect(onDelete).not.toHaveBeenCalled();
      fireEvent.press(view.getByLabelText('Delete image'));
      act(() => alert.mock.calls.at(-1)![2]![0]!.onPress!());
      fireEvent.press(view.getByLabelText('Delete image'));
      act(() => alert.mock.calls.at(-1)![3]!.onDismiss!());
      fireEvent.press(view.getByLabelText('Delete image'));
      const currentDelete = alert.mock.calls.at(-1)![2]![1]!.onPress!;
      act(() => currentDelete());
      act(() => currentDelete());
      expect(onDelete).toHaveBeenCalledTimes(1);
    } finally {
      alert.mockRestore();
    }
  });
});
