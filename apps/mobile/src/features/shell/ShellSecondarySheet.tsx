import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import type { LucideIcon } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export interface ShellSecondaryControl {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}

/** The shell's secondary controls live in the native sheet, never in a menu. */
export function ShellSecondarySheet({
  title,
  controls,
  onClose,
}: {
  title: string;
  controls: readonly ShellSecondaryControl[];
  onClose: () => void;
}) {
  const colors = useThemeColors();

  return (
    <BottomSheet index={0} snapPoints={['40%']} onClose={onClose}>
      <View testID="shell.secondary-sheet" style={{ paddingHorizontal: 14, paddingBottom: 24 }}>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            fontWeight: '600',
            marginBottom: 8,
            paddingHorizontal: 2,
          }}
        >
          {title}
        </Text>
        {controls.map(({ key, label, icon: Icon, onPress }) => (
          <PressableBox
            key={key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{
              minHeight: 44,
              borderRadius: 10,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Icon size={19} color={colors.textSecondary} strokeWidth={1.8} />
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>{label}</Text>
          </PressableBox>
        ))}
      </View>
    </BottomSheet>
  );
}
