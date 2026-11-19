import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
  I18nManager,
  Modal,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  MapPinned,
  Navigation,
  Star,
  X,
} from 'lucide-react-native';
import type { PlacesCardPhoto, PlacesCardPlace } from '@agiworkforce/types';
import { PLACE_PHOTO_DETAIL_WIDTH_PX, placePhotoUrl } from '@agiworkforce/cloud-contracts';
import {
  ASSISTANT_NOTE_HEADING,
  openNowLabel,
  placeSummaryLine,
  ratingLabel,
  reviewCountLabel,
} from '@agiworkforce/unified-chat/place-facts';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { openPlaceDirections, openPlaceInMaps } from './mapHandoff';

const TARGET = 44;
const PHOTO_HEIGHT = 160;
const DOT_SIZE = 8;
const MAX_PHOTO_DOTS = 8;

export interface PlacePhotoAccess {
  base: string;
  headers: Record<string, string>;
}

function PhotoPlaceholder({ label }: { label: string | null }) {
  const colors = useThemeColors();
  return (
    <View
      testID="places-photo-placeholder"
      style={{
        height: PHOTO_HEIGHT,
        borderRadius: 12,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.surfaceHover,
      }}
    >
      <MapPinned size={24} color={colors.textSecondary} />
      {label ? (
        <Text variant="inline" style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function PlacePhotos({
  photos,
  placeName,
  access,
}: {
  photos: readonly PlacesCardPhoto[];
  placeName: string;
  access: PlacePhotoAccess;
}) {
  const colors = useThemeColors();
  const listRef = useRef<FlatList<PlacesCardPhoto>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const count = photos.length;
  const showDots = count > 1 && count <= MAX_PHOTO_DOTS;
  const showCounter = count > MAX_PHOTO_DOTS;

  const select = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  useEffect(() => {
    if (width > 0) {
      listRef.current?.scrollToOffset({ offset: indexRef.current * width, animated: false });
    }
  }, [width]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offset = I18nManager.isRTL
        ? contentSize.width - (contentOffset.x + layoutMeasurement.width)
        : contentOffset.x;
      const page = Math.round(offset / width);
      select(Math.max(0, Math.min(count - 1, page)));
    },
    [width, count, select],
  );

  const goTo = useCallback(
    (page: number) => {
      select(page);
      listRef.current?.scrollToOffset({ offset: page * width, animated: true });
    },
    [select, width],
  );

  const markFailed = useCallback((reference: string) => {
    setFailed((state) => {
      if (state.has(reference)) return state;
      const next = new Set(state);
      next.add(reference);
      return next;
    });
  }, []);

  const dotSlot = Math.max(1, Math.min(TARGET, Math.floor(width / Math.max(count, 1))));

  return (
    <View>
      <View
        testID="places-photo-frame"
        onLayout={handleLayout}
        style={{
          height: PHOTO_HEIGHT,
          borderRadius: 12,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: colors.surfaceHover,
        }}
      >
        {width > 0 ? (
          <FlatList
            ref={listRef}
            testID="places-photo-pager"
            data={photos}
            keyExtractor={(photo) => photo.reference}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, page) => ({ length: width, offset: width * page, index: page })}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={({ item, index: page }) => {
              const photoFailed = failed.has(item.reference);
              return (
                <View style={{ width, height: PHOTO_HEIGHT }}>
                  {photoFailed ? (
                    <PhotoPlaceholder label="Photo unavailable" />
                  ) : (
                    <Image
                      testID="places-detail-photo"
                      accessibilityLabel={
                        count > 1
                          ? `Photo ${page + 1} of ${count}, ${placeName}`
                          : `Photo of ${placeName}`
                      }
                      source={{
                        uri: `${access.base}${placePhotoUrl(item.reference, PLACE_PHOTO_DETAIL_WIDTH_PX)}`,
                        headers: access.headers,
                      }}
                      contentFit="cover"
                      onError={() => markFailed(item.reference)}
                      style={{ width: '100%', height: PHOTO_HEIGHT }}
                    />
                  )}
                  {item.attribution && !photoFailed ? (
                    <View
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: 6,
                        maxWidth: '70%',
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
                        {item.attribution}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}
        {showCounter ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 8, alignItems: 'center' }}
          >
            <View
              testID="places-photo-counter"
              accessible
              accessibilityLabel={`Photo ${index + 1} of ${count}`}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 9999,
                backgroundColor: colors.scrim,
              }}
            >
              <Text
                variant="inline"
                style={{
                  fontSize: typeScale.caption,
                  color: colors.cameraOverlayText,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {`${index + 1} / ${count}`}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {showDots ? (
        <View testID="places-photo-dots" style={{ flexDirection: 'row', justifyContent: 'center' }}>
          {photos.map((photo, photoIndex) => (
            <PressableBox
              key={photo.reference}
              accessibilityRole="button"
              accessibilityLabel={`Show photo ${photoIndex + 1} of ${count}`}
              accessibilityState={{ selected: photoIndex === index }}
              onPress={() => goTo(photoIndex)}
              style={{
                width: dotSlot,
                height: TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: DOT_SIZE / 2,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: photoIndex === index ? colors.teal : colors.surfaceElevated,
                }}
              />
            </PressableBox>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function openInSheet(url: string) {
  void openUntrustedUrlInAppBrowser(url).then((opened) => {
    if (opened) return;
    Alert.alert('Could not open this link', 'Check your connection and try again.');
  });
}

function openDirections(url: string, destination: { latitude: number; longitude: number }) {
  void openPlaceDirections(url, destination).then((opened) => {
    if (!opened) openInSheet(url);
  });
}

export function openProviderTerms(url: string) {
  openInSheet(url);
}

function ActionButton({
  label,
  icon,
  primary,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  primary: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: TARGET,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderCurve: 'continuous',
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.teal : colors.transparent,
      }}
    >
      {icon}
      <Text
        variant="inline"
        style={{
          fontSize: typeScale.footnote,
          fontWeight: '600',
          color: primary ? colors.accentText : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

export function PlaceDetailSheet({
  place,
  index,
  total,
  note,
  photoAccess,
  attribution,
  termsUrl,
  onClose,
  onStep,
}: {
  place: PlacesCardPlace | null;
  index: number;
  total: number;
  note: string | null;
  photoAccess: PlacePhotoAccess | null;
  attribution: string;
  termsUrl: string | undefined;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const colors = useThemeColors();
  useDismissOnScreenBlur(place !== null, onClose);
  const rating = place ? ratingLabel(place.rating) : null;
  const reviews = place ? reviewCountLabel(place.reviewCount) : null;
  const open = place ? openNowLabel(place.openNow) : null;
  const summary = place ? placeSummaryLine(place) : '';

  return (
    <Modal
      visible={place !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {place ? (
        <SafeAreaView
          testID="places-detail-sheet"
          style={{ flex: 1, backgroundColor: colors.surfaceBase }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 16,
              paddingRight: 4,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              variant="inline"
              accessibilityRole="header"
              numberOfLines={2}
              style={{
                flex: 1,
                fontSize: typeScale.callout,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {place.name}
            </Text>
            <PressableBox
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close place details"
              style={{
                width: TARGET,
                height: TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} color={colors.textSecondary} />
            </PressableBox>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {place.photos && place.photos.length > 0 && photoAccess ? (
              <PlacePhotos
                key={place.placeId}
                photos={place.photos}
                placeName={place.name}
                access={photoAccess}
              />
            ) : (
              <PhotoPlaceholder label={null} />
            )}

            {rating || open ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {rating ? (
                  <>
                    <Star size={14} color={colors.agentWarning} fill={colors.agentWarning} />
                    <Text
                      variant="inline"
                      style={{
                        fontSize: typeScale.subhead,
                        fontWeight: '600',
                        color: colors.textPrimary,
                      }}
                    >
                      {rating}
                    </Text>
                    {reviews ? (
                      <Text
                        variant="inline"
                        style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}
                      >
                        {reviews}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {open ? (
                  <Text
                    variant="inline"
                    style={{
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                      color: place.openNow ? colors.agentSuccess : colors.textSecondary,
                    }}
                  >
                    {open}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {summary ? (
              <Text
                variant="inline"
                style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}
              >
                {summary}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {place.directionsUrl ? (
                <ActionButton
                  label="Directions"
                  primary
                  icon={<Navigation size={14} color={colors.accentText} />}
                  onPress={() => openDirections(place.directionsUrl!, place)}
                />
              ) : null}
              <ActionButton
                label="Open in Maps"
                primary={!place.directionsUrl}
                icon={
                  <MapPinned
                    size={14}
                    color={place.directionsUrl ? colors.textPrimary : colors.accentText}
                  />
                }
                onPress={() => {
                  void openPlaceInMaps(place).then((opened) => {
                    if (opened) return;
                    Alert.alert(
                      'Could not open Maps',
                      'Nothing on this device could open this place.',
                    );
                  });
                }}
              />
              {place.websiteUrl ? (
                <ActionButton
                  label="Website"
                  primary={false}
                  icon={<Globe size={14} color={colors.textPrimary} />}
                  onPress={() => openInSheet(place.websiteUrl!)}
                />
              ) : null}
            </View>

            {place.address ? (
              <Text
                variant="inline"
                selectable
                style={{ fontSize: typeScale.subhead, lineHeight: 20, color: colors.textSecondary }}
              >
                {place.address}
              </Text>
            ) : null}

            {note ? (
              <View
                testID="places-assistant-note"
                style={{
                  gap: 4,
                  padding: 10,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: colors.surfaceHover,
                }}
              >
                <Text
                  variant="inline"
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: colors.textSecondary,
                  }}
                >
                  {ASSISTANT_NOTE_HEADING}
                </Text>
                <Text
                  variant="inline"
                  selectable
                  style={{ fontSize: typeScale.subhead, lineHeight: 20, color: colors.textPrimary }}
                >
                  {note}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingLeft: 16,
              paddingRight: 4,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                variant="inline"
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: typeScale.caption, color: colors.textMuted }}
              >
                {attribution}
              </Text>
              {termsUrl ? (
                <PressableBox
                  accessibilityRole="link"
                  accessibilityLabel="Terms"
                  onPress={() => openProviderTerms(termsUrl)}
                  style={{
                    minHeight: TARGET,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                  }}
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
                  <ExternalLink size={12} color={colors.textMuted} />
                </PressableBox>
              ) : null}
            </View>
            {total > 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <PressableBox
                  accessibilityRole="button"
                  accessibilityLabel="Previous place"
                  onPress={() => onStep(-1)}
                  style={{
                    width: TARGET,
                    height: TARGET,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronLeft size={18} color={colors.textSecondary} />
                </PressableBox>
                <Text
                  variant="inline"
                  style={{
                    fontSize: typeScale.caption,
                    color: colors.textSecondary,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {`${index + 1} of ${total}`}
                </Text>
                <PressableBox
                  accessibilityRole="button"
                  accessibilityLabel="Next place"
                  onPress={() => onStep(1)}
                  style={{
                    width: TARGET,
                    height: TARGET,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChevronRight size={18} color={colors.textSecondary} />
                </PressableBox>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      ) : null}
    </Modal>
  );
}
