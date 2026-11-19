import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking, View as MockView } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { InteractiveCard, PlacesCardBody } from '@agiworkforce/types';
import { ASSISTANT_NOTE_HEADING } from '@agiworkforce/unified-chat/place-facts';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockOpenUntrustedUrl = jest.fn();
const mockApiFetch = jest.fn();
let mockIsDark = false;

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('lucide-react-native', () => {
  const icon = (props: Record<string, unknown>) => <MockView {...props} />;
  return {
    AlertCircle: icon,
    ChevronLeft: icon,
    ChevronRight: icon,
    ExternalLink: icon,
    Globe: icon,
    MapPinned: icon,
    Maximize2: icon,
    Minus: icon,
    Navigation: icon,
    Plus: icon,
    Star: icon,
    X: icon,
  };
});

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: jest.requireActual('@/lib/safeOpenURL').isInAppBrowsableUrl,
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrustedUrl(...args),
}));

jest.mock('@/src/ui/theme', () => {
  const colors = {
    background: 'colour-background',
    border: 'colour-border',
    surfaceBase: 'colour-base',
    surfaceElevated: 'colour-elevated',
    surfaceOverlay: 'colour-overlay',
    surfaceHover: 'colour-hover',
    scrim: 'colour-scrim',
    teal: 'colour-teal',
    accentText: 'colour-accent-text',
    agentWarning: 'colour-warning',
    agentSuccess: 'colour-success',
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
    textSecondary: 'colour-secondary',
    transparent: 'transparent',
  };
  return {
    useThemeColors: () => colors,
    useTheme: () => ({ colors, isDark: mockIsDark }),
  };
});

import { InteractiveCardBlock } from '../../InteractiveCardBlock';
import { resetMapTileConfigCache } from '../../../services/mapTiles';
import * as PlaceDetailSheetModule from '../PlaceDetailSheet';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';

const TILE_ORIGIN = 'https://app.agi.example/';
const DIRECTIONS_URL = 'https://maps.google.com/?cid=1111';
const APPLE_DIRECTIONS_URL = 'https://maps.apple.com/?daddr=30.2672,-97.7431';
const WEBSITE_URL = 'https://cafe-one.example/';
const TERMS_URL = 'https://maps.example/terms';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Light tile credit',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Dark tile credit',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const BODY: PlacesCardBody = {
  query: 'coffee',
  near: 'Austin',
  openNowRequested: true,
  localTime: '7:42 PM',
  attribution: 'Provider credit',
  termsUrl: TERMS_URL,
  places: [
    {
      placeId: 'place-one',
      name: 'Cafe One',
      latitude: 30.2672,
      longitude: -97.7431,
      address: '100 Congress Ave, Austin',
      rating: 4.6,
      reviewCount: 1234,
      category: 'Cafe',
      priceLevel: 'moderate',
      openNow: true,
      directionsUrl: DIRECTIONS_URL,
      websiteUrl: WEBSITE_URL,
    },
    {
      placeId: 'place-two',
      name: 'Bean Two',
      latitude: 30.28,
      longitude: -97.73,
      openNow: false,
    },
  ],
};

