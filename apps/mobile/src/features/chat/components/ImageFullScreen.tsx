import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Modal,
  Alert,
  StyleSheet,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Button } from '@/components/ui/Button';
import { Image } from 'expo-image';
import {
  Check,
  Copy,
  Download,
  Flag,
  Paintbrush,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { preferredImpactHaptic } from '@/src/shared/utils/haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Directions,
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { ReportSheet, type ReportTarget } from './ReportFlagButton';
import { useImageZoom } from './ZoomableImage';
import { useThemeColors, zIndex } from '@/src/ui/theme';
import { motion, spacing, typeScale } from '@/src/ui/theme/tokens';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import {
  runViewerImageAction,
  viewerImageActions,
  type ViewerImageAction,
} from '@/src/features/image/services/viewerImageActions';
import { toUserMessage } from '@/services/userMessage';
import { sharingWithProvidersAnswer } from '@/src/features/chat/actions/mediaGenerationConsent';
import {
  isPhotosPermissionDenied,
  showPhotosPermissionAlert,
} from '@/src/features/image/photosAccess';

import { imageSettingsCaption } from '@/src/features/image/imageSettingsCaption';
import {
  ImageAreaEditor,
  type ImageAreaEdit,
} from '@/src/features/image/components/ImageAreaEditor';
import { ImageChangeSheet } from '@/src/features/image/components/ImageChangeSheet';
import type { ImageWholeEdit } from '@/src/features/image/wholeImageEdit';
import {
  canDismissAtScale,
  DISMISS_ACTIVATION_OFFSET,
  dismissBackdropOpacity,
  dismissPictureScale,
  dismissProgress,
  dragDownOffset,
  shouldDismissViewer,
} from './imageViewerDismiss';

export interface ViewerImage {
  url: string;
  kind?: 'generated' | 'attachment';
  name?: string;
  mimeType?: string | null;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  allowEphemeral?: boolean;
}

interface ImageFullScreenProps {
  imageUrl?: string | null;
  images?: readonly ViewerImage[];
  initialIndex?: number;
  kind?: ViewerImage['kind'];
  name?: string;
  mimeType?: string | null;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  visible: boolean;
  onClose: () => void;
  allowEphemeral?: boolean;
  onEditArea?: (edit: ImageAreaEdit) => void;
  onEditImage?: (edit: ImageWholeEdit) => void;
  onDelete?: () => void;
  deleteMessage?: string;
  reportTarget?: ReportTarget;
}

const DIRECTLY_DISPLAYABLE_URI = /^(file|ph|content|assets-library|data|https?):/i;
const STAGE_GUTTER = spacing['3xl'];

const ACTION_FAILURE_TITLE: Readonly<Record<ViewerImageAction, string>> = {
  save: 'Could not save image',
  share: 'Could not share image',
  copy: 'Could not copy image',
};

function isDirectlyDisplayableUri(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) return false;
  return DIRECTLY_DISPLAYABLE_URI.test(imageUrl.trim());
}

function viewerImagesOf(props: ImageFullScreenProps): readonly ViewerImage[] {
  if (props.images && props.images.length > 0) return props.images;
  if (!props.imageUrl) return [];
  return [
    {
      url: props.imageUrl,
      ...(props.kind ? { kind: props.kind } : {}),
      ...(props.name ? { name: props.name } : {}),
      ...(props.mimeType ? { mimeType: props.mimeType } : {}),
      ...(props.prompt ? { prompt: props.prompt } : {}),
      ...(props.model ? { model: props.model } : {}),
      ...(props.aspectRatio ? { aspectRatio: props.aspectRatio } : {}),
      ...(props.allowEphemeral ? { allowEphemeral: true } : {}),
    },
  ];
}

function imageLabel(image: ViewerImage): string {
  if (image.kind === 'attachment') return image.name?.trim() || 'Attached image';
  return image.prompt?.trim() || 'Full screen generated image';
}

export function ImageFullScreen(props: ImageFullScreenProps) {
  const images = viewerImagesOf(props);
  if (!props.visible || images.length === 0) return null;
  const ownerKey = images.map((image) => `${image.url}:${image.allowEphemeral ?? false}`).join('|');
  return (
    <ImageFullScreenOwner
      key={`${ownerKey}#${props.initialIndex ?? 0}`}
      {...props}
      viewerImages={images}
    />
  );
}

