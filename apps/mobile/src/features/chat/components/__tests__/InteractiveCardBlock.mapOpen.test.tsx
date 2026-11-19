import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking, View as MockView } from 'react-native';
import type { InteractiveCard } from '@agiworkforce/types';

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

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: () => Promise.resolve({ Authorization: 'Bearer short-lived-token' }),
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
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
  };
  return { useThemeColors: () => colors, useTheme: () => ({ colors, isDark: false }) };
});

import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { InteractiveCardBlock } from '../InteractiveCardBlock';

const mockOpenInApp = openUntrustedUrlInAppBrowser as jest.MockedFunction<
  typeof openUntrustedUrlInAppBrowser
>;

const SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=coffee%20union%20square';

function searchCard(url: string): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'coffee-card',
    createdAt: '2026-11-15T12:00:00.000Z',
    fallback: { headline: 'Coffee near Union Square', text: 'Coffee' },
    producedBy: { toolCallId: 'coffee-card', toolName: 'search_maps' },
    recognized: true,
    kind: 'map-search.v1',
    body: {
      title: 'Coffee near Union Square',
      query: 'coffee near union square',
      actions: [{ provider: 'google_maps', label: 'Open in Google Maps', url }],
      places: [],
    },
  };
}

function renderSearch(url: string) {
  return render(
    <InteractiveCardBlock
      cards={[searchCard(url)]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={false}
      messageId="msg-coffee"
      conversationId="conv-coffee"
    />,
  );
}

describe('Open in Maps on a map card', () => {
  beforeEach(() => {
    mockOpenInApp.mockReset();
    mockOpenInApp.mockResolvedValue(true);
  });

  it('opens the provider search in the in-app browser, like every other answer link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    const { getByLabelText } = renderSearch(SEARCH_URL);

    fireEvent.press(getByLabelText('Open in Google Maps'));

    await waitFor(() => expect(mockOpenInApp).toHaveBeenCalledWith(SEARCH_URL));
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('opens nothing and says so when the link is not a provider search', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = renderSearch('https://maps.example.test/search?q=coffee');

    fireEvent.press(getByLabelText('Open in Google Maps'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not open this place',
        'Check your connection and try opening the result again.',
      ),
    );
    expect(mockOpenInApp).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
