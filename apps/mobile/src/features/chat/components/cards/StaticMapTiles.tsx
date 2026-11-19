import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { MapPinned } from 'lucide-react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  FRAME_HEIGHT,
  TILE_SIZE,
  project,
  type MapPoint,
  type MarkerAnchor,
} from '../../services/mapTiles';

export function MapUnavailable({
  frameHeight,
  loading,
  copy,
  bottomInset = 0,
}: {
  frameHeight: number;
  loading: boolean;
  copy: string | null;
  bottomInset?: number;
}) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="summary"
      style={{
        height: frameHeight,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: bottomInset,
        backgroundColor: colors.surfaceOverlay,
      }}
    >
      {loading ? <LoadingIndicator /> : <MapPinned size={24} color={colors.textMuted} />}
      {copy ? (
        <Text
          variant="inline"
          selectable
          style={{
            textAlign: 'center',
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: colors.textMuted,
          }}
        >
          {copy}
        </Text>
      ) : null}
    </View>
  );
}

export function StaticMapTiles({
  latitude,
  longitude,
  zoom,
  points,
  width,
  frameHeight,
  mapHeight = FRAME_HEIGHT,
  tileUri,
  headers,
  accessibilityLabel,
  markerAnchor,
  renderMarker,
  onAllTilesFailed,
}: {
  latitude: number;
  longitude: number;
  zoom: number;
  points: readonly MapPoint[];
  width: number;
  frameHeight: number;
  mapHeight?: number;
  tileUri: (zoom: number, x: number, y: number) => string;
  headers: Record<string, string>;
  accessibilityLabel: string;
  markerAnchor: MarkerAnchor;
  renderMarker: (index: number) => ReactNode;
  onAllTilesFailed: () => void;
}) {
  const colors = useThemeColors();
  const [frameWidth, setFrameWidth] = useState(width);
  const centre = project(latitude, longitude, zoom);
  const tileCount = 2 ** zoom;
  const centreTileX = Math.floor(centre.pixelX / TILE_SIZE);
  const centreTileY = Math.floor(centre.pixelY / TILE_SIZE);
  const acrossHalf = Math.ceil(frameWidth / 2 / TILE_SIZE) + 1;
  const downHalf = Math.ceil(frameHeight / TILE_SIZE) + 1;
  const centreY = mapHeight / 2;

  const tiles: Array<{ key: string; uri: string; left: number; top: number }> = [];
  for (let row = -downHalf; row <= downHalf; row++) {
    for (let col = -acrossHalf; col <= acrossHalf; col++) {
      const x = centreTileX + col;
      const y = centreTileY + row;
      if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) continue;
      tiles.push({
        key: `${x}-${y}`,
        uri: tileUri(zoom, x, y),
        left: x * TILE_SIZE - centre.pixelX,
        top: y * TILE_SIZE - centre.pixelY,
      });
    }
  }

  const tileSetKey = `${latitude}:${longitude}:${zoom}:${frameWidth}`;
  const [failedTileKeys, setFailedTileKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setFailedTileKeys(new Set());
  }, [tileSetKey]);
  const allTilesFailed = tiles.length > 0 && failedTileKeys.size >= tiles.length;
  useEffect(() => {
    if (allTilesFailed) onAllTilesFailed();
  }, [allTilesFailed, onAllTilesFailed]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => {
        const next = Math.max(1, Math.round(event.nativeEvent.layout.width));
        setFrameWidth((current) => (current === next ? current : next));
      }}
      style={{ height: frameHeight, overflow: 'hidden', backgroundColor: colors.surfaceOverlay }}
    >
      <View style={{ position: 'absolute', left: '50%', top: centreY, width: 0, height: 0 }}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri, headers }}
            accessible={false}
            onError={() => {
              setFailedTileKeys((current) => {
                if (current.has(tile.key)) return current;
                const next = new Set(current);
                next.add(tile.key);
                return next;
              });
            }}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: TILE_SIZE,
              height: TILE_SIZE,
            }}
          />
        ))}
      </View>
      <View
        pointerEvents="box-none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {points.map((point, index) => {
          const projected = project(point.latitude, point.longitude, zoom);
          return (
            <View
              key={point.key}
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: frameWidth / 2 + projected.pixelX - centre.pixelX - markerAnchor.width / 2,
                top: centreY + projected.pixelY - centre.pixelY - markerAnchor.height,
                width: markerAnchor.width,
                alignItems: 'center',
              }}
            >
              {renderMarker(index)}
            </View>
          );
        })}
      </View>
    </View>
  );
}
