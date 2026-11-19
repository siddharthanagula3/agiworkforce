import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { AlertCircle, ExternalLink, MapPinned, Navigation } from 'lucide-react-native';
import {
  isAllowedItineraryRouteUrl,
  isAllowedMapSearchProviderUrl,
} from '@agiworkforce/cloud-contracts';
import {
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  cardLeadsProse,
  isResolvedPlace,
  walkAnswerUiBlocks,
  type AnswerUiCardBody,
  type AnswerUiValue,
  type ImageCardBody,
  type InteractiveCard,
  type InteractiveCardResponsePayload,
  type ItineraryCardBody,
  type ItineraryTravelMode,
  type MapSearchCardBody,
  type MapSearchView,
  type PlaceIdentity,
} from '@agiworkforce/types';
import { reportAssetFor } from '@/services/contentReportAsset';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { GeneratedImage } from './GeneratedImage';
import { ImageFullScreen } from './ImageFullScreen';
import { SideScroller } from './SideScroller';
import { ClarifyCard } from './ClarifyCard';
import { AnswerUiCard, type AnswerUiSendState } from './AnswerUiCard';
import {
  ANSWER_UI_SEND_NEEDS_SAVED_CHAT,
  ANSWER_UI_SEND_WAITS_FOR_REPLY,
  requestAnswerUiMessage,
} from './cards/answer-ui';
import { openItineraryRoute } from './cards/mapHandoff';
import { PlacesCard } from './cards/PlacesCard';
import { ProductComparisonCard } from './cards/ProductComparisonCard';
import { McpAppCard } from './cards/McpAppCard';
import {
  FRAME_HEIGHT,
  SINGLE_STOP_ZOOM,
  fitViewToPoints,
  mapTileStyle,
  tileAccessCopy,
  tileUriFromTemplate,
  useManagedCloudTileAccess,
  useMapTileConfig,
  type MapPoint,
  type TileAccess,
} from '../services/mapTiles';
import { MapUnavailable } from './cards/StaticMapTiles';
import { ExpandableStaticMap } from './cards/MapViewer';

const CAROUSEL_AREA = 76;
const CAROUSEL_CARD_MAX_WIDTH = 240;
const MARKER_SIZE = 24;
const MAP_CONTROL_TARGET = 44;

function StopMarker({ index, unconfirmed }: { index: number; unconfirmed: boolean }) {
  const colors = useThemeColors();
  const filled = index === 0 || unconfirmed;
  const fill = unconfirmed ? colors.agentWarning : colors.textPrimary;
  return (
    <View
      testID={unconfirmed ? 'map-marker-unconfirmed' : undefined}
      style={{
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        borderRadius: MARKER_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? fill : colors.background,
        borderWidth: 2,
        borderColor: filled ? colors.background : colors.textPrimary,
      }}
    >
      <Text
        style={{
          color: filled ? colors.background : colors.textPrimary,
          fontSize: typeScale.subhead,
          fontWeight: '700',
        }}
      >
        {index + 1}
      </Text>
    </View>
  );
}

function MapOverlayPill({ label, testID }: { label: string; testID: string }) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      style={{
        maxWidth: '100%',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: colors.scrim,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ fontSize: typeScale.subhead, color: colors.cameraOverlayText }}
      >
        {label}
      </Text>
    </View>
  );
}

