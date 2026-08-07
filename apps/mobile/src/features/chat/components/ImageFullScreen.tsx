import { useCallback, useMemo } from 'react';
import { View, Pressable, Modal, Alert, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { X, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { shareGeneratedImage } from '@/services/fileCreation';

interface ImageFullScreenProps {
  imageUrl: string | null;
  prompt?: string;
  visible: boolean;
  onClose: () => void;
  /** Display-only fallback for a response explicitly marked persisted:false. */
  allowEphemeral?: boolean;
}

/**
 * URIs the image view can render as-is, with no Cloud round trip.
 *
 * `useGeneratedImageSource` speaks exactly one dialect: the durable
 * `/api/files/<uuid>` path a Cloud generation returns, which it turns into an
 * absolute URL and fetches with a bearer token. Anything else lands on its
 * `invalid` branch.
 *
 * This viewer is also opened for USER ATTACHMENTS (`MessageBubble` passes
 * `attachment.url` straight in), and those are on-device URIs — `file://` from
 * the document picker, `ph://` from the photo library, `content://` on Android,
 * or an inline `data:` payload. None is a durable path, so tapping an attached
 * image in Local Mode rendered "Generated image unavailable" on black: the
 * viewer asking the Cloud about a file that never left the phone.
 *
 * These need no authorization and must never be routed through one — Local Mode
 * is an on-device trust boundary, and fetching an attachment's bytes through
 * Cloud would breach it.
 */
const DIRECTLY_DISPLAYABLE_URI = /^(file|ph|content|assets-library|data|https?):/i;

/** True when `imageUrl` can be handed to `expo-image` unchanged. */
function isDirectlyDisplayableUri(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) return false;
  // A durable generated path is relative (`/api/files/…`), so it can never
  // match a scheme-prefixed URI — the two sets do not overlap.
  return DIRECTLY_DISPLAYABLE_URI.test(imageUrl.trim());
}

/**
 * Full-screen image viewer with pinch-to-zoom and double-tap toggle.
 * Overlay pattern matching ArtifactFullScreen.
 */
export function ImageFullScreen({
  imageUrl,
  prompt,
  visible,
  onClose,
  allowEphemeral = false,
}: ImageFullScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const directUri = useMemo(
    () => (isDirectlyDisplayableUri(imageUrl) ? imageUrl.trim() : null),
    [imageUrl],
  );
  // Hooks cannot be called conditionally, so the generated-image resolver still
  // runs — it is fed an empty URL for a direct URI so it settles on `invalid`
  // without issuing a token request, and its result is then overridden below.
  const { source: generatedSource, status: generatedStatus } = useGeneratedImageSource(
    directUri ? '' : (imageUrl ?? ''),
    allowEphemeral,
  );
  const source = directUri ? { uri: directUri } : generatedSource;
  const sourceStatus = directUri ? ('ready' as const) : generatedStatus;

  // Zoom state via reanimated shared values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Pinch-to-zoom gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      if (scale.value < 1.1) {
        scale.value = withTiming(1, { duration: 250 });
        translateX.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(0, { duration: 250 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  // Pan gesture (only when zoomed in)
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      'worklet';
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Double-tap to toggle zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.1) {
        scale.value = withTiming(1, { duration: 250 });
        translateX.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(0, { duration: 250 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: 300 });
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const handleShare = useCallback(async () => {
    if (!imageUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await shareGeneratedImage(imageUrl);
    } catch (error) {
      Alert.alert(
        'Could not share image',
        error instanceof Error ? error.message : 'Save the image and try again.',
      );
    }
  }, [imageUrl]);

  const handleClose = useCallback(() => {
    // Reset zoom before closing
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]); // Shared values are stable refs — omit from deps

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.black,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingTop: insets.top + 8,
              paddingHorizontal: 16,
              paddingBottom: 12,
              gap: 8,
              zIndex: 10,
            }}
          >
            {/* Share button */}
            <Pressable
              onPress={handleShare}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.neutralSurface,
              }}
              accessibilityLabel="Share image"
              accessibilityRole="button"
            >
              <Share2 size={18} color={colors.textSecondary} />
            </Pressable>

            {/* Close button */}
            <Pressable
              onPress={handleClose}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.neutralSurface,
              }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Zoomable image area */}
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={animatedImageStyle}>
                {sourceStatus === 'ready' && source ? (
                  <Image
                    source={source}
                    style={{
                      width: screenWidth - 32,
                      height: screenWidth - 32,
                      borderRadius: 4,
                    }}
                    contentFit="contain"
                    cachePolicy="memory"
                    accessibilityLabel={prompt ?? 'Full screen generated image'}
                  />
                ) : (
                  <View
                    style={{
                      width: screenWidth - 32,
                      height: screenWidth - 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                      {sourceStatus === 'signed-out'
                        ? 'Sign in to view this generated image'
                        : sourceStatus === 'authorizing'
                          ? 'Loading generated image…'
                          : 'Generated image unavailable'}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Prompt footer */}
          {prompt ? (
            <View
              style={{
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: insets.bottom + 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: colors.textMuted,
                  textAlign: 'center',
                }}
                numberOfLines={4}
                selectable
              >
                {prompt}
              </Text>
            </View>
          ) : (
            <View style={{ height: insets.bottom + 16 }} />
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
