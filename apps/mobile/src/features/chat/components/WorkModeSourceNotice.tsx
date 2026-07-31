import { Plug } from 'lucide-react-native';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';

import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export function WorkModeSourceNotice({ onOpenConnectors }: { onOpenConnectors: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLabel="Work mode connected-source privacy"
      style={{
        width: '100%',
        maxWidth: 360,
        marginTop: 18,
        borderRadius: 14,
        padding: 14,
        gap: 9,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Plug size={17} color={colors.textSecondary} />
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
          Connected sources stay request-scoped
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
        Work mode uses connected services only after you ask. AGI does not scan repositories or
        accounts in the background to generate task suggestions.
      </Text>
      <Pressable
        onPress={onOpenConnectors}
        accessibilityRole="button"
        accessibilityLabel="Manage connected services"
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          minHeight: 36,
          justifyContent: 'center',
          borderRadius: 9,
          paddingHorizontal: 12,
          backgroundColor: colors.neutralSurface,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>
          Manage connected services
        </Text>
      </Pressable>
    </View>
  );
}
