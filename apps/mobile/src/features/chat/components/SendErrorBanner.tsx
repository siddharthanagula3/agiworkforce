import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { AlertTriangle, RotateCcw, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  freeCapacityCountdownMessage,
  freeCapacityRetrySeconds,
  type FreeCapacityErrorState,
} from '@/src/features/chat/utils/freeCapacityRecovery';

const COUNTDOWN_TICK_MS = 1_000;

interface SendErrorBannerProps {
  error: string | null;
  freeCapacity?: FreeCapacityErrorState | null;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function SendErrorBanner({
  error,
  freeCapacity = null,
  onRetry,
  onDismiss,
}: SendErrorBannerProps) {
  const colors = useThemeColors();
  const retryAtMs = freeCapacity?.retryAtMs ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const startMs = Date.now();
    setNowMs(startMs);
    if (freeCapacityRetrySeconds(retryAtMs, startMs) === 0) return;
    const timer = setInterval(() => {
      const tickMs = Date.now();
      setNowMs(tickMs);
      if (freeCapacityRetrySeconds(retryAtMs, tickMs) === 0) clearInterval(timer);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [retryAtMs]);

  if (!error) return null;

  const retrySeconds = freeCapacityRetrySeconds(retryAtMs, nowMs);
  const waitingForCapacity = retrySeconds > 0;
  const message = waitingForCapacity ? freeCapacityCountdownMessage(retrySeconds) : error;
  const retryColor = waitingForCapacity ? colors.textMuted : colors.agentError;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: colors.dangerSurface,
        borderTopWidth: 1,
        borderTopColor: colors.dangerBorder,
        gap: 8,
      }}
      accessibilityRole="alert"
      accessibilityLabel={`Message failed to send: ${message}`}
    >
      <AlertTriangle size={14} color={colors.agentError} strokeWidth={2} />
      <Text
        style={{ fontSize: 12, color: colors.agentError, fontWeight: '500', flex: 1 }}
        numberOfLines={2}
      >
        {message}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          disabled={waitingForCapacity}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          accessibilityLabel="Retry sending message"
          accessibilityRole="button"
          accessibilityState={{ disabled: waitingForCapacity }}
        >
          <RotateCcw size={13} color={retryColor} strokeWidth={2} />
          <Text style={{ fontSize: 12, color: retryColor, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss error"
        accessibilityRole="button"
      >
        <X size={14} color={colors.agentError} />
      </Pressable>
    </View>
  );
}
