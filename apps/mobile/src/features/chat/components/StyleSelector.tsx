import { useCallback, useEffect, useState } from 'react';
import { Modal, View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useChatStore, type ChatStyle } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/src/ui/theme';

const STYLE_OPTIONS: Array<{
  id: ChatStyle;
  label: string;
  description: string;
}> = [
  { id: 'normal', label: 'Normal', description: 'Balanced, standard' },
  { id: 'concise', label: 'Concise', description: 'Short, direct answers' },
  { id: 'detailed', label: 'Detailed', description: 'Thorough explanations' },
  { id: 'creative', label: 'Creative', description: 'Imaginative, expressive' },
];

interface StyleSelectorProps {
  openSignal?: number;
}

export function StyleSelector({ openSignal }: StyleSelectorProps) {
  const { colors: themeColors } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [visible, setVisible] = useState(false);

  const chatStyle = useChatStore((s) => s.chatStyle);
  const setChatStyle = useChatStore((s) => s.setChatStyle);

  const haptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [hapticsEnabled]);

  const closeSheet = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!openSignal) return;
    setVisible(true);
  }, [openSignal]);

  const handleSelect = useCallback(
    (style: ChatStyle) => {
      haptic();
      setChatStyle(style);
      closeSheet();
    },
    [haptic, setChatStyle, closeSheet],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeSheet}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: themeColors.scrim,
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={closeSheet}
          accessibilityLabel="Close style selector"
          accessibilityRole="button"
        />
        <View
          style={{
            backgroundColor: themeColors.surfaceElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 8,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: themeColors.border,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: themeColors.textMuted,
              marginBottom: 14,
            }}
          />

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
              accessibilityLabel="Close style selector"
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
              Choose Style
            </Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Options */}
          <View style={{ paddingHorizontal: 20, gap: 4 }}>
            {STYLE_OPTIONS.map((option) => {
              const isSelected = chatStyle === option.id;
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
                    backgroundColor: isSelected
                      ? themeColors.accentSurface
                      : themeColors.transparent,
                  }}
                  accessibilityLabel={`${option.label} style${isSelected ? ', selected' : ''}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  {/* Radio circle */}
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? themeColors.teal : themeColors.textMuted,
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
                          backgroundColor: themeColors.teal,
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
        </View>
      </View>
    </Modal>
  );
}
