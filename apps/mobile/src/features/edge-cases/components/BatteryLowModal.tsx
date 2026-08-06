/**
 * BatteryLowModal — shown when battery level is <15% AND an inference run
 * is about to start.
 *
 * Gives the user the choice to continue (they accept the risk of slowdown)
 * or cancel (abort the inference start).
 *
 * The caller gates on `Battery.getBatteryLevelAsync()` and only shows the
 * modal at the threshold — the component itself has no battery-reading logic.
 */
import { Modal, View, Pressable } from 'react-native';
import { BatteryLow } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/src/ui/theme';

export interface BatteryLowModalProps {
  visible: boolean;
  /** User confirmed — inference should proceed. */
  onConfirm: () => void;
  /** User cancelled — inference should NOT start. */
  onCancel: () => void;
}

export function BatteryLowModal({ visible, onConfirm, onCancel }: BatteryLowModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
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
          accessibilityLabel={EDGE_COPY.batteryLow.title}
        >
          {/* Icon */}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radii.full,
              backgroundColor: `${colors.agentWarning}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BatteryLow size={24} color={colors.agentWarning} strokeWidth={2} />
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
            {EDGE_COPY.batteryLow.title}
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
            {EDGE_COPY.batteryLow.body}
          </Text>

          {/* Confirm */}
          <Pressable
            onPress={onConfirm}
            style={{
              width: '100%',
              backgroundColor: colors.teal,
              borderRadius: radii.lg,
              paddingVertical: spacing.md,
              alignItems: 'center',
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.batteryLow.confirm}
            accessibilityHint="Starts inference despite low battery"
          >
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.batteryLow.confirm}
            </Text>
          </Pressable>

          {/* Cancel */}
          <Pressable
            onPress={onCancel}
            style={{
              width: '100%',
              borderRadius: radii.lg,
              paddingVertical: spacing.md,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityRole="button"
            accessibilityLabel={EDGE_COPY.batteryLow.cancel}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>
              {EDGE_COPY.batteryLow.cancel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
