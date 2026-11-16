/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { Alert, Linking, Modal, StyleSheet } from 'react-native';

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
const mockImageChangeSheet = jest.fn();
jest.mock('../src/features/image/components/ImageChangeSheet', () => ({
  ImageChangeSheet: (props: Record<string, unknown>) => {
    mockImageChangeSheet(props);
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
  PhotosPermissionError: class PhotosPermissionError extends Error {
    constructor() {
      super('Allow AGI Workforce to add photos in Settings to save images.');
      this.name = 'PhotosPermissionError';
    }
  },
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
  Sparkles: jest.fn().mockReturnValue(null),
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

const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const { useRef } = require('react');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => useRef({ value }).current,
    withTiming: (value: unknown, _config?: unknown, done?: (finished: boolean) => void) => {
      done?.(true);
      return value;
    },
    runOnJS: (fn: unknown) => fn,
  };
});

let mockReduceMotion = false;
jest.mock('@/src/ui/theme/useReduceMotion', () => ({
  ...jest.requireActual('@/src/ui/theme/useReduceMotion'),
  useReduceMotion: () => mockReduceMotion,
}));

const mockGestureHandlers: Record<
  string,
  {
    onStart?: () => void;
    onUpdate?: (event: Record<string, number>) => void;
    onEnd?: (event: Record<string, number>, success: boolean) => void;
  }
> = {};
let mockDismissChain: Record<string, jest.Mock> | undefined;

jest.mock('react-native-gesture-handler', () => {
  const chain = (initialKind?: string) => {
    let kind = initialKind;
    const value: Record<string, jest.Mock> = {};
    for (const method of [
      'onStart',
      'onUpdate',
      'onEnd',
      'minPointers',
      'maxPointers',
      'activeOffsetY',
      'failOffsetX',
      'numberOfTaps',
      'direction',
      'runOnJS',
    ]) {
      value[method] = jest.fn((handler?: unknown) => {
        if (kind === 'pan' && method === 'activeOffsetY') {
          kind = 'dismiss';
          mockDismissChain = value;
        }
        if (kind && (method === 'onStart' || method === 'onUpdate' || method === 'onEnd')) {
          mockGestureHandlers[kind] = { ...mockGestureHandlers[kind], [method]: handler };
        }
        return value;
      });
    }
    return value;
  };
  return {
    Gesture: {
      Pinch: () => chain('pinch'),
      Pan: () => chain('pan'),
      Tap: () => chain('tap'),
      Fling: () => chain('fling'),
      Simultaneous: jest.fn(() => chain()),
    },
    Directions: { LEFT: 2, RIGHT: 1 },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  };
});

const mockShareAsync = jest.fn();
const mockSaveToLibrary = jest.fn();
const mockSetImage = jest.fn();
const mockReadAsString = jest.fn();
const mockWriteAsString = jest.fn();
const mockMakeDirectory = jest.fn();
const mockGuardedFetch = jest.fn();

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockRequestPhotoPermission = jest.fn(async (..._args: unknown[]) => ({ granted: true }));

jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPhotoPermission(...args),
  saveToLibraryAsync: (...args: unknown[]) => mockSaveToLibrary(...args),
}));

jest.mock('expo-clipboard', () => ({
  setImageAsync: (...args: unknown[]) => mockSetImage(...args),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'viewer-uuid',
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: (...args: unknown[]) => mockReadAsString(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsString(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectory(...args),
}));

jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));

