import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, View as MockView } from 'react-native';
import type { InteractiveCard, MapSearchCardBody } from '@agiworkforce/types';

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => ({
  ExternalLink: (props: Record<string, unknown>) => <MockView {...props} />,
  MapPinned: (props: Record<string, unknown>) => <MockView {...props} />,
  Maximize2: (props: Record<string, unknown>) => <MockView {...props} />,
  Minus: (props: Record<string, unknown>) => <MockView {...props} />,
  Navigation: (props: Record<string, unknown>) => <MockView {...props} />,
  Plus: (props: Record<string, unknown>) => <MockView {...props} />,
  X: (props: Record<string, unknown>) => <MockView {...props} />,
}));

jest.mock('@/services/api', () => ({
  apiFetch: () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
          attribution: 'Map data provider',
          darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
          darkAttribution: 'Dark map data provider',
          dimLightTiles: false,
          minZoom: 2,
          maxZoom: 19,
        }),
    }),
}));

const mockGetAuthHeaders = jest.fn(() =>
  Promise.resolve({ Authorization: 'Bearer short-lived-token' }),
);
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: () => mockGetAuthHeaders(),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

jest.mock('@/src/ui/theme', () => {
  const colors = {
    background: 'colour-background',
    border: 'colour-border',
    surfaceElevated: 'colour-elevated',
    surfaceOverlay: 'colour-overlay',
    scrim: 'colour-scrim',
    teal: 'colour-teal',
    accentText: 'colour-accent-text',
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
    textSecondary: 'colour-secondary',
    transparent: 'transparent',
  };
  return { useThemeColors: () => colors, useTheme: () => ({ colors, isDark: false }) };
});

import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { InteractiveCardBlock } from '../InteractiveCardBlock';

const mockOpenInApp = openUntrustedUrlInAppBrowser as jest.MockedFunction<
  typeof openUntrustedUrlInAppBrowser
>;

const GOOGLE_URL = 'https://www.google.com/maps/search/?api=1&query=coffee%20near%20union%20square';
const OSM_URL = 'https://www.openstreetmap.org/search?query=coffee%20near%20union%20square';
const VIEW = { latitude: 37.788, longitude: -122.407, zoom: 15, attribution: 'Server view credit' };
const PLACES = [
  { label: 'Blue Bottle, Geary Street, San Francisco', latitude: 37.788, longitude: -122.407 },
  { label: 'Philz, Powell Street, San Francisco', latitude: 37.787, longitude: -122.408 },
];

function body(overrides: Partial<MapSearchCardBody> = {}): MapSearchCardBody {
  return {
    title: 'Coffee near Union Square',
    query: 'coffee shops within walking distance of Union Square, San Francisco',
    actions: [
      { provider: 'google_maps', label: 'Open in Google Maps', url: GOOGLE_URL },
      { provider: 'openstreetmap', label: 'Open in OpenStreetMap', url: OSM_URL },
    ],
    ...overrides,
  };
}

function card(cardBody: MapSearchCardBody): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'coffee-card',
    createdAt: '2026-11-16T12:00:00.000Z',
    fallback: { headline: 'Coffee near Union Square', text: 'Coffee' },
    producedBy: { toolCallId: 'coffee-card', toolName: 'search_maps' },
    recognized: true,
    kind: 'map-search.v1',
    body: cardBody,
  };
}

