import { useCallback, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { Maximize2, Minus, Plus, X } from 'lucide-react-native';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { useThemeColors } from '@/src/ui/theme';
import { elevation, spacing, typeScale } from '@/src/ui/theme/tokens';
import { ModalSafeArea } from '../ModalSafeArea';
import {
  TILE_SIZE,
  project,
  unproject,
  type FittedView,
  type MapPoint,
  type MarkerAnchor,
} from '../../services/mapTiles';
import { StaticMapTiles } from './StaticMapTiles';

export const MAP_ENTER_FULLSCREEN_LABEL = 'Full screen map';
export const MAP_VIEWER_UNAVAILABLE_MESSAGE = 'The map could not be loaded.';

const CONTROL_TARGET = 44;
const ICON_SIZE = 20;
const DRAG_THRESHOLD = 4;

export interface ZoomBounds {
  min: number;
  max: number;
}

export function clampZoom(zoom: number, bounds: ZoomBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(zoom)));
}

export function panView(view: FittedView, dx: number, dy: number): FittedView {
  const centre = project(view.latitude, view.longitude, view.zoom);
  const worldSize = TILE_SIZE * 2 ** view.zoom;
  const pixelX = Math.min(worldSize, Math.max(0, centre.pixelX - dx));
  const pixelY = Math.min(worldSize, Math.max(0, centre.pixelY - dy));
  return { ...unproject(pixelX, pixelY, view.zoom), zoom: view.zoom };
}

export function zoomView(view: FittedView, delta: number, bounds: ZoomBounds): FittedView {
  return { ...view, zoom: clampZoom(view.zoom + delta, bounds) };
}

export function MapFullScreenButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableBox
      testID="map-full-screen-button"
      accessibilityRole="button"
      accessibilityLabel={MAP_ENTER_FULLSCREEN_LABEL}
      onPress={onPress}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: CONTROL_TARGET,
        height: CONTROL_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={elevation.e2}>
        <Maximize2 size={ICON_SIZE} color={colors.textPrimary} />
      </View>
    </PressableBox>
  );
}

function HeaderIcon({
  label,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <PressableBox
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: CONTROL_TARGET,
        height: CONTROL_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </PressableBox>
  );
}

export interface MapViewerProps {
  visible: boolean;
  title: string;
  initialView: FittedView;
  zoomBounds: ZoomBounds;
  points: readonly MapPoint[];
  tileUri: (zoom: number, x: number, y: number) => string;
  headers: Record<string, string>;
  attribution: string;
  markerAnchor: MarkerAnchor;
  renderMarker: (index: number) => ReactNode;
  onClose: () => void;
}

export function MapViewer({
  visible,
  title,
  initialView,
  zoomBounds,
  points,
  tileUri,
  headers,
  attribution,
  markerAnchor,
  renderMarker,
  onClose,
}: MapViewerProps) {
  const colors = useThemeColors();
  useDismissOnScreenBlur(visible, onClose);
  const [view, setView] = useState<FittedView>(() => ({
    ...initialView,
    zoom: clampZoom(initialView.zoom, zoomBounds),
  }));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failedView, setFailedView] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef(new Animated.ValueXY()).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > DRAG_THRESHOLD,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_event, gesture) => {
          drag.setValue({ x: 0, y: 0 });
          setView(panView(viewRef.current, gesture.dx, gesture.dy));
        },
        onPanResponderTerminate: () => {
          drag.setValue({ x: 0, y: 0 });
        },
      }),
    [drag],
  );

  const viewKey = `${view.latitude}:${view.longitude}:${view.zoom}`;
  const handleAllTilesFailed = useCallback(() => setFailedView(viewKey), [viewKey]);
  const atMin = view.zoom <= zoomBounds.min;
  const atMax = view.zoom >= zoomBounds.max;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <ModalSafeArea testID="map-viewer" style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: spacing.lg,
            paddingRight: spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            variant="inline"
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: typeScale.callout,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {title}
          </Text>
          <HeaderIcon
            label="Zoom out"
            disabled={atMin}
            onPress={() => setView((current) => zoomView(current, -1, zoomBounds))}
          >
            <Minus size={ICON_SIZE} color={atMin ? colors.textMuted : colors.textPrimary} />
          </HeaderIcon>
          <HeaderIcon
            label="Zoom in"
            disabled={atMax}
            onPress={() => setView((current) => zoomView(current, 1, zoomBounds))}
          >
            <Plus size={ICON_SIZE} color={atMax ? colors.textMuted : colors.textPrimary} />
          </HeaderIcon>
          <HeaderIcon label="Close" onPress={onClose}>
            <X size={ICON_SIZE} color={colors.textSecondary} />
          </HeaderIcon>
        </View>
        <View
          testID="map-viewer-canvas"
          style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceOverlay }}
          onLayout={(event) => {
            const width = Math.max(1, Math.round(event.nativeEvent.layout.width));
            const height = Math.max(1, Math.round(event.nativeEvent.layout.height));
            setSize((current) =>
              current && current.width === width && current.height === height
                ? current
                : { width, height },
            );
          }}
          {...panResponder.panHandlers}
        >
          {visible && size && failedView !== viewKey ? (
            <Animated.View
              style={{ flex: 1, transform: drag.getTranslateTransform() }}
              pointerEvents="box-none"
            >
              <StaticMapTiles
                latitude={view.latitude}
                longitude={view.longitude}
                zoom={view.zoom}
                points={points}
                width={size.width}
                frameHeight={size.height}
                mapHeight={size.height}
                tileUri={tileUri}
                headers={headers}
                accessibilityLabel={title}
                markerAnchor={markerAnchor}
                onAllTilesFailed={handleAllTilesFailed}
                renderMarker={(index) => <View pointerEvents="none">{renderMarker(index)}</View>}
              />
            </Animated.View>
          ) : failedView === viewKey ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text
                variant="inline"
                selectable
                style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}
              >
                {MAP_VIEWER_UNAVAILABLE_MESSAGE}
              </Text>
            </View>
          ) : null}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: spacing.sm,
              bottom: spacing.sm,
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
              {attribution}
            </Text>
          </View>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

export function ExpandableStaticMap({
  title,
  zoomBounds,
  attribution,
  viewerMarker,
  ...tiles
}: ComponentProps<typeof StaticMapTiles> & {
  title: string;
  zoomBounds: ZoomBounds;
  attribution: string;
  viewerMarker?: (index: number) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const initialView = useMemo<FittedView>(
    () => ({ latitude: tiles.latitude, longitude: tiles.longitude, zoom: tiles.zoom }),
    [tiles.latitude, tiles.longitude, tiles.zoom],
  );
  return (
    <View>
      <StaticMapTiles {...tiles} />
      <MapFullScreenButton onPress={() => setOpen(true)} />
      {open ? (
        <MapViewer
          visible
          title={title}
          initialView={initialView}
          zoomBounds={zoomBounds}
          points={tiles.points}
          tileUri={tiles.tileUri}
          headers={tiles.headers}
          attribution={attribution}
          markerAnchor={tiles.markerAnchor}
          renderMarker={viewerMarker ?? tiles.renderMarker}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
