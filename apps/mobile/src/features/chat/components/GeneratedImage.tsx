import { useState, useCallback, useEffect } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors } from '@/src/ui/theme';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { shareGeneratedImage } from '@/services/fileCreation';

interface GeneratedImageProps {
  imageUrl: string;
  revisedPrompt?: string;
  width?: number;
  onPress?: () => void;
  /** Display-only fallback for an API response explicitly marked persisted:false. */
  allowEphemeral?: boolean;
}

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * Inline image display component for chat messages.
 * Shows a generated image with rounded corners, optional revised prompt,
 * long-press share, and fade-in animation on load.
 */
export function GeneratedImage({
  imageUrl,
  revisedPrompt,
  width,
  onPress,
  allowEphemeral = false,
}: GeneratedImageProps) {
  const colors = useThemeColors();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const { source, status: sourceStatus } = useGeneratedImageSource(imageUrl, allowEphemeral);

  useEffect(() => {
    setLoadState('loading');
  }, [source?.uri]);

  const handleLoad = useCallback(() => {
    setLoadState('loaded');
  }, []);

  const handleError = useCallback(() => {
    setLoadState('error');
  }, []);

  const handleLongPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await shareGeneratedImage(imageUrl);
    } catch (error) {
      Alert.alert(
        'Could not share image',
        error instanceof Error ? error.message : 'Save the image and try again.',
      );
    }
  }, [imageUrl]);

  const imageWidth = width ?? 280;
  const imageHeight = imageWidth; // Default to square aspect ratio

  const unavailableMessage =
    sourceStatus === 'signed-out'
      ? 'Sign in to view this generated image'
      : sourceStatus === 'invalid'
        ? 'Generated image unavailable'
        : sourceStatus === 'error' || loadState === 'error'
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
          gap: 8,
          marginVertical: 6,
        }}
        accessibilityLabel={unavailableMessage}
      >
        <ImageOff size={28} color={colors.textMuted} />
        <Text
          style={{
            fontSize: 13,
            color: colors.textMuted,
          }}
        >
          {unavailableMessage}
        </Text>
      </View>
    );
  }

  if (sourceStatus === 'authorizing' || !source) {
    return (
      <View
        style={{
          width: imageWidth,
          height: imageHeight,
          borderRadius: 12,
          overflow: 'hidden',
          marginVertical: 6,
        }}
        accessibilityLabel="Loading generated image"
      >
        <Skeleton width={imageWidth} height={imageHeight} borderRadius={12} />
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 6 }}>
      <Pressable
        onPress={onPress}
        onLongPress={handleLongPress}
        accessibilityLabel={revisedPrompt ?? 'Generated image'}
        accessibilityRole="image"
        accessibilityHint="Tap to view full screen, long press to share"
      >
        {/* Loading skeleton */}
        {loadState === 'loading' && (
          <View
            style={{
              width: imageWidth,
              height: imageHeight,
              borderRadius: 12,
              overflow: 'hidden',
              position: 'absolute',
              zIndex: 1,
            }}
          >
            <Skeleton width={imageWidth} height={imageHeight} borderRadius={12} />
          </View>
        )}

        {/* Image — opacity controlled by loadState, expo-image handles its own transition */}
        <View
          style={{
            opacity: loadState === 'loaded' ? 1 : 0,
          }}
        >
          <Image
            source={source}
            style={{
              width: imageWidth,
              height: imageHeight,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            contentFit="cover"
            transition={200}
            onLoad={handleLoad}
            onError={handleError}
            cachePolicy="memory"
            accessibilityLabel={revisedPrompt ?? 'Generated image'}
          />
        </View>
      </Pressable>

      {/* Revised prompt text */}
      {revisedPrompt && loadState === 'loaded' ? (
        <Text
          style={{
            fontSize: 12,
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
    </View>
  );
}
