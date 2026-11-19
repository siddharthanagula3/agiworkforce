import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { MapPinned, Star } from 'lucide-react-native';
import {
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  type PlacesCardBody,
  type PlacesCardPlace,
} from '@agiworkforce/types';
import { Image } from 'expo-image';
import { PLACE_PHOTO_THUMBNAIL_WIDTH_PX, placePhotoUrl } from '@agiworkforce/cloud-contracts';
import {
  assistantNoteForPlace,
  openNowLabel,
  placeMarkerName,
  placeSummaryLine,
  ratingLabel,
  reviewCountLabel,
} from '@agiworkforce/unified-chat/place-facts';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { openProviderTerms, PlaceDetailSheet, type PlacePhotoAccess } from './PlaceDetailSheet';
import { placesScope } from './placeFacts';
import { ExpandableStaticMap } from './MapViewer';
import {
  FRAME_HEIGHT,
  fitViewToPoints,
  mapTileStyle,
  tileUriFromTemplate,
  useMapTileConfig,
  type MapPoint,
  type TileAccess,
} from '../../services/mapTiles';
import { MapUnavailable } from './StaticMapTiles';

export const PLACES_EMPTY_MESSAGE = 'No places matched this search.';
export const PLACES_MAP_UNAVAILABLE_MESSAGE =
  'The map could not be loaded. The places from this search are listed below.';

const MARKER_WIDTH = 56;
const MARKER_HEIGHT = 24;
const MARKER_HIT_SLOP = { top: 10, bottom: 10, left: 0, right: 0 };
const FIT_PADDING = MARKER_WIDTH / 2;
const SINGLE_PLACE_ZOOM = 15;
const THUMBNAIL_SIZE = 48;
const TARGET = 44;

function RatingMarker({
  place,
  selected,
  onPress,
}: {
  place: PlacesCardPlace;
  selected: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const rating = ratingLabel(place.rating);
  const style = {
    height: MARKER_HEIGHT,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 8,
    borderRadius: MARKER_HEIGHT / 2,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? colors.teal : colors.border,
    backgroundColor: colors.surfaceElevated,
  };
  const content = (
    <>
      <Star size={11} color={colors.textPrimary} fill={colors.textPrimary} />
      <Text
        variant="inline"
        style={{ fontSize: typeScale.caption, fontWeight: '700', color: colors.textPrimary }}
      >
        {rating ?? place.name.slice(0, 1)}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View
        testID="places-viewer-marker"
        accessible
        accessibilityLabel={placeMarkerName(place)}
        style={style}
      >
        {content}
      </View>
    );
  }
  return (
    <PressableBox
      testID="places-map-marker"
      accessibilityRole="button"
      accessibilityLabel={placeMarkerName(place)}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={MARKER_HIT_SLOP}
      style={style}
    >
      {content}
    </PressableBox>
  );
}

