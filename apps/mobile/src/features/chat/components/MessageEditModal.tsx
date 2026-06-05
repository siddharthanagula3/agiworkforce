/**
 * Standalone edit modal extracted from MessageBubble.
 * Allows users to edit a previously sent message.
 */

import { View, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface MessageEditModalProps {
  visible: boolean;
  text: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function MessageEditModal({
  visible,
  text,
  onChangeText,
  onClose,
  onSubmit,
}: MessageEditModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityLabel="Dismiss edit dialog"
        accessibilityRole="button"
      >
        <Pressable
          style={[
            styles.dialog,
            {
              backgroundColor: colors.surfaceBase,
              borderColor: colors.border,
            },
          ]}
          onPress={() => undefined}
        >
          <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Edit Message</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputSurface,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            placeholderTextColor={colors.textMuted}
            placeholder="Edit your message…"
            accessibilityLabel="Edit message text"
            accessibilityHint="Modify your message then tap Send"
          />
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.submitBtn}
              onPress={onSubmit}
              accessibilityRole="button"
              accessibilityLabel="Submit edit"
            >
              <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>Send</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
    borderWidth: 1,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  cancelBtn: {
    padding: 8,
  },
  submitBtn: {
    padding: 8,
  },
});
