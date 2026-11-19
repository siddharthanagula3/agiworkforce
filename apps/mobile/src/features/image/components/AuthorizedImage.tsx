import { useEffect, useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';

interface AuthorizedImageProps {
  uri: string;
  style: StyleProp<ImageStyle>;
  recyclingKey?: string;
  name?: string;
  onUnavailableChange?: (unavailable: boolean) => void;
}

const UNAVAILABLE_STATUSES: ReadonlySet<string> = new Set(['signed-out', 'invalid', 'error']);

const UNAVAILABLE_TEXT_SCALE_LIMIT = 1;

export function AuthorizedImage(props: AuthorizedImageProps) {
  return <AuthorizedImageOwner key={props.uri} {...props} />;
}

// A file kept in AGI Cloud is served only to its signed-in owner, so its image
// request carries the session's headers. A file still on the device is read
// straight from its local path.
function AuthorizedImageOwner({
  uri,
  style,
  recyclingKey,
  name,
  onUnavailableChange,
}: AuthorizedImageProps) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const stored = resolveGeneratedImageUri(uri) !== null;
  const { source, status } = useGeneratedImageSource(uri, false);
  const imageSource = stored ? source : { uri };
  const unavailable = failed || (stored && UNAVAILABLE_STATUSES.has(status));
  const label = name?.trim();

  useEffect(() => {
    onUnavailableChange?.(unavailable);
  }, [unavailable, onUnavailableChange]);

  return (
    <View
      testID="authorized-image"
      style={[
        style,
        {
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: loaded ? undefined : colors.surfaceElevated,
        },
      ]}
    >
      {unavailable ? (
        <View
          accessible
          accessibilityLabel={label ? `${label}, image unavailable` : 'Image unavailable'}
          style={{ alignItems: 'center', gap: spacing.xs }}
        >
          <ImageOff size={20} color={colors.textMuted} />
          {label ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={UNAVAILABLE_TEXT_SCALE_LIMIT}
              style={{ fontSize: typeScale.caption, color: colors.textMuted, maxWidth: '100%' }}
            >
              {label}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={UNAVAILABLE_TEXT_SCALE_LIMIT}
            style={{ fontSize: typeScale.caption, color: colors.textMuted, maxWidth: '100%' }}
          >
            Unavailable
          </Text>
        </View>
      ) : imageSource ? (
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          {...(recyclingKey ? { recyclingKey } : {})}
        />
      ) : null}
    </View>
  );
}
