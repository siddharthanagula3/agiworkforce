import { View } from 'react-native';

import { projectAccentHex, projectIcon } from '@/src/features/projects/projectAppearance';
import { useThemeColors } from '@/src/ui/theme';

export function AgentAvatar({
  icon,
  accentColor,
  size = 40,
}: {
  icon: string;
  accentColor: string;
  size?: number;
}) {
  const colors = useThemeColors();
  const Icon = projectIcon(icon);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.neutralSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon
        size={Math.round(size * 0.48)}
        color={projectAccentHex(accentColor) ?? colors.textPrimary}
      />
    </View>
  );
}
