import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Linking, View as MockView } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { InteractiveCard } from '@agiworkforce/types';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockOpenUntrustedUrl = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

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
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrustedUrl(...args),
}));

jest.mock('@/src/ui/theme', () => {
  const colors = {
    border: '#333333',
    surfaceElevated: '#181818',
    surfaceOverlay: '#202020',
    teal: '#4E9B91',
    agentError: '#DD5544',
    cameraOverlayText: '#FFFFFF',
    textMuted: '#8D8D8D',
    textPrimary: '#FFFFFF',
  };
  return { useThemeColors: () => colors, useTheme: () => ({ colors, isDark: false }) };
});

import { MAP_CONFIG_PATH } from '@agiworkforce/cloud-contracts';
import { InteractiveCardBlock } from '../InteractiveCardBlock';
import { resetMapTileConfigCache } from '../../services/mapTiles';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Light tile credit',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Dark tile credit',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const TILE_ORIGIN = 'https://app.agi.example/';
const PROVIDER_URL = 'https://www.google.com/maps/search/?api=1&query=coffee%20austin';

const mapCard: InteractiveCard = {
  schemaVersion: 1,
  cardId: 'fixture-map-call',
  createdAt: '2026-08-13T12:00:00.000Z',
  fallback: {
    headline: 'Coffee near Austin',
    text: 'Map results for coffee near Austin.',
  },
  producedBy: { toolCallId: 'fixture-map-call', toolName: 'search_maps' },
  recognized: true,
  kind: 'map-search.v1',
  body: {
    title: 'Coffee near Austin',
    query: 'coffee near Austin',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: PROVIDER_URL,
      },
    ],
    view: {
      latitude: 30.2672,
      longitude: -97.7431,
      zoom: 11,
      attribution: '© OpenStreetMap contributors',
    },
    places: [
      {
        label: 'Austin, Travis County, Texas, United States',
        latitude: 30.2672,
        longitude: -97.7431,
        kind: 'city',
      },
    ],
  },
};

const PHONE: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function PhoneSafeArea({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={PHONE}>{children}</SafeAreaProvider>;
}

function renderMap(canLoadManagedCloudTiles = true) {
  return render(
    <InteractiveCardBlock
      cards={[mapCard]}
      tileBaseUrl={TILE_ORIGIN}
      canLoadManagedCloudTiles={canLoadManagedCloudTiles}
      messageId="msg-map"
      conversationId="conv-map"
    />,
    { wrapper: PhoneSafeArea },
  );
}

describe('InteractiveCardBlock authenticated map tiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMapTileConfigCache();
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
    mockOpenUntrustedUrl.mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the current owner bearer header to every Expo Image tile source', async () => {
    renderMap();

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());

    expect(mockGetAuthHeaders).toHaveBeenCalledTimes(1);
    const sources = mockExpoImage.mock.calls.map(([props]) => props.source);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).toMatchObject({
        uri: expect.stringMatching(/^https:\/\/app\.agi\.example\/api\/maps\/tile\/11\/\d+\/\d+$/),
        headers: { Authorization: 'Bearer short-lived-token' },
      });
    }
  });

  it('reads the tile template and attribution from the map config through the stamped client', async () => {
    const { findByTestId, getByLabelText, getByTestId } = renderMap();

    expect(await findByTestId('map-attribution')).toHaveTextContent('Light tile credit');
    fireEvent.press(getByLabelText('Full screen map'));
    expect(within(getByTestId('map-viewer')).getByText('Coffee near Austin')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith(
      MAP_CONFIG_PATH,
      { method: 'GET' },
      {
        baseUrl: 'https://app.agi.example',
        headers: { Authorization: 'Bearer short-lived-token' },
      },
    );
  });

  it('shows the honest fallback without tile bytes when the map config is refused', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { findByText } = renderMap();

    expect(
      await findByText('Map preview is unavailable. You can still open the result in Maps.'),
    ).toBeTruthy();
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('names the first place in the map preview label', async () => {
    const { findByLabelText } = renderMap();

    expect(
      await findByLabelText('Map of Austin, Travis County, Texas, United States'),
    ).toBeTruthy();
  });

  it('never consults auth or creates tile images for a Local transcript, while keeping the provider link', () => {
    const { getByLabelText, getByText } = renderMap(false);

    expect(getByText('Map preview is available in Managed Cloud.')).toBeTruthy();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockExpoImage).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Open in Google Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(PROVIDER_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('shows a visible error when the platform cannot open the provider map', async () => {
    mockOpenUntrustedUrl.mockResolvedValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = renderMap(false);

    fireEvent.press(getByLabelText('Open in Google Maps'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not open this place',
        'Check your connection and try opening the result again.',
      ),
    );
    alert.mockRestore();
  });

  it('shows the signed-out fallback without requesting tile bytes when no bearer token exists', async () => {
    mockGetAuthHeaders.mockResolvedValue({});
    const { getByText } = renderMap();

    await waitFor(() => expect(getByText('Sign in to load the secure map preview.')).toBeTruthy());
    expect(mockGetAuthHeaders).toHaveBeenCalledTimes(1);
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('shows the unavailable fallback without requesting tile bytes when auth resolution fails', async () => {
    mockGetAuthHeaders.mockRejectedValue(new Error('secure storage unavailable'));
    const { getByText } = renderMap();

    await waitFor(() =>
      expect(
        getByText('Map preview is unavailable. You can still open the result in Maps.'),
      ).toBeTruthy(),
    );
    expect(mockGetAuthHeaders).toHaveBeenCalledTimes(1);
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('replaces a fully failed tile set with the honest provider-link fallback', async () => {
    const { getByText } = renderMap();

    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    const tilePropsByUri = new Map<string, Record<string, unknown>>();
    for (const [props] of mockExpoImage.mock.calls) {
      const source = props.source as { uri?: string } | undefined;
      if (source?.uri) tilePropsByUri.set(source.uri, props);
    }
    expect(tilePropsByUri.size).toBeGreaterThan(0);

    act(() => {
      for (const props of tilePropsByUri.values()) {
        (props.onError as (() => void) | undefined)?.();
      }
    });

    await waitFor(() =>
      expect(
        getByText('Map preview is unavailable. You can still open the result in Maps.'),
      ).toBeTruthy(),
    );
  });
});