function HeaderControl({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <PressableBox
      onPress={onPress}
      style={{
        width: FULL_SCREEN_TOUCH_TARGET,
        height: FULL_SCREEN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {children}
    </PressableBox>
  );
}

function ViewerPicture({
  image,
  directUri,
  width,
  height,
  onNaturalRatio,
  onRetry,
}: {
  image: ViewerImage;
  directUri: string | null;
  width: number;
  height: number;
  onNaturalRatio: (ratio: number) => void;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const [loadFailed, setLoadFailed] = useState(false);
  const { source: generatedSource, status: generatedStatus } = useGeneratedImageSource(
    directUri ? '' : image.url,
    image.allowEphemeral ?? false,
  );
  const source = directUri ? { uri: directUri } : generatedSource;
  const sourceStatus = directUri ? ('ready' as const) : generatedStatus;
  const label = imageLabel(image);

  if (sourceStatus === 'ready' && source && !loadFailed) {
    return (
      <Image
        source={source}
        style={{ width, height, borderRadius: 4 }}
        contentFit="contain"
        cachePolicy="memory"
        accessibilityLabel={label}
        onLoad={(event) => {
          const { width: naturalWidth, height: naturalHeight } = event.source;
          if (naturalWidth > 0 && naturalHeight > 0) onNaturalRatio(naturalWidth / naturalHeight);
        }}
        onError={() => setLoadFailed(true)}
      />
    );
  }

  const failed = loadFailed || sourceStatus === 'error';
  const message = failed
    ? 'Image failed to load'
    : sourceStatus === 'signed-out'
      ? 'Sign in to view this generated image'
      : sourceStatus === 'authorizing'
        ? 'Loading generated image…'
        : 'Generated image unavailable';
  return (
    <View
      style={{ width, height, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
    >
      <Text style={{ color: colors.cameraOverlayTextMuted, textAlign: 'center' }}>{message}</Text>
      {failed ? (
        <Button
          title="Retry"
          variant="outline"
          size="md"
          accessibilityLabel="Retry loading this image"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

function ImageFullScreenOwner({
  viewerImages,
  initialIndex = 0,
  visible,
  onClose,
  onEditArea,
  onEditImage,
  onDelete,
  deleteMessage,
  reportTarget,
}: ImageFullScreenProps & { viewerImages: readonly ViewerImage[] }) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, Math.trunc(initialIndex)), viewerImages.length - 1),
  );
  const image = viewerImages[index]!;
  const imageUrl = image.url;
  const isAttachment = image.kind === 'attachment';
  const [editSession, setEditSession] = useState<number | null>(null);
  const [editKind, setEditKind] = useState<'area' | 'change'>('area');
  const editSessionRef = useRef<number | null>(null);
  const editSequenceRef = useRef(0);
  const askingSessionRef = useRef<number | null>(null);
  const lifetimeRef = useRef<symbol | null>(null);
  const operationRef = useRef<symbol | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  }, []);

  const retire = useCallback(() => {
    lifetimeRef.current = null;
    operationRef.current = null;
    editSessionRef.current = null;
    clearFeedback();
  }, [clearFeedback]);

  useLayoutEffect(() => {
    lifetimeRef.current = Symbol('image viewer lifetime');
    return retire;
  }, [retire]);

  const beginAction = useCallback(() => {
    const lifetime = lifetimeRef.current;
    if (!lifetime || operationRef.current || editSessionRef.current) return null;
    const operation = Symbol('image viewer action');
    operationRef.current = operation;
    clearFeedback();
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
  }, [clearFeedback]);
  const [reporting, setReporting] = useState(false);
  const settingsCaption = isAttachment
    ? null
    : imageSettingsCaption(image.model, image.aspectRatio);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const directUri = useMemo(
    () => (isDirectlyDisplayableUri(imageUrl) ? imageUrl.trim() : null),
    [imageUrl],
  );
  const actions = viewerImageActions(imageUrl, { name: image.name, mimeType: image.mimeType });

  const stageWidth = Math.max(0, (stageSize?.width ?? screenWidth) - STAGE_GUTTER);
  const stageHeight = Math.max(0, stageSize?.height ?? screenHeight / 2);
  const frame = naturalRatio
    ? {
        width: Math.min(stageWidth, stageHeight * naturalRatio),
        height: Math.min(stageWidth, stageHeight * naturalRatio) / naturalRatio,
      }
    : { width: Math.min(stageWidth, stageHeight), height: Math.min(stageWidth, stageHeight) };

  const paneWidth = stageSize?.width ?? screenWidth;
  const paneHeight = stageSize?.height ?? screenHeight / 2;
  const {
    scale,
    savedScale,
    resetZoom,
    zoomTo,
    pinchGesture,
    panGesture,
    doubleTapGesture,
    animatedImageStyle,
  } = useImageZoom({
    frameWidth: frame.width,
    frameHeight: frame.height,
    stageWidth: paneWidth,
    stageHeight: paneHeight,
  });

  const handleClose = useCallback(() => {
    if (!lifetimeRef.current) return;
    retire();
    resetZoom();
    onClose();
  }, [onClose, resetZoom, retire]);
  useDismissOnScreenBlur(visible, handleClose);

  const reduceMotion = useReduceMotion();
  const dismissY = useSharedValue(0);
  const dismissArmed = useSharedValue(false);
  const dismissExtent = screenHeight;

  const dismissGesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetY(DISMISS_ACTIVATION_OFFSET)
    .failOffsetX([-DISMISS_ACTIVATION_OFFSET, DISMISS_ACTIVATION_OFFSET])
    .onStart(() => {
      'worklet';
      dismissArmed.value = canDismissAtScale(scale.value);
    })
    .onUpdate((event) => {
      'worklet';
      if (!dismissArmed.value || reduceMotion) return;
      dismissY.value = dragDownOffset(event.translationY);
    })
    .onEnd((event, success) => {
      'worklet';
      if (!dismissArmed.value) return;
      dismissArmed.value = false;
      if (success && shouldDismissViewer(event.translationY, event.velocityY, dismissExtent)) {
        if (reduceMotion) {
          runOnJS(handleClose)();
          return;
        }
        dismissY.value = withTiming(dismissExtent, { duration: motion.quick }, (finished) => {
          'worklet';
          if (finished) runOnJS(handleClose)();
        });
        return;
      }
      dismissY.value = reduceMotion ? 0 : withTiming(0, { duration: motion.moved });
    });

  const dismissPictureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissY.value },
      { scale: dismissPictureScale(dismissProgress(dismissY.value, dismissExtent)) },
    ],
  }));
  const dismissBackdropStyle = useAnimatedStyle(() => ({
    opacity: dismissBackdropOpacity(dismissProgress(dismissY.value, dismissExtent)),
  }));
  const dismissChromeStyle = useAnimatedStyle(() => ({
    opacity: 1 - dismissProgress(dismissY.value, dismissExtent),
  }));

  const goTo = useCallback(
    (next: number) => {
      if (!lifetimeRef.current || editSessionRef.current) return;
      if (next < 0 || next >= viewerImages.length || next === index) return;
      operationRef.current = null;
      clearFeedback();
      setSaved(false);
      setCopied(false);
      setNaturalRatio(null);
      setAttempt(0);
      resetZoom();
      setIndex(next);
    },
    [clearFeedback, index, resetZoom, viewerImages.length],
  );

  const pageBy = useCallback(
    (step: number) => {
      if (scale.value > 1.1) return;
      goTo(index + step);
    },
    [goTo, index, scale],
  );

  const nextFling = Gesture.Fling()
    .direction(Directions.LEFT)
    .runOnJS(true)
    .onEnd(() => pageBy(1));
  const previousFling = Gesture.Fling()
    .direction(Directions.RIGHT)
    .runOnJS(true)
    .onEnd(() => pageBy(-1));

  const composedGesture =
    viewerImages.length > 1
      ? Gesture.Simultaneous(
          pinchGesture,
          panGesture,
          dismissGesture,
          doubleTapGesture,
          nextFling,
          previousFling,
        )
      : Gesture.Simultaneous(pinchGesture, panGesture, dismissGesture, doubleTapGesture);

  const runAction = useCallback(
    async (kind: ViewerImageAction) => {
      const action = beginAction();
      if (!action) return;
      preferredImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
      try {
        await runViewerImageAction(kind, imageUrl, {
          isCurrent: action.isCurrent,
          ...(isAttachment && image.name ? { fileName: image.name } : {}),
        });
        if (kind !== 'share') action.showFeedback(kind);
      } catch (error) {
        if (action.isCurrent()) {
          if (isPhotosPermissionDenied(error)) {
            showPhotosPermissionAlert();
          } else {
            Alert.alert(ACTION_FAILURE_TITLE[kind], toUserMessage(error, 'Try again in a moment.'));
          }
        }
      } finally {
        action.finish();
      }
    },
    [beginAction, image.name, imageUrl, isAttachment],
  );

  const handleShare = useCallback(() => runAction('share'), [runAction]);
  const handleSave = useCallback(() => runAction('save'), [runAction]);
  const handleCopy = useCallback(() => runAction('copy'), [runAction]);

  const canDelete = Boolean(onDelete) && !isAttachment;
  const handleDelete = useCallback(() => {
    if (!onDelete || isAttachment) return;
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
  }, [beginAction, deleteMessage, isAttachment, onDelete]);

  const startEdit = useCallback((kind: 'area' | 'change') => {
    if (!lifetimeRef.current || operationRef.current || editSessionRef.current) return;
    const session = ++editSequenceRef.current;
    editSessionRef.current = session;
    setEditKind(kind);
    setEditSession(session);
  }, []);
  const handleStartEdit = useCallback(() => startEdit('area'), [startEdit]);
  const handleStartChange = useCallback(() => startEdit('change'), [startEdit]);

  const handleCancelEdit = useCallback(() => {
    if (!lifetimeRef.current || !editSession || editSessionRef.current !== editSession) return;
    editSessionRef.current = null;
    setEditSession(null);
  }, [editSession]);

  const submitAfterSharingQuestion = useCallback(
    (send: () => void) => {
      if (!lifetimeRef.current || !editSession || editSessionRef.current !== editSession) return;
      if (askingSessionRef.current === editSession) return;
      const submit = () => {
        if (!lifetimeRef.current || editSessionRef.current !== editSession) return;
        editSessionRef.current = null;
        setEditSession(null);
        send();
      };
      const answer = sharingWithProvidersAnswer();
      if (answer === true) {
        submit();
        return;
      }
      askingSessionRef.current = editSession;
      const settle = () => {
        if (askingSessionRef.current === editSession) askingSessionRef.current = null;
      };
      void answer.then(
        (allowed) => {
          settle();
          if (allowed) submit();
        },
        () => {
          settle();
          submit();
        },
      );
    },
    [editSession],
  );

  const handleSubmitEdit = useCallback(
    (edit: ImageAreaEdit) => submitAfterSharingQuestion(() => onEditArea?.(edit)),
    [onEditArea, submitAfterSharingQuestion],
  );

  const handleSubmitChange = useCallback(
    (edit: ImageWholeEdit) => submitAfterSharingQuestion(() => onEditImage?.(edit)),
    [onEditImage, submitAfterSharingQuestion],
  );

  const handleRetry = useCallback(() => {
    setNaturalRatio(null);
    setAttempt((value) => value + 1);
  }, []);

  const accessibilityActions = [
    { name: 'zoomIn', label: 'Zoom in' },
    { name: 'zoomOut', label: 'Zoom out' },
    ...(index < viewerImages.length - 1 ? [{ name: 'nextImage', label: 'Next image' }] : []),
    ...(index > 0 ? [{ name: 'previousImage', label: 'Previous image' }] : []),
  ];

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'zoomIn') zoomTo(savedScale.value * 1.5);
    else if (name === 'zoomOut') zoomTo(savedScale.value / 1.5 < 1.1 ? 1 : savedScale.value / 1.5);
    else if (name === 'nextImage') goTo(index + 1);
    else if (name === 'previousImage') goTo(index - 1);
  };

  const counter = viewerImages.length > 1 ? `${index + 1} of ${viewerImages.length}` : null;

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
        <View style={{ flex: 1 }}>
          <Animated.View
            testID="image-viewer-backdrop"
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.black },
              dismissBackdropStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingTop: insets.top + spacing.sm,
                paddingHorizontal: spacing.sm,
                paddingBottom: spacing.sm,
                zIndex: zIndex.control,
              },
              dismissChromeStyle,
            ]}
          >
            {onEditImage && !directUri && !isAttachment ? (
              <HeaderControl label="Change this image" onPress={handleStartChange}>
                <Sparkles size={20} color={colors.cameraOverlayText} />
              </HeaderControl>
            ) : null}

            {onEditArea && !directUri && !isAttachment ? (
              <HeaderControl label="Edit an area of this image" onPress={handleStartEdit}>
                <Paintbrush size={20} color={colors.cameraOverlayText} />
              </HeaderControl>
            ) : null}

            {reportTarget && !isAttachment ? (
              <HeaderControl label="Report this image" onPress={() => setReporting(true)}>
                <Flag size={20} color={colors.cameraOverlayText} />
              </HeaderControl>
            ) : null}

            {canDelete ? (
              <HeaderControl label="Delete image" onPress={handleDelete}>
                <Trash2 size={20} color={colors.cameraOverlayText} />
              </HeaderControl>
            ) : null}

            {actions.has('save') ? (
              <HeaderControl
                label={saved ? 'Image saved to Photos' : 'Save image to Photos'}
                onPress={handleSave}
              >
                {saved ? (
                  <Check size={20} color={colors.cameraOverlayText} />
                ) : (
                  <Download size={20} color={colors.cameraOverlayText} />
                )}
              </HeaderControl>
            ) : null}

            {actions.has('share') ? (
              <HeaderControl label="Share image" onPress={handleShare}>
                <Share2 size={20} color={colors.cameraOverlayText} />
              </HeaderControl>
            ) : null}

            {actions.has('copy') ? (
              <HeaderControl label={copied ? 'Image copied' : 'Copy image'} onPress={handleCopy}>
                {copied ? (
                  <Check size={20} color={colors.cameraOverlayText} />
                ) : (
                  <Copy size={20} color={colors.cameraOverlayText} />
                )}
              </HeaderControl>
            ) : null}

            <HeaderControl label="Close" onPress={handleClose}>
              <X size={22} color={colors.cameraOverlayText} />
            </HeaderControl>
          </Animated.View>

          <View
            testID="image-viewer-stage"
            onLayout={(event: LayoutChangeEvent) => {
              const { width, height } = event.nativeEvent.layout;
              setStageSize({ width, height });
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GestureDetector gesture={composedGesture}>
              <View
                testID="image-viewer-gesture-area"
                style={{
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Animated.View testID="image-viewer-dismiss" style={dismissPictureStyle}>
                  <Animated.View
                    style={animatedImageStyle}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={imageLabel(image)}
                    accessibilityActions={accessibilityActions}
                    onAccessibilityAction={handleAccessibilityAction}
                  >
                    <ViewerPicture
                      key={`${imageUrl}#${attempt}`}
                      image={image}
                      directUri={directUri}
                      width={frame.width}
                      height={frame.height}
                      onNaturalRatio={setNaturalRatio}
                      onRetry={handleRetry}
                    />
                  </Animated.View>
                </Animated.View>
              </View>
            </GestureDetector>
          </View>

          {counter || image.prompt || settingsCaption ? (
            <Animated.View
              style={[
                {
                  paddingHorizontal: spacing['2xl'],
                  paddingTop: spacing.md,
                  paddingBottom: insets.bottom + spacing.lg,
                  gap: spacing.xs,
                },
                dismissChromeStyle,
              ]}
            >
              {counter ? (
                <Text
                  testID="image-viewer-counter"
                  accessibilityLiveRegion="polite"
                  style={{
                    fontSize: typeScale.caption,
                    color: colors.cameraOverlayTextMuted,
                    textAlign: 'center',
                  }}
                >
                  {counter}
                </Text>
              ) : null}
              {image.prompt && !isAttachment ? (
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
                  {image.prompt}
                </Text>
              ) : null}
              {settingsCaption ? (
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 17,
                    color: colors.cameraOverlayTextMuted,
                    textAlign: 'center',
                  }}
                  selectable
                >
                  {settingsCaption}
                </Text>
              ) : null}
            </Animated.View>
          ) : (
            <View style={{ height: insets.bottom + spacing.lg }} />
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
      {onEditImage && editSession && editKind === 'change' ? (
        <ImageChangeSheet
          key={editSession}
          imagePath={imageUrl}
          imagePrompt={image.prompt}
          model={image.model}
          aspectRatio={image.aspectRatio}
          onCancel={handleCancelEdit}
          onSubmit={handleSubmitChange}
        />
      ) : null}
      {onEditArea && editSession && editKind === 'area' ? (
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