import { ImageFullScreen } from '../src/features/chat/components/ImageFullScreen';
import { FULL_SCREEN_TOUCH_TARGET } from '../src/features/chat/chrome/fullScreenChrome';
import { viewerImageActions } from '../src/features/image/services/viewerImageActions';
import { spaceAbove, tapTarget } from '../test-utils/viewerChrome';

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

  it('opens the change sheet for a generated image and hands its edit up once', () => {
    const onEditImage = jest.fn();
    const view = render(
      <ImageFullScreen
        imageUrl={durablePath}
        prompt="A harbour"
        model="registry-image-route"
        aspectRatio="3:2"
        visible
        onClose={jest.fn()}
        onEditImage={onEditImage}
      />,
    );
    expect(mockImageChangeSheet).not.toHaveBeenCalled();

    fireEvent.press(view.getByLabelText('Change this image'));

    expect(mockImageChangeSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        imagePath: durablePath,
        imagePrompt: 'A harbour',
        model: 'registry-image-route',
        aspectRatio: '3:2',
      }),
    );
    const sheet = mockImageChangeSheet.mock.calls.at(-1)![0];
    const edit = { operation: 'variation', prompt: 'A harbour', sourceBase64: 'c291cmNl' };
    act(() => sheet.onSubmit(edit));
    act(() => sheet.onSubmit(edit));
    expect(onEditImage).toHaveBeenCalledTimes(1);
    expect(onEditImage).toHaveBeenCalledWith(edit);
  });

  it('closes the change sheet without sending anything when it is cancelled', () => {
    const onEditImage = jest.fn();
    const view = render(
      <ImageFullScreen
        imageUrl={durablePath}
        visible
        onClose={jest.fn()}
        onEditImage={onEditImage}
      />,
    );
    fireEvent.press(view.getByLabelText('Change this image'));
    const callsBefore = mockImageChangeSheet.mock.calls.length;
    const sheet = mockImageChangeSheet.mock.calls.at(-1)![0];

    act(() => sheet.onCancel());
    fireEvent.press(view.getByLabelText('Change this image'));

    expect(mockImageChangeSheet.mock.calls.length).toBeGreaterThan(callsBefore);
    act(() => sheet.onSubmit({ operation: 'variation', prompt: 'x', sourceBase64: 'y' }));
    expect(onEditImage).not.toHaveBeenCalled();
  });

  it('offers no change control without a handler, on a photo, or on a device image', () => {
    const none = render(<ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />);
    expect(none.queryByLabelText('Change this image')).toBeNull();
    none.unmount();

    const photo = render(
      <ImageFullScreen
        imageUrl={durablePath}
        kind="attachment"
        visible
        onClose={jest.fn()}
        onEditImage={jest.fn()}
      />,
    );
    expect(photo.queryByLabelText('Change this image')).toBeNull();
    photo.unmount();

    const device = render(
      <ImageFullScreen
        imageUrl="file:///var/mobile/tmp/photo.png"
        visible
        onClose={jest.fn()}
        onEditImage={jest.fn()}
      />,
    );
    expect(device.queryByLabelText('Change this image')).toBeNull();
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

describe('ImageFullScreen actions for images that are not stored in AGI Cloud', () => {
  const devicePhoto = 'file:///var/mobile/Containers/Data/tmp/photo.png';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
    mockReadAsString.mockResolvedValue('cGhvdG8=');
    mockShareAsync.mockResolvedValue(undefined);
    mockSaveToLibrary.mockResolvedValue(undefined);
    mockSetImage.mockResolvedValue(undefined);
  });

  it('shares, saves and copies an on-device photo from its own bytes', async () => {
    const view = render(<ImageFullScreen imageUrl={devicePhoto} visible onClose={jest.fn()} />);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Share image'));
    });
    expect(mockShareAsync).toHaveBeenCalledWith(devicePhoto, {
      mimeType: 'image/png',
      dialogTitle: 'Share image',
    });

    await act(async () => {
      fireEvent.press(view.getByLabelText('Save image to Photos'));
    });
    expect(mockSaveToLibrary).toHaveBeenCalledWith(devicePhoto);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy image'));
    });
    expect(mockReadAsString).toHaveBeenCalledWith(devicePhoto, { encoding: 'base64' });
    expect(mockSetImage).toHaveBeenCalledWith('cGhvdG8=');
    expect(mockShareGeneratedImage).not.toHaveBeenCalled();
    expect(mockCopyGeneratedImage).not.toHaveBeenCalled();
  });

  it('writes a session-only embedded image to a named file before sharing it', async () => {
    const view = render(
      <ImageFullScreen
        imageUrl="data:image/webp;base64,d2VicA=="
        allowEphemeral
        visible
        onClose={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText('Share image'));
    });

    expect(mockWriteAsString).toHaveBeenCalledWith(
      'file:///cache/viewer-images/viewer-uuid/image.webp',
      'd2VicA==',
      { encoding: 'base64' },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/viewer-images/viewer-uuid/image.webp',
      { mimeType: 'image/webp', dialogTitle: 'Share image' },
    );
  });

  it('copies an embedded image straight from its data', async () => {
    const view = render(
      <ImageFullScreen imageUrl="data:image/gif;base64,R0lGOD==" visible onClose={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy image'));
    });

    expect(mockSetImage).toHaveBeenCalledWith('R0lGOD==');
  });

  it.each([
    ['a photo-library asset', 'ph://A1B2C3D4-0000-4000-8000-00000000ABCD/L0/001'],
    ['an Android content URI', 'content://media/external/images/media/42'],
  ])('offers no Copy, Share or Save for %s it cannot read', (_label, uri) => {
    const view = render(<ImageFullScreen imageUrl={uri} visible onClose={jest.fn()} />);

    expect(view.queryByLabelText('Share image')).toBeNull();
    expect(view.queryByLabelText('Copy image')).toBeNull();
    expect(view.queryByLabelText('Save image to Photos')).toBeNull();
    expect(view.getByLabelText('Close')).toBeTruthy();
  });

  it('says why a save failed instead of failing silently', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      mockSaveToLibrary.mockRejectedValueOnce(new Error('Photos is unavailable.'));
      const view = render(<ImageFullScreen imageUrl={devicePhoto} visible onClose={jest.fn()} />);
      await act(async () => {
        fireEvent.press(view.getByLabelText('Save image to Photos'));
      });
      expect(alert).toHaveBeenCalledWith('Could not save image', expect.any(String));
    } finally {
      alert.mockRestore();
    }
  });
});

