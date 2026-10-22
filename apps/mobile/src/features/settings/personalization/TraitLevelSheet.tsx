import { Modal, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ResponseStyleTraitKey, ResponseStyleTraitLevel } from '@agiworkforce/types';
import { RESPONSE_STYLE_TRAIT_LEVELS } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function TraitLevelSheet({
  trait,
  level,
  onSelect,
  onClose,
}: {
  trait: { key: ResponseStyleTraitKey; label: string } | null;
  level: ResponseStyleTraitLevel;
  onSelect: (level: ResponseStyleTraitLevel) => void;
  onClose: () => void;
}) {
  const c = useThemeColors();
  return (
    <Modal visible={trait !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}
        onPress={onClose}
      >
        <Pressable accessible={false} onPress={(event) => event.stopPropagation()}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: c.surfaceOverlay,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 24,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: c.textPrimary,
                fontSize: typeScale.callout,
                fontWeight: '700',
                paddingHorizontal: 18,
                paddingBottom: 12,
              }}
            >
              {trait?.label ?? ''}
            </Text>
            {RESPONSE_STYLE_TRAIT_LEVELS.map((option, index) => {
              const selected = option.value === level;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${trait?.label ?? ''} ${option.label}`}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    paddingHorizontal: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: c.border,
                    backgroundColor: pressed ? c.surfaceHover : c.transparent,
                  })}
                >
                  <Text style={{ flex: 1, color: c.textPrimary, fontSize: typeScale.body }}>
                    {option.label}
                  </Text>
                  {selected ? <Check size={17} color={c.teal} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
