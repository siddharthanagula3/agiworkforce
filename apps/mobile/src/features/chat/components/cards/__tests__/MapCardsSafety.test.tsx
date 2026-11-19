import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert, Linking, View as MockView } from 'react-native';
import type { InteractiveCard, MapSearchCardBody } from '@agiworkforce/types';

const mockOpenUntrustedUrl = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

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
  getAuthHeaders: () => Promise.resolve({ Authorization: 'Bearer short-lived-token' }),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  isInAppBrowsableUrl: jest.requireActual('@/lib/safeOpenURL').isInAppBrowsableUrl,
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrustedUrl(...args),
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
    agentWarning: 'colour-warning',
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
    textSecondary: 'colour-secondary',
  };
  return { useThemeColors: () => colors, useTheme: () => ({ colors, isDark: false }) };
});

import { InteractiveCardBlock } from '../../InteractiveCardBlock';

const SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=springfield';
const ROUTE_URL =
  'https://www.google.com/maps/dir/?api=1&origin=Austin&destination=Dallas&travelmode=driving';
const PROVIDER_TERMS_URL = 'https://maps.example/terms';
const UNCONFIRMED_CAPTION =
  'One of these places could not be matched to the area the others are in, so no route is offered. Open each place to check it first.';
const DEFAULT_CAPTION = 'Opens a provider search. Confirm the place before navigating.';

function mapSearch(body: Partial<MapSearchCardBody>): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'map-card',
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Springfield', text: 'Map' },
    producedBy: { toolCallId: 'map-card', toolName: 'search_maps' },
    recognized: true,
    kind: 'map-search.v1',
    body: {
      title: 'Chicago to Springfield',
      query: 'chicago to springfield',
      actions: [{ provider: 'google_maps', label: 'Open in Google Maps', url: SEARCH_URL }],
      view: { latitude: 40.8, longitude: -89, zoom: 6, attribution: 'Map data provider' },
      places: [
        { label: 'Chicago, Cook County, Illinois', latitude: 41.88, longitude: -87.63 },
        { label: 'Springfield, Sangamon County, Illinois', latitude: 39.8, longitude: -89.64 },
      ],
      ...body,
    },
  };
}

const itinerary: InteractiveCard = {
  schemaVersion: 1,
  cardId: 'itinerary-card',
  createdAt: '2026-11-14T12:00:00.000Z',
  fallback: { headline: 'Texas day', text: 'Plan' },
  producedBy: { toolCallId: 'itinerary-card', toolName: 'plan_itinerary' },
  recognized: true,
  kind: 'itinerary.v1',
  body: {
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
        attribution: { providerLabel: 'Places provider', providerUrl: PROVIDER_TERMS_URL },
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
        attribution: { providerLabel: 'Places provider', providerUrl: PROVIDER_TERMS_URL },
      },
    ],
    stops: [
      { id: 's1', pin: 1, placeIndex: 0, startTimeLabel: '9 AM', note: '', sources: [] },
      { id: 's2', pin: 2, placeIndex: 1, startTimeLabel: '2 PM', note: '', sources: [] },
    ],
    route: {
      status: 'available',
      travelMode: 'driving',
      legs: [{ label: 'Austin to Dallas', url: ROUTE_URL, stopIds: ['s1', 's2'] }],
    },
  },
};

function renderCards(cards: InteractiveCard[], placement?: 'before-prose' | 'after-prose') {
  return render(
    <InteractiveCardBlock
      cards={cards}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={false}
      messageId="msg-map"
      conversationId="conv-map"
      {...(placement ? { placement } : {})}
    />,
  );
}

describe('map search confidence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenUntrustedUrl.mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offers the route and the standard caption when every place is confirmed', () => {
    const { getByLabelText, getByText, queryByText } = renderCards([mapSearch({})]);

    expect(getByLabelText('Open in Google Maps')).toBeTruthy();
    expect(getByText(DEFAULT_CAPTION)).toBeTruthy();
    expect(queryByText(UNCONFIRMED_CAPTION)).toBeNull();
  });

  it('withholds the route, warns on the place and explains why when a place is not confident', () => {
    const { queryByLabelText, getByText, getAllByTestId, getByTestId } = renderCards([
      mapSearch({
        places: [
          { label: 'Chicago, Cook County, Illinois', latitude: 41.88, longitude: -87.63 },
          {
            label: 'Springfield, Hampden County, Massachusetts',
            latitude: 42.1,
            longitude: -72.59,
            confident: false,
          },
        ],
      }),
    ]);

    expect(queryByLabelText('Open in Google Maps')).toBeNull();
    expect(getByText(UNCONFIRMED_CAPTION)).toBeTruthy();
    expect(
      getByText('Far from the other places in this request, check this is the one you meant.'),
    ).toHaveStyle({ color: 'colour-warning' });
    expect(getAllByTestId('map-marker-unconfirmed')).toHaveLength(1);
    expect(getByTestId('map-marker-unconfirmed')).toHaveStyle({
      backgroundColor: 'colour-warning',
    });
  });

  it('lists the stops it could not locate', () => {
    const { getByText } = renderCards([mapSearch({ unresolvedStops: ['Atlantis', 'El Dorado'] })]);

    expect(getByText('2 of 4 stops located. Not found: Atlantis, El Dorado.')).toBeTruthy();
  });
});

describe('map hand-off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenUntrustedUrl.mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens an allowed provider search in the in-app browser, like every other answer link', () => {
    const { getByLabelText } = renderCards([mapSearch({})]);

    fireEvent.press(getByLabelText('Open in Google Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(SEARCH_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('refuses a provider action whose URL is not a provider search and says so', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = renderCards([
      mapSearch({
        actions: [
          {
            provider: 'google_maps',
            label: 'Open in Google Maps',
            url: 'https://attacker.example/maps/search/?api=1&query=x',
          },
        ],
      }),
    ]);

    fireEvent.press(getByLabelText('Open in Google Maps'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not open this place',
        'Check your connection and try opening the result again.',
      ),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens an itinerary leg in the in-app browser with the same route', () => {
    const { getByLabelText } = renderCards([itinerary]);

    fireEvent.press(getByLabelText('Austin to Dallas, Driving directions in Google Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(ROUTE_URL);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the itinerary provider terms from the attribution line', () => {
    const { getByLabelText, getByText } = renderCards([itinerary]);

    expect(getByText('Places provider')).toBeTruthy();
    fireEvent.press(getByLabelText('Terms'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(PROVIDER_TERMS_URL);
  });
});

describe('card placement around the prose', () => {
  it('renders only the leading kinds before the prose and the rest after it', () => {
    const cards = [mapSearch({}), itinerary];

    const before = renderCards(cards, 'before-prose');
    expect(before.getByText('Texas day')).toBeTruthy();
    expect(before.queryByText('Chicago to Springfield')).toBeNull();
    before.unmount();

    const after = renderCards(cards, 'after-prose');
    expect(within(after.root).getAllByText('Chicago to Springfield').length).toBeGreaterThan(0);
    expect(after.queryByText('Texas day')).toBeNull();
  });

  it('renders every card when no placement is given', () => {
    const { getByText, getAllByText } = renderCards([mapSearch({}), itinerary]);

    expect(getByText('Texas day')).toBeTruthy();
    expect(getAllByText('Chicago to Springfield').length).toBeGreaterThan(0);
  });

  it('renders nothing when no card belongs to the requested placement', () => {
    const { toJSON } = renderCards([mapSearch({})], 'before-prose');

    expect(toJSON()).toBeNull();
  });
});
