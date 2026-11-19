import { render } from '@testing-library/react-native';
import { Text, View as MockView } from 'react-native';

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('lucide-react-native', () => {
  const icon = (props: Record<string, unknown>) => <MockView {...props} />;
  return { MapPinned: icon };
});

jest.mock('@/src/ui/theme', () => {
  const colors = { surfaceOverlay: 'colour-overlay', textMuted: 'colour-muted' };
  return { useThemeColors: () => colors };
});

import { StaticMapTiles } from '../StaticMapTiles';

const LABEL = 'Map of Austin';

function renderMap() {
  return render(
    <StaticMapTiles
      latitude={30.27}
      longitude={-97.74}
      zoom={12}
      points={[{ key: 'austin', latitude: 30.27, longitude: -97.74 }]}
      width={320}
      frameHeight={200}
      tileUri={(zoom, x, y) => `https://tiles.example/${zoom}/${x}/${y}`}
      headers={{}}
      accessibilityLabel={LABEL}
      markerAnchor={{ width: 24, height: 24 }}
      renderMarker={(index) => <Text testID="stop-marker">{index + 1}</Text>}
      onAllTilesFailed={jest.fn()}
    />,
  );
}

describe('StaticMapTiles screen reader behaviour', () => {
  it('announces the map frame as one image with its label', () => {
    const screen = renderMap();
    const frame = screen.getByLabelText(LABEL);

    expect(frame.props.accessible).toBe(true);
    expect(frame.props.accessibilityRole).toBe('image');
  });

  it('hides the marker layer so the digits are not read out', () => {
    const screen = renderMap();
    const marker = screen.getByTestId('stop-marker', { includeHiddenElements: true });
    let layer = marker.parent;
    while (layer && layer.props.accessibilityElementsHidden !== true) layer = layer.parent;

    expect(layer?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('stop-marker')).toBeNull();
  });
});
