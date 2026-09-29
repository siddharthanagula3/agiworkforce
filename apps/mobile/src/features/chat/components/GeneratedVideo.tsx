import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Image } from 'expo-image';
import { Download, Film, Play } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { prepareLocalVideoPlayer, shareFile, type LocalVideoPlayer } from '@/services/fileCreation';
import { VideoPlayerModal } from './VideoPlayerModal';

export interface GeneratedVideoProps {
  videoUrl: string;
  thumbnailUrl?: string;
  width: number;
  prompt?: string;
}

type LoadingAction = 'play' | 'save';

export function GeneratedVideo({ videoUrl, thumbnailUrl, width, prompt }: GeneratedVideoProps) {
  const colors = useThemeColors();
  const height = Math.round(width * (9 / 16));
  const [player, setPlayer] = useState<LocalVideoPlayer | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingAction | null>(null);

  const ensurePlayer = useCallback(async (): Promise<LocalVideoPlayer> => {
    if (player) return player;
    const prepared = await prepareLocalVideoPlayer(videoUrl, colors.black);
    setPlayer(prepared);
    return prepared;
  }, [colors.black, player, videoUrl]);

  const play = useCallback(async () => {
    if (loading) return;
    setLoading('play');
    try {
      await ensurePlayer();
      setPlayerOpen(true);
    } catch {
      Alert.alert('Could not play the video', 'Check your connection and try again.');
    } finally {
      setLoading(null);
    }
  }, [ensurePlayer, loading]);

  const save = useCallback(async () => {
    if (loading) return;
    setLoading('save');
    try {
      const prepared = await ensurePlayer();
      await shareFile(prepared.videoUri);
    } catch {
      Alert.alert('Could not save the video', 'Check your connection and try again.');
    } finally {
      setLoading(null);
    }
  }, [ensurePlayer, loading]);

  const closePlayer = useCallback(() => setPlayerOpen(false), []);

  return (
    <View testID="generated-video" style={{ marginTop: 8, gap: 6 }}>
      <Pressable
        onPress={() => void play()}
        disabled={loading !== null}
        accessibilityRole="button"
        accessibilityLabel={prompt ? `Play generated video: ${prompt}` : 'Play generated video'}
        accessibilityState={{ busy: loading === 'play' }}
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
          {loading === 'play' ? (
            <ActivityIndicator size="small" color={colors.cameraOverlayText} />
          ) : (
            <Play size={13} color={colors.cameraOverlayText} />
          )}
          <Text
            style={{
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.cameraOverlayText,
            }}
          >
            {loading === 'play' ? 'Loading' : 'Play'}
          </Text>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {prompt ? (
          <Text
            style={{ flex: 1, fontSize: typeScale.caption, color: colors.textMuted }}
            numberOfLines={2}
          >
            {prompt}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          onPress={() => void save()}
          disabled={loading !== null}
          accessibilityRole="button"
          accessibilityLabel="Save video"
          accessibilityHint="Downloads the video and opens the share sheet"
          accessibilityState={{ busy: loading === 'save' }}
          style={{
            minHeight: 44,
            minWidth: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: loading !== null && loading !== 'save' ? 0.55 : 1,
          }}
        >
          {loading === 'save' ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Download size={15} color={colors.textSecondary} />
          )}
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textSecondary }}
          >
            Save
          </Text>
        </Pressable>
      </View>

      <VideoPlayerModal
        player={player}
        visible={playerOpen}
        onClose={closePlayer}
        label={prompt ? `Video: ${prompt}` : 'Generated video'}
        failureHint="Try Save to open it in another app."
      />
    </View>
  );
}

export default GeneratedVideo;
