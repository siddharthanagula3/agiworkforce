/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { trustedImageKeys } from '@agiworkforce/unified-chat/markdown-image-sources';

const mockExpoImage = jest.fn();
const mockImageFullScreen = jest.fn();
const mockOpenUntrusted = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('../src/features/chat/components/GeneratedImage', () => {
  const { Pressable, Text } = require('react-native');
  return {
    GeneratedImage: ({ imageUrl, onPress }: { imageUrl: string; onPress?: () => void }) => (
      <Pressable accessibilityLabel={`stored ${imageUrl}`} onPress={onPress}>
        <Text>{imageUrl}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockImageFullScreen(props);
    return null;
  },
}));

jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: (value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value),
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrusted(...args),
}));

import { MarkdownImage } from '../src/features/chat/components/MarkdownImage';
import {
  CarouselSurface,
  GallerySurface,
} from '../src/features/chat/components/AnswerMediaSurfaces';
import { lightColors } from '../src/ui/theme';

const storedPath = '/api/files/22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenUntrusted.mockResolvedValue(true);
});

describe('MarkdownImage', () => {
  it('opens a stored image full screen on tap', () => {
    const view = render(<MarkdownImage src={storedPath} alt="A fox" colors={lightColors} />);
    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageUrl: storedPath, visible: false }),
    );

    fireEvent.press(view.getByLabelText(`stored ${storedPath}`));

    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageUrl: storedPath, prompt: 'A fox', visible: true }),
    );
  });

  it('loads an image that came from the answer’s own results without asking', () => {
    const src = 'https://images.example.com/bay.jpg';
    const view = render(
      <MarkdownImage
        src={src}
        alt="Bay"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys([src])}
      />,
    );

    expect(view.queryByLabelText('Load image from images.example.com')).toBeNull();
    expect(mockExpoImage).toHaveBeenCalledWith(expect.objectContaining({ source: { uri: src } }));
  });

  it('keeps its height when a recycled row loads an approved image again', () => {
    const src = 'https://images.example.com/recycled.jpg';
    const keys = trustedImageKeys([src]);
    const first = render(
      <MarkdownImage src={src} alt="Bay" colors={lightColors} trustedImageKeys={keys} />,
    );
    expect(mockExpoImage.mock.calls.at(-1)![0].style).toEqual(
      expect.objectContaining({ height: 160 }),
    );
    act(() => {
      mockExpoImage.mock.calls.at(-1)![0].onLoad({ source: { width: 1600, height: 800 } });
    });
    first.unmount();
    mockExpoImage.mockClear();

    render(<MarkdownImage src={src} alt="Bay" colors={lightColors} trustedImageKeys={keys} />);

    const style = mockExpoImage.mock.calls[0]![0].style;
    expect(style.aspectRatio).toBe(2);
    expect(style.height).toBeUndefined();
  });

  it('exposes the title the author gave a loaded image', () => {
    const src = 'https://images.example.com/titled.jpg';
    const view = render(
      <MarkdownImage
        src={src}
        alt="Bay"
        title="Sunrise over the bay"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys([src])}
      />,
    );

    expect(view.getByLabelText('Bay').props.accessibilityHint).toBe(
      'Sunrise over the bay. Opens the image in the browser',
    );
    expect(mockExpoImage.mock.calls.at(-1)![0].accessibilityHint).toBe('Sunrise over the bay');
  });

  it('reads a file-name alt as words and drops a file-name title', () => {
    const src = 'https://images.example.com/sunset-over-bay.png';
    const view = render(
      <MarkdownImage
        src={src}
        alt="sunset-over-bay.png"
        title="sunset-over-bay.png"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys([src])}
      />,
    );

    expect(view.getByLabelText('Sunset over bay')).toBeTruthy();
    expect(mockExpoImage.mock.calls.at(-1)![0].accessibilityLabel).toBe('Sunset over bay');
    expect(mockExpoImage.mock.calls.at(-1)![0].accessibilityHint).toBeUndefined();
  });

  it('leaves the hint off when the title only repeats the label', () => {
    const src = 'https://images.example.com/plain.jpg';
    const view = render(
      <MarkdownImage
        src={src}
        alt="Bay at dawn"
        title="Bay at dawn"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys([src])}
      />,
    );

    expect(view.getByLabelText('Bay at dawn').props.accessibilityHint).toBe(
      'Opens the image in the browser',
    );
    expect(mockExpoImage.mock.calls.at(-1)![0].accessibilityHint).toBeUndefined();
  });

  it('leaves the hint off when no title is given for a readable alt', () => {
    const src = 'https://images.example.com/notitle.jpg';
    render(
      <MarkdownImage
        src={src}
        alt="Bay at dawn"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys([src])}
      />,
    );

    expect(mockExpoImage.mock.calls.at(-1)![0].accessibilityHint).toBeUndefined();
  });

  it('still asks before loading an image the model named on its own', () => {
    const view = render(
      <MarkdownImage
        src="https://tracker.example.net/pixel.png"
        alt="Chart"
        colors={lightColors}
        trustedImageKeys={trustedImageKeys(['https://images.example.com/bay.jpg'])}
      />,
    );

    expect(view.getByLabelText('Load image from tracker.example.net')).toBeTruthy();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });
});