describe('ImageFullScreen when Photos access is off', () => {
  const devicePhoto = 'file:///var/mobile/Containers/Data/tmp/photo.png';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
    mockSaveToLibrary.mockResolvedValue(undefined);
  });

  it('offers Open Settings and opens the app settings page from it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    try {
      mockRequestPhotoPermission.mockResolvedValueOnce({ granted: false });
      const view = render(<ImageFullScreen imageUrl={devicePhoto} visible onClose={jest.fn()} />);
      await act(async () => {
        fireEvent.press(view.getByLabelText('Save image to Photos'));
      });

      expect(mockSaveToLibrary).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(
        'Allow Photos access',
        'Allow AGI Workforce to add photos in Settings to save images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: expect.any(Function) },
        ],
      );
      const buttons = alert.mock.calls[0]![2]!;
      buttons[1]!.onPress!();
      expect(openSettings).toHaveBeenCalledTimes(1);
    } finally {
      alert.mockRestore();
      openSettings.mockRestore();
    }
  });
});

describe('ImageFullScreen for a photo the person sent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
  });

  it('offers no Delete, Edit or Report and reads the file name', () => {
    const { getByLabelText, queryByLabelText, queryByText } = render(
      <ImageFullScreen
        images={[{ url: 'file:///tmp/IMG_2041.jpg', kind: 'attachment', name: 'IMG_2041.jpg' }]}
        model="some-model"
        visible
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onEditArea={jest.fn()}
        reportTarget={{ messageId: 'm', conversationId: 'c', contentExcerpt: 'x' }}
      />,
    );

    expect(queryByLabelText('Delete image')).toBeNull();
    expect(queryByLabelText('Edit an area of this image')).toBeNull();
    expect(queryByLabelText('Report this image')).toBeNull();
    expect(queryByText(/Generated with/)).toBeNull();
    expect(getByLabelText('IMG_2041.jpg')).toBeTruthy();
  });

  it('shares and saves a stored photo under the name it was sent with', async () => {
    mockUseGeneratedImageSource.mockReturnValue({
      status: 'ready',
      source: { uri: `https://agiworkforce.com${durablePath}`, headers: {} },
    });
    mockShareGeneratedImage.mockResolvedValue(undefined);
    mockSaveGeneratedImage.mockResolvedValue(undefined);
    const { getByLabelText } = render(
      <ImageFullScreen
        images={[{ url: durablePath, kind: 'attachment', name: 'receipt.jpg' }]}
        visible
        onClose={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Share image'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Save image to Photos'));
    });

    expect(mockShareGeneratedImage).toHaveBeenCalledWith(durablePath, 'receipt.jpg', {
      isCurrent: expect.any(Function),
    });
    expect(mockSaveGeneratedImage).toHaveBeenCalledWith(durablePath, 'receipt.jpg', {
      isCurrent: expect.any(Function),
    });
  });

  it('keeps Delete for a generated image', () => {
    const { getByLabelText } = render(
      <ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(getByLabelText('Delete image')).toBeTruthy();
  });
});

