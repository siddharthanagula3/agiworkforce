import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Modal, View as MockView } from 'react-native';
import type { InteractiveCard, ItineraryCardBody } from '@agiworkforce/types';

const mockExpoImage = jest.fn();
const mockApiFetch = jest.fn();
const mockGetAuthHeaders = jest.fn();

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
    ExternalLink: icon,
    MapPinned: icon,
    Maximize2: icon,
    Minus: icon,
    Navigation: icon,
    Plus: icon,
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
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

jest.mock('@/src/ui/theme', () => {
  const colors = {
    background: 'colour-background',
    border: 'colour-border',
    surfaceBase: 'colour-base',
    surfaceElevated: 'colour-elevated',
    surfaceOverlay: 'colour-overlay',
    scrim: 'colour-scrim',
    teal: 'colour-teal',
    accentText: 'colour-accent-text',
    agentWarning: 'colour-warning',
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
    textSecondary: 'colour-secondary',
  };
  return { useThemeColors: () => colors, useTheme: () => ({ colors, isDark: false }) };
});

import {
  ITINERARY_MAP_UNAVAILABLE_MESSAGE,
  InteractiveCardBlock,
} from '../../InteractiveCardBlock';
import { MAP_ENTER_FULLSCREEN_LABEL, MapViewer, clampZoom, panView, zoomView } from '../MapViewer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { spaceAbove, tapTarget } from '@/test-utils/viewerChrome';
import { project, resetMapTileConfigCache } from '../../../services/mapTiles';

const TILE_ORIGIN = 'https://app.agi.example/';
const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Light tile credit',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Dark tile credit',
  dimLightTiles: false,
  minZoom: 3,
  maxZoom: 12,
};

const ITINERARY: ItineraryCardBody = {
  title: 'Texas day',
  summary: 'Two cities.',
  summarySources: [],
  region: { label: 'Texas', timeZone: 'America/Chicago' },
  places: [
    {
      status: 'resolved',
      provider: 'fixture',
      providerPlaceId: 'austin',
      lat: 30.27,
      lng: -97.74,
      displayName: 'Austin',
      formattedAddress: 'Austin, TX',
      resolvedAt: '2026-11-14T12:00:00.000Z',
      attribution: { providerLabel: 'Places provider' },
    },
    {
      status: 'resolved',
      provider: 'fixture',
      providerPlaceId: 'dallas',
      lat: 32.78,
      lng: -96.8,
      displayName: 'Dallas',
      formattedAddress: 'Dallas, TX',
      resolvedAt: '2026-11-14T12:00:00.000Z',
      attribution: { providerLabel: 'Places provider' },
    },
    { status: 'unresolved', query: 'Marfa lights', reason: 'no_match' },
  ],
  stops: [
    { id: 's1', pin: 1, placeIndex: 0, startTimeLabel: '9 AM', note: '', sources: [] },
    { id: 's2', pin: 2, placeIndex: 1, startTimeLabel: '2 PM', note: '', sources: [] },
    { id: 's3', pin: 3, placeIndex: 2, startTimeLabel: '8 PM', note: '', sources: [] },
  ],
  route: { status: 'unavailable', reason: 'unresolved_stops', unresolvedStopCount: 1 },
};

function itineraryCard(body: ItineraryCardBody = ITINERARY): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'itinerary-card',
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Texas day', text: 'Plan' },
    producedBy: { toolCallId: 'itinerary-card', toolName: 'plan_itinerary' },
    recognized: true,
    kind: 'itinerary.v1',
    body,
  };
}

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function renderItinerary(canLoadManagedCloudTiles = true) {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <InteractiveCardBlock
        cards={[itineraryCard()]}
        tileBaseUrl={TILE_ORIGIN}
        canLoadManagedCloudTiles={canLoadManagedCloudTiles}
        messageId="msg-itinerary"
        conversationId="conv-itinerary"
      />
    </SafeAreaProvider>,
  );
}

