import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { API_URL } from '@/lib/constants';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme, type ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { MAP_SEARCH_MAX_ZOOM, MAP_SEARCH_MIN_ZOOM } from '@agiworkforce/types';
import type { MapStop } from '@agiworkforce/unified-chat/answer-surfaces';
import { MAP_FENCE_LISTED_ONLY_NOTE } from '@agiworkforce/unified-chat/assistant-fence';
import {
  fitViewToPoints,
  mapTileStyle,
  SINGLE_STOP_ZOOM,
  tileAccessCopy,
  tileUriFromTemplate,
  useManagedCloudTileAccess,
  useMapTileConfig,
  type MapPoint,
} from '../services/mapTiles';
import { ExpandableStaticMap } from './cards/MapViewer';
import { MapUnavailable } from './cards/StaticMapTiles';
import { PanelHeader, PanelSection, SurfacePanel } from './AnswerSurfaceKit';

export const MAP_FENCE_HEIGHT = 180;
export const MAP_FENCE_LISTED_ONLY = MAP_FENCE_LISTED_ONLY_NOTE;
export const MAP_FENCE_UNAVAILABLE = 'Map preview is unavailable. Place names are listed.';

const MARKER_SIZE = 24;
const DEFAULT_WIDTH = 320;

interface LocatedStop {
  listIndex: number;
  point: MapPoint;
}

function locatedStops(stops: readonly MapStop[]): LocatedStop[] {
  return stops.flatMap((stop, listIndex) =>
    stop.lat === null || stop.lon === null
      ? []
      : [{ listIndex, point: { key: String(listIndex), latitude: stop.lat, longitude: stop.lon } }],
  );
}

function StopMarker({
  index,
  first,
  colors,
}: {
  index: number;
  first: boolean;
  colors: ColorScheme;
}) {
  const filled = first;
  return (
    <View
      style={{
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        borderRadius: MARKER_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? colors.textPrimary : colors.background,
        borderWidth: 2,
        borderColor: filled ? colors.background : colors.textPrimary,
      }}
    >
      <Text
        variant="inline"
        maxFontSizeMultiplier={1}
        style={{
          color: filled ? colors.background : colors.textPrimary,
          fontSize: typeScale.footnote,
          fontWeight: '700',
        }}
      >
        {index + 1}
      </Text>
    </View>
  );
}

function StopRow({ index, stop, colors }: { index: number; stop: MapStop; colors: ColorScheme }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        {`${index + 1}.`}
      </Text>
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>
        <Text style={{ fontWeight: '600' }}>{stop.name}</Text>
        {stop.note ? <Text style={{ color: colors.textSecondary }}>{`: ${stop.note}`}</Text> : null}
      </Text>
    </View>
  );
}

