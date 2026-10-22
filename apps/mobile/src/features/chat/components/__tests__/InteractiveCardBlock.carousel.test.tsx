import { render, waitFor } from '@testing-library/react-native';
import { View as MockView } from 'react-native';
import type { InteractiveCard } from '@agiworkforce/types';

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => ({
  ExternalLink: (props: Record<string, unknown>) => <MockView {...props} />,
  MapPinned: (props: Record<string, unknown>) => <MockView {...props} />,
  Navigation: (props: Record<string, unknown>) => <MockView {...props} />,
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: () => Promise.resolve({ Authorization: 'Bearer short-lived-token' }),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn(),
}));

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    background: 'colour-background',
    border: 'colour-border',
    surfaceElevated: 'colour-elevated',
    surfaceOverlay: 'colour-overlay',
    scrim: 'colour-scrim',
    teal: 'colour-teal',
    cameraOverlayText: 'colour-overlay-text',
    textMuted: 'colour-muted',
    textPrimary: 'colour-primary',
  }),
}));

import { InteractiveCardBlock } from '../InteractiveCardBlock';

function mapCard(options: { withView: boolean }): InteractiveCard {
  return {
    schemaVersion: 1,
    cardId: 'route-card',
    createdAt: '2026-08-13T12:00:00.000Z',
    fallback: { headline: 'Dallas to Las Vegas', text: 'Route' },
    producedBy: { toolCallId: 'route-card', toolName: 'search_maps' },
    recognized: true,
    kind: 'map-search.v1',
    body: {
      title: 'Dallas to Las Vegas',
      query: 'dallas to las vegas',
      actions: [
        {
          provider: 'google_maps',
          label: 'Open in Google Maps',
          url: 'https://www.google.com/maps',
        },
      ],
      ...(options.withView
        ? {
            view: {
              latitude: 35.5,
              longitude: -108,
              zoom: 5,
              attribution: 'Map data provider',
            },
          }
        : {}),
      places: [
        { label: 'Dallas, Dallas County, Texas', latitude: 32.78, longitude: -96.8, kind: 'city' },
        { label: 'Las Vegas, Clark County, Nevada', latitude: 36.17, longitude: -115.14 },
      ],
    },
  };
}

function renderCard(withView: boolean, canLoadManagedCloudTiles = true) {
  return render(
    <InteractiveCardBlock
      cards={[mapCard({ withView })]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={canLoadManagedCloudTiles}
    />,
  );
}

describe('InteractiveCardBlock map place carousel', () => {
  it('lays the route label and the attribution over the loaded map', async () => {
    const { getByTestId } = renderCard(true);

    await waitFor(() => expect(getByTestId('map-route-pill')).toBeTruthy());
    expect(getByTestId('map-route-pill')).toHaveTextContent('Dallas to Las Vegas');
    expect(getByTestId('map-attribution')).toHaveTextContent('Map data provider');
  });

  it('lists each stop as a card with its own numbered marker', async () => {
    const { getByText, getAllByText } = renderCard(true);

    await waitFor(() => expect(getByText('Dallas')).toBeTruthy());
    expect(getByText('Las Vegas')).toBeTruthy();
    expect(getByText('city · Dallas County, Texas')).toBeTruthy();
    expect(getAllByText('1').length).toBeGreaterThan(0);
    expect(getAllByText('2').length).toBeGreaterThan(0);
  });

  it('fills the first stop marker and outlines the later ones', async () => {
    const { getAllByText } = renderCard(true);

    await waitFor(() => expect(getAllByText('1').length).toBeGreaterThan(0));
    const first = getAllByText('1')[0]!.parent!.parent!;
    const second = getAllByText('2')[0]!.parent!.parent!;
    expect(first).toHaveStyle({
      backgroundColor: 'colour-primary',
      borderColor: 'colour-background',
    });
    expect(second).toHaveStyle({
      backgroundColor: 'colour-background',
      borderColor: 'colour-primary',
    });
  });

  it('keeps the place cards when the map preview is not available', () => {
    const { getByText, queryByTestId } = renderCard(true, false);

    expect(getByText('Map preview is available in Managed Cloud.')).toBeTruthy();
    expect(queryByTestId('map-route-pill')).toBeNull();
    expect(getByText('Dallas')).toBeTruthy();
    expect(getByText('Las Vegas')).toBeTruthy();
  });

  it('shows the place cards in the card body when the payload has no map view', () => {
    const { getByText, queryByTestId } = renderCard(false);

    expect(queryByTestId('map-route-pill')).toBeNull();
    expect(getByText('Dallas')).toBeTruthy();
    expect(getByText('Las Vegas')).toBeTruthy();
  });
});
