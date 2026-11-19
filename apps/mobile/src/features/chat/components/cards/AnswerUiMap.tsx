import { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { ExternalLink } from 'lucide-react-native';
import {
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  type AnswerUiMapBlock,
} from '@agiworkforce/types';
import { ANSWER_UI_MAP_NOTE } from '@agiworkforce/unified-chat/answer-ui';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  FRAME_HEIGHT,
  fitViewToPoints,
  mapTileStyle,
  tileUriFromTemplate,
  useMapTileConfig,
  type MapPoint,
  type TileAccess,
} from '../../services/mapTiles';
import { ExpandableStaticMap } from './MapViewer';

const PIN_SIZE = 24;
const TARGET = 44;
const SINGLE_PIN_ZOOM = 15;

function PinNumber({ index }: { index: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: PIN_SIZE,
        height: PIN_SIZE,
        borderRadius: PIN_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surfaceElevated,
        backgroundColor: colors.teal,
      }}
    >
      <Text
        variant="inline"
        style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.accentText }}
      >
        {index + 1}
      </Text>
    </View>
  );
}

function AnswerUiMapTiles({
  block,
  points,
  tileBaseUrl,
  tileAccess,
}: {
  block: AnswerUiMapBlock;
  points: MapPoint[];
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const { colors, isDark } = useTheme();
  const tileState = useMapTileConfig(tileBaseUrl, tileAccess);
  const [width, setWidth] = useState(320);
  const [failed, setFailed] = useState(false);
  const handleFailed = useCallback(() => setFailed(true), []);
  if (tileState.status !== 'ready' || tileAccess.status !== 'ready' || failed) return null;
  const style = mapTileStyle(tileState.config, isDark);
  const view = fitViewToPoints(
    points,
    { width, height: FRAME_HEIGHT, padding: PIN_SIZE },
    {
      min: Math.max(MAP_SEARCH_MIN_ZOOM, tileState.config.minZoom),
      max: Math.min(MAP_SEARCH_MAX_ZOOM, tileState.config.maxZoom),
      single: Math.min(SINGLE_PIN_ZOOM, tileState.config.maxZoom),
    },
  );
  if (!view) return null;
  return (
    <View
      testID="answer-ui-map-tiles"
      onLayout={(event) => {
        const next = Math.max(1, Math.round(event.nativeEvent.layout.width));
        setWidth((current) => (current === next ? current : next));
      }}
    >
      <ExpandableStaticMap
        title={block.title}
        zoomBounds={{ min: tileState.config.minZoom, max: tileState.config.maxZoom }}
        attribution={style.attribution}
        latitude={view.latitude}
        longitude={view.longitude}
        zoom={view.zoom}
        points={points}
        width={width}
        frameHeight={FRAME_HEIGHT}
        tileUri={tileUriFromTemplate(tileBaseUrl, style.urlTemplate)}
        headers={tileAccess.headers}
        accessibilityLabel={`Map: ${block.title}`}
        markerAnchor={{ width: PIN_SIZE, height: PIN_SIZE }}
        onAllTilesFailed={handleFailed}
        renderMarker={(index) => <PinNumber index={index} />}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 6,
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
  );
}

export function AnswerUiMap({
  block,
  tileBaseUrl,
  tileAccess,
}: {
  block: AnswerUiMapBlock;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const { colors } = useTheme();
  const points = useMemo<MapPoint[]>(
    () =>
      block.pins.map((pin) => ({ key: pin.id, latitude: pin.latitude, longitude: pin.longitude })),
    [block.pins],
  );
  return (
    <View
      testID="answer-ui-map"
      accessibilityLabel={block.title}
      style={{
        overflow: 'hidden',
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Text
        variant="inline"
        accessibilityRole="header"
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          fontSize: typeScale.subhead,
          fontWeight: '600',
          color: colors.textPrimary,
        }}
      >
        {block.title}
      </Text>
      <AnswerUiMapTiles
        block={block}
        points={points}
        tileBaseUrl={tileBaseUrl}
        tileAccess={tileAccess}
      />
      {block.pins.map((pin, index) => (
        <View
          key={pin.id}
          testID="answer-ui-map-pin"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 16,
            paddingRight: 4,
            paddingVertical: 4,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: colors.borderLight,
          }}
        >
          <PinNumber index={index} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="inline"
              selectable
              style={{ fontSize: typeScale.subhead, fontWeight: '500', color: colors.textPrimary }}
            >
              {pin.label}
            </Text>
            {pin.note ? (
              <Text
                variant="inline"
                selectable
                style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}
              >
                {pin.note}
              </Text>
            ) : null}
          </View>
          <PressableBox
            accessibilityRole="link"
            accessibilityLabel={`Open ${pin.label} in Maps`}
            onPress={() => {
              void openUntrustedUrlInAppBrowser(pin.url).then((opened) => {
                if (opened) return;
                Alert.alert('Could not open this place', 'Check your connection and try again.');
              });
            }}
            style={{
              width: TARGET,
              height: TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ExternalLink size={18} color={colors.textSecondary} />
          </PressableBox>
        </View>
      ))}
      <Text
        variant="inline"
        style={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 12,
          fontSize: typeScale.caption,
          color: colors.textMuted,
        }}
      >
        {ANSWER_UI_MAP_NOTE}
      </Text>
    </View>
  );
}
