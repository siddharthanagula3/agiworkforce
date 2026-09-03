import { Modal, View, Pressable } from 'react-native';
import { FileX } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/src/ui/theme';

export interface FileTooLargeModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function FileTooLargeModal({ visible, onDismiss }: FileTooLargeModalProps) {
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
          // @ts-ignore, alertdialog valid role
          accessibilityRole="alertdialog"
          accessibilityLabel={EDGE_COPY.fileTooLarge.title}
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
            <FileX size={24} color={colors.agentWarning} strokeWidth={2} />
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
            {EDGE_COPY.fileTooLarge.title}
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
            {EDGE_COPY.fileTooLarge.body}
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
            accessibilityLabel={EDGE_COPY.fileTooLarge.cta}
          >
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
              {EDGE_COPY.fileTooLarge.cta}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
