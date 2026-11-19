import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function StorageScopeNotice() {
  const colors = useThemeColors();

  return (
    <Text
      testID="storage-scope-notice"
      style={{ color: colors.textSecondary, fontSize: typeScale.caption, lineHeight: 18 }}
    >
      Totals cover only downloaded models and cache on this device.
    </Text>
  );
}
