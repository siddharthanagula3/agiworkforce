import { useCallback, forwardRef } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useChatStore, type ToolAccess } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/hooks/useTheme';
import { colors } from '@/lib/theme';

const SNAP_POINTS = ['50%'];

const TOOL_ACCESS_OPTIONS: Array<{
  id: ToolAccess;
  label: string;
  description: string;
}> = [
  { id: 'auto', label: 'Auto', description: 'AI chooses for you' },
  {
    id: 'on-demand',
    label: 'On demand',
    description: 'Load when needed. More messages, lower accuracy',
  },
  { id: 'always', label: 'Always available', description: 'All tools loaded' },
];

export const ToolAccessSelector = forwardRef<BottomSheet>(function ToolAccessSelector(_props, ref) {
  const { colors: themeColors, isDark } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const toolAccess = useChatStore((s) => s.toolAccess);
  const setToolAccess = useChatStore((s) => s.setToolAccess);

  const haptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticsEnabled]);

  const closeSheet = useCallback(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.close();
    }
  }, [ref]);

  const handleSelect = useCallback(
    (access: ToolAccess) => {
      haptic();
      setToolAccess(access);
      closeSheet();
    },
    [haptic, setToolAccess, closeSheet],
  );

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const selectedBg = isDark ? 'rgba(33, 128, 141, 0.12)' : 'rgba(33, 128, 141, 0.08)';

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: themeColors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: themeColors.textMuted }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <Pressable
          onPress={closeSheet}
          style={{ padding: 4 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <X size={20} color={themeColors.textMuted} />
        </Pressable>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: themeColors.textPrimary,
          }}
        >
          Tool Access
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Options */}
      <View style={{ paddingHorizontal: 20, gap: 4 }}>
        {TOOL_ACCESS_OPTIONS.map((option) => {
          const isSelected = toolAccess === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleSelect(option.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: isSelected ? selectedBg : 'transparent',
              }}
              accessibilityLabel={`${option.label}${isSelected ? ', selected' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              {/* Radio circle */}
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.teal : themeColors.textMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                {isSelected && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.teal,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: themeColors.textPrimary,
                  }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: themeColors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
});