function renderCard(cardBody: MapSearchCardBody, canLoadManagedCloudTiles = true) {
  return render(
    <InteractiveCardBlock
      cards={[card(cardBody)]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={canLoadManagedCloudTiles}
      messageId="msg-coffee"
      conversationId="conv-coffee"
    />,
  );
}

describe('map search card header', () => {
  beforeEach(() => {
    mockGetAuthHeaders.mockClear();
    mockOpenInApp.mockReset();
    mockOpenInApp.mockResolvedValue(true);
  });

  describe('map frame', () => {
    it('draws the map when the view has places', async () => {
      const { getByTestId } = renderCard(body({ view: VIEW, places: PLACES }));

      await waitFor(() => expect(getByTestId('map-route-pill')).toBeTruthy());
      expect(mockGetAuthHeaders).toHaveBeenCalled();
    });

    it('draws no map for a view with zero places and asks for no map tiles', async () => {
      const { queryByTestId, queryByText, getByText } = renderCard(
        body({ view: VIEW, places: [] }),
      );

      expect(mockGetAuthHeaders).not.toHaveBeenCalled();
      expect(queryByTestId('map-route-pill')).toBeNull();
      expect(queryByText('Loading secure map preview…')).toBeNull();
      expect(
        queryByText('Map preview is unavailable. You can still open the result in Maps.'),
      ).toBeNull();
      expect(getByText('Coffee near Union Square')).toBeTruthy();
    });

    it('draws no map for a view without a places list', () => {
      const { queryByTestId } = renderCard(body({ view: VIEW }));

      expect(queryByTestId('map-route-pill')).toBeNull();
    });

    it('draws no map when there is no view', () => {
      const { queryByTestId, getByText } = renderCard(body({ places: PLACES }));

      expect(queryByTestId('map-route-pill')).toBeNull();
      expect(getByText('Blue Bottle')).toBeTruthy();
    });
  });

  describe('query line', () => {
    it('shows the query under the title when the map is not drawn', () => {
      const { getByText } = renderCard(body({ view: VIEW, places: [] }));

      const query = getByText(
        'coffee shops within walking distance of Union Square, San Francisco',
      );
      expect(query.props.numberOfLines).toBe(2);
      expect(query.props.selectable).toBe(true);
      expect(query).toHaveStyle({ color: 'colour-secondary' });
    });

    it('shows the query when there is no view at all', () => {
      const { getByText } = renderCard(body());

      expect(
        getByText('coffee shops within walking distance of Union Square, San Francisco'),
      ).toBeTruthy();
    });

    it('skips the query when it is the title ignoring case and spacing', () => {
      const { queryAllByText } = renderCard(body({ query: '  coffee   NEAR union square ' }));

      expect(queryAllByText(/coffee\s+near/i)).toHaveLength(1);
      expect(queryAllByText('Coffee near Union Square')).toHaveLength(1);
    });

    it('skips an empty query', () => {
      const { toJSON } = renderCard(body({ query: '   ' }));

      expect(JSON.stringify(toJSON())).not.toContain('"numberOfLines":2');
    });

    it('does not repeat the query when the map is drawn', async () => {
      const { getByTestId, queryByText } = renderCard(body({ view: VIEW, places: PLACES }));

      await waitFor(() => expect(getByTestId('map-route-pill')).toBeTruthy());
      expect(
        queryByText('coffee shops within walking distance of Union Square, San Francisco'),
      ).toBeNull();
    });
  });

  describe('map buttons', () => {
    it('draws one button per action in contract order with its own label', () => {
      const { getByLabelText, getAllByRole } = renderCard(body());

      const buttons = getAllByRole('button');
      expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
        'Open in Google Maps',
        'Open in OpenStreetMap',
      ]);
      expect(getByLabelText('Open in Google Maps')).toHaveStyle({
        minHeight: 44,
        backgroundColor: 'colour-teal',
      });
      expect(getByLabelText('Open in OpenStreetMap')).toHaveStyle({
        minHeight: 44,
        borderWidth: 1,
        backgroundColor: 'transparent',
      });
    });

    it('opens each provider link in the in-app browser', async () => {
      const { getByLabelText } = renderCard(body());

      fireEvent.press(getByLabelText('Open in Google Maps'));
      await waitFor(() => expect(mockOpenInApp).toHaveBeenLastCalledWith(GOOGLE_URL));
      fireEvent.press(getByLabelText('Open in OpenStreetMap'));
      await waitFor(() => expect(mockOpenInApp).toHaveBeenLastCalledWith(OSM_URL));
      expect(mockOpenInApp).toHaveBeenCalledTimes(2);
    });

    it('keeps both buttons under a drawn map', async () => {
      const { getByLabelText, getByTestId } = renderCard(body({ view: VIEW, places: PLACES }));

      await waitFor(() => expect(getByTestId('map-route-pill')).toBeTruthy());
      expect(getByLabelText('Open in Google Maps')).toBeTruthy();
      expect(getByLabelText('Open in OpenStreetMap')).toBeTruthy();
    });

    it('opens nothing and alerts when a link is not a link of its own provider', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByLabelText } = renderCard(
        body({
          actions: [
            { provider: 'google_maps', label: 'Open in Google Maps', url: GOOGLE_URL },
            {
              provider: 'openstreetmap',
              label: 'Open in OpenStreetMap',
              url: 'https://maps.example.test/search?q=coffee',
            },
          ],
        }),
      );

      fireEvent.press(getByLabelText('Open in OpenStreetMap'));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'Could not open this place',
          'Check your connection and try opening the result again.',
        ),
      );
      expect(mockOpenInApp).not.toHaveBeenCalled();
      alert.mockRestore();
    });

    it('alerts when the in-app browser cannot open the link', async () => {
      mockOpenInApp.mockResolvedValue(false);
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByLabelText } = renderCard(body());

      fireEvent.press(getByLabelText('Open in Google Maps'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      alert.mockRestore();
    });

    it('draws no button row when there are no actions', () => {
      const { queryAllByRole } = renderCard(body({ actions: [] }));

      expect(queryAllByRole('button')).toHaveLength(0);
    });

    it('hides the buttons while a place is unconfirmed', () => {
      const { queryAllByRole, getByText } = renderCard(
        body({ places: [{ ...PLACES[0]!, confident: false }, PLACES[1]!] }),
      );

      expect(queryAllByRole('button')).toHaveLength(0);
      expect(
        getByText(
          'One of these places could not be matched to the area the others are in, so no route is offered. Open each place to check it first.',
        ),
      ).toBeTruthy();
    });
  });
});
