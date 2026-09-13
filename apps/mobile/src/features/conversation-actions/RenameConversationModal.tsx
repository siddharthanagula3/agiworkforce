import { Modal, Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { ConversationRenameState } from './useConversationActions';

/** Alert.prompt is iOS-only, so the rename field is its own modal. */
export function RenameConversationModal({ rename }: { rename: ConversationRenameState }) {
  const colors = useThemeColors();

  return (
    <Modal visible={rename.visible} transparent animationType="fade" onRequestClose={rename.cancel}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
        onPress={rename.cancel}
      >
        <Pressable
          style={{
            width: '100%',
            backgroundColor: colors.surfaceElevated,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={() => undefined}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: colors.textPrimary,
              marginBottom: 12,
            }}
          >
            Rename chat
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.inputSurface,
              borderRadius: 8,
              padding: 12,
              fontSize: 15,
              color: colors.textPrimary,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 16,
            }}
            value={rename.text}
            onChangeText={rename.setText}
            autoFocus
            placeholder="Enter a new title"
            placeholderTextColor={colors.textMuted}
            selectTextOnFocus
            accessibilityLabel="Chat title"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
            <Pressable
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
              onPress={rename.cancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel rename"
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
              onPress={rename.submit}
              accessibilityRole="button"
              accessibilityLabel="Submit rename"
            >
              <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>Rename</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
