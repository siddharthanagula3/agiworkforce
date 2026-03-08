import { useState, useCallback } from 'react';
import { View, Pressable, Modal, Share, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { X, Share2, Download } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface ImageFullScreenProps {
  imageUrl: string | null;
  prompt?: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Full-screen image viewer with pinch-to-zoom and double-tap toggle.
 * Overlay pattern matching ArtifactFullScreen.
 */
export function ImageFullScreen({ imageUrl, prompt, visible, onClose }: ImageFullScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [saved, setSaved] = useState(false);

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
      // Android does not support the `url` field in Share.share — use `message` instead.
      // iOS supports `url` natively for sharing image links.
      await Share.share({
        title: 'Generated Image',
        message: Platform.OS === 'android' ? imageUrl : (prompt ?? ''),
        url: Platform.OS !== 'android' ? imageUrl : undefined,
      });
    } catch {
      // User cancelled
    }
  }, [imageUrl, prompt]);

  const handleSave = useCallback(async () => {
    if (!imageUrl) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Placeholder: actual save would use expo-media-library
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
  }, [onClose, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
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
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
              accessibilityLabel="Share image"
              accessibilityRole="button"
            >
              <Share2 size={18} color={colors.textSecondary} />
            </Pressable>

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: saved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              }}
              accessibilityLabel={saved ? 'Saved' : 'Save image'}
              accessibilityRole="button"
            >
              <Download size={18} color={saved ? colors.agentSuccess : colors.textSecondary} />
            </Pressable>

            {/* Close button */}
            <Pressable
              onPress={handleClose}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
                <Image
                  source={{ uri: imageUrl }}
                  style={{
                    width: screenWidth - 32,
                    height: screenWidth - 32,
                    borderRadius: 4,
                  }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessibilityLabel={prompt ?? 'Full screen generated image'}
                />
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
