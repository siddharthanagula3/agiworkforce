import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { View, Alert, ActionSheetIOS, Platform } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Button } from '@/components/ui/Button';
import { Image } from 'expo-image';
import { parseMediaAspectRatio } from '@agiworkforce/types';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { preferredImpactHaptic } from '@/src/shared/utils/haptics';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeColors, zIndex } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { imageSettingsCaption } from '@/src/features/image/imageSettingsCaption';
import { inlineImageFrame } from '@/src/features/image/inlineImageFrame';
import { imageVersionLabel, type ImageVersion } from '@/src/features/image/imageVersions';
import {
  runViewerImageAction,
  viewerImageActions,
  type ViewerImageAction,
} from '@/src/features/image/services/viewerImageActions';
import {
  KEEP_IMAGE_FAILURE_TITLE,
  KEEP_IMAGE_LABEL,
  KEPT_IMAGE_MESSAGE,
  keepGeneratedImage,
  keepableImageId,
} from '@/src/features/image/services/keepMedia';
import { showToast } from '@/src/shared/components/Toast';
import { useActionMenu, type ActionMenu } from '@/src/shared/hooks/useActionMenu';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { toUserMessage } from '@/services/userMessage';
import {
  isPhotosPermissionDenied,
  showPhotosPermissionAlert,
} from '@/src/features/image/photosAccess';

interface GeneratedImageProps {
  imageUrl: string;
  revisedPrompt?: string;
  width?: number;
  onPress?: (imageUrl: string) => void;
  allowEphemeral?: boolean;
  model?: string;
  aspectRatio?: string;
  previousVersions?: readonly ImageVersion[];
  inTemporaryChat?: boolean;
}

const VERSION_BUTTON_SIZE = 44;

type LoadState = 'loading' | 'loaded' | 'error';

type MenuAction = ViewerImageAction | 'keep';

const MENU_ACTIONS: readonly { action: ViewerImageAction; label: string }[] = [
  { action: 'save', label: 'Save to Photos' },
  { action: 'copy', label: 'Copy image' },
  { action: 'share', label: 'Share image' },
];

const ACTION_FAILURE_TITLE: Readonly<Record<ViewerImageAction, string>> = {
  save: 'Could not save image',
  share: 'Could not share image',
  copy: 'Could not copy image',
};

function chooseImageAction(
  available: readonly { action: MenuAction; label: string }[],
  onChoose: (action: MenuAction) => void,
  openMenu: ActionMenu['open'],
): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...available.map((item) => item.label), 'Cancel'],
        cancelButtonIndex: available.length,
      },
      (index) => {
        const chosen = available[index];
        if (chosen) onChoose(chosen.action);
      },
    );
    return;
  }
  openMenu(
    'Image',
    available.map((item) => ({
      key: item.action,
      label: item.label,
      run: () => onChoose(item.action),
    })),
  );
}

type OwnerProps = Omit<GeneratedImageProps, 'onPress' | 'previousVersions' | 'inTemporaryChat'> & {
  onPress?: () => void;
};

interface KeepControl {
  onKeep: () => Promise<void>;
}

