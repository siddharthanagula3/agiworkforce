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