function tileZooms(): number[] {
  return mockExpoImage.mock.calls
    .map(([props]) => (props.source as { uri?: string } | undefined)?.uri ?? '')
    .map((uri) => /\/api\/maps\/tile\/(\d+)\//.exec(uri)?.[1])
    .filter((zoom): zoom is string => Boolean(zoom))
    .map(Number);
}

function tileUris(): string[] {
  return mockExpoImage.mock.calls
    .map(([props]) => (props.source as { uri?: string } | undefined)?.uri ?? '')
    .filter(Boolean);
}

describe('map view math', () => {
  it('moves the centre opposite to the drag by exactly the dragged pixels', () => {
    const view = { latitude: 30.27, longitude: -97.74, zoom: 10 };
    const before = project(view.latitude, view.longitude, view.zoom);
    const moved = panView(view, 120, -40);
    const after = project(moved.latitude, moved.longitude, moved.zoom);

    expect(moved.zoom).toBe(10);
    expect(after.pixelX).toBeCloseTo(before.pixelX - 120, 6);
    expect(after.pixelY).toBeCloseTo(before.pixelY + 40, 6);
  });

  it('stops at the edge of the world instead of leaving the tiles', () => {
    const moved = panView({ latitude: 0, longitude: 179, zoom: 2 }, -100000, 0);
    expect(moved.longitude).toBeCloseTo(180, 6);
  });

  it('keeps zoom inside the provider bounds', () => {
    const bounds = { min: 3, max: 6 };
    expect(zoomView({ latitude: 0, longitude: 0, zoom: 6 }, 1, bounds).zoom).toBe(6);
    expect(zoomView({ latitude: 0, longitude: 0, zoom: 3 }, -1, bounds).zoom).toBe(3);
    expect(zoomView({ latitude: 0, longitude: 0, zoom: 4 }, 1, bounds).zoom).toBe(5);
    expect(clampZoom(11, bounds)).toBe(6);
  });
});

describe('itinerary map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMapTileConfigCache();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
  });

  it('draws a numbered marker for each resolved stop on the first-party tiles', async () => {
    const { findAllByTestId, getByTestId, getByText } = renderItinerary();

    const markers = await findAllByTestId('itinerary-map-marker', { includeHiddenElements: true });
    expect(markers.map((marker) => marker.props.accessibilityLabel)).toEqual([
      'Stop 1: Austin',
      'Stop 2: Dallas',
    ]);
    expect(getByTestId('itinerary-map-attribution')).toHaveTextContent('Light tile credit');
    for (const uri of tileUris()) {
      expect(uri.startsWith('https://app.agi.example/api/maps/tile/')).toBe(true);
    }
    expect(getByText('Marfa lights')).toBeTruthy();
  });

  it('highlights the marker and centres the map on a stop tapped in the list', async () => {
    const { findByLabelText, getAllByTestId } = renderItinerary();

    const dallas = await findByLabelText('Show Dallas on the map');
    const before = new Set(tileUris());
    mockExpoImage.mockClear();
    fireEvent.press(dallas);

    const markers = getAllByTestId('itinerary-map-marker', { includeHiddenElements: true });
    expect(markers[1]).toBeSelected();
    expect(markers[0]).not.toBeSelected();
    expect(tileUris().some((uri) => !before.has(uri))).toBe(true);
  });

  it('selects a stop from its marker', async () => {
    const { findAllByTestId, getByLabelText } = renderItinerary();

    const markers = await findAllByTestId('itinerary-map-marker', { includeHiddenElements: true });
    fireEvent.press(markers[0]!);
    expect(getByLabelText('Show Austin on the map')).toBeSelected();
  });

  it('keeps the stops with the map note when every tile fails', async () => {
    const { findAllByTestId, findByTestId, getByText, queryByTestId } = renderItinerary();

    await findAllByTestId('itinerary-map-marker', { includeHiddenElements: true });
    act(() => {
      for (const [props] of mockExpoImage.mock.calls) {
        (props.onError as (() => void) | undefined)?.();
      }
    });

    expect(await findByTestId('itinerary-map-unavailable')).toHaveTextContent(
      ITINERARY_MAP_UNAVAILABLE_MESSAGE,
    );
    expect(queryByTestId('itinerary-map')).toBeNull();
    expect(getByText('Austin')).toBeTruthy();
    expect(getByText('Dallas')).toBeTruthy();
  });

  it('draws no map and asks for no token in a Local chat', () => {
    const { queryByTestId, getByText } = renderItinerary(false);

    expect(queryByTestId('itinerary-map')).toBeNull();
    expect(queryByTestId('itinerary-map-unavailable')).toBeNull();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(getByText('Austin')).toBeTruthy();
  });
});