function placesCard(body: PlacesCardBody = BODY): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'places-card',
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Places for coffee near Austin', text: '1. Cafe One' },
    producedBy: { toolCallId: 'places-call', toolName: 'search_places' },
    recognized: true,
    kind: 'places.v1',
    body,
  };
}

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function PhoneSafeArea({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={PHONE}>{children}</SafeAreaProvider>;
}

function renderPlaces(
  body?: PlacesCardBody,
  canLoadManagedCloudTiles = true,
  assistantText?: string,
) {
  return render(
    <InteractiveCardBlock
      cards={[placesCard(body)]}
      tileBaseUrl={TILE_ORIGIN}
      canLoadManagedCloudTiles={canLoadManagedCloudTiles}
      messageId="msg-places"
      conversationId="conv-places"
      {...(assistantText ? { assistantText } : {})}
    />,
    { wrapper: PhoneSafeArea },
  );
}

const PHOTO_BODY: PlacesCardBody = {
  ...BODY,
  places: [
    {
      ...BODY.places[0]!,
      photos: [
        { reference: 'places/one/photos/a', attribution: 'Photo by Ana' },
        { reference: 'places/one/photos/b' },
      ],
    },
    BODY.places[1]!,
  ],
};

function imageSources(testID: string) {
  return mockExpoImage.mock.calls
    .map(([props]) => props)
    .filter((props) => props.testID === testID)
    .map((props) => props.source as { uri: string; headers: Record<string, string> });
}

describe('InteractiveCardBlock places card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDark = false;
    resetMapTileConfigCache();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
    mockOpenUntrustedUrl.mockResolvedValue(true);
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    useLocalSettingsStore.setState({ mapProvider: 'apple' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    useLocalSettingsStore.setState({ mapProvider: 'apple' });
  });

  it('opens the places on a full screen map whose pins name each place', async () => {
    const { findByLabelText, getByTestId, queryByTestId } = renderPlaces();

    fireEvent.press(await findByLabelText('Full screen map'));
    const viewer = within(getByTestId('map-viewer'));
    expect(viewer.getByText('Map of places for coffee near Austin')).toBeTruthy();
    expect(viewer.getByText('Light tile credit')).toBeTruthy();
    act(() => {
      getByTestId('map-viewer-canvas').props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    const pins = await viewer.findAllByTestId('places-viewer-marker', {
      includeHiddenElements: true,
    });
    expect(pins).toHaveLength(2);
    expect(pins[0]).not.toHaveProp('accessibilityRole', 'button');

    fireEvent.press(viewer.getByLabelText('Close'));
    expect(queryByTestId('map-viewer')).toBeNull();
  });

  it('renders the places card instead of the generic fallback box', async () => {
    const { getByTestId, queryByText, getByText } = renderPlaces();

    expect(getByTestId('interactive-card-places')).toBeTruthy();
    expect(queryByText('Places for coffee near Austin')).toBeNull();
    expect(getByText('coffee near Austin')).toBeTruthy();
    expect(getByText('Open at 7:42 PM')).toBeTruthy();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('says Checked with the time when the search did not ask about opening hours', async () => {
    const { getByText } = renderPlaces({ ...BODY, openNowRequested: false });

    expect(getByText('Checked 7:42 PM')).toBeTruthy();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('lists each place with rating, review count, price, category and open state', async () => {
    const { getAllByTestId } = renderPlaces();

    const rows = getAllByTestId('places-list-row');
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText('Cafe One')).toBeTruthy();
    expect(first.getByText('4.6')).toBeTruthy();
    expect(first.getByText(`(${(1234).toLocaleString()})`)).toBeTruthy();
    expect(first.getByText('$$ · Cafe')).toBeTruthy();
    expect(first.getByText('Open')).toHaveStyle({ color: 'colour-success' });
    const second = within(rows[1]!);
    expect(second.getByText('Bean Two')).toBeTruthy();
    expect(second.getByText('Closed')).toHaveStyle({ color: 'colour-secondary' });
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('draws the map from the configured tile endpoint with the bearer header and a rating marker per place', async () => {
    const { findAllByTestId, getByLabelText } = renderPlaces();

    const markers = await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    expect(markers).toHaveLength(2);
    expect(within(markers[0]!).getByText('4.6', { includeHiddenElements: true })).toBeTruthy();
    expect(within(markers[1]!).getByText('B', { includeHiddenElements: true })).toBeTruthy();
    expect(getByLabelText('Map of places for coffee near Austin')).toBeTruthy();

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/maps/config',
      { method: 'GET' },
      {
        baseUrl: 'https://app.agi.example',
        headers: { Authorization: 'Bearer short-lived-token' },
      },
    );
    const sources = mockExpoImage.mock.calls.map(([props]) => props.source);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).toMatchObject({
        uri: expect.stringMatching(/^https:\/\/app\.agi\.example\/api\/maps\/tile\/\d+\/\d+\/\d+$/),
        headers: { Authorization: 'Bearer short-lived-token' },
      });
    }
  });

  it('uses the dark tile style and its attribution in a dark theme', async () => {
    mockIsDark = true;
    const { findAllByTestId, getByTestId } = renderPlaces();

    await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    const uris = mockExpoImage.mock.calls.map(([props]) => (props.source as { uri: string }).uri);
    expect(uris.every((uri) => uri.endsWith('?style=dark'))).toBe(true);
    expect(getByTestId('places-card-attribution')).toHaveTextContent(
      'Provider credit · Dark tile credit',
    );
  });

  it('shows the provider and tile attribution in the footer and opens the provider terms', async () => {
    const { findAllByTestId, getByTestId, getAllByLabelText } = renderPlaces();

    await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    expect(getByTestId('places-card-attribution')).toHaveTextContent(
      'Provider credit · Light tile credit',
    );
    fireEvent.press(getAllByLabelText('Terms')[0]!);
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(TERMS_URL);
  });

  it('keeps the provider attribution and the list when the map cannot be loaded', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve(null) });
    const { findByText, getByTestId, getAllByTestId, queryAllByTestId } = renderPlaces();

    expect(
      await findByText(
        'The map could not be loaded. The places from this search are listed below.',
      ),
    ).toBeTruthy();
    expect(queryAllByTestId('places-map-marker', { includeHiddenElements: true })).toHaveLength(0);
    expect(getAllByTestId('places-list-row')).toHaveLength(2);
    expect(getByTestId('places-card-attribution')).toHaveTextContent('Provider credit');
  });

  it('shows the unavailable map line when the map configuration request is refused', async () => {
    mockApiFetch.mockRejectedValue(new Error('credential unavailable'));
    const { findByText, getAllByTestId } = renderPlaces();

    expect(
      await findByText(
        'The map could not be loaded. The places from this search are listed below.',
      ),
    ).toBeTruthy();
    expect(getAllByTestId('places-list-row')).toHaveLength(2);
  });

  it('shows the unavailable map line when every tile fails', async () => {
    const { findAllByTestId, findByText } = renderPlaces();

    await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    act(() => {
      for (const [props] of mockExpoImage.mock.calls) {
        (props.onError as (() => void) | undefined)?.();
      }
    });
    expect(
      await findByText(
        'The map could not be loaded. The places from this search are listed below.',
      ),
    ).toBeTruthy();
  });

  it('never asks for auth, map configuration or tiles outside Managed Cloud', () => {
    const { getByText, getAllByTestId } = renderPlaces(BODY, false);

    expect(
      getByText('The map could not be loaded. The places from this search are listed below.'),
    ).toBeTruthy();
    expect(getAllByTestId('places-list-row')).toHaveLength(2);
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('says no places matched when the search returned none', () => {
    const { getByTestId, queryByTestId } = renderPlaces({ ...BODY, places: [] });

    expect(getByTestId('places-card-empty')).toHaveTextContent('No places matched this search.');
    expect(queryByTestId('places-card-list')).toBeNull();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
  });

  it('opens the details sheet from a marker and marks that marker selected', async () => {
    const { findAllByTestId, getByTestId } = renderPlaces();

    const markers = await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    fireEvent.press(markers[1]!);

    const sheet = within(getByTestId('places-detail-sheet'));
    expect(sheet.getByText('Bean Two')).toBeTruthy();
    expect(sheet.getByText('2 of 2')).toBeTruthy();
    const refreshed = await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    expect(refreshed[1]).toBeSelected();
    expect(refreshed[0]).not.toBeSelected();
  });

  it('shows the place facts, address and actions in the details sheet', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    const sheet = within(getByTestId('places-detail-sheet'));
    expect(sheet.getByText('Cafe One')).toBeTruthy();
    expect(sheet.getByText('4.6')).toBeTruthy();
    expect(sheet.getByText('Open')).toBeTruthy();
    expect(sheet.getByText('$$ · Cafe')).toBeTruthy();
    expect(sheet.getByText('100 Congress Ave, Austin').props.selectable).toBe(true);
    expect(sheet.getByText('Provider credit')).toBeTruthy();

    fireEvent.press(sheet.getByLabelText('Directions'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(APPLE_DIRECTIONS_URL);

    fireEvent.press(sheet.getByLabelText('Website'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(WEBSITE_URL);

    fireEvent.press(sheet.getByLabelText('Open in Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(
      'https://maps.apple.com/?ll=30.2672,-97.7431&q=Cafe%20One',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();

    fireEvent.press(sheet.getByLabelText('Terms'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(TERMS_URL);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('opens Apple Maps directions and any other directions link in the in-app browser', async () => {
    const otherDirections = 'https://maps.example.com/dir/cafe-one';
    const { getAllByTestId, getByTestId, rerender } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Directions'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(APPLE_DIRECTIONS_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();

    rerender(
      <InteractiveCardBlock
        cards={[
          placesCard({
            ...BODY,
            places: [{ ...BODY.places[0]!, directionsUrl: otherDirections }, BODY.places[1]!],
          }),
        ]}
        tileBaseUrl={TILE_ORIGIN}
        canLoadManagedCloudTiles
        messageId="msg-places"
        conversationId="conv-places"
      />,
    );
    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Directions'));
    expect(Linking.openURL).not.toHaveBeenCalled();
    await waitFor(() => expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(otherDirections));
  });

  it('never asks the system to open a directions link', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Directions'));
    await waitFor(() =>
      expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(APPLE_DIRECTIONS_URL),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the Google Maps place link for Directions and Open in Maps on Google Maps when that is the map choice', async () => {
    useLocalSettingsStore.setState({ mapProvider: 'google' });
    const { getAllByTestId, getByTestId } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    const sheet = within(getByTestId('places-detail-sheet'));
    fireEvent.press(sheet.getByLabelText('Directions'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(DIRECTIONS_URL);

    fireEvent.press(sheet.getByLabelText('Open in Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenLastCalledWith(
      'https://www.google.com/maps/search/?api=1&query=30.2672%2C-97.7431',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('offers no Directions or Website for a place without those links', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[1]!);
    const sheet = within(getByTestId('places-detail-sheet'));
    expect(sheet.queryByLabelText('Directions')).toBeNull();
    expect(sheet.queryByLabelText('Website')).toBeNull();
    expect(sheet.getByLabelText('Open in Maps')).toBeTruthy();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('steps to the next and previous place and closes the sheet', async () => {
    const { getAllByTestId, getByTestId, queryByTestId } = renderPlaces();

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Next place'));
    expect(within(getByTestId('places-detail-sheet')).getByText('Bean Two')).toBeTruthy();

    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Next place'));
    expect(within(getByTestId('places-detail-sheet')).getByText('Cafe One')).toBeTruthy();

    fireEvent.press(within(getByTestId('places-detail-sheet')).getByLabelText('Previous place'));
    expect(within(getByTestId('places-detail-sheet')).getByText('Bean Two')).toBeTruthy();

    fireEvent.press(
      within(getByTestId('places-detail-sheet')).getByLabelText('Close place details'),
    );
    expect(queryByTestId('places-detail-sheet')).toBeNull();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('hides the pagination for a single place', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces({ ...BODY, places: [BODY.places[0]!] });

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    const sheet = within(getByTestId('places-detail-sheet'));
    expect(sheet.queryByLabelText('Next place')).toBeNull();
    expect(sheet.queryByText('1 of 1')).toBeNull();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('shows each place photo as its list thumbnail through the first-party photo proxy with the bearer header', async () => {
    const { getAllByTestId } = renderPlaces(PHOTO_BODY);

    await waitFor(() => expect(imageSources('places-list-photo')).not.toHaveLength(0));
    expect(imageSources('places-list-photo').at(-1)).toEqual({
      uri: 'https://app.agi.example/api/maps/place-photo?ref=places%2Fone%2Fphotos%2Fa&w=160',
      headers: { Authorization: 'Bearer short-lived-token' },
    });
    expect(
      within(getAllByTestId('places-list-row')[1]!).getByTestId('places-photo-placeholder'),
    ).toBeTruthy();
  });

  it('falls back to the pin square when a thumbnail fails to load', async () => {
    const { getAllByTestId } = renderPlaces(PHOTO_BODY);

    await waitFor(() => expect(imageSources('places-list-photo')).not.toHaveLength(0));
    const thumbnail = mockExpoImage.mock.calls
      .map(([props]) => props)
      .filter((props) => props.testID === 'places-list-photo')
      .at(-1)!;
    act(() => (thumbnail.onError as () => void)());
    expect(
      within(getAllByTestId('places-list-row')[0]!).getByTestId('places-photo-placeholder'),
    ).toBeTruthy();
  });

  it('pages through the place photos in the details sheet with their attribution', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces(PHOTO_BODY);

    await waitFor(() => expect(imageSources('places-list-photo')).not.toHaveLength(0));
    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    const sheet = within(getByTestId('places-detail-sheet'));
    fireEvent(sheet.getByTestId('places-photo-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 361, height: 160 } },
    });
    const detailSources = imageSources('places-detail-photo');
    expect(detailSources.map((source) => source.uri)).toEqual(
      expect.arrayContaining([
        'https://app.agi.example/api/maps/place-photo?ref=places%2Fone%2Fphotos%2Fa&w=640',
        'https://app.agi.example/api/maps/place-photo?ref=places%2Fone%2Fphotos%2Fb&w=640',
      ]),
    );
    expect(detailSources.at(-1)?.headers).toEqual({ Authorization: 'Bearer short-lived-token' });
    expect(sheet.getByText('Photo by Ana')).toBeTruthy();
    expect(sheet.getByLabelText('Show photo 1 of 2')).toBeSelected();

    fireEvent(sheet.getByTestId('places-photo-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 361, y: 0 } },
    });
    expect(sheet.getByLabelText('Show photo 2 of 2')).toBeSelected();
  });

  it('never asks for place photos outside Managed Cloud', () => {
    const { getAllByTestId, getByTestId } = renderPlaces(PHOTO_BODY, false);

    const row = getAllByTestId('places-list-row')[0]!;
    expect(within(row).getByTestId('places-photo-placeholder')).toBeTruthy();
    fireEvent.press(row);
    expect(
      within(getByTestId('places-detail-sheet')).getByTestId('places-photo-placeholder'),
    ).toBeTruthy();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('quotes what the answer said about the selected place under About, from this answer', async () => {
    const { getAllByTestId, getByTestId } = renderPlaces(
      BODY,
      true,
      'Here are two spots.\n\n- **Cafe One** roasts its own beans and opens early. Bean Two is quieter.',
    );

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    const note = within(getByTestId('places-assistant-note'));
    expect(note.getByText('About, from this answer')).toBeTruthy();
    expect(note.getByText(ASSISTANT_NOTE_HEADING)).toBeTruthy();
    expect(PlaceDetailSheetModule).not.toHaveProperty('ASSISTANT_NOTE_HEADING');
    expect(note.getByText('Cafe One roasts its own beans and opens early.')).toBeTruthy();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('shows no note when the answer never names the place', async () => {
    const { getAllByTestId, queryByTestId } = renderPlaces(BODY, true, 'Nothing specific here.');

    fireEvent.press(getAllByTestId('places-list-row')[0]!);
    expect(queryByTestId('places-assistant-note')).toBeNull();
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
  });

  it('centres the map on the place that was picked', async () => {
    const { findAllByTestId, getAllByTestId } = renderPlaces();

    await findAllByTestId('places-map-marker', { includeHiddenElements: true });
    const tileZoom = () =>
      Number(
        /\/api\/maps\/tile\/(\d+)\//.exec(
          (mockExpoImage.mock.calls.at(-1)![0].source as { uri: string }).uri,
        )![1],
      );
    expect(tileZoom()).toBeLessThan(15);
    mockExpoImage.mockClear();
    fireEvent.press(getAllByTestId('places-list-row')[1]!);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(tileZoom()).toBe(15);
  });
});