export function GeneratedImage({
  previousVersions,
  onPress,
  inTemporaryChat = false,
  ...props
}: GeneratedImageProps) {
  const colors = useThemeColors();
  const [attempt, setAttempt] = useState(0);
  const [keptIds, setKeptIds] = useState<ReadonlySet<string>>(() => new Set());
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const earlier = previousVersions ?? [];
  const total = earlier.length + 1;
  const safeViewed =
    viewedVersion !== null && viewedVersion < earlier.length ? viewedVersion : null;
  const position = safeViewed ?? total - 1;
  const shown = safeViewed === null ? undefined : earlier[safeViewed];
  const shownUrl = shown?.imageUrl ?? props.imageUrl;
  const ownerProps: OwnerProps = shown
    ? {
        imageUrl: shown.imageUrl,
        ...(props.width !== undefined ? { width: props.width } : {}),
        ...(shown.prompt ? { revisedPrompt: shown.prompt } : {}),
        ...(shown.model ? { model: shown.model } : {}),
        ...(shown.aspect ? { aspectRatio: shown.aspect } : {}),
      }
    : props;
  const stepTo = (next: number) => setViewedVersion(next >= total - 1 ? null : next);
  const keepId = inTemporaryChat ? keepableImageId(shownUrl) : null;
  const keep: KeepControl | undefined =
    keepId && !keptIds.has(keepId)
      ? {
          onKeep: async () => {
            const kept = await keepGeneratedImage(shownUrl);
            setKeptIds((current) => new Set(current).add(kept));
            showToast(KEPT_IMAGE_MESSAGE);
          },
        }
      : undefined;
  return (
    <View>
      <GeneratedImageOwner
        key={`${shownUrl}:${shown ? false : (props.allowEphemeral ?? false)}:${attempt}`}
        {...ownerProps}
        {...(onPress ? { onPress: () => onPress(shownUrl) } : {})}
        {...(keep ? { keep } : {})}
        onRetry={retry}
      />
      {total > 1 ? (
        <View
          accessibilityRole="toolbar"
          accessibilityLabel="Image versions"
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <PressableBox
            onPress={() => stepTo(position - 1)}
            disabled={position === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous version"
            accessibilityState={{ disabled: position === 0 }}
            testID="generated-image-previous-version"
            style={{
              width: VERSION_BUTTON_SIZE,
              height: VERSION_BUTTON_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={position === 0 ? colors.textMuted : colors.textPrimary} />
          </PressableBox>
          <Text
            testID="generated-image-version-label"
            accessibilityLiveRegion="polite"
            style={{ fontSize: typeScale.caption, color: colors.textMuted }}
          >
            {imageVersionLabel(position + 1, total)}
          </Text>
          <PressableBox
            onPress={() => stepTo(position + 1)}
            disabled={position === total - 1}
            accessibilityRole="button"
            accessibilityLabel="Next version"
            accessibilityState={{ disabled: position === total - 1 }}
            testID="generated-image-next-version"
            style={{
              width: VERSION_BUTTON_SIZE,
              height: VERSION_BUTTON_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight
              size={18}
              color={position === total - 1 ? colors.textMuted : colors.textPrimary}
            />
          </PressableBox>
        </View>
      ) : null}
    </View>
  );
}

function GeneratedImageOwner({
  imageUrl,
  revisedPrompt,
  width,
  onPress,
  allowEphemeral = false,
  model,
  aspectRatio,
  keep,
  onRetry,
}: OwnerProps & { onRetry: () => void; keep?: KeepControl }) {
  const colors = useThemeColors();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const { source, status: sourceStatus } = useGeneratedImageSource(imageUrl, allowEphemeral);
  const imageMenu = useActionMenu();
  const openImageMenu = imageMenu.open;

  const lifetimeRef = useRef<symbol | null>(null);
  const operationRef = useRef<symbol | null>(null);

  useLayoutEffect(() => {
    const lifetime = Symbol('image lifetime');
    lifetimeRef.current = lifetime;
    return () => {
      lifetimeRef.current = null;
      operationRef.current = null;
    };
  }, []);

  useEffect(() => {
    setLoadState('loading');
  }, [source?.uri]);

  const handleLoad = useCallback((event: { source: { width: number; height: number } }) => {
    if (!lifetimeRef.current) return;
    const { width: naturalWidth, height: naturalHeight } = event.source;
    if (naturalWidth > 0 && naturalHeight > 0) setNaturalRatio(naturalWidth / naturalHeight);
    setLoadState('loaded');
  }, []);

  const handleError = useCallback(() => {
    if (lifetimeRef.current) setLoadState('error');
  }, []);

  const runAction = useCallback(
    async (action: MenuAction) => {
      const lifetime = lifetimeRef.current;
      if (!lifetime || operationRef.current) return;
      const operation = Symbol('image action');
      operationRef.current = operation;
      const isCurrent = () =>
        lifetimeRef.current === lifetime && operationRef.current === operation;
      try {
        if (action === 'keep') await keep?.onKeep();
        else await runViewerImageAction(action, imageUrl, { isCurrent });
      } catch (error) {
        if (isCurrent()) {
          if (action !== 'keep' && isPhotosPermissionDenied(error)) {
            showPhotosPermissionAlert();
          } else {
            Alert.alert(
              action === 'keep' ? KEEP_IMAGE_FAILURE_TITLE : ACTION_FAILURE_TITLE[action],
              toUserMessage(error, 'Try again in a moment.'),
            );
          }
        }
      } finally {
        if (isCurrent()) operationRef.current = null;
      }
    },
    [imageUrl, keep],
  );

  const handleLongPress = useCallback(() => {
    if (!lifetimeRef.current || operationRef.current) return;
    const available = viewerImageActions(imageUrl);
    const menu: { action: MenuAction; label: string }[] = [
      ...MENU_ACTIONS.filter((item) => available.has(item.action)),
      ...(keep ? [{ action: 'keep' as const, label: KEEP_IMAGE_LABEL }] : []),
    ];
    if (menu.length === 0) return;
    preferredImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    chooseImageAction(menu, (action) => void runAction(action), openImageMenu);
  }, [imageUrl, keep, openImageMenu, runAction]);

  const imageWidth = width ?? 280;
  const frame = inlineImageFrame(imageWidth, naturalRatio ?? parseMediaAspectRatio(aspectRatio));
  const settingsCaption = imageSettingsCaption(model, aspectRatio);

  const failed = sourceStatus === 'error' || loadState === 'error';
  const unavailableMessage =
    sourceStatus === 'signed-out'
      ? 'Sign in to view this generated image'
      : sourceStatus === 'invalid'
        ? 'Generated image unavailable'
        : failed
          ? 'Failed to load image'
          : null;

  if (unavailableMessage) {
    return (
      <View
        style={{
          width: imageWidth,
          height: imageWidth * 0.6,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          marginVertical: 6,
        }}
        accessibilityLabel={unavailableMessage}
      >
        <ImageOff size={28} color={colors.textMuted} />
        <Text
          style={{
            fontSize: typeScale.footnote,
            color: colors.textMuted,
          }}
        >
          {unavailableMessage}
        </Text>
        {failed && sourceStatus !== 'signed-out' && sourceStatus !== 'invalid' ? (
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

  if (sourceStatus === 'authorizing' || !source) {
    return (
      <View
        style={{
          width: frame.width,
          height: frame.height,
          borderRadius: 12,
          overflow: 'hidden',
          marginVertical: 6,
        }}
        accessibilityLabel="Loading generated image"
      >
        <Skeleton width={frame.width} height={frame.height} borderRadius={12} />
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 6 }}>
      <PressableBox
        onPress={onPress}
        onLongPress={handleLongPress}
        accessibilityLabel={revisedPrompt ?? 'Generated image'}
        accessibilityRole="image"
        accessibilityHint={
          onPress
            ? 'Tap to view full screen, long press to save or share'
            : 'Long press to save or share'
        }
      >
        {loadState === 'loading' && (
          <View
            style={{
              width: frame.width,
              height: frame.height,
              borderRadius: 12,
              overflow: 'hidden',
              position: 'absolute',
              zIndex: zIndex.content,
            }}
          >
            <Skeleton width={frame.width} height={frame.height} borderRadius={12} />
          </View>
        )}

        <View
          style={{
            opacity: loadState === 'loaded' ? 1 : 0,
          }}
        >
          <Image
            source={source}
            style={{
              width: frame.width,
              height: frame.height,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            contentFit="contain"
            transition={200}
            onLoad={handleLoad}
            onError={handleError}
            cachePolicy="memory"
            accessibilityLabel={revisedPrompt ?? 'Generated image'}
          />
        </View>
      </PressableBox>

      {revisedPrompt && loadState === 'loaded' ? (
        <Text
          style={{
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: colors.textMuted,
            marginTop: 6,
            paddingHorizontal: 2,
          }}
          numberOfLines={3}
        >
          {revisedPrompt}
        </Text>
      ) : null}

      {settingsCaption && loadState === 'loaded' ? (
        <Text
          testID="generated-image-caption"
          style={{
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: colors.textMuted,
            marginTop: spacing.xs,
            paddingHorizontal: 2,
          }}
          numberOfLines={1}
        >
          {settingsCaption}
        </Text>
      ) : null}
      <ActionMenuSheet menu={imageMenu.menu} dismissLabel="Dismiss image actions" />
    </View>
  );
}
