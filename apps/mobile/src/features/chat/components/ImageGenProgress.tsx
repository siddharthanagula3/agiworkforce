import { useEffect } from 'react';
import { View } from 'react-native';
import { ImagePlus, AlertCircle, Loader2 } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';

interface ImageGenProgressProps {
  prompt: string;
  /** Real server-reported percentage. Omit for an indeterminate operation. */
  progress?: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  estimatedTime?: number; // seconds
  errorMessage?: string;
  onRetry?: () => void;
}

/**
 * Image generation progress indicator shown in the chat thread
 * while an image is being generated. Replaces itself with
 * GeneratedImage on completion (handled by parent).
 */
export function ImageGenProgress({
  prompt,
  progress,
  status,
  estimatedTime,
  errorMessage,
  onRetry,
}: ImageGenProgressProps) {
  const colors = useThemeColors();

  // Pulsing animation for "pending" state
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'pending') {
      pulseOpacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [status, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Animated progress bar width
  const barWidth = useSharedValue(0);

  useEffect(() => {
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      barWidth.value = withTiming(Math.min(100, Math.max(0, progress)), {
        duration: 400,
      });
    }
  }, [progress, barWidth]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const isFailed = status === 'failed';
  const isPending = status === 'pending';
  const hasDeterminateProgress =
    status === 'generating' && typeof progress === 'number' && Number.isFinite(progress);
  const normalizedProgress = hasDeterminateProgress
    ? Math.min(100, Math.max(0, progress))
    : undefined;

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <View
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isFailed ? colors.dangerBorder : colors.border,
          padding: 14,
          marginVertical: 6,
          gap: 10,
        }}
        accessibilityLabel={`Image generation ${status}`}
        accessibilityRole="progressbar"
        accessibilityValue={
          normalizedProgress === undefined
            ? { text: isFailed ? 'Failed' : 'In progress' }
            : { min: 0, max: 100, now: normalizedProgress }
        }
      >
        {/* Header row: icon + title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isFailed ? (
            <AlertCircle size={20} color={colors.agentError} />
          ) : isPending ? (
            <Animated.View style={pulseStyle}>
              <ImagePlus size={20} color={colors.agentThinking} />
            </Animated.View>
          ) : (
            <ImagePlus size={20} color={colors.agentThinking} />
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: isFailed ? colors.agentError : colors.textPrimary,
              }}
            >
              {isFailed ? 'Image Generation Failed' : 'Generating Image\u2026'}
            </Text>
          </View>

          {/* Spinner for active generation */}
          {status === 'generating' && <Loader2 size={16} color={colors.textMuted} />}
        </View>

        {/* Prompt preview */}
        <Text
          style={{
            fontSize: 12,
            lineHeight: 17,
            color: colors.textSecondary,
          }}
          numberOfLines={2}
        >
          {prompt}
        </Text>

        {/* Pending state */}
        {isPending && (
          <Animated.View style={pulseStyle}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              Queued...
            </Text>
          </Animated.View>
        )}

        {/* Generating state: progress bar + stats */}
        {status === 'generating' && normalizedProgress !== undefined && (
          <View style={{ gap: 6 }}>
            {/* Progress bar */}
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.progressTrack,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={[
                  {
                    height: '100%',
                    borderRadius: 2,
                    backgroundColor: colors.teal,
                  },
                  barStyle,
                ]}
              />
            </View>

            {/* Progress text */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                }}
              >
                {Math.round(normalizedProgress)}% complete
              </Text>

              {estimatedTime != null && estimatedTime > 0 ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.textMuted,
                  }}
                >
                  ~{estimatedTime}s remaining
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {status === 'generating' && !hasDeterminateProgress ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            Generating securely in AGI Cloud…
          </Text>
        ) : null}

        {/* Failed state: error message + retry button */}
        {isFailed && (
          <View style={{ gap: 8 }}>
            {errorMessage ? (
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.agentError,
                }}
                numberOfLines={3}
              >
                {errorMessage}
              </Text>
            ) : null}

            {onRetry ? (
              <Button
                title="Retry"
                variant="outline"
                size="sm"
                onPress={onRetry}
                className="self-start"
              />
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
