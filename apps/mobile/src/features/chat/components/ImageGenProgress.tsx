import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useRecyclingState } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { ImagePlus, AlertCircle, Square } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { formatResearchElapsed } from '@/src/features/chat/utils/researchRunState';
import { parseMediaAspectRatio } from '@agiworkforce/types';
import { inlineImageFrame } from '@/src/features/image/inlineImageFrame';

const FRAME_MIN_HEIGHT = 132;

const TICK_MS = 1000;

interface ImageGenProgressProps {
  prompt: string;
  progress?: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
  onRetry?: () => void;
  onStop?: () => void;
  startedAt?: number;
  retryAt?: number;
  aspectRatio?: string;
  width?: number;
}

export function ImageGenProgress({
  prompt,
  progress,
  status,
  errorMessage,
  onRetry,
  onStop,
  startedAt,
  retryAt,
  aspectRatio,
  width,
}: ImageGenProgressProps) {
  const colors = useThemeColors();
  const [now, setNow] = useState(() => Date.now());
  const [startTime] = useRecyclingState(() => startedAt ?? Date.now(), [startedAt]);
  const waitingToRetry = status === 'failed' && retryAt !== undefined && retryAt > now;
  const ticking = status === 'pending' || status === 'generating' || waitingToRetry;

  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'pending') {
      pulseOpacity.value = withRepeat(withTiming(0.4, { duration: motion.pulse }), -1, true);
    } else {
      pulseOpacity.value = withTiming(1, { duration: motion.quick });
    }
  }, [status, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const barWidth = useSharedValue(0);

  useEffect(() => {
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      barWidth.value = withTiming(Math.min(100, Math.max(0, progress)), {
        duration: motion.moved,
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

  const requestedRatio = parseMediaAspectRatio(aspectRatio);
  const frame = width === undefined ? null : inlineImageFrame(width, requestedRatio);
  const frameStyle = isFailed
    ? null
    : {
        justifyContent: 'center' as const,
        ...(frame
          ? { width: frame.width, minHeight: Math.max(frame.height, FRAME_MIN_HEIGHT) }
          : { aspectRatio: requestedRatio ?? 1, minHeight: FRAME_MIN_HEIGHT }),
      };

  return (
    <Animated.View entering={FadeInDown.duration(motion.moved).springify()}>
      <View
        style={{
          ...frameStyle,
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
                fontSize: typeScale.subhead,
                fontWeight: '600',
                color: isFailed ? colors.agentError : colors.textPrimary,
              }}
            >
              {isFailed ? 'Image Generation Failed' : 'Generating Image\u2026'}
            </Text>
          </View>

          {isFailed ? null : (
            <Text
              testID="image-gen-elapsed"
              accessibilityLabel={`Running for ${formatResearchElapsed(now - startTime)}`}
              style={{ fontSize: typeScale.caption, color: colors.textMuted }}
            >
              {formatResearchElapsed(now - startTime)}
            </Text>
          )}
          {status === 'generating' && <LoadingIndicator accessible={false} size={16} />}
        </View>

        <Text
          style={{
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: colors.textSecondary,
          }}
          numberOfLines={2}
        >
          {prompt}
        </Text>

        {isPending && (
          <Animated.View style={pulseStyle}>
            <Text
              style={{
                fontSize: typeScale.caption,
                color: colors.textMuted,
              }}
            >
              Queued...
            </Text>
          </Animated.View>
        )}

        {status === 'generating' && normalizedProgress !== undefined && (
          <View style={{ gap: 6 }}>
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

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.caption,
                  color: colors.textMuted,
                }}
              >
                {Math.round(normalizedProgress)}% complete
              </Text>
            </View>
          </View>
        )}

        {status === 'generating' && !hasDeterminateProgress ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            Generating securely in AGI Cloud…
          </Text>
        ) : null}

        {onStop && !isFailed ? (
          <PressableBox
            testID="image-gen-stop"
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel="Stop generating this image"
            hitSlop={{ top: 6, bottom: 6 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 6,
              minHeight: 32,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Square size={11} color={colors.textSecondary} />
            <Text
              style={{
                fontSize: typeScale.caption,
                fontWeight: '600',
                color: colors.textSecondary,
              }}
            >
              Stop generating
            </Text>
          </PressableBox>
        ) : null}

        {isFailed && (
          <View style={{ gap: 8 }}>
            {errorMessage ? (
              <Text
                style={{
                  fontSize: typeScale.caption,
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
                title={
                  waitingToRetry
                    ? `Retry in ${formatResearchElapsed(Math.ceil(((retryAt ?? now) - now) / TICK_MS) * TICK_MS)}`
                    : 'Retry'
                }
                variant="outline"
                size="sm"
                disabled={waitingToRetry}
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
