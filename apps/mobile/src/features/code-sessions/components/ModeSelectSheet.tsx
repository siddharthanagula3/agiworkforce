import { Modal, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { Check, Code2, ScrollText, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { CodeSessionMode } from '../types';

interface ModeSelectSheetProps {
  visible: boolean;
  selectedMode: CodeSessionMode;
  onSelect: (mode: CodeSessionMode) => void;
  onClose: () => void;
}

export function ModeSelectSheet({
  visible,
  selectedMode,
  onSelect,
  onClose,
}: ModeSelectSheetProps) {
  const c = useThemeColors();

  const choose = (mode: CodeSessionMode) => {
    onSelect(mode);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.58)' }}
        onPress={onClose}
        accessibilityLabel="Close mode selector"
      >
        <Pressable
          testID="code-mode-sheet"
          onPress={() => {
            /* keep taps inside the sheet */
          }}
          className="rounded-t-[28px] px-5 pt-5 pb-20 min-h-[430px]"
          style={{ backgroundColor: c.surfaceBase }}
        >
          <View className="flex-row items-center justify-center mb-8">
            <Pressable
              onPress={onClose}
              className="absolute left-0 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
              style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={24} color={c.textSecondary} />
            </Pressable>
            <Text className="text-[20px] font-semibold" style={{ color: c.textPrimary }}>
              Select mode
            </Text>
          </View>

          <ModeOption
            mode="plan"
            title="Plan"
            body="AGI explores code and presents a plan in the connected environment"
            icon={<ScrollText size={28} color={c.agentActive} />}
            selected={selectedMode === 'plan'}
            onPress={choose}
          />
          <ModeOption
            mode="code"
            title="Code"
            body="AGI writes and edits code directly in the connected environment"
            icon={<Code2 size={28} color={c.agentThinking} />}
            selected={selectedMode === 'code'}
            onPress={choose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModeOption({
  mode,
  title,
  body,
  icon,
  selected,
  onPress,
}: {
  mode: CodeSessionMode;
  title: string;
  body: string;
  icon: ReactNode;
  selected: boolean;
  onPress: (mode: CodeSessionMode) => void;
}) {
  const c = useThemeColors();

  return (
    <Pressable
      onPress={() => onPress(mode)}
      className="flex-row items-center gap-5 py-4 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${title} mode`}
      accessibilityState={{ selected }}
    >
      <View className="w-12 items-center">{icon}</View>
      <View className="flex-1">
        <Text className="text-[18px] font-medium" style={{ color: c.textPrimary }}>
          {title}
        </Text>
        <Text className="text-[15px] leading-[21px] mt-1" style={{ color: c.textSecondary }}>
          {body}
        </Text>
      </View>
      {selected ? <Check size={26} color={c.agentActive} /> : <View className="w-[26px]" />}
    </Pressable>
  );
}