describe('full screen map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMapTileConfigCache();
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
  });

  it('opens from the map, zooms within the provider bounds and closes back to the chat', async () => {
    const { findByLabelText, getByTestId, queryByTestId } = renderItinerary();

    fireEvent.press(await findByLabelText(MAP_ENTER_FULLSCREEN_LABEL));
    const viewer = within(getByTestId('map-viewer'));
    expect(viewer.getByText('Map of Texas day')).toBeTruthy();
    expect(viewer.getByText('Light tile credit')).toBeTruthy();

    act(() => {
      getByTestId('map-viewer-canvas').props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    await waitFor(() =>
      expect(viewer.getAllByLabelText(/^Stop \d: /, { includeHiddenElements: true })).toHaveLength(
        2,
      ),
    );
    const startZoom = Math.max(...tileZooms());

    mockExpoImage.mockClear();
    fireEvent.press(viewer.getByLabelText('Zoom in'));
    expect(new Set(tileZooms())).toEqual(new Set([startZoom + 1]));

    for (let step = 0; step < TILE_CONFIG.maxZoom; step++) {
      fireEvent.press(viewer.getByLabelText('Zoom in'));
    }
    expect(viewer.getByLabelText('Zoom in')).toBeDisabled();
    expect(viewer.getByLabelText('Zoom out')).not.toBeDisabled();
    mockExpoImage.mockClear();
    fireEvent.press(viewer.getByLabelText('Zoom out'));
    expect(new Set(tileZooms())).toEqual(new Set([TILE_CONFIG.maxZoom - 1]));

    fireEvent.press(viewer.getByLabelText('Close'));
    expect(queryByTestId('map-viewer')).toBeNull();
  });

  it('keeps Close below the status bar, and the system back closes the map', () => {
    const onClose = jest.fn();
    const screen = render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <MapViewer
          visible
          title="Map of Texas day"
          initialView={{ latitude: 30.27, longitude: -97.74, zoom: 6 }}
          zoomBounds={{ min: TILE_CONFIG.minZoom, max: TILE_CONFIG.maxZoom }}
          points={[]}
          tileUri={() => `${TILE_ORIGIN}api/maps/tile/6/0/0`}
          headers={{}}
          attribution="Light tile credit"
          markerAnchor={{ width: 24, height: 24 }}
          renderMarker={() => null}
          onClose={onClose}
        />
      </SafeAreaProvider>,
    );

    const close = screen.getByLabelText('Close');
    expect(spaceAbove(close)).toBeGreaterThanOrEqual(PHONE.insets.top);
    const target = tapTarget(close);
    expect(target.width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(target.height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);

    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lets the canvas take a drag so the map moves instead of the chat', async () => {
    const { findByLabelText, getByTestId } = renderItinerary();

    fireEvent.press(await findByLabelText(MAP_ENTER_FULLSCREEN_LABEL));
    const canvas = getByTestId('map-viewer-canvas');
    expect(typeof canvas.props.onMoveShouldSetResponder).toBe('function');
    expect(canvas.props.onResponderTerminationRequest()).toBe(false);
  });
});