describe('GallerySurface', () => {
  const items = [
    {
      caption: 'Golden Gate',
      src: 'https://images.example.com/gate.jpg',
      color: '',
      detail: 'Shot at dawn from Marin',
    },
  ];

  it('shows the detail under the caption', () => {
    const view = render(<GallerySurface items={items} colors={lightColors} />);

    expect(view.getByText('Shot at dawn from Marin')).toBeTruthy();
  });

  it('copies the image URL and opens the image through the safe browser', async () => {
    jest.useFakeTimers();
    try {
      const view = render(<GallerySurface items={items} colors={lightColors} />);

      await act(async () => {
        fireEvent.press(view.getByLabelText('Copy image URL: Golden Gate'));
      });
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://images.example.com/gate.jpg');
      expect(view.getByLabelText('Copied image URL: Golden Gate')).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.getByLabelText('Copy image URL: Golden Gate')).toBeTruthy();

      fireEvent.press(view.getByLabelText('Open image: Golden Gate'));
      expect(mockOpenUntrusted).toHaveBeenCalledWith('https://images.example.com/gate.jpg');
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers no URL actions for a stored image', () => {
    const view = render(
      <GallerySurface
        items={[{ caption: 'Mine', src: storedPath, color: '' }]}
        colors={lightColors}
      />,
    );

    expect(view.queryByLabelText('Copy image URL: Mine')).toBeNull();
  });
});

describe('CarouselSurface', () => {
  const spec = {
    title: 'Trip',
    items: [
      { title: 'Day one', text: 'Arrive', src: 'https://images.example.com/1.jpg' },
      { title: 'Day two', text: 'Hike', src: '' },
      { title: 'Day three', text: 'Leave', src: '' },
    ],
  };

  it('moves between slides with Previous and Next', () => {
    const view = render(<CarouselSurface spec={spec} colors={lightColors} />);
    fireEvent(view.getByTestId('answer-surface-carousel'), 'layout', {
      nativeEvent: { layout: { width: 348 } },
    });

    expect(view.getByText('1 of 3')).toBeTruthy();
    expect(view.getByLabelText('Previous')).toBeDisabled();
    fireEvent.press(view.getByLabelText('Next'));
    fireEvent.press(view.getByLabelText('Next'));
    expect(view.getByText('3 of 3')).toBeTruthy();
    expect(view.getByLabelText('Next')).toBeDisabled();
    fireEvent.press(view.getByLabelText('Previous'));
    expect(view.getByText('2 of 3')).toBeTruthy();
  });

  it('offers Open and Copy URL on a slide image', async () => {
    const view = render(<CarouselSurface spec={spec} colors={lightColors} />);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy image URL: Day one'));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://images.example.com/1.jpg');
    expect(view.getByLabelText('Open image: Day one')).toBeTruthy();
  });
});
