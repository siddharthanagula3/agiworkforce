import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useThemeColors } from '@/src/ui/theme';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';

const UNAVAILABLE: ReadonlySet<string> = new Set(['signed-out', 'invalid', 'error']);
const DEFAULT_RATIO = 4 / 3;

export function StoredImageView({
  path,
  label,
  fit = 'contain',
  style,
}: {
  path: string;
  label: string;
  fit?: 'contain' | 'cover';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const onDevice = path.startsWith('file://');
  const stored = useGeneratedImageSource(onDevice ? '' : path, false);
  const source = onDevice ? { uri: path } : stored.source;
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const unavailable = failed || (!onDevice && UNAVAILABLE.has(stored.status));

  return (
    <View
      testID="stored-image"
      accessible
      accessibilityRole="image"
      accessibilityLabel={unavailable ? `${label}, image unavailable` : label}
      style={[
        {
          width: '100%',
          aspectRatio: ratio ?? DEFAULT_RATIO,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ratio ? colors.transparent : colors.surfaceElevated,
        },
        style,
      ]}
    >
      {unavailable ? (
        <ImageOff size={20} color={colors.textMuted} />
      ) : source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit={fit}
          transition={200}
          onLoad={(event) => {
            const { width, height } = event.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}
