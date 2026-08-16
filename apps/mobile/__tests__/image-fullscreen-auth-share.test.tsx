/* eslint-disable @typescript-eslint/no-require-imports */
import { fireEvent, render } from '@testing-library/react-native';

const mockExpoImage = jest.fn();
const mockShareGeneratedImage = jest.fn();
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
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('lucide-react-native', () => ({
  X: jest.fn().mockReturnValue(null),
  Share2: jest.fn().mockReturnValue(null),
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

    expect(mockShareGeneratedImage).toHaveBeenCalledWith(durablePath);
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
