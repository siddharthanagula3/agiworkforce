import { useState, useCallback, useEffect } from 'react';
import { View, Alert } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors, zIndex } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { shareGeneratedImage } from '@/services/fileCreation';

interface GeneratedImageProps {
  imageUrl: string;
  revisedPrompt?: string;
  width?: number;
  onPress?: () => void;
  allowEphemeral?: boolean;
}

type LoadState = 'loading' | 'loaded' | 'error';

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
    } catch {
      Alert.alert('Could not share image', 'Save the image and try again.');
    }
  }, [imageUrl]);

  const imageWidth = width ?? 280;
  const imageHeight = imageWidth;

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
            fontSize: typeScale.footnote,
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
      <PressableBox
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
              zIndex: zIndex.content,
            }}
          >
            <Skeleton width={imageWidth} height={imageHeight} borderRadius={12} />
          </View>
        )}

        {/* Image, opacity controlled by loadState, expo-image handles its own transition */}
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
      </PressableBox>

      {/* Revised prompt text */}
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
    </View>
  );
}
