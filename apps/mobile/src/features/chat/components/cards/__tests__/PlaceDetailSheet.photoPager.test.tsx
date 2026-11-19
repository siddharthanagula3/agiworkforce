import { FlatList, I18nManager } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PlacesCardPhoto, PlacesCardPlace } from '@agiworkforce/types';

const mockExpoImage = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: jest.fn(() => true),
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

const mockTheme = { isDark: false, colors: {} as Record<string, string> };
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    useTheme: () => mockTheme,
    useThemeColors: () => mockTheme.colors,
  };
});

import { getColors } from '@/src/ui/theme/tokens';
import { PlaceDetailSheet } from '../PlaceDetailSheet';

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};
const PAGE_WIDTH = 361;
const ACCESS = { base: 'https://app.agi.example', headers: { Authorization: 'Bearer token' } };

function photos(count: number, prefix = 'one'): PlacesCardPhoto[] {
  return Array.from({ length: count }, (_, i) => ({
    reference: `places/${prefix}/photos/${i + 1}`,
    ...(i === 0 ? { attribution: `Photo by ${prefix}` } : {}),
  }));
}

function place(name: string, placeId: string, photoCount: number): PlacesCardPlace {
  return {
    placeId,
    name,
    latitude: 30.2672,
    longitude: -97.7431,
    photos: photos(photoCount, placeId),
  };
}

function sheet(target: PlacesCardPlace) {
  return (
    <SafeAreaProvider initialMetrics={PHONE}>
      <PlaceDetailSheet
        place={target}
        index={0}
        total={2}
        note={null}
        photoAccess={ACCESS}
        attribution="Provider credit"
        termsUrl={undefined}
        onClose={jest.fn()}
        onStep={jest.fn()}
      />
    </SafeAreaProvider>
  );
}

function measure(width = PAGE_WIDTH) {
  fireEvent(screen.getByTestId('places-photo-frame'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 160 } },
  });
}

function swipeTo(page: number, width = PAGE_WIDTH) {
  fireEvent(screen.getByTestId('places-photo-pager'), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: page * width, y: 0 } },
  });
}

function swipeToRtl(page: number, pages: number, width = PAGE_WIDTH) {
  fireEvent(screen.getByTestId('places-photo-pager'), 'momentumScrollEnd', {
    nativeEvent: {
      contentOffset: { x: (pages - 1 - page) * width, y: 0 },
      contentSize: { width: pages * width, height: 160 },
      layoutMeasurement: { width, height: 160 },
    },
  });
}

function photoLabels(): string[] {
  const labels = mockExpoImage.mock.calls
    .map(([props]) => props)
    .filter((props) => props.testID === 'places-detail-photo')
    .map((props) => String(props.accessibilityLabel));
  return [...new Set(labels)];
}

beforeEach(() => {
  mockTheme.colors = getColors('light', 'light', false);
  mockExpoImage.mockClear();
});

