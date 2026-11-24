import { View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { spacing, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { EDGE_COPY } from './copy';

export function OfflineBanner() {
  const colors = useThemeColors();
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  if (isOnline) return null;

  return (
    <View
      style={{
        backgroundColor: colors.teal,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        gap: spacing.sm,
      }}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={EDGE_COPY.offline.banner}
      accessibilityLiveRegion="polite"
    >
      <WifiOff size={14} color={colors.accentText} strokeWidth={2} />
      <Text
        style={{
          color: colors.accentText,
          fontSize: typeScale.caption,
          fontWeight: '600',
          flexShrink: 1,
          textAlign: 'center',
        }}
      >
        {EDGE_COPY.offline.banner}
      </Text>
    </View>
  );
}
