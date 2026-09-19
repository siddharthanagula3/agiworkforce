import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

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
            fontSize: 12,
            fontWeight: '600',
            marginBottom: 8,
            paddingHorizontal: 2,
          }}
        >
          {title}
        </Text>
        {controls.map(({ key, label, icon: Icon, onPress }) => (
          <Pressable
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
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