export function MapFenceSurface({
  stops,
  colors,
  streaming = false,
}: {
  stops: readonly MapStop[];
  colors: ColorScheme;
  streaming?: boolean;
}) {
  const { isDark } = useTheme();
  const cloud = useChatAppModeStore((state) => state.appMode === 'cloud');
  const located = useMemo(() => locatedStops(stops), [stops]);
  const points = useMemo(() => located.map((stop) => stop.point), [located]);
  const pointsKey = points.map((point) => `${point.latitude},${point.longitude}`).join('|');
  const wantsMap = cloud && points.length > 0;
  const tileAccess = useManagedCloudTileAccess(wantsMap && !streaming);
  const tileState = useMapTileConfig(API_URL, tileAccess);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const handleTilesFailed = useCallback(() => setFailedKey(pointsKey), [pointsKey]);

  let slot: 'none' | 'loading' | 'map' = 'none';
  let notice: string | null = MAP_FENCE_LISTED_ONLY;
  if (wantsMap) {
    if (streaming) {
      notice = null;
    } else if (tileAccess.status === 'signed-out') {
      notice = tileAccessCopy('signed-out');
    } else if (tileAccess.status === 'authorizing' || tileAccess.status === 'blocked') {
      slot = 'loading';
      notice = null;
    } else if (tileAccess.status === 'ready' && tileState.status === 'loading') {
      slot = 'loading';
      notice = null;
    } else if (
      tileAccess.status === 'ready' &&
      tileState.status === 'ready' &&
      failedKey !== pointsKey
    ) {
      slot = 'map';
      notice = null;
    } else {
      notice = MAP_FENCE_UNAVAILABLE;
    }
  }

  const style = tileState.status === 'ready' ? mapTileStyle(tileState.config, isDark) : null;
  const view =
    slot === 'map' && tileState.status === 'ready'
      ? fitViewToPoints(
          points,
          { width, height: MAP_FENCE_HEIGHT, padding: MARKER_SIZE },
          {
            min: Math.max(MAP_SEARCH_MIN_ZOOM, tileState.config.minZoom),
            max: Math.min(MAP_SEARCH_MAX_ZOOM, tileState.config.maxZoom),
            single: Math.min(SINGLE_STOP_ZOOM, tileState.config.maxZoom),
          },
        )
      : null;

  return (
    <SurfacePanel colors={colors} testID="answer-surface-map" accessibilityLabel="Map">
      <PanelHeader title="Places" colors={colors} />
      {slot === 'loading' ? (
        <View testID="answer-surface-map-loading">
          <MapUnavailable
            frameHeight={MAP_FENCE_HEIGHT}
            loading
            copy={tileAccess.status === 'ready' ? null : tileAccessCopy('authorizing')}
          />
        </View>
      ) : null}
      {slot === 'map' &&
      view &&
      style &&
      tileState.status === 'ready' &&
      tileAccess.status === 'ready' ? (
        <View
          testID="answer-surface-map-tiles"
          onLayout={(event) => {
            const next = Math.max(1, Math.round(event.nativeEvent.layout.width));
            setWidth((current) => (current === next ? current : next));
          }}
        >
          <ExpandableStaticMap
            title="Places"
            zoomBounds={{ min: tileState.config.minZoom, max: tileState.config.maxZoom }}
            attribution={style.attribution}
            latitude={view.latitude}
            longitude={view.longitude}
            zoom={view.zoom}
            points={points}
            width={width}
            frameHeight={MAP_FENCE_HEIGHT}
            mapHeight={MAP_FENCE_HEIGHT}
            tileUri={tileUriFromTemplate(API_URL, style.urlTemplate)}
            headers={tileAccess.headers}
            accessibilityLabel={
              located.length === 1
                ? `Map of ${stops[located[0].listIndex].name}`
                : `Map of ${located.length} places`
            }
            markerAnchor={{ width: MARKER_SIZE, height: MARKER_SIZE }}
            onAllTilesFailed={handleTilesFailed}
            renderMarker={(index) => (
              <StopMarker
                index={located[index]?.listIndex ?? index}
                first={index === 0}
                colors={colors}
              />
            )}
          />
          <View
            testID="answer-surface-map-attribution"
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: spacing.sm,
              bottom: spacing.sm,
              maxWidth: '80%',
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderRadius: radii.full,
              backgroundColor: colors.scrim,
            }}
          >
            <Text
              variant="inline"
              numberOfLines={1}
              style={{ fontSize: typeScale.caption, color: colors.cameraOverlayText }}
            >
              {style.attribution}
            </Text>
          </View>
        </View>
      ) : null}
      <PanelSection colors={colors} divided={slot !== 'none'}>
        {stops.map((stop, index) => (
          <StopRow key={stop.name} index={index} stop={stop} colors={colors} />
        ))}
      </PanelSection>
      {notice ? (
        <PanelSection colors={colors} divided>
          <Text
            testID="answer-surface-map-notice"
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 20 }}
          >
            {notice}
          </Text>
        </PanelSection>
      ) : null}
    </SurfacePanel>
  );
}
