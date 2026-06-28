import { useMemo } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type AppMode = 'chat' | 'agent' | 'voice' | 'cloud' | 'local';

export interface ModeSwitchModalProps {
  visible: boolean;
  fromMode?: AppMode;
  toMode?: AppMode;
  currentMode?: AppMode;
  sourceSessionId?: string;
  contextItems?: unknown[];
  onConfirm?: () => void;
  onCancel?: () => void;
  onSelectMode?: (mode: AppMode) => void;
  onClose?: () => void;
}

function modeLabel(mode?: AppMode): string {
  if (mode === 'local') return 'Local Mode';
  if (mode === 'cloud') return 'AGI Cloud';
  if (mode === 'agent') return 'Agent';
  if (mode === 'voice') return 'Voice';
  return 'Chat';
}

export function ModeSwitchModal({
  visible,
  fromMode,
  toMode,
  onConfirm,
  onCancel,
  onClose,
}: ModeSwitchModalProps) {
  const colors = useThemeColors();
  const targetsCloud = toMode === 'cloud';

  const title = useMemo(() => {
    if (targetsCloud) return 'Switch to AGI Cloud?';
    return `Switch from ${modeLabel(fromMode)} to ${modeLabel(toMode)}?`;
  }, [fromMode, targetsCloud, toMode]);

  if (!visible) return null;

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
  };

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: colors.scrim,
          padding: 20,
        }}
      >
        <View
          style={{
            maxHeight: '86%',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceBase,
            padding: 18,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '700' }}>
            {title}
          </Text>
          <Text style={{ marginTop: 8, color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            {targetsCloud
              ? 'Sign in to use AGI Cloud chat. Your local chat stays on this device unless you choose to start a Cloud session.'
              : 'This changes the active model path for the conversation.'}
          </Text>

          <View
            style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}
          >
            <Pressable
              onPress={handleCancel}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: colors.teal,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: '700' }}>
                {targetsCloud ? 'Continue' : 'Switch'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default ModeSwitchModal;
