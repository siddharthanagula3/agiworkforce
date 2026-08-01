/**
 * ThermalThrottleModal — shown when the device is thermally throttling
 * (iOS thermalState >= "serious", or Android equivalent reported by the
 * native thermal status bridge).
 *
 * Informs the user that inference is paused until the device cools.
 * Single CTA dismisses the modal — the caller is responsible for actually
 * pausing inference before showing this modal.
 */
import { Modal, View, Pressable } from 'react-native';
import { Thermometer } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/src/ui/theme';

export interface ThermalThrottleModalProps {
  visible: boolean;
  /** Dismisses the modal — inference should already be paused by the caller. */
  onDismiss: () => void;
}

export function ThermalThrottleModal({ visible, onDismiss }: ThermalThrottleModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing['2xl'],
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radii.xl,
            padding: spacing['2xl'],
            width: '100%',
            maxWidth: 340,
            alignItems: 'center',
            gap: spacing.lg,
          }}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — alertdialog valid role
          accessibilityRole="alertdialog"
          accessibilityLabel={EDGE_COPY.thermalThrottle.title}
        >
          {/* Icon */}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radii.full,
              backgroundColor: `${colors.agentError}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Thermometer size={24} color={colors.agentError} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {EDGE_COPY.thermalThrottle.title}
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 14,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {EDGE_COPY.thermalThrottle.body}
          </Text>

          {/* Dismiss CTA */}
          <Pressable
            onPress={onDismiss}
            style={{
              width: '100%',
              backgroundColor: colors.teal,
              borderRadius: radii.lg,
              paddingVertical: spacing.md,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.thermalThrottle.cta}
          >
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.thermalThrottle.cta}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
