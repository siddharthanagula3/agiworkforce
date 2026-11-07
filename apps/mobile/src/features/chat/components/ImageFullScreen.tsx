import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Modal, Alert, useWindowDimensions } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Image } from 'expo-image';
import { Check, Copy, Download, Flag, Paintbrush, Share2, Trash2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { copyGeneratedImage } from '@/services/fileCreation';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { ReportSheet, type ReportTarget } from './ReportFlagButton';
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
  reportTarget?: ReportTarget;
}

const DIRECTLY_DISPLAYABLE_URI = /^(file|ph|content|assets-library|data|https?):/i;

function isDirectlyDisplayableUri(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) return false;
  return DIRECTLY_DISPLAYABLE_URI.test(imageUrl.trim());
}

export function ImageFullScreen(props: ImageFullScreenProps) {
  if (!props.visible || !props.imageUrl) return null;
  return (
    <ImageFullScreenOwner key={`${props.imageUrl}:${props.allowEphemeral ?? false}`} {...props} />
  );
}

function ImageFullScreenOwner({
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
  reportTarget,
}: ImageFullScreenProps) {
  const [editSession, setEditSession] = useState<number | null>(null);
  const editSessionRef = useRef<number | null>(null);
  const editSequenceRef = useRef(0);
  const lifetimeRef = useRef<symbol | null>(null);
  const operationRef = useRef<symbol | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const retire = useCallback(() => {
    lifetimeRef.current = null;
    operationRef.current = null;
    editSessionRef.current = null;
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    lifetimeRef.current = Symbol('image viewer lifetime');
    return retire;
  }, [retire]);

  const beginAction = useCallback(() => {
    const lifetime = lifetimeRef.current;
    if (!lifetime || operationRef.current || editSessionRef.current) return null;
    const operation = Symbol('image viewer action');
    operationRef.current = operation;
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setSaved(false);
    setCopied(false);
    const isCurrent = () => lifetimeRef.current === lifetime && operationRef.current === operation;
    return {
      isCurrent,
      finish: () => {
        if (isCurrent()) operationRef.current = null;
      },
      showFeedback: (action: 'save' | 'copy') => {
        if (!isCurrent()) return;
        if (action === 'save') setSaved(true);
        else setCopied(true);
        const timer = setTimeout(() => {
          if (lifetimeRef.current !== lifetime || feedbackTimerRef.current !== timer) return;
          feedbackTimerRef.current = null;
          setSaved(false);
          setCopied(false);
        }, 2000);
        feedbackTimerRef.current = timer;
      },
    };
  }, []);
  const [reporting, setReporting] = useState(false);
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

  const runAction = useCallback(
    async (kind: 'share' | 'save' | 'copy') => {
      if (!imageUrl) return;
      const action = beginAction();
      if (!action) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const options = { isCurrent: action.isCurrent };
        if (kind === 'share') await shareGeneratedImage(imageUrl, undefined, options);
        else if (kind === 'save') await saveGeneratedImageToPhotos(imageUrl, undefined, options);
        else await copyGeneratedImage(imageUrl, options);
        if (kind !== 'share') action.showFeedback(kind);
      } catch (error) {
        if (action.isCurrent()) {
          Alert.alert(
            `Could not ${kind} image`,
            kind === 'save'
              ? toUserMessage(error, 'Try again in a moment.')
              : kind === 'share'
                ? 'Save the image and try again.'
                : 'Try again in a moment.',
          );
        }
      } finally {
        action.finish();
      }
    },
    [beginAction, imageUrl],
  );

  const handleShare = useCallback(() => runAction('share'), [runAction]);
  const handleSave = useCallback(() => runAction('save'), [runAction]);
  const handleCopy = useCallback(() => runAction('copy'), [runAction]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    const action = beginAction();
    if (!action) return;
    Alert.alert(
      'Delete this image?',
      deleteMessage,
      [
        { text: 'Cancel', style: 'cancel', onPress: action.finish },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!action.isCurrent()) return;
            action.finish();
            onDelete();
          },
        },
      ],
      { cancelable: true, onDismiss: action.finish },
    );
  }, [beginAction, deleteMessage, onDelete]);

  const handleStartEdit = useCallback(() => {
    if (!lifetimeRef.current || operationRef.current || editSessionRef.current) return;
    const session = ++editSequenceRef.current;
    editSessionRef.current = session;
    setEditSession(session);
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (!lifetimeRef.current || !editSession || editSessionRef.current !== editSession) return;
    editSessionRef.current = null;
    setEditSession(null);
  }, [editSession]);

  const handleSubmitEdit = useCallback(
    (edit: ImageAreaEdit) => {
      if (!lifetimeRef.current || !editSession || editSessionRef.current !== editSession) return;
      editSessionRef.current = null;
      setEditSession(null);
      onEditArea?.(edit);
    },
    [editSession, onEditArea],
  );

  const handleClose = useCallback(() => {
    if (!lifetimeRef.current) return;
    retire();
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, retire]);

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
                onPress={handleStartEdit}
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

            {reportTarget ? (
              <PressableBox
                onPress={() => setReporting(true)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.voiceControlSurface,
                }}
                accessibilityLabel="Report this image"
                accessibilityRole="button"
              >
                <Flag size={18} color={colors.cameraOverlayText} />
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
        {reportTarget && reporting ? (
          <ReportSheet
            visible
            onClose={() => setReporting(false)}
            title="Report this image"
            target={reportTarget}
          />
        ) : null}
      </GestureHandlerRootView>
      {onEditArea && editSession ? (
        <ImageAreaEditor
          key={editSession}
          imagePath={imageUrl}
          visible
          onCancel={handleCancelEdit}
          onSubmit={handleSubmitEdit}
        />
      ) : null}
    </Modal>
  );
}
