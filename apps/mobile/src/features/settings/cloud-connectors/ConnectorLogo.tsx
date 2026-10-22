import { View } from 'react-native';
import { Plug } from 'lucide-react-native';
import { useThemeColors } from '@/src/ui/theme';

export function ConnectorLogo({ size = 40 }: { size?: number }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        backgroundColor: colors.neutralSurface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Plug size={Math.round(size / 2)} color={colors.textSecondary} />
    </View>
  );
}
