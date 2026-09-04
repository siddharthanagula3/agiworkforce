import { Alert, View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { ExternalLink, Film } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { openInAppBrowser } from '@/lib/safeOpenURL';

export interface GeneratedVideoProps {
  videoUrl: string;
  thumbnailUrl?: string;
  width: number;
  prompt?: string;
}

export function GeneratedVideo({ videoUrl, thumbnailUrl, width, prompt }: GeneratedVideoProps) {
  const colors = useThemeColors();
  const height = Math.round(width * (9 / 16));

  return (
    <View testID="generated-video" style={{ marginTop: 8, gap: 6 }}>
      <Pressable
        onPress={() => {
          void (async () => {
            // The generated video is auth-gated, so it has to open in the
            // in-app browser, which carries the session. The system browser
            // would 401, and before the URL was resolved to an absolute one,
            // the allowlist refused it outright and the tap did nothing at all.
            const opened = await openInAppBrowser(videoUrl);
            if (!opened) {
              Alert.alert('Could not open the video', 'Try again from your library.');
            }
          })();
        }}
        accessibilityRole="button"
        accessibilityLabel={
          prompt ? `Open generated video: ${prompt}` : 'Open generated video in browser'
        }
        accessibilityHint="Opens the video in the in-app browser"
        style={{
          width,
          height,
          borderRadius: radii.lg,
          overflow: 'hidden',
          backgroundColor: colors.neutralSurface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Film size={28} color={colors.textMuted} />
        )}

        {/* Affordance overlay, states plainly where the tap goes. */}
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: colors.cameraOverlaySurfaceStrong,
          }}
        >
          <ExternalLink size={13} color={colors.cameraOverlayText} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.cameraOverlayText }}>
            Open in browser
          </Text>
        </View>
      </Pressable>

      {prompt ? (
        <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={2}>
          {prompt}
        </Text>
      ) : null}
    </View>
  );
}

export default GeneratedVideo;
