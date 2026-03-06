import { useState, useCallback } from 'react';
import { View, Pressable, Share } from 'react-native';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { colors } from '@/lib/theme';

interface GeneratedImageProps {
  imageUrl: string;
  revisedPrompt?: string;
  width?: number;
  onPress?: () => void;
}

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * Inline image display component for chat messages.
 * Shows a generated image with rounded corners, optional revised prompt,
 * long-press share, and fade-in animation on load.
 */
export function GeneratedImage({ imageUrl, revisedPrompt, width, onPress }: GeneratedImageProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const handleLoad = useCallback(() => {
    setLoadState('loaded');
  }, []);

  const handleError = useCallback(() => {
    setLoadState('error');
  }, []);

  const handleLongPress = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ url: imageUrl, message: revisedPrompt ?? '' });
    } catch {
      // User cancelled or share failed silently
    }
  }, [imageUrl, revisedPrompt]);

  const imageWidth = width ?? 280;
  const imageHeight = imageWidth; // Default to square aspect ratio

  // Error state
  if (loadState === 'error') {
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
        accessibilityLabel="Failed to load generated image"
      >
        <ImageOff size={28} color={colors.textMuted} />
        <Text
          style={{
            fontSize: 13,
            color: colors.textMuted,
          }}
        >
          Failed to load image
        </Text>
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
            source={{ uri: imageUrl }}
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
            cachePolicy="memory-disk"
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
