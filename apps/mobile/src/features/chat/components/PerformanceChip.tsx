// On-device performance chip. Renders the measured decode rate (tokens/sec)
// under a completed local-model reply. Shows nothing when no measured value is
// available (e.g. cloud replies, or a single-token response).

import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type RuntimeTier = 'local' | 'cloud' | 'Tier 1' | 'Tier 2' | 'Tier 3';

export interface PerformanceChipProps {
  model?: string;
  tier?: string | undefined;
  ttftMs?: number;
  totalMs?: number;
  tokensPerSecond?: number | undefined;
  firstTokenLatencyMs?: number | undefined;
  modelId?: string;
}

export function PerformanceChip({ tokensPerSecond }: PerformanceChipProps): ReactElement | null {
  const colors = useThemeColors();
  if (tokensPerSecond === undefined || tokensPerSecond <= 0) return null;
  return (
    <View
      testID="performance-chip"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
      accessibilityLabel={`Decode speed ${tokensPerSecond} tokens per second`}
    >
      <Zap size={11} color={colors.textMuted} strokeWidth={2} />
      <Text style={{ fontSize: 11, color: colors.textMuted }}>{tokensPerSecond} tok/s</Text>
    </View>
  );
}

export default PerformanceChip;
