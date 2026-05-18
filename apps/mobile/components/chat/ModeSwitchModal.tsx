import { Modal, View, Pressable } from 'react-native';
import { Monitor, Cloud } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

export type AppMode = 'local' | 'cloud';

interface ModeSwitchModalProps {
  visible: boolean;
  fromMode: AppMode;
  toMode: AppMode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal shown when user switches between Local and Cloud mode
 * mid-conversation.
 *
 * Local→Cloud: warns that new messages will be sent via cloud provider.
 * Cloud→Local: warns that new messages will be processed on-device.
 */
export function ModeSwitchModal({
  visible,
  fromMode,
  toMode,
  onConfirm,
  onCancel,
}: ModeSwitchModalProps) {
  const isGoingCloud = toMode === 'cloud';
  const Icon = isGoingCloud ? Cloud : Monitor;
  const iconColor = isGoingCloud ? colors.teal : '#a78bfa';

  const title = isGoingCloud ? 'Switch to Cloud?' : 'Switch to On-Device?';
  const body = isGoingCloud
    ? 'New messages will be sent to the cloud provider. Previous messages remain private.'
    : 'New messages will be processed on-device. No data leaves this phone.';

  const confirmLabel = isGoingCloud ? 'Switch to Cloud' : 'Switch to On-Device';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
        onPress={onCancel}
      >
        <Pressable
          style={{
            width: '100%',
            backgroundColor: '#1a1c22',
            borderRadius: 16,
            padding: 24,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
          onPress={() => undefined}
          accessible={false}
        >
          {/* Icon badge */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: isGoingCloud ? 'rgba(33,128,141,0.15)' : 'rgba(167,139,250,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Icon size={24} color={iconColor} />
          </View>

          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: '#fff',
              marginBottom: 8,
            }}
          >
            {title}
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            {body}
          </Text>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            {/* Cancel */}
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              })}
              accessibilityLabel="Cancel mode switch"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>Keep current</Text>
            </Pressable>

            {/* Confirm */}
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: pressed
                  ? isGoingCloud
                    ? '#1a6b76'
                    : '#7c5db7'
                  : isGoingCloud
                    ? colors.teal
                    : '#7c3aed',
                alignItems: 'center',
              })}
              accessibilityLabel={confirmLabel}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