describe('ImageFullScreen paging and zoom', () => {
  const photos = [
    { url: 'file:///tmp/one.jpg', kind: 'attachment' as const, name: 'one.jpg' },
    { url: 'file:///tmp/two.jpg', kind: 'attachment' as const, name: 'two.jpg' },
    { url: 'file:///tmp/three.jpg', kind: 'attachment' as const, name: 'three.jpg' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
  });

  it('opens at the tapped photo, moves to the next and resets zoom', () => {
    const view = render(
      <ImageFullScreen images={photos} initialIndex={1} visible onClose={jest.fn()} />,
    );

    expect(view.getByTestId('image-viewer-counter')).toHaveTextContent('2 of 3');
    fireEvent(view.getByLabelText('two.jpg'), 'accessibilityAction', {
      nativeEvent: { actionName: 'zoomIn' },
    });
    fireEvent(view.getByLabelText('two.jpg'), 'accessibilityAction', {
      nativeEvent: { actionName: 'nextImage' },
    });

    expect(view.getByTestId('image-viewer-counter')).toHaveTextContent('3 of 3');
    expect(mockExpoImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: { uri: 'file:///tmp/three.jpg' } }),
    );
    expect(view.getByLabelText('three.jpg').props.style.transform[0]).toEqual({ scale: 1 });
    expect(
      view
        .getByLabelText('three.jpg')
        .props.accessibilityActions.map((action: { name: string }) => action.name),
    ).toEqual(['zoomIn', 'zoomOut', 'previousImage']);
  });

  it('zooms with the accessibility actions', () => {
    const view = render(<ImageFullScreen images={photos} visible onClose={jest.fn()} />);
    const picture = () => view.getByLabelText('one.jpg');

    fireEvent(picture(), 'accessibilityAction', { nativeEvent: { actionName: 'zoomIn' } });
    view.rerender(<ImageFullScreen images={photos} visible onClose={jest.fn()} />);
    expect(picture().props.style.transform[0]).toEqual({ scale: 1.5 });

    fireEvent(picture(), 'accessibilityAction', { nativeEvent: { actionName: 'zoomOut' } });
    view.rerender(<ImageFullScreen images={photos} visible onClose={jest.fn()} />);
    expect(picture().props.style.transform[0]).toEqual({ scale: 1 });
  });

  it('moves a zoomed image with the finger and never drags it off the screen', () => {
    const view = render(
      <ImageFullScreen imageUrl="file:///tmp/one.jpg" visible onClose={jest.fn()} />,
    );
    fireEvent(view.getByTestId('image-viewer-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
    });
    act(() => {
      mockExpoImage.mock.calls.at(-1)![0].onLoad({ source: { width: 1000, height: 1000 } });
    });
    const picture = () => view.getByLabelText('Full screen generated image');

    fireEvent(picture(), 'accessibilityAction', { nativeEvent: { actionName: 'zoomIn' } });
    act(() => mockGestureHandlers.pan!.onUpdate!({ translationX: 30, translationY: 0 }));
    view.rerender(<ImageFullScreen imageUrl="file:///tmp/one.jpg" visible onClose={jest.fn()} />);
    expect(picture().props.style.transform).toEqual([
      { scale: 1.5 },
      { translateX: 20 },
      { translateY: 0 },
    ]);

    act(() => mockGestureHandlers.pan!.onUpdate!({ translationX: 5000, translationY: -5000 }));
    view.rerender(<ImageFullScreen imageUrl="file:///tmp/one.jpg" visible onClose={jest.fn()} />);
    const [, panX, panY] = picture().props.style.transform;
    const frame = 400 - 32;
    const limit = (frame * 1.5 - 400) / (2 * 1.5);
    expect(panX.translateX).toBeCloseTo(limit);
    expect(panY.translateY).toBeCloseTo(-limit);
  });

  it('shows no counter for a single image', () => {
    const view = render(
      <ImageFullScreen imageUrl="file:///tmp/one.jpg" visible onClose={jest.fn()} />,
    );

    expect(view.queryByTestId('image-viewer-counter')).toBeNull();
  });
});