describe('place photo pager', () => {
  it('lays every photo out as a page of the measured width in a paged horizontal list', () => {
    render(sheet(place('Cafe One', 'one', 3)));
    expect(screen.queryByTestId('places-photo-pager')).toBeNull();

    measure();

    const pager = screen.getByTestId('places-photo-pager');
    expect(pager.props.pagingEnabled).toBe(true);
    expect(pager.props.horizontal).toBe(true);
    expect(pager.props.getItemLayout(null, 2)).toEqual({
      length: PAGE_WIDTH,
      offset: PAGE_WIDTH * 2,
      index: 2,
    });
    expect(photoLabels()).toEqual([
      'Photo 1 of 3, Cafe One',
      'Photo 2 of 3, Cafe One',
      'Photo 3 of 3, Cafe One',
    ]);
  });

  it('moves the selected dot with a swipe', () => {
    render(sheet(place('Cafe One', 'one', 3)));
    measure();
    expect(screen.getByLabelText('Show photo 1 of 3')).toBeSelected();

    swipeTo(2);

    expect(screen.getByLabelText('Show photo 3 of 3')).toBeSelected();
    expect(screen.getByLabelText('Show photo 1 of 3')).not.toBeSelected();
  });

  it('follows a swipe in a right-to-left layout where the native offset runs from the left edge', () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    try {
      render(sheet(place('Cafe One', 'one', 4)));
      measure();

      swipeToRtl(0, 4);
      expect(screen.getByLabelText('Show photo 1 of 4')).toBeSelected();

      swipeToRtl(3, 4);
      expect(screen.getByLabelText('Show photo 4 of 4')).toBeSelected();
      expect(screen.getByLabelText('Show photo 1 of 4')).not.toBeSelected();
    } finally {
      Object.defineProperty(I18nManager, 'isRTL', { value: original, configurable: true });
    }
  });

  it('keeps the dots below the photo so a swipe anywhere on the photo pages it', () => {
    render(sheet(place('Cafe One', 'one', 3)));
    measure();

    const frame = screen.getByTestId('places-photo-frame');
    expect(within(frame).queryByLabelText(/^Show photo/)).toBeNull();
    expect(
      within(screen.getByTestId('places-photo-dots')).getAllByLabelText(/^Show photo/),
    ).toHaveLength(3);
  });

  it('scrolls to a photo when its dot is tapped', () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    render(sheet(place('Cafe One', 'one', 4)));
    measure();

    fireEvent.press(screen.getByLabelText('Show photo 3 of 4'));

    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: PAGE_WIDTH * 2, animated: true });
    expect(screen.getByLabelText('Show photo 3 of 4')).toBeSelected();
    scrollToOffset.mockRestore();
  });

  it('keeps the page when the sheet is resized', () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    render(sheet(place('Cafe One', 'one', 4)));
    measure();
    swipeTo(2);

    measure(500);

    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 1000, animated: false });
    scrollToOffset.mockRestore();
  });

  it('shows one dot per photo up to eight and no counter', () => {
    render(sheet(place('Cafe One', 'one', 8)));
    measure();

    expect(screen.getAllByLabelText(/^Show photo \d of 8$/)).toHaveLength(8);
    expect(screen.queryByTestId('places-photo-counter')).toBeNull();
  });

  it('swaps the dots for a position counter beyond eight photos', () => {
    render(sheet(place('Cafe One', 'one', 12)));
    measure();

    expect(screen.queryByLabelText(/^Show photo/)).toBeNull();
    const counter = screen.getByTestId('places-photo-counter');
    expect(within(counter).getByText('1 / 12')).toBeTruthy();
    expect(counter.props.accessibilityLabel).toBe('Photo 1 of 12');

    swipeTo(2);

    expect(within(screen.getByTestId('places-photo-counter')).getByText('3 / 12')).toBeTruthy();
  });

  it('shows no dots or counter for a single photo', () => {
    render(sheet(place('Cafe One', 'one', 1)));
    measure();

    expect(screen.queryByLabelText(/^Show photo/)).toBeNull();
    expect(screen.queryByTestId('places-photo-counter')).toBeNull();
    expect(photoLabels()).toEqual(['Photo of Cafe One']);
  });

  it('replaces only the photo that fails and keeps the others and their attribution', () => {
    render(sheet(place('Cafe One', 'one', 3)));
    measure();
    expect(screen.getByText('Photo by one')).toBeTruthy();

    const second = mockExpoImage.mock.calls
      .map(([props]) => props)
      .filter((props) => props.testID === 'places-detail-photo')
      .find((props) => String(props.accessibilityLabel).startsWith('Photo 2 of 3'))!;
    act(() => (second.onError as () => void)());

    expect(screen.getAllByTestId('places-photo-placeholder')).toHaveLength(1);
    expect(screen.getByText('Photo unavailable')).toBeTruthy();
    expect(screen.getByText('Photo by one')).toBeTruthy();
  });

  it('starts at the first photo when the place changes', () => {
    const { rerender } = render(sheet(place('Cafe One', 'one', 3)));
    measure();
    swipeTo(2);
    expect(screen.getByLabelText('Show photo 3 of 3')).toBeSelected();

    rerender(sheet(place('Bean Two', 'two', 3)));
    measure();

    expect(screen.getByLabelText('Show photo 1 of 3')).toBeSelected();
    expect(photoLabels()).toContain('Photo 3 of 3, Bean Two');
  });
});
