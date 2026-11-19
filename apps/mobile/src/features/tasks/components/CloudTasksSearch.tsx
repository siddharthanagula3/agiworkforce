import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { MANAGED_CLOUD_AGENT_RUN_SEARCH_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  FLOATING_PRIMARY_ACTION_GAP,
  FLOATING_PRIMARY_ACTION_HEIGHT,
} from '@/src/shared/components/FloatingPrimaryAction';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const CLOUD_TASKS_SEARCH_LABEL = 'Search Cloud tasks';
const SEARCH_BUTTON_SIZE = 44;

export function CloudTasksSearchButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={CLOUD_TASKS_SEARCH_LABEL}
      style={({ pressed }) => ({
        position: 'absolute',
        left: 18,
        bottom:
          insets.bottom +
          FLOATING_PRIMARY_ACTION_GAP +
          (FLOATING_PRIMARY_ACTION_HEIGHT - SEARCH_BUTTON_SIZE) / 2,
        width: SEARCH_BUTTON_SIZE,
        height: SEARCH_BUTTON_SIZE,
        borderRadius: SEARCH_BUTTON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Search size={20} color={colors.textPrimary} />
    </PressableBox>
  );
}

export function CloudTasksSearchField({
  value,
  onChangeText,
  onCancel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onCancel: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 44,
          borderRadius: 22,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Search size={17} color={colors.textMuted} />
        <TextInput
          autoFocus
          value={value}
          onChangeText={onChangeText}
          placeholder={CLOUD_TASKS_SEARCH_LABEL}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={CLOUD_TASKS_SEARCH_LABEL}
          maxLength={MANAGED_CLOUD_AGENT_RUN_SEARCH_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxFontSizeMultiplier={2}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.subhead,
            paddingVertical: 0,
          }}
        />
        {value.length > 0 ? (
          <PressableBox
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={colors.textMuted} />
          </PressableBox>
        ) : null}
      </View>
      <PressableBox
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
        style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}>
          Cancel
        </Text>
      </PressableBox>
    </View>
  );
}
