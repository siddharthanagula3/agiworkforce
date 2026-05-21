/**
 * FileUnreadableModal — shown when a file parse attempt fails (wrong format
 * or corrupt file).
 *
 * Lists the supported formats. Single dismiss CTA.
 */
import { Modal, View, Pressable } from 'react-native';
import { FileWarning } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/lib/theme';

export interface FileUnreadableModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function FileUnreadableModal({ visible, onDismiss }: FileUnreadableModalProps) {
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
          accessibilityLabel={EDGE_COPY.fileUnreadable.title}
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
            <FileWarning size={24} color={colors.agentError} strokeWidth={2} />
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
            {EDGE_COPY.fileUnreadable.title}
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
            {EDGE_COPY.fileUnreadable.body}
          </Text>

          {/* Dismiss */}
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
            accessibilityLabel={EDGE_COPY.fileUnreadable.cta}
          >
            <Text style={{ color: colors.white, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.fileUnreadable.cta}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