function PlaceCarousel({
  places,
  width,
}: {
  places: NonNullable<MapSearchCardBody['places']>;
  width: number;
}) {
  const colors = useThemeColors();
  const cardWidth = Math.min(CAROUSEL_CARD_MAX_WIDTH, Math.round(width * 0.7));
  return (
    <SideScroller
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
    >
      {places.map((place, index) => {
        const [name, ...rest] = place.label.split(',');
        const detail = [place.kind, rest.slice(0, 2).join(',').trim()].filter(Boolean).join(' · ');
        return (
          <View
            key={`${place.latitude},${place.longitude}`}
            style={{
              width: cardWidth,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <StopMarker index={index} unconfirmed={place.confident === false} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                selectable
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
                numberOfLines={1}
              >
                {name}
              </Text>
              {detail ? (
                <Text
                  style={{ fontSize: typeScale.subhead, color: colors.textMuted }}
                  numberOfLines={1}
                >
                  {detail}
                </Text>
              ) : null}
              {place.confident === false ? (
                <Text
                  selectable
                  style={{ fontSize: typeScale.caption, color: colors.agentWarning }}
                >
                  {UNCONFIRMED_PLACE_WARNING}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </SideScroller>
  );
}

const MAP_SEARCH_CAPTION = 'Opens a provider search. Confirm the place before navigating.';
const MAP_SEARCH_UNCONFIRMED_CAPTION =
  'One of these places could not be matched to the area the others are in, so no route is offered. Open each place to check it first.';
const UNCONFIRMED_PLACE_WARNING =
  'Far from the other places in this request, check this is the one you meant.';

function MapSearchTiles({
  view,
  places,
  title,
  query,
  width,
  frameHeight,
  tileBaseUrl,
  tileAccess,
}: {
  view: MapSearchView;
  title: string;
  query: string;
  places: NonNullable<MapSearchCardBody['places']>;
  width: number;
  frameHeight: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const { isDark } = useTheme();
  const tileState = useMapTileConfig(tileBaseUrl, tileAccess);
  const tileSetKey = `${view.latitude}:${view.longitude}:${view.zoom}`;
  const [failedTileSet, setFailedTileSet] = useState<string | null>(null);
  const handleAllTilesFailed = useCallback(() => setFailedTileSet(tileSetKey), [tileSetKey]);
  const points = useMemo(
    () =>
      places.map((place, index) => ({
        key: `${index}:${place.latitude},${place.longitude}`,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    [places],
  );

  if (
    tileAccess.status !== 'ready' ||
    tileState.status !== 'ready' ||
    failedTileSet === tileSetKey
  ) {
    return (
      <MapUnavailable
        frameHeight={frameHeight}
        loading={
          tileAccess.status === 'authorizing' ||
          (tileAccess.status === 'ready' && tileState.status === 'loading')
        }
        copy={
          tileAccess.status === 'ready' && tileState.status === 'loading'
            ? null
            : tileAccessCopy(tileAccess.status === 'ready' ? 'error' : tileAccess.status)
        }
        bottomInset={frameHeight - FRAME_HEIGHT}
      />
    );
  }

  const style = mapTileStyle(tileState.config, isDark);
  const label = `Map of ${places[0]?.label ?? query}`;
  return (
    <>
      <ExpandableStaticMap
        title={title}
        zoomBounds={{ min: tileState.config.minZoom, max: tileState.config.maxZoom }}
        attribution={style.attribution}
        latitude={view.latitude}
        longitude={view.longitude}
        zoom={view.zoom}
        points={points}
        width={width}
        frameHeight={frameHeight}
        tileUri={tileUriFromTemplate(tileBaseUrl, style.urlTemplate)}
        headers={tileAccess.headers}
        accessibilityLabel={label}
        markerAnchor={{ width: MARKER_SIZE, height: MARKER_SIZE }}
        onAllTilesFailed={handleAllTilesFailed}
        renderMarker={(index) => (
          <StopMarker index={index} unconfirmed={places[index]?.confident === false} />
        )}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12 + MAP_CONTROL_TARGET,
          alignItems: 'flex-start',
        }}
      >
        <MapOverlayPill testID="map-route-pill" label={title} />
      </View>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 12, bottom: frameHeight - FRAME_HEIGHT + 8 }}
      >
        <MapOverlayPill testID="map-attribution" label={style.attribution} />
      </View>
    </>
  );
}

function hasDrawnMap(body: MapSearchCardBody): boolean {
  return Boolean(body.view) && (body.places?.length ?? 0) > 0;
}

function squashed(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function shouldShowMapQuery(query: string, title: string): boolean {
  const normalized = squashed(query);
  return normalized.length > 0 && normalized !== squashed(title);
}

function MapSearchActionButton({
  action,
  primary,
}: {
  action: MapSearchCardBody['actions'][number];
  primary: boolean;
}) {
  const colors = useThemeColors();
  const labelColor = primary ? colors.accentText : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => {
        const opening = isAllowedMapSearchProviderUrl(action.url, action.provider)
          ? openUntrustedUrlInAppBrowser(action.url)
          : Promise.resolve(false);
        void opening.then((opened) => {
          if (opened) return;
          Alert.alert(
            'Could not open this place',
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
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.teal : colors.transparent,
      }}
    >
      <Text style={{ color: labelColor, fontSize: typeScale.footnote, fontWeight: '600' }}>
        {action.label}
      </Text>
      <ExternalLink size={14} color={labelColor} />
    </Pressable>
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
  const unresolvedStops = body.unresolvedStops ?? [];
  const hasUnconfirmedPlace = places.some((place) => place.confident === false);
  const showMap = hasDrawnMap(body);
  const showQuery = !showMap && shouldShowMapQuery(body.query, body.title);
  const carouselArea = places.length > 0 ? CAROUSEL_AREA : 0;
  const frameHeight = FRAME_HEIGHT + carouselArea;

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
      {showMap && body.view ? (
        <View style={{ height: frameHeight }}>
          <MapSearchTiles
            view={body.view}
            places={places}
            title={body.title}
            query={body.query}
            width={width}
            frameHeight={frameHeight}
            tileBaseUrl={tileBaseUrl}
            tileAccess={tileAccess}
          />
          {places.length > 0 ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>
              <PlaceCarousel places={places} width={width} />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MapPinned size={16} color={colors.teal} />
          <Text
            selectable
            style={{
              flex: 1,
              fontSize: typeScale.body,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {body.title}
          </Text>
        </View>

        {showQuery ? (
          <Text
            selectable
            numberOfLines={2}
            style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
          >
            {body.query}
          </Text>
        ) : null}

        {!showMap && places.length > 0 ? (
          <View style={{ marginHorizontal: -12 }}>
            <PlaceCarousel places={places} width={width} />
          </View>
        ) : null}

        {!hasUnconfirmedPlace && body.actions.length > 0 ? (
          <View style={{ gap: 8 }}>
            {body.actions.map((action, actionIndex) => (
              <MapSearchActionButton
                key={action.provider}
                action={action}
                primary={actionIndex === 0}
              />
            ))}
          </View>
        ) : null}

        {unresolvedStops.length > 0 ? (
          <Text
            selectable
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            style={{ fontSize: typeScale.caption, color: colors.agentWarning }}
          >
            {`${places.length} of ${places.length + unresolvedStops.length} stops located. Not found: ${unresolvedStops.join(', ')}.`}
          </Text>
        ) : null}

        <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {hasUnconfirmedPlace ? MAP_SEARCH_UNCONFIRMED_CAPTION : MAP_SEARCH_CAPTION}
        </Text>
      </View>
    </View>
  );
}

const IMAGE_CARD_MAX_WIDTH = 320;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function answerUiHasMap(body: AnswerUiCardBody): boolean {
  let found = false;
  walkAnswerUiBlocks(body.blocks, (block) => {
    if (block.type === 'map') found = true;
  });
  return found;
}

interface CardMessage {
  messageId: string;
  conversationId: string;
}

function ImageCard({
  body,
  width,
  message,
}: {
  body: ImageCardBody;
  width: number;
  message: CardMessage;
}) {
  const [fullScreenUrl, setFullScreenUrl] = useState<string | null>(null);
  const imageWidth = Math.min(width, IMAGE_CARD_MAX_WIDTH);
  const asset = reportAssetFor('image', fullScreenUrl);
  return (
    <View style={{ marginTop: 12 }}>
      {body.images.map((image) => (
        <GeneratedImage
          key={image.assetId}
          imageUrl={image.url}
          revisedPrompt={body.prompt}
          width={imageWidth}
          onPress={() => setFullScreenUrl(image.url)}
        />
      ))}
      <ImageFullScreen
        imageUrl={fullScreenUrl}
        prompt={body.prompt}
        visible={fullScreenUrl !== null}
        onClose={() => setFullScreenUrl(null)}
        reportTarget={
          asset
            ? {
                messageId: message.messageId,
                conversationId: message.conversationId,
                contentExcerpt: body.prompt,
                asset,
              }
            : undefined
        }
      />
    </View>
  );
}

const ITINERARY_DIRECTIONS: Record<ItineraryTravelMode, string> = {
  walking: 'Walking directions in Google Maps',
  driving: 'Driving directions in Google Maps',
  transit: 'Transit directions in Google Maps',
  bicycling: 'Cycling directions in Google Maps',
};

function unresolvedStopLabel(place: PlaceIdentity | undefined): string {
  return place?.status === 'unresolved' &&
    (place.reason === 'provider_error' || place.reason === 'rate_limited')
    ? 'Could not be looked up'
    : 'Not found on the map';
}

function itineraryRouteMessage(route: ItineraryCardBody['route']): string | null {
  if (route.status === 'available' || route.reason === 'too_few_stops') return null;
  if (route.reason === 'unresolved_stops') {
    return route.unresolvedStopCount === 1
      ? 'No route, because one place is missing from the map.'
      : `No route, because ${route.unresolvedStopCount} places are missing from the map.`;
  }
  return 'No route is available for this plan.';
}

export const ITINERARY_MAP_UNAVAILABLE_MESSAGE =
  'The map could not be loaded. The stops are listed below.';
const ITINERARY_FIT_PADDING = 28;
const ITINERARY_MARKER_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

function ItineraryPinMarker({
  label,
  name,
  selected,
  onPress,
}: {
  label: string;
  name: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const style = {
    minWidth: MARKER_SIZE,
    height: MARKER_SIZE,
    paddingHorizontal: 6,
    borderRadius: MARKER_SIZE / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? colors.teal : colors.border,
    backgroundColor: colors.surfaceElevated,
  };
  const text = (
    <Text style={{ fontSize: typeScale.caption, fontWeight: '700', color: colors.textPrimary }}>
      {label}
    </Text>
  );
  const accessibilityLabel = `Stop ${label}: ${name}`;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={style}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      testID="itinerary-map-marker"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={ITINERARY_MARKER_HIT_SLOP}
      onPress={onPress}
      style={style}
    >
      {text}
    </Pressable>
  );
}

function ItineraryMap({
  body,
  width,
  tileBaseUrl,
  tileAccess,
  selectedPlace,
  onSelect,
  onReadyChange,
}: {
  body: ItineraryCardBody;
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
  selectedPlace: number | null;
  onSelect: (placeIndex: number) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const tileState = useMapTileConfig(tileBaseUrl, tileAccess);
  const [tilesFailed, setTilesFailed] = useState(false);
  const handleTilesFailed = useCallback(() => setTilesFailed(true), []);
  const points = useMemo<MapPoint[]>(
    () =>
      body.places.flatMap((place, index) =>
        isResolvedPlace(place)
          ? [{ key: String(index), latitude: place.lat, longitude: place.lng }]
          : [],
      ),
    [body.places],
  );
  const pinsByPlace = useMemo(() => {
    const pins = new Map<number, number[]>();
    for (const stop of body.stops) {
      pins.set(stop.placeIndex, [...(pins.get(stop.placeIndex) ?? []), stop.pin]);
    }
    return pins;
  }, [body.stops]);

  const ready =
    points.length > 0 &&
    tileAccess.status === 'ready' &&
    tileState.status === 'ready' &&
    !tilesFailed;
  useEffect(() => {
    onReadyChange(ready);
  }, [ready, onReadyChange]);

  if (points.length === 0 || tileAccess.status === 'blocked') return null;
  if (
    tileAccess.status === 'authorizing' ||
    (tileAccess.status === 'ready' && tileState.status === 'loading')
  ) {
    return <MapUnavailable frameHeight={FRAME_HEIGHT} loading copy={null} />;
  }
  if (!ready || tileState.status !== 'ready' || tileAccess.status !== 'ready') {
    return (
      <Text
        testID="itinerary-map-unavailable"
        selectable
        style={{ paddingHorizontal: 12, fontSize: typeScale.subhead, color: colors.textSecondary }}
      >
        {ITINERARY_MAP_UNAVAILABLE_MESSAGE}
      </Text>
    );
  }

  const config = tileState.config;
  const style = mapTileStyle(config, isDark);
  const fitted = fitViewToPoints(
    points,
    { width, height: FRAME_HEIGHT, padding: ITINERARY_FIT_PADDING },
    {
      min: Math.max(MAP_SEARCH_MIN_ZOOM, config.minZoom),
      max: Math.min(MAP_SEARCH_MAX_ZOOM, config.maxZoom),
      single: Math.min(SINGLE_STOP_ZOOM, config.maxZoom),
    },
  );
  if (!fitted) return null;
  const focused = selectedPlace === null ? null : body.places[selectedPlace];
  const shown =
    focused && isResolvedPlace(focused)
      ? { latitude: focused.lat, longitude: focused.lng, zoom: fitted.zoom }
      : fitted;
  const marker = (index: number, interactive: boolean) => {
    const point = points[index];
    if (!point) return null;
    const placeIndex = Number(point.key);
    const place = body.places[placeIndex];
    if (!place || !isResolvedPlace(place)) return null;
    return (
      <ItineraryPinMarker
        label={(pinsByPlace.get(placeIndex) ?? []).join(', ')}
        name={place.displayName}
        selected={selectedPlace === placeIndex}
        {...(interactive ? { onPress: () => onSelect(placeIndex) } : {})}
      />
    );
  };

  return (
    <View testID="itinerary-map">
      <ExpandableStaticMap
        title={`Map of ${body.title}`}
        zoomBounds={{ min: config.minZoom, max: config.maxZoom }}
        attribution={style.attribution}
        latitude={shown.latitude}
        longitude={shown.longitude}
        zoom={shown.zoom}
        points={points}
        width={width}
        frameHeight={FRAME_HEIGHT}
        tileUri={tileUriFromTemplate(tileBaseUrl, style.urlTemplate)}
        headers={tileAccess.headers}
        accessibilityLabel={`Map of ${body.title}`}
        markerAnchor={{ width: MARKER_SIZE, height: MARKER_SIZE }}
        onAllTilesFailed={handleTilesFailed}
        renderMarker={(index) => marker(index, true)}
        viewerMarker={(index) => marker(index, false)}
      />
      <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 8 }}>
        <MapOverlayPill testID="itinerary-map-attribution" label={style.attribution} />
      </View>
    </View>
  );
}

function ItineraryCard({
  body,
  width,
  tileBaseUrl,
  tileAccess,
}: {
  body: ItineraryCardBody;
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
}) {
  const colors = useThemeColors();
  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const routeLegs =
    body.route.status === 'available'
      ? body.route.legs.filter((leg) => isAllowedItineraryRouteUrl(leg.url))
      : [];
  const directions =
    body.route.status === 'available' ? ITINERARY_DIRECTIONS[body.route.travelMode] : null;
  const routeMessage = itineraryRouteMessage(body.route);
  const attribution = body.places.find(isResolvedPlace)?.attribution;
  const termsUrl = attribution?.providerUrl;

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
      <View style={{ padding: 12, gap: 12 }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MapPinned size={16} color={colors.teal} />
            <Text
              selectable
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: typeScale.body,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {body.title}
            </Text>
          </View>
          <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {body.region.label}
          </Text>
        </View>

        {body.summary ? (
          <Text
            selectable
            style={{ fontSize: typeScale.subhead, lineHeight: 20, color: colors.textSecondary }}
          >
            {body.summary}
          </Text>
        ) : null}

        {tileAccess.status !== 'blocked' && body.places.some(isResolvedPlace) ? (
          <View style={{ marginHorizontal: -12 }}>
            <ItineraryMap
              body={body}
              width={width}
              tileBaseUrl={tileBaseUrl}
              tileAccess={tileAccess}
              selectedPlace={selectedPlace}
              onSelect={setSelectedPlace}
              onReadyChange={setMapReady}
            />
          </View>
        ) : null}

        {body.stops.map((stop) => {
          const place = body.places[stop.placeIndex];
          const resolved = place && isResolvedPlace(place) ? place : null;
          const selected = selectedPlace === stop.placeIndex;
          return (
            <View key={stop.id} testID="itinerary-stop" style={{ flexDirection: 'row', gap: 10 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: selected ? 2 : 0,
                  borderColor: colors.textPrimary,
                  backgroundColor: colors.teal,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: colors.accentText,
                    fontSize: typeScale.caption,
                    fontWeight: '700',
                  }}
                >
                  {stop.pin}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                {stop.startTimeLabel ? (
                  <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                    {stop.startTimeLabel}
                  </Text>
                ) : null}
                {resolved && mapReady ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${resolved.displayName} on the map`}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedPlace(stop.placeIndex)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.subhead,
                        fontWeight: '600',
                        color: colors.textPrimary,
                      }}
                    >
                      {resolved.displayName}
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    selectable
                    style={{
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                      color: colors.textPrimary,
                    }}
                  >
                    {resolved
                      ? resolved.displayName
                      : place?.status === 'unresolved'
                        ? place.query
                        : ''}
                  </Text>
                )}
                {resolved ? (
                  <Text
                    selectable
                    style={{ fontSize: typeScale.caption, color: colors.textMuted }}
                    numberOfLines={2}
                  >
                    {resolved.formattedAddress}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} color={colors.textSecondary} />
                    <Text
                      selectable
                      style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
                    >
                      {unresolvedStopLabel(place)}
                    </Text>
                  </View>
                )}
                {stop.note ? (
                  <Text
                    selectable
                    style={{
                      fontSize: typeScale.footnote,
                      lineHeight: 19,
                      color: colors.textSecondary,
                    }}
                  >
                    {stop.note}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}

        {directions && routeLegs.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
              {directions}
            </Text>
            {routeLegs.map((leg) => (
              <Pressable
                key={leg.url}
                accessibilityRole="link"
                accessibilityLabel={`${leg.label}, ${directions}`}
                onPress={() => {
                  void openItineraryRoute(leg.url).then((opened) => {
                    if (opened) return;
                    Alert.alert(
                      'Could not open this route',
                      'Check your connection and try opening the route again.',
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
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Navigation size={14} color={colors.textPrimary} />
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  {leg.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : routeMessage ? (
          <Text selectable style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
            {routeMessage}
          </Text>
        ) : null}

        {attribution ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
              {attribution.providerLabel}
            </Text>
            {termsUrl ? (
              <>
                <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}> · </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Terms"
                  onPress={() => void openUntrustedUrlInAppBrowser(termsUrl)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      color: colors.textMuted,
                      textDecorationLine: 'underline',
                    }}
                  >
                    Terms
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function InteractiveCardBlock({
  cards,
  tileBaseUrl,
  canLoadManagedCloudTiles,
  canRespond = false,
  onRespond,
  messageId,
  conversationId,
  placement,
  assistantText,
  textOffsets,
  onSendMessage,
}: {
  cards: InteractiveCard[];
  onSendMessage?: (text: string) => void;
  assistantText?: string;
  textOffsets?: Readonly<Record<string, number>>;
  tileBaseUrl: string;
  canLoadManagedCloudTiles: boolean;
  canRespond?: boolean;
  onRespond?: (cardId: string, payload: InteractiveCardResponsePayload) => Promise<boolean>;
  placement?: 'before-prose' | 'after-prose';
} & CardMessage) {
  const colors = useThemeColors();
  const placedCards = useMemo(
    () =>
      placement === undefined
        ? cards
        : cards.filter(
            (card) => cardLeadsProse(card, textOffsets) === (placement === 'before-prose'),
          ),
    [cards, placement, textOffsets],
  );
  const wantsMapTiles = useMemo(
    () =>
      placedCards.some(
        (card) =>
          (card.recognized && card.kind === 'map-search.v1' && hasDrawnMap(card.body)) ||
          (card.recognized && card.kind === 'places.v1' && card.body.places.length > 0) ||
          (card.recognized &&
            card.kind === 'itinerary.v1' &&
            card.body.places.some(isResolvedPlace)) ||
          (card.recognized && card.kind === 'answer-ui.v1' && answerUiHasMap(card.body)),
      ),
    [placedCards],
  );
  const tileAccess = useManagedCloudTileAccess(canLoadManagedCloudTiles && wantsMapTiles);
  const [cardWidth, setCardWidth] = useState(320);
  const savedChat = UUID.test(conversationId) && UUID.test(messageId);
  const answerUiSend = useCallback(
    (cardId: string): AnswerUiSendState => {
      if (!onSendMessage || !canLoadManagedCloudTiles) return { canSend: false };
      if (!savedChat) return { canSend: false, blockedReason: ANSWER_UI_SEND_NEEDS_SAVED_CHAT };
      const onSend = async (actionId: string, values: Record<string, AnswerUiValue>) => {
        onSendMessage(
          await requestAnswerUiMessage({ conversationId, messageId, cardId }, actionId, values),
        );
      };
      return canRespond
        ? { canSend: true, onSend }
        : { canSend: false, blockedReason: ANSWER_UI_SEND_WAITS_FOR_REPLY, onSend };
    },
    [onSendMessage, canLoadManagedCloudTiles, savedChat, canRespond, conversationId, messageId],
  );
  if (!placedCards.length) return null;

  return (
    <View
      onLayout={(event) => {
        const nextWidth = Math.max(1, Math.round(event.nativeEvent.layout.width));
        setCardWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
    >
      {placedCards.map((card) => {
        if (card.recognized && card.kind === 'clarify.v1') {
          return (
            <ClarifyCard
              key={card.cardId}
              card={card}
              body={card.body}
              canRespond={canRespond}
              messageId={messageId}
              {...(onRespond ? { onRespond } : {})}
            />
          );
        }
        if (card.recognized && card.kind === 'answer-ui.v1') {
          return (
            <AnswerUiCard
              key={card.cardId}
              cardId={card.cardId}
              body={card.body}
              label={card.fallback.headline}
              send={answerUiSend(card.cardId)}
              tileBaseUrl={tileBaseUrl}
              tileAccess={tileAccess}
              messageId={messageId}
            />
          );
        }
        if (card.recognized && card.kind === 'mcp-app.v1') {
          return (
            <McpAppCard
              key={card.cardId}
              body={card.body}
              fallbackText={card.fallback.text}
              canLoad={canLoadManagedCloudTiles}
            />
          );
        }
        if (card.recognized && card.kind === 'product-comparison.v1') {
          return <ProductComparisonCard key={card.cardId} body={card.body} />;
        }
        if (card.recognized && card.kind === 'itinerary.v1') {
          return (
            <ItineraryCard
              key={card.cardId}
              body={card.body}
              width={cardWidth}
              tileBaseUrl={tileBaseUrl}
              tileAccess={tileAccess}
            />
          );
        }
        if (card.recognized && card.kind === 'image.v1') {
          return (
            <ImageCard
              key={card.cardId}
              body={card.body}
              width={cardWidth}
              message={{ messageId, conversationId }}
            />
          );
        }
        if (card.recognized && card.kind === 'places.v1') {
          return (
            <PlacesCard
              key={card.cardId}
              body={card.body}
              width={cardWidth}
              tileBaseUrl={tileBaseUrl}
              tileAccess={tileAccess}
              {...(assistantText ? { assistantText } : {})}
            />
          );
        }
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
            testID="interactive-card-fallback"
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
            <Text
              selectable
              accessibilityRole="header"
              style={{
                fontSize: typeScale.footnote,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {card.fallback.headline}
            </Text>
            <Text selectable style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
              {card.fallback.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
