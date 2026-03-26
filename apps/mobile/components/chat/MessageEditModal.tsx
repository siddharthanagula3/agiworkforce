/**
 * Standalone edit modal extracted from MessageBubble.
 * Allows users to edit a previously sent message.
 */

import { View, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          <Text style={styles.dialogTitle}>Edit Message</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            placeholderTextColor="rgba(255,255,255,0.3)"
            placeholder="Edit your message…"
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#1e2025',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