describe('ImageFullScreen frame and failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
  });

  function lastImageProps() {
    return mockExpoImage.mock.calls.at(-1)![0] as {
      style: { width: number; height: number };
      onLoad: (event: unknown) => void;
      onError: () => void;
    };
  }

  it.each([
    ['a tall 9:16 image fills the height', 900, 1600, 338, 600],
    ['a wide 16:9 image fills the width', 1600, 900, 343, 193],
  ])('%s', (_label, naturalWidth, naturalHeight, width, height) => {
    const view = render(
      <ImageFullScreen imageUrl="file:///tmp/picture.png" visible onClose={jest.fn()} />,
    );
    fireEvent(view.getByTestId('image-viewer-stage'), 'layout', {
      nativeEvent: { layout: { width: 375, height: 600 } },
    });
    expect(lastImageProps().style).toEqual(expect.objectContaining({ width: 343, height: 343 }));

    act(() => {
      lastImageProps().onLoad({ source: { width: naturalWidth, height: naturalHeight } });
    });

    const style = lastImageProps().style;
    expect(Math.round(style.width)).toBe(width);
    expect(Math.round(style.height)).toBe(height);
  });

  it('says the image failed and reloads it on Retry', () => {
    const view = render(
      <ImageFullScreen imageUrl="https://cdn.example.com/cat.png" visible onClose={jest.fn()} />,
    );
    act(() => lastImageProps().onError());

    expect(view.getByText('Image failed to load')).toBeTruthy();
    const callsBeforeRetry = mockExpoImage.mock.calls.length;
    fireEvent.press(view.getByLabelText('Retry loading this image'));

    expect(view.queryByText('Image failed to load')).toBeNull();
    expect(mockExpoImage.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('offers Retry when the stored image could not be authorized', () => {
    mockUseGeneratedImageSource.mockReturnValue({ status: 'error', source: null });
    const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={jest.fn()} />);

    expect(view.getByText('Image failed to load')).toBeTruthy();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'ready', source: { uri: durablePath } });
    fireEvent.press(view.getByLabelText('Retry loading this image'));

    expect(mockExpoImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: { uri: durablePath } }),
    );
  });
});