function PlaceThumbnail({
  place,
  photoAccess,
}: {
  place: PlacesCardPlace;
  photoAccess: PlacePhotoAccess | null;
}) {
  const { colors } = useTheme();
  const photo = place.photos?.[0];
  const [failedReference, setFailedReference] = useState<string | null>(null);
  return (
    <View
      style={{
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 8,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceHover,
      }}
    >
      {photo && photoAccess && failedReference !== photo.reference ? (
        <Image
          testID="places-list-photo"
          accessible={false}
          source={{
            uri: `${photoAccess.base}${placePhotoUrl(photo.reference, PLACE_PHOTO_THUMBNAIL_WIDTH_PX)}`,
            headers: photoAccess.headers,
          }}
          contentFit="cover"
          onError={() => setFailedReference(photo.reference)}
          style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
        />
      ) : (
        <View testID="places-photo-placeholder">
          <MapPinned size={20} color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
}

function PlaceRow({
  place,
  selected,
  photoAccess,
  onPress,
}: {
  place: PlacesCardPlace;
  selected: boolean;
  photoAccess: PlacePhotoAccess | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const rating = ratingLabel(place.rating);
  const reviews = reviewCountLabel(place.reviewCount);
  const open = openNowLabel(place.openNow);
  const summary = placeSummaryLine(place);
  return (
    <PressableBox
      testID="places-list-row"
      accessibilityRole="button"
      accessibilityLabel={placeMarkerName(place)}
      accessibilityHint="Shows details for this place"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        borderRadius: 12,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: selected ? colors.teal : colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <PlaceThumbnail place={place} photoAccess={photoAccess} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          variant="inline"
          numberOfLines={1}
          style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
        >
          {place.name}
        </Text>
        {rating || summary ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {rating ? (
              <>
                <Star size={12} color={colors.agentWarning} fill={colors.agentWarning} />
                <Text
                  variant="inline"
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                >
                  {rating}
                </Text>
                {reviews ? (
                  <Text
                    variant="inline"
                    style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
                  >
                    {reviews}
                  </Text>
                ) : null}
              </>
            ) : null}
            {summary ? (
              <Text
                variant="inline"
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: typeScale.caption, color: colors.textSecondary }}
              >
                {summary}
              </Text>
            ) : null}
          </View>
        ) : null}
        {open ? (
          <Text
            variant="inline"
            style={{
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: place.openNow ? colors.agentSuccess : colors.textSecondary,
            }}
          >
            {open}
          </Text>
        ) : null}
      </View>
    </PressableBox>
  );
}

function PlacesMap({
  places,
  scope,
  width,
  tileBaseUrl,
  tileAccess,
  selectedIndex,
  onSelect,
  onTileAttribution,
}: {
  places: PlacesCardPlace[];
  scope: string;
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onTileAttribution: (attribution: string | null) => void;
}) {
  const { isDark } = useTheme();
  const tileState = useMapTileConfig(tileBaseUrl, tileAccess);
  const [tilesFailed, setTilesFailed] = useState(false);
  const handleTilesFailed = useCallback(() => setTilesFailed(true), []);
  const points = useMemo<MapPoint[]>(
    () =>
      places.map((place) => ({
        key: place.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    [places],
  );

  const style = tileState.status === 'ready' ? mapTileStyle(tileState.config, isDark) : null;
  const ready = tileState.status === 'ready' && tileAccess.status === 'ready' && !tilesFailed;
  const attribution = ready && style ? style.attribution : null;
  useEffect(() => {
    onTileAttribution(attribution);
  }, [attribution, onTileAttribution]);

  if (!ready || !style || tileState.status !== 'ready' || tileAccess.status !== 'ready') {
    const loading = !tilesFailed && tileState.status === 'loading';
    return (
      <MapUnavailable
        frameHeight={FRAME_HEIGHT}
        loading={loading}
        copy={loading ? null : PLACES_MAP_UNAVAILABLE_MESSAGE}
      />
    );
  }

  const view = fitViewToPoints(
    points,
    { width, height: FRAME_HEIGHT, padding: FIT_PADDING },
    {
      min: Math.max(MAP_SEARCH_MIN_ZOOM, tileState.config.minZoom),
      max: Math.min(MAP_SEARCH_MAX_ZOOM, tileState.config.maxZoom),
      single: Math.min(SINGLE_PLACE_ZOOM, tileState.config.maxZoom),
    },
  );
  if (!view) return null;
  const focused = selectedIndex === null ? null : (places[selectedIndex] ?? null);
  const shown = focused
    ? {
        latitude: focused.latitude,
        longitude: focused.longitude,
        zoom: Math.max(view.zoom, Math.min(SINGLE_PLACE_ZOOM, tileState.config.maxZoom)),
      }
    : view;

  return (
    <ExpandableStaticMap
      title={`Map of places for ${scope}`}
      zoomBounds={{ min: tileState.config.minZoom, max: tileState.config.maxZoom }}
      attribution={style.attribution}
      viewerMarker={(index) => {
        const place = places[index];
        return place ? <RatingMarker place={place} selected={selectedIndex === index} /> : null;
      }}
      latitude={shown.latitude}
      longitude={shown.longitude}
      zoom={shown.zoom}
      points={points}
      width={width}
      frameHeight={FRAME_HEIGHT}
      tileUri={tileUriFromTemplate(tileBaseUrl, style.urlTemplate)}
      headers={tileAccess.headers}
      accessibilityLabel={`Map of places for ${scope}`}
      markerAnchor={{ width: MARKER_WIDTH, height: MARKER_HEIGHT }}
      onAllTilesFailed={handleTilesFailed}
      renderMarker={(index) => {
        const place = places[index];
        return place ? (
          <RatingMarker
            place={place}
            selected={selectedIndex === index}
            onPress={() => onSelect(index)}
          />
        ) : null;
      }}
    />
  );
}

export function PlacesCard({
  body,
  width,
  tileBaseUrl,
  tileAccess,
  assistantText,
}: {
  body: PlacesCardBody;
  width: number;
  tileBaseUrl: string;
  tileAccess: TileAccess;
  assistantText?: string;
}) {
  const { colors } = useTheme();
  const photoAccess = useMemo<PlacePhotoAccess | null>(
    () =>
      tileAccess.status === 'ready'
        ? { base: tileBaseUrl.replace(/\/$/, ''), headers: tileAccess.headers }
        : null,
    [tileAccess, tileBaseUrl],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [tileAttribution, setTileAttribution] = useState<string | null>(null);
  const places = body.places;
  const scope = placesScope(body);
  const selectedPlace = selectedIndex === null ? null : (places[selectedIndex] ?? null);

  const step = useCallback(
    (delta: number) => {
      setSelectedIndex((current) =>
        current === null || places.length === 0
          ? current
          : (current + delta + places.length) % places.length,
      );
    },
    [places.length],
  );

  return (
    <View
      testID="interactive-card-places"
      accessibilityLabel={`Places for ${scope}`}
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
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: 12,
          rowGap: 2,
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MapPinned size={16} color={colors.teal} />
          <Text
            variant="inline"
            selectable
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: typeScale.body,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {scope}
          </Text>
        </View>
        {body.localTime ? (
          <Text variant="inline" style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {`${body.openNowRequested ? 'Open at' : 'Checked'} ${body.localTime}`}
          </Text>
        ) : null}
      </View>

      {places.length === 0 ? (
        <Text
          variant="inline"
          testID="places-card-empty"
          selectable
          style={{
            paddingHorizontal: 12,
            fontSize: typeScale.subhead,
            color: colors.textSecondary,
          }}
        >
          {PLACES_EMPTY_MESSAGE}
        </Text>
      ) : (
        <>
          <PlacesMap
            places={places}
            scope={scope}
            width={width}
            tileBaseUrl={tileBaseUrl}
            tileAccess={tileAccess}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onTileAttribution={setTileAttribution}
          />
          <View testID="places-card-list" style={{ gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
            {places.map((place, index) => (
              <PlaceRow
                key={place.placeId}
                place={place}
                selected={selectedIndex === index}
                photoAccess={photoAccess}
                onPress={() => setSelectedIndex(index)}
              />
            ))}
          </View>
        </>
      )}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: body.termsUrl ? 0 : 12,
        }}
      >
        <Text
          variant="inline"
          testID="places-card-attribution"
          selectable
          style={{ fontSize: typeScale.caption, color: colors.textMuted }}
        >
          {tileAttribution ? `${body.attribution} · ${tileAttribution}` : body.attribution}
        </Text>
        {body.termsUrl ? (
          <>
            <Text variant="inline" style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
              {' '}
              ·{' '}
            </Text>
            <PressableBox
              accessibilityRole="link"
              accessibilityLabel="Terms"
              onPress={() => openProviderTerms(body.termsUrl!)}
              style={{ minHeight: TARGET, justifyContent: 'center' }}
            >
              <Text
                variant="inline"
                style={{
                  fontSize: typeScale.caption,
                  color: colors.textMuted,
                  textDecorationLine: 'underline',
                }}
              >
                Terms
              </Text>
            </PressableBox>
          </>
        ) : null}
      </View>

      <PlaceDetailSheet
        place={selectedPlace}
        index={selectedIndex ?? 0}
        total={places.length}
        note={selectedPlace ? assistantNoteForPlace(assistantText, selectedPlace.name) : null}
        photoAccess={photoAccess}
        attribution={body.attribution}
        termsUrl={body.termsUrl}
        onClose={() => setSelectedIndex(null)}
        onStep={step}
      />
    </View>
  );
}
