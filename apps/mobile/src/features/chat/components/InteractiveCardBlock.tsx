import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { MapPinned, Navigation, ExternalLink } from 'lucide-react-native';
import type { InteractiveCard, MapSearchCardBody, MapSearchView } from '@agiworkforce/types';
import { getAuthHeaders } from '@/services/authSession';
import { useThemeColors } from '@/src/ui/theme';

const TILE_SIZE = 256;
const FRAME_HEIGHT = 200;

type TileAccess =
  | { status: 'blocked' | 'authorizing' | 'signed-out' | 'error' }
  | { status: 'ready'; headers: { Authorization: string } };

function useManagedCloudTileAccess(enabled: boolean): TileAccess {
  const [access, setAccess] = useState<TileAccess>(() =>
    enabled ? { status: 'authorizing' } : { status: 'blocked' },
  );

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setAccess({ status: 'blocked' });
      return () => {
        active = false;
      };
    }

    setAccess({ status: 'authorizing' });
    void getAuthHeaders()
      .then((headers) => {
        if (!active) return;
        const authorization = headers.Authorization;
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
          setAccess({ status: 'signed-out' });
          return;
        }
        setAccess({ status: 'ready', headers: { Authorization: authorization } });
      })
      .catch(() => {
        if (active) setAccess({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return access;
}

function project(latitude: number, longitude: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return {
    pixelX: ((longitude + 180) / 360) * worldSize,
    pixelY: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize,
  };
}

function MapTiles({
  view,
  places,
  width,
  tileBaseUrl,
  tileAccess,
}: {
  view: MapSearchView;
  places: MapSearchCardBody['places'];
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const colors = useThemeColors();
  const mapPlaces = places ?? [];
  const centre = project(view.latitude, view.longitude, view.zoom);
  const tileCount = 2 ** view.zoom;
  const centreTileX = Math.floor(centre.pixelX / TILE_SIZE);
  const centreTileY = Math.floor(centre.pixelY / TILE_SIZE);
  const acrossHalf = Math.ceil(width / 2 / TILE_SIZE) + 1;
  const downHalf = Math.ceil(FRAME_HEIGHT / 2 / TILE_SIZE) + 1;

  const tiles: Array<{ key: string; uri: string; left: number; top: number }> = [];
  const normalizedBaseUrl = tileBaseUrl.replace(/\/$/, '');
  for (let row = -downHalf; row <= downHalf; row++) {
    for (let col = -acrossHalf; col <= acrossHalf; col++) {
      const x = centreTileX + col;
      const y = centreTileY + row;
      if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) continue;
      tiles.push({
        key: `${x}-${y}`,
        uri: `${normalizedBaseUrl}/api/maps/tile/${view.zoom}/${x}/${y}`,
        left: x * TILE_SIZE - centre.pixelX,
        top: y * TILE_SIZE - centre.pixelY,
      });
    }
  }

  const tileSetKey = `${view.latitude}:${view.longitude}:${view.zoom}:${width}`;
  const [failedTileKeys, setFailedTileKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setFailedTileKeys(new Set());
  }, [tileSetKey]);
  const allTilesFailed = tiles.length > 0 && failedTileKeys.size >= tiles.length;

  if (tileAccess.status !== 'ready' || allTilesFailed) {
    const copy =
      tileAccess.status === 'authorizing'
        ? 'Loading secure map preview…'
        : tileAccess.status === 'blocked'
          ? 'Map preview is available in Managed Cloud.'
          : tileAccess.status === 'signed-out'
            ? 'Sign in to load the secure map preview.'
            : 'Map preview is unavailable. You can still open the result in Maps.';
    return (
      <View
        accessibilityRole="summary"
        style={{
          height: FRAME_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 24,
          backgroundColor: colors.surfaceOverlay,
        }}
      >
        {tileAccess.status === 'authorizing' ? (
          <ActivityIndicator color={colors.teal} />
        ) : (
          <MapPinned size={24} color={colors.textMuted} />
        )}
        <Text
          selectable
          style={{ textAlign: 'center', fontSize: 12, lineHeight: 17, color: colors.textMuted }}
        >
          {copy}
        </Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`Map preview with ${mapPlaces.length} place${mapPlaces.length === 1 ? '' : 's'}`}
      style={{ height: FRAME_HEIGHT, overflow: 'hidden', backgroundColor: colors.surfaceOverlay }}
    >
      {/* Origin pinned to the frame's centre; children carry signed offsets. */}
      <View style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri, headers: tileAccess.headers }}
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
        {mapPlaces.map((place, index) => {
          const point = project(place.latitude, place.longitude, view.zoom);
          return (
            <View
              key={`${place.latitude},${place.longitude}`}
              style={{
                position: 'absolute',
                left: point.pixelX - centre.pixelX - 12,
                top: point.pixelY - centre.pixelY - 24,
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.agentError,
                borderWidth: 2,
                borderColor: colors.cameraOverlayText,
              }}
            >
              <Text style={{ color: colors.cameraOverlayText, fontSize: 11, fontWeight: '700' }}>
                {index + 1}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MapSearchCard({
  body,
  width,
  tileBaseUrl,
  tileAccess,
}: {
  body: MapSearchCardBody;
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const colors = useThemeColors();
  const places = body.places ?? [];
  const primary = body.actions.find((a) => a.provider === 'google_maps') ?? body.actions[0];

  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 16,
        borderCurve: 'continuous',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {body.view ? (
        <MapTiles
          view={body.view}
          places={places}
          width={width}
          tileBaseUrl={tileBaseUrl}
          tileAccess={tileAccess}
        />
      ) : null}

      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPinned size={16} color={colors.teal} />
          <Text
            selectable
            style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary }}
            numberOfLines={1}
          >
            {body.title}
          </Text>
        </View>

        {places.map((place, index) => (
          <View
            key={`${place.latitude},${place.longitude}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: colors.teal,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.cameraOverlayText, fontSize: 10, fontWeight: '700' }}>
                {index + 1}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                selectable
                style={{ fontSize: 13, color: colors.textPrimary }}
                numberOfLines={1}
              >
                {place.label.split(',')[0]}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }} numberOfLines={1}>
                {place.kind ? `${place.kind} · ` : ''}
                {place.label.split(',').slice(1, 3).join(',').trim()}
              </Text>
            </View>
          </View>
        ))}

        {primary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            onPress={() => {
              void Linking.openURL(primary.url).catch(() => {
                Alert.alert(
                  'Could not open Maps',
                  'Check your connection and try opening the result again.',
                );
              });
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              minHeight: 44,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: colors.teal,
            }}
          >
            <Navigation size={14} color={colors.cameraOverlayText} />
            <Text style={{ color: colors.cameraOverlayText, fontSize: 13, fontWeight: '600' }}>
              {places.length > 1 ? 'Open route' : 'Open in Maps'}
            </Text>
          </Pressable>
        ) : null}

        <Text selectable style={{ fontSize: 10, color: colors.textMuted }}>
          {body.view ? `${body.view.attribution} · ` : ''}Opens a provider search. Confirm the place
          before navigating.
        </Text>
      </View>
    </View>
  );
}

export function InteractiveCardBlock({
  cards,
  tileBaseUrl,
  canLoadManagedCloudTiles,
}: {
  cards: InteractiveCard[];
  tileBaseUrl: string;
  canLoadManagedCloudTiles: boolean;
}) {
  const colors = useThemeColors();
  const wantsMapTiles = useMemo(
    () =>
      cards.some(
        (card) => card.recognized && card.kind === 'map-search.v1' && Boolean(card.body.view),
      ),
    [cards],
  );
  const tileAccess = useManagedCloudTileAccess(canLoadManagedCloudTiles && wantsMapTiles);
  const [cardWidth, setCardWidth] = useState(320);
  if (!cards.length) return null;

  return (
    <View
      onLayout={(event) => {
        const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
        setCardWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
    >
      {cards.map((card) => {
        if (card.recognized && card.kind === 'map-search.v1') {
          return (
            <MapSearchCard
              key={card.cardId}
              body={card.body}
              width={cardWidth}
              tileBaseUrl={tileBaseUrl}
              tileAccess={tileAccess}
            />
          );
        }
        return (
          <View
            key={card.cardId}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} color={colors.textMuted} />
              <Text
                selectable
                style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}
              >
                {card.fallback.headline}
              </Text>
            </View>
            <Text selectable style={{ fontSize: 12, color: colors.textMuted }}>
              {card.fallback.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
