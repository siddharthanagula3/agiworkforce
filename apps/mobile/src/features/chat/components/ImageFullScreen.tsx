import { useCallback, useMemo, useState } from 'react';
import { View, Modal, Alert, useWindowDimensions } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Image } from 'expo-image';
import { Check, Copy, Download, Paintbrush, Share2, Trash2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { copyGeneratedImage } from '@/services/fileCreation';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors, zIndex } from '@/src/ui/theme';
import { motion, typeScale } from '@/src/ui/theme/tokens';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { saveGeneratedImageToPhotos, shareGeneratedImage } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';

import { imageSettingsCaption } from '@/src/features/image/imageSettingsCaption';
import {
  ImageAreaEditor,
  type ImageAreaEdit,
} from '@/src/features/image/components/ImageAreaEditor';

interface ImageFullScreenProps {
  imageUrl: string | null;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  visible: boolean;
  onClose: () => void;
  allowEphemeral?: boolean;
  onEditArea?: (edit: ImageAreaEdit) => void;
  onDelete?: () => void;
  deleteMessage?: string;
}

const DIRECTLY_DISPLAYABLE_URI = /^(file|ph|content|assets-library|data|https?):/i;

function isDirectlyDisplayableUri(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) return false;
  return DIRECTLY_DISPLAYABLE_URI.test(imageUrl.trim());
}

export function ImageFullScreen({
  imageUrl,
  prompt,
  model,
  aspectRatio,
  visible,
  onClose,
  allowEphemeral = false,
  onEditArea,
  onDelete,
  deleteMessage,
}: ImageFullScreenProps) {
  const [editing, setEditing] = useState(false);
  const settingsCaption = imageSettingsCaption(model, aspectRatio);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const directUri = useMemo(
    () => (isDirectlyDisplayableUri(imageUrl) ? imageUrl.trim() : null),
    [imageUrl],
  );
  const { source: generatedSource, status: generatedStatus } = useGeneratedImageSource(
    directUri ? '' : (imageUrl ?? ''),
    allowEphemeral,
  );
  const source = directUri ? { uri: directUri } : generatedSource;
  const sourceStatus = directUri ? ('ready' as const) : generatedStatus;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      if (scale.value < 1.1) {
        scale.value = withTiming(1, { duration: motion.moved });
        translateX.value = withTiming(0, { duration: motion.moved });
        translateY.value = withTiming(0, { duration: motion.moved });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

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

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.1) {
        scale.value = withTiming(1, { duration: motion.moved });
        translateX.value = withTiming(0, { duration: motion.moved });
        translateY.value = withTiming(0, { duration: motion.moved });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5, { duration: motion.moved });
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
    } catch {
      Alert.alert('Could not share image', 'Save the image and try again.');
    }
  }, [imageUrl]);

  const [saved, setSaved] = useState(false);
  const handleSave = useCallback(async () => {
    if (!imageUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await saveGeneratedImageToPhotos(imageUrl);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      Alert.alert('Could not save image', toUserMessage(error, 'Try again in a moment.'));
    }
  }, [imageUrl]);

  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!imageUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await copyGeneratedImage(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Could not copy image', 'Try again in a moment.');
    }
  }, [imageUrl]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    Alert.alert('Delete this image?', deleteMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }, [deleteMessage, onDelete]);

  const handleSubmitEdit = useCallback(
    (edit: ImageAreaEdit) => {
      setEditing(false);
      onEditArea?.(edit);
    },
    [onEditArea],
  );

  const handleClose = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

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
              zIndex: zIndex.control,
            }}
          >
            {onEditArea && !directUri ? (
              <PressableBox
                onPress={() => setEditing(true)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.voiceControlSurface,
                }}
                accessibilityLabel="Edit an area of this image"
                accessibilityRole="button"
              >
                <Paintbrush size={18} color={colors.cameraOverlayText} />
              </PressableBox>
            ) : null}

            {onDelete ? (
              <PressableBox
                onPress={handleDelete}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.voiceControlSurface,
                }}
                accessibilityLabel="Delete image"
                accessibilityRole="button"
              >
                <Trash2 size={18} color={colors.cameraOverlayText} />
              </PressableBox>
            ) : null}

            {!directUri ? (
              <PressableBox
                onPress={handleSave}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.voiceControlSurface,
                }}
                accessibilityLabel={saved ? 'Image saved to Photos' : 'Save image to Photos'}
                accessibilityRole="button"
              >
                {saved ? (
                  <Check size={18} color={colors.cameraOverlayText} />
                ) : (
                  <Download size={18} color={colors.cameraOverlayText} />
                )}
              </PressableBox>
            ) : null}

            {/* Share button */}
            <PressableBox
              onPress={handleShare}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.voiceControlSurface,
              }}
              accessibilityLabel="Share image"
              accessibilityRole="button"
            >
              <Share2 size={18} color={colors.cameraOverlayText} />
            </PressableBox>

            <PressableBox
              onPress={handleCopy}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.voiceControlSurface,
              }}
              accessibilityLabel={copied ? 'Image copied' : 'Copy image'}
              accessibilityRole="button"
            >
              {copied ? (
                <Check size={18} color={colors.cameraOverlayText} />
              ) : (
                <Copy size={18} color={colors.cameraOverlayText} />
              )}
            </PressableBox>

            {/* Close button */}
            <PressableBox
              onPress={handleClose}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: colors.voiceControlSurface,
              }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={18} color={colors.cameraOverlayText} />
            </PressableBox>
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
                    <Text style={{ color: colors.cameraOverlayTextMuted, textAlign: 'center' }}>
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
          {prompt || settingsCaption ? (
            <View
              style={{
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: insets.bottom + 16,
              }}
            >
              {prompt ? (
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                    color: colors.cameraOverlayTextMuted,
                    textAlign: 'center',
                  }}
                  numberOfLines={4}
                  selectable
                >
                  {prompt}
                </Text>
              ) : null}
              {settingsCaption ? (
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 17,
                    marginTop: prompt ? 6 : 0,
                    color: colors.cameraOverlayTextMuted,
                    textAlign: 'center',
                  }}
                  selectable
                >
                  {settingsCaption}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={{ height: insets.bottom + 16 }} />
          )}
        </View>
      </GestureHandlerRootView>
      {onEditArea ? (
        <ImageAreaEditor
          imagePath={imageUrl}
          visible={editing}
          onCancel={() => setEditing(false)}
          onSubmit={handleSubmitEdit}
        />
      ) : null}
    </Modal>
  );
}
