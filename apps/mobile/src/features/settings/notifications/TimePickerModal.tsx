import { useCallback, useState } from 'react';
import {
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Clock, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export interface TimePickerModalProps {
  visible: boolean;
  title: string;
  inputLabel: string;
  quickTimes: readonly string[];
  currentValue: string;
  onClose: () => void;
  onConfirm: (time: string) => void;
}

export function TimePickerModal({
  visible,
  title,
  inputLabel,
  quickTimes,
  currentValue,
  onClose,
  onConfirm,
}: TimePickerModalProps) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const [value, setValue] = useState(currentValue);
  const modalWidth = Math.min(width - 48, 320);

  const handleConfirm = useCallback(() => {
    const parts = value.split(':');
    const hours = parseInt(parts[0] ?? '', 10);
    const minutes = parseInt(parts[1] ?? '', 10);
    if (
      parts.length === 2 &&
      !isNaN(hours) &&
      !isNaN(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      const normalised = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      onConfirm(normalised);
      onClose();
    }
  }, [value, onConfirm, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: colors.scrim }}
        onPress={onClose}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable accessible={false} onPress={(e) => e.stopPropagation()}>
            <View
              accessibilityViewIsModal
              className="rounded-2xl p-5"
              style={{
                backgroundColor: colors.surfaceOverlay,
                paddingBottom: 20,
                width: modalWidth,
              }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[15px] font-semibold" style={{ color: colors.textPrimary }}>
                  {title}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={onClose}
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  })}
                  accessibilityLabel="Close time picker"
                  accessibilityRole="button"
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              </View>

              <View
                className="rounded-xl px-4 py-3 mb-4 flex-row items-center"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Clock size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  accessibilityLabel={inputLabel}
                  value={value}
                  onChangeText={setValue}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={{
                    flex: 1,
                    color: colors.textPrimary,
                    fontSize: typeScale.headline,
                    fontVariant: ['tabular-nums'],
                  }}
                  selectTextOnFocus
                />
              </View>

              <View className="flex-row flex-wrap gap-2 mb-4">
                {quickTimes.map((t) => (
                  <Pressable
                    accessibilityLabel={`Set time to ${t}`}
                    accessibilityRole="button"
                    key={t}
                    onPress={() => setValue(t)}
                    className="px-3 py-1.5 rounded-lg active:opacity-70"
                    style={{
                      backgroundColor: value === t ? colors.accentSurface : colors.surfaceElevated,
                      borderWidth: value === t ? 1 : 0,
                      borderColor: colors.accentBorder,
                    }}
                  >
                    <Text
                      className="text-sm"
                      style={{ color: value === t ? colors.teal : colors.textSecondary }}
                    >
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ marginTop: 8 }}>
                <Pressable
                  accessibilityLabel="Set Time"
                  accessibilityRole="button"
                  onPress={handleConfirm}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.textPrimary,
                    borderColor: colors.textPrimary,
                    borderRadius: 10,
                    borderWidth: 1,
                    justifyContent: 'center',
                    minHeight: 44,
                    width: '100%',
                  }}
                >
                  <Text
                    style={{
                      color: colors.surfaceElevated,
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                    }}
                  >
                    Set Time
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    justifyContent: 'center',
                    marginTop: 8,
                    minHeight: 44,
                    width: '100%',
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
