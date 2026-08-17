import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { AlertCircle, Film, Square } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export interface VideoGenProgressProps {
  prompt: string;
  progress?: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  errorMessage?: string;
  onStop?: () => void;
  stopping?: boolean;
  stopError?: string;
}

const STATUS_LABEL: Record<VideoGenProgressProps['status'], string> = {
  queued: 'Queued with the provider…',
  processing: 'Generating video…',
  completed: 'Video ready',
  failed: 'Video generation failed',
  timeout: 'Video generation timed out',
  cancelled: 'Video generation stopped',
};

export function VideoGenProgress({
  prompt,
  progress,
  status,
  errorMessage,
  onStop,
  stopping,
  stopError,
}: VideoGenProgressProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const isError = status === 'failed' || status === 'timeout';
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isError || reducedMotion) {
      pulse.value = withTiming(1, { duration: 200 });
      return;
    }
    pulse.value = withRepeat(withTiming(0.45, { duration: 1000 }), -1, true);
  }, [isError, reducedMotion, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      testID="video-gen-progress"
      entering={reducedMotion ? undefined : FadeInDown.duration(200)}
      style={{
        marginTop: 8,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isError ? colors.dangerBorder : colors.border,
        backgroundColor: isError ? colors.dangerSurface : colors.surfaceBase,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Animated.View style={isError ? undefined : pulseStyle}>
          {isError ? (
            <AlertCircle size={16} color={colors.agentError} />
          ) : (
            <Film size={16} color={colors.textMuted} />
          )}
        </Animated.View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: isError ? colors.agentError : colors.textPrimary,
          }}
        >
          {STATUS_LABEL[status]}
        </Text>
        {progress !== undefined && !isError ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{Math.round(progress)}%</Text>
        ) : null}
      </View>

      <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={2}>
        {isError ? (errorMessage ?? 'Something went wrong.') : prompt}
      </Text>

      {/* Determinate bar only when the provider actually reported a number —
          a fake moving bar would misrepresent an unknown wait. */}
      {progress !== undefined && !isError ? (
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.neutralSurface,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: 3,
              borderRadius: 2,
              width: `${Math.max(0, Math.min(100, progress))}%`,
              backgroundColor: colors.teal,
            }}
          />
        </View>
      ) : null}

      {!isError ? (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>
          This usually takes a minute or two. You can keep using the app.
        </Text>
      ) : null}

      {onStop && !isError ? (
        <Pressable
          testID="video-gen-stop"
          onPress={onStop}
          disabled={stopping === true}
          accessibilityRole="button"
          accessibilityState={{ disabled: stopping === true }}
          accessibilityLabel="Stop generating this video"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: stopping === true ? 0.6 : 1,
          }}
        >
          <Square size={11} color={colors.textSecondary} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
            {stopping === true ? 'Stopping…' : 'Stop generating'}
          </Text>
        </Pressable>
      ) : null}

      {stopError ? (
        <Text
          testID="video-gen-stop-error"
          accessibilityRole="alert"
          style={{ fontSize: 11, color: colors.agentError }}
        >
          Could not stop this generation: {stopError}
        </Text>
      ) : null}
    </Animated.View>
  );
}

export default VideoGenProgress;
