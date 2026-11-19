import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { classifyAssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import { API_URL } from '@/lib/constants';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme } from '@/src/ui/theme';
import { AssistantSurface, canRenderAssistantSurface } from '../AssistantSurface';
import { resetMapTileConfigCache } from '../../services/mapTiles';
import { MAP_FENCE_HEIGHT, MAP_FENCE_LISTED_ONLY, MAP_FENCE_UNAVAILABLE } from '../MapFenceSurface';

const mockExpoImage = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    mockExpoImage(props);
    return null;
  },
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Light tile credit',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Dark tile credit',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const ITINERARY = [
  'Chicago | 41.88, -87.63 | Start',
  'Somewhere nice | Unplaced stop',
  'Indianapolis | 39.77, -86.16 | Lunch',
].join('\n');

const ONE_PLACED = 'Chicago | 41.88, -87.63 | Start\nSomewhere nice | Unplaced stop';
const FIRST_UNPLACED = [
  'Somewhere nice | Unplaced stop',
  'Chicago | 41.88, -87.63 | Start',
  'Indianapolis | 39.77, -86.16 | Lunch',
].join('\n');

const NAMES_ONLY = 'Library | Main reading room\nCafe | Coffee';

function Surface({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const { colors } = useTheme();
  const fence = classifyAssistantFence('map', content);
  if (!canRenderAssistantSurface(fence)) throw new Error('map fence did not classify');
  return <AssistantSurface fence={fence} colors={colors} streaming={streaming} />;
}

async function renderSurface(content: string, streaming = false) {
  const view = render(<Surface content={content} streaming={streaming} />);
  await act(async () => undefined);
  return view;
}

function markerFill(label: ReactTestInstance): unknown {
  let node: ReactTestInstance | null = label.parent;
  while (node) {
    const style = StyleSheet.flatten(node.props.style);
    if (style?.backgroundColor !== undefined) return style.backgroundColor;
    node = node.parent;
  }
  return undefined;
}

function tileSources() {
  return mockExpoImage.mock.calls
    .map(([props]) => props as { source: { uri: string; headers: Record<string, string> } })
    .map((props) => props.source);
}

describe('map fence panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMapTileConfigCache();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer short-lived-token' });
    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
  });

  afterEach(() => {
    cleanup();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('draws the map above the list from managed tiles and numbers markers by list position', async () => {
    await renderSurface(ITINERARY);

    expect(await screen.findByTestId('answer-surface-map-tiles')).toBeTruthy();
    await waitFor(() => expect(tileSources().length).toBeGreaterThan(0));
    for (const source of tileSources()) {
      expect(source.uri.startsWith(`${API_URL.replace(/\/$/, '')}/api/maps/tile/`)).toBe(true);
      expect(source.uri).not.toContain('openstreetmap');
      expect(source.headers).toEqual({ Authorization: 'Bearer short-lived-token' });
    }
    expect(screen.getByLabelText('Map of 2 places')).toBeTruthy();
    expect(screen.getByTestId('answer-surface-map-attribution')).toBeTruthy();
    expect(screen.getByText('Light tile credit')).toBeTruthy();
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('2', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-notice')).toBeNull();
    expect(screen.getByLabelText('Map of 2 places').props.style).toMatchObject({
      height: MAP_FENCE_HEIGHT,
    });
  });

  it('names the place on the map when only one stop has coordinates', async () => {
    await renderSurface(ONE_PLACED);

    expect(await screen.findByLabelText('Map of Chicago')).toBeTruthy();
    expect(screen.queryByLabelText(/Map of 1 places/)).toBeNull();
  });

  it('fills the first marker that is on the map when the first listed stop has no coordinates', async () => {
    await renderSurface(FIRST_UNPLACED);
    await screen.findByTestId('answer-surface-map-tiles');

    const firstOnMap = markerFill(screen.getByText('2', { includeHiddenElements: true }));
    const secondOnMap = markerFill(screen.getByText('3', { includeHiddenElements: true }));
    expect(firstOnMap).toBeDefined();
    expect(secondOnMap).toBeDefined();
    expect(firstOnMap).not.toBe(secondOnMap);
  });

  it('keeps the marker digits at their drawn size at large text sizes', async () => {
    await renderSurface(ITINERARY);
    await screen.findByTestId('answer-surface-map-tiles');

    expect(screen.getByText('1', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(
      1,
    );
    expect(screen.getByText('3', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(
      1,
    );
  });

  it('shows the loading frame while the tile settings are fetched', async () => {
    let resolveConfig: (value: unknown) => void = () => undefined;
    mockApiFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    await renderSurface(ITINERARY);

    expect(await screen.findByTestId('answer-surface-map-loading')).toBeTruthy();
    expect(screen.getByText('Chicago')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-notice')).toBeNull();

    await act(async () => {
      resolveConfig({ ok: true, json: () => Promise.resolve(TILE_CONFIG) });
    });
    expect(await screen.findByTestId('answer-surface-map-tiles')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-loading')).toBeNull();
  });

  it("keeps today's list and sentence in Local mode and never asks for tiles", async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    await renderSurface(ITINERARY);

    expect(screen.getByText('Chicago')).toBeTruthy();
    expect(screen.getByText(MAP_FENCE_LISTED_ONLY)).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-tiles')).toBeNull();
    expect(screen.queryByTestId('answer-surface-map-loading')).toBeNull();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('keeps the list only when no stop has coordinates, even in Cloud', async () => {
    await renderSurface(NAMES_ONLY);

    expect(screen.getByText('Library')).toBeTruthy();
    expect(screen.getByText(MAP_FENCE_LISTED_ONLY)).toBeTruthy();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(screen.queryByTestId('answer-surface-map-tiles')).toBeNull();
  });

  it('asks the person to sign in when the account is signed out', async () => {
    mockGetAuthHeaders.mockResolvedValue({});
    await renderSurface(ITINERARY);

    expect(await screen.findByText('Sign in to load the secure map preview.')).toBeTruthy();
    expect(screen.getByText('Chicago')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-tiles')).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('keeps the list with an unavailable sentence when the tile settings cannot be loaded', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve(null) });
    await renderSurface(ITINERARY);

    expect(await screen.findByText(MAP_FENCE_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText('Indianapolis')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-tiles')).toBeNull();
    expect(screen.queryByTestId('answer-surface-map-loading')).toBeNull();
  });

  it('replaces the map with the unavailable sentence when every tile fails to load', async () => {
    await renderSurface(ITINERARY);
    await screen.findByTestId('answer-surface-map-tiles');
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());

    await act(async () => {
      for (const [props] of mockExpoImage.mock.calls) {
        (props as { onError: () => void }).onError();
      }
    });

    expect(await screen.findByText(MAP_FENCE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-tiles')).toBeNull();
    expect(screen.getByText('Chicago')).toBeTruthy();
  });

  it('waits for the finished answer before loading tiles', async () => {
    const view = await renderSurface(ITINERARY, true);

    expect(screen.getByText('Chicago')).toBeTruthy();
    expect(screen.queryByTestId('answer-surface-map-notice')).toBeNull();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(<Surface content={ITINERARY} />);
    });
    expect(await screen.findByTestId('answer-surface-map-tiles')).toBeTruthy();
  });
});