describe('the image viewer header', () => {
  afterEach(() => {
    mockInsets.top = 0;
  });

  it('lays Close out under the status bar as a 44 point target that closes the viewer', () => {
    mockInsets.top = 59;
    mockUseGeneratedImageSource.mockReturnValue({ status: 'ready', source: { uri: durablePath } });
    const onClose = jest.fn();
    const view = render(<ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />);

    const close = view.getByLabelText('Close');
    expect(spaceAbove(close)).toBeGreaterThanOrEqual(59);
    expect(tapTarget(close).width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(tapTarget(close).height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the image viewer and the screen under it', () => {
  function owningScreen() {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    return { navigation, blur: () => act(() => listeners.blur?.()) };
  }

  beforeEach(() => {
    mockUseGeneratedImageSource.mockReturnValue({ status: 'ready', source: { uri: durablePath } });
  });

  it('closes when a link opens another screen, once', () => {
    const onClose = jest.fn();
    const { navigation, blur } = owningScreen();
    render(
      <NavigationContext.Provider value={navigation as never}>
        <ImageFullScreen imageUrl={durablePath} visible onClose={onClose} />
      </NavigationContext.Provider>,
    );

    blur();
    blur();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen while the viewer is closed', () => {
    const { navigation } = owningScreen();
    render(
      <NavigationContext.Provider value={navigation as never}>
        <ImageFullScreen imageUrl={durablePath} visible={false} onClose={jest.fn()} />
      </NavigationContext.Provider>,
    );

    expect(navigation.addListener).not.toHaveBeenCalled();
  });
});

describe('ImageFullScreen drag down to close', () => {
  const PHOTO = 'file:///tmp/one.jpg';
  const DOWNWARD = 300;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion = false;
    mockUseGeneratedImageSource.mockReturnValue({ status: 'invalid', source: null });
  });

  function mount() {
    const onClose = jest.fn();
    const view = render(<ImageFullScreen imageUrl={PHOTO} visible onClose={onClose} />);
    const redraw = () =>
      view.rerender(<ImageFullScreen imageUrl={PHOTO} visible onClose={onClose} />);
    const offset = () => {
      redraw();
      const style = StyleSheet.flatten(view.getByTestId('image-viewer-dismiss').props.style);
      return style.transform[0].translateY as number;
    };
    const backdrop = () => {
      redraw();
      return StyleSheet.flatten(view.getByTestId('image-viewer-backdrop').props.style)
        .opacity as number;
    };
    return { view, onClose, offset, backdrop };
  }

  function drag(translationY: number, velocityY = 0, success = true) {
    act(() => mockGestureHandlers.dismiss!.onStart!());
    act(() => mockGestureHandlers.dismiss!.onUpdate!({ translationY }));
    return () =>
      act(() => mockGestureHandlers.dismiss!.onEnd!({ translationY, velocityY }, success));
  }

  it('hands the drag gesture to the detector as a single finger vertical pan', () => {
    mount();

    const simultaneous = jest.requireMock('react-native-gesture-handler').Gesture
      .Simultaneous as jest.Mock;
    const composed = simultaneous.mock.calls[simultaneous.mock.calls.length - 1] as unknown[];
    expect(mockDismissChain).toBeDefined();
    expect(composed).toContain(mockDismissChain);
    expect(mockDismissChain!.maxPointers).toHaveBeenCalledWith(1);
    const [from, to] = mockDismissChain!.failOffsetX.mock.calls[0]![0] as number[];
    expect(from).toBeLessThan(0);
    expect(to).toBeGreaterThan(0);
    expect(mockDismissChain!.activeOffsetY).toHaveBeenCalledTimes(1);
  });

  it('follows the finger downward and dims the screen behind the picture', () => {
    const { offset, backdrop, onClose } = mount();
    expect(offset()).toBe(0);
    expect(backdrop()).toBe(1);

    drag(150);

    expect(offset()).toBe(150);
    expect(backdrop()).toBeLessThan(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('springs back when released short of the distance and slowly', () => {
    const { offset, onClose } = mount();

    drag(120, 200)();

    expect(onClose).not.toHaveBeenCalled();
    expect(offset()).toBe(0);
  });

  it('closes when released past the distance', () => {
    const { onClose } = mount();

    drag(DOWNWARD, 100)();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a fast flick that has not travelled far', () => {
    const { onClose } = mount();

    drag(60, 1500)();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a touch that barely moved however fast it was', () => {
    const { onClose, offset } = mount();

    drag(10, 3000)();

    expect(onClose).not.toHaveBeenCalled();
    expect(offset()).toBe(0);
  });

  it('never closes on an upward drag', () => {
    const { onClose, offset } = mount();

    drag(-DOWNWARD, -2000)();

    expect(offset()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('springs back when the system cancels the drag', () => {
    const { onClose, offset } = mount();

    drag(DOWNWARD, 0, false)();

    expect(onClose).not.toHaveBeenCalled();
    expect(offset()).toBe(0);
  });

  it('pans a zoomed picture and never closes it', () => {
    const { view, onClose, offset } = mount();
    fireEvent(view.getByLabelText('Full screen generated image'), 'accessibilityAction', {
      nativeEvent: { actionName: 'zoomIn' },
    });

    drag(DOWNWARD, 3000)();

    expect(offset()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a picture that was zoomed back out to 1x', () => {
    const { view, onClose } = mount();
    const picture = () => view.getByLabelText('Full screen generated image');
    fireEvent(picture(), 'accessibilityAction', { nativeEvent: { actionName: 'zoomIn' } });
    fireEvent(picture(), 'accessibilityAction', { nativeEvent: { actionName: 'zoomOut' } });

    drag(DOWNWARD)();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without following the finger when Reduce Motion is on', () => {
    mockReduceMotion = true;
    const { offset, onClose } = mount();

    const release = drag(DOWNWARD);
    expect(offset()).toBe(0);
    release();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Close and Android Back as ways out', () => {
    const { view, onClose } = mount();

    fireEvent.press(view.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const second = mount();
    act(() => second.view.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ImageFullScreen for a vector or untyped picture', () => {
  const stored = '/api/files/44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGeneratedImageSource.mockReturnValue({ status: 'ready', source: { uri: stored } });
  });

  const noPictureActions = (view: ReturnType<typeof render>) => {
    expect(view.queryByLabelText('Save image to Photos')).toBeNull();
    expect(view.queryByLabelText('Share image')).toBeNull();
    expect(view.queryByLabelText('Copy image')).toBeNull();
  };

  it('offers Save, Share and Copy for a PNG', () => {
    const view = render(
      <ImageFullScreen
        imageUrl={stored}
        kind="attachment"
        name="plot.png"
        mimeType="image/png"
        visible
        onClose={jest.fn()}
      />,
    );

    expect(view.getByLabelText('Save image to Photos')).toBeTruthy();
    expect(view.getByLabelText('Share image')).toBeTruthy();
    expect(view.getByLabelText('Copy image')).toBeTruthy();
  });

  it('offers none of them for an SVG the file record reports', () => {
    const view = render(
      <ImageFullScreen imageUrl={stored} mimeType="image/svg+xml" visible onClose={jest.fn()} />,
    );

    noPictureActions(view);
    expect(view.getByLabelText('Close')).toBeTruthy();
  });

  it('offers none of them for a file the server sends as a download', () => {
    const view = render(
      <ImageFullScreen
        imageUrl={stored}
        mimeType="application/octet-stream"
        visible
        onClose={jest.fn()}
      />,
    );

    noPictureActions(view);
  });

  it('offers none of them for a file named as an SVG, and keeps Delete and Report', () => {
    const view = render(
      <ImageFullScreen
        imageUrl={stored}
        name="diagram.SVG"
        visible
        onClose={jest.fn()}
        onDelete={jest.fn()}
        reportTarget={{
          messageId: 'm1',
          conversationId: 'c1',
          contentExcerpt: 'diagram',
          asset: { kind: 'image', url: stored },
        }}
      />,
    );

    noPictureActions(view);
    expect(view.getByLabelText('Delete image')).toBeTruthy();
    expect(view.getByLabelText('Report this image')).toBeTruthy();
  });
});

describe('viewerImageActions for vector and untyped pictures', () => {
  const stored = '/api/files/55555555-5555-4555-8555-555555555555';

  it.each([
    ['a stored PNG', stored, { mimeType: 'image/png' }],
    ['a stored picture with no type', stored, {}],
    ['a remote PNG', 'https://cdn.example.com/cat.png?v=2', {}],
    ['an on-device JPEG', 'file:///tmp/photo.jpg', { name: 'photo.jpg' }],
    ['an embedded PNG', 'data:image/png;base64,iVBORw0KGgo=', {}],
  ])('offers Save, Share and Copy for %s', (_label, uri, hints) => {
    expect([...viewerImageActions(uri, hints)].sort()).toEqual(['copy', 'save', 'share']);
  });

  it.each([
    ['a stored SVG', stored, { mimeType: 'image/svg+xml' }],
    ['a stored SVG with a charset', stored, { mimeType: 'Image/SVG+XML; charset=utf-8' }],
    ['a stored download', stored, { mimeType: 'application/octet-stream' }],
    ['a stored file named as an SVG', stored, { name: 'chart.svg' }],
    ['a compressed SVG file name', stored, { name: 'chart.svgz' }],
    ['a remote SVG', 'https://cdn.example.com/logo.svg?v=2#top', {}],
    ['an on-device SVG', 'file:///tmp/logo.svg', {}],
    ['an embedded SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', {}],
    ['an embedded SVG as text', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', {}],
  ])('offers nothing for %s', (_label, uri, hints) => {
    expect(viewerImageActions(uri, hints).size).toBe(0);
  });

  it('still offers nothing for an address it cannot read', () => {
    expect(viewerImageActions('ftp://example.com/a.png').size).toBe(0);
  });
});
