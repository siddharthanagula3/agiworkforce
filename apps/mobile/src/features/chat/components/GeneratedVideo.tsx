/**
 * A completed generated video in the transcript.
 *
 * INLINE PLAYBACK IS NOT AVAILABLE YET. The app has no video playback
 * dependency — `expo-video`, `expo-av`, and `react-native-video` are all absent
 * from package.json — and adding one is a native module, so it needs a new
 * dev-client/EAS build rather than a JS change. Until that ships this renders
 * the provider's poster frame (or a placeholder) and opens the video in the
 * in-app browser on tap.
 *
 * The card says "Opens in browser" out loud rather than showing a play triangle
 * that silently does something else — a fake inline player is exactly the kind
 * of dead control the repo's rules forbid.
 */

import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { ExternalLink, Film } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';

export interface GeneratedVideoProps {
  videoUrl: string;
  thumbnailUrl?: string;
  width: number;
  prompt?: string;
}

export function GeneratedVideo({ videoUrl, thumbnailUrl, width, prompt }: GeneratedVideoProps) {
  const colors = useThemeColors();
  // 16:9 is the shape every supported provider returns; the poster is letterboxed
  // into it with contentFit="cover" rather than distorting a different ratio.
  const height = Math.round(width * (9 / 16));

  return (
    <View testID="generated-video" style={{ marginTop: 8, gap: 6 }}>
      <Pressable
        onPress={() => {
          void openExternalUrl(videoUrl);
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

        {/* Affordance overlay — states plainly where the tap goes. */}
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
            // Sits on top of an arbitrary poster frame, so it needs the same
            // over-media treatment the camera overlays use rather than a
            // surface token meant for the app background.
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
