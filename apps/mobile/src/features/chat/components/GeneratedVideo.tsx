import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Download, Film, Play, RotateCcw } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { prepareLocalVideoPlayer, shareFile, type LocalVideoPlayer } from '@/services/fileCreation';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { inlineImageFrame } from '@/src/features/image/inlineImageFrame';
import type { ReportTarget } from './ReportFlagButton';
import { VideoPlayerModal } from './VideoPlayerModal';

export interface GeneratedVideoProps {
  videoUrl: string;
  thumbnailUrl?: string;
  width: number;
  prompt?: string;
  reportTarget?: ReportTarget;
}

type LoadingAction = 'play' | 'save';

const DEFAULT_VIDEO_RATIO = 16 / 9;

export function GeneratedVideo(props: GeneratedVideoProps) {
  return <GeneratedVideoOwner key={props.videoUrl} {...props} />;
}

function GeneratedVideoOwner({
  videoUrl,
  thumbnailUrl,
  width,
  prompt,
  reportTarget,
}: GeneratedVideoProps) {
  const colors = useThemeColors();
  const [posterRatio, setPosterRatio] = useState<number | null>(null);
  const frame = inlineImageFrame(width, posterRatio ?? DEFAULT_VIDEO_RATIO);
  const { source: posterSource } = useGeneratedImageSource(thumbnailUrl ?? '', true);
  const [player, setPlayer] = useState<LocalVideoPlayer | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [loading, setLoading] = useState<LoadingAction | null>(null);
  const [playFailed, setPlayFailed] = useState(false);

  const lifetimeRef = useRef<symbol | null>(null);
  const operationRef = useRef<symbol | null>(null);

  useLayoutEffect(() => {
    const lifetime = Symbol('video lifetime');
    lifetimeRef.current = lifetime;
    return () => {
      if (lifetimeRef.current === lifetime) {
        lifetimeRef.current = null;
        operationRef.current = null;
      }
    };
  }, []);

  const runAction = useCallback(
    async (action: LoadingAction) => {
      const lifetime = lifetimeRef.current;
      if (!lifetime || operationRef.current) return;
      const operation = Symbol('video action');
      operationRef.current = operation;
      const isCurrent = () =>
        lifetimeRef.current === lifetime && operationRef.current === operation;
      setLoading(action);
      if (action === 'play') setPlayFailed(false);
      try {
        const prepared = player ?? (await prepareLocalVideoPlayer(videoUrl, colors.black));
        if (!isCurrent()) return;
        setPlayer(prepared);
        if (action === 'play') {
          setPlayerOpen(true);
        } else {
          await shareFile(prepared.videoUri, { isCurrent });
        }
      } catch {
        if (!isCurrent()) return;
        if (action === 'play') setPlayFailed(true);
        else Alert.alert('Could not save the video', 'Check your connection and try again.');
      } finally {
        if (isCurrent()) {
          operationRef.current = null;
          setLoading(null);
        }
      }
    },
    [colors.black, player, videoUrl],
  );

  const play = useCallback(() => runAction('play'), [runAction]);
  const save = useCallback(() => runAction('save'), [runAction]);

  const closePlayer = useCallback(() => setPlayerOpen(false), []);
  const handlePlaybackError = useCallback(() => {
    setPlayerOpen(false);
    setPlayer(null);
    setPlayFailed(true);
  }, []);

  return (
    <View testID="generated-video" style={{ marginTop: 8, gap: 6 }}>
      <Pressable
        onPress={() => void play()}
        disabled={loading !== null}
        accessibilityRole="button"
        accessibilityLabel={
          playFailed
            ? 'Video could not play. Retry'
            : prompt
              ? `Play generated video: ${prompt}`
              : 'Play generated video'
        }
        accessibilityState={{ busy: loading === 'play' }}
        style={{
          width: frame.width,
          height: frame.height,
          borderRadius: radii.lg,
          overflow: 'hidden',
          backgroundColor: colors.neutralSurface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {posterSource ? (
          <Image
            testID="generated-video-poster"
            source={posterSource}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={200}
            cachePolicy="memory"
            onLoad={(event) => {
              const { width: posterWidth, height: posterHeight } = event.source;
              if (posterWidth > 0 && posterHeight > 0) setPosterRatio(posterWidth / posterHeight);
            }}
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
            <LoadingIndicator size="small" />
          ) : playFailed ? (
            <RotateCcw size={13} color={colors.cameraOverlayText} />
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
            {loading === 'play' ? 'Loading' : playFailed ? 'Retry' : 'Play'}
          </Text>
        </View>
      </Pressable>

      {playFailed ? (
        <View
          testID="generated-video-failed"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
        >
          <AlertCircle size={14} color={colors.agentError} />
          <Text style={{ flex: 1, fontSize: typeScale.caption, color: colors.agentError }}>
            The video could not play. Retry, or Save to open it in another app.
          </Text>
        </View>
      ) : null}

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
            <LoadingIndicator size="small" />
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
        reportTarget={reportTarget}
        onPlaybackError={handlePlaybackError}
        onSave={() => void save()}
        saving={loading === 'save'}
      />
    </View>
  );
}

export default GeneratedVideo;
