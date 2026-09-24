import { useCallback, useRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type {
  ConversationMenuAction,
  ConversationMenuState,
  ConversationRenameState,
} from './useConversationActions';

/**
 * A row's action list is a sheet on both platforms: Android renders at most
 * three `Alert` buttons, which dropped Delete and Cancel from a Cloud chat's
 * five-action menu.
 */
function ConversationMenuSheet({ menu }: { menu: ConversationMenuState }) {
  const colors = useThemeColors();
  const pendingRef = useRef<(() => void) | null>(null);

  const runPending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  }, []);

  const select = useCallback(
    (action: ConversationMenuAction) => {
      menu.close();
      if (Platform.OS === 'ios') {
        pendingRef.current = action.run;
        return;
      }
      setTimeout(action.run, 0);
    },
    [menu],
  );

  return (
    <Modal
      visible={menu.visible}
      transparent
      animationType="slide"
      onRequestClose={menu.close}
      onDismiss={runPending}
      accessibilityViewIsModal
    >
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        onPress={menu.close}
        accessibilityLabel="Dismiss chat actions"
        accessibilityRole="button"
        accessible={false}
      >
        <SafeAreaView edges={['bottom']} style={{ width: '100%' }}>
          <Pressable
            style={{
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 8,
            }}
            onPress={() => undefined}
            accessible={false}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.textMuted,
                paddingHorizontal: 20,
                paddingBottom: 8,
              }}
              numberOfLines={1}
            >
              {menu.title}
            </Text>
            {menu.actions.map((action, index) => (
              <Pressable
                key={action.key}
                testID={`conversation-action-${action.key}`}
                onPress={() => select(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={{
                  minHeight: 52,
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  borderBottomWidth: index < menu.actions.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: action.destructive ? colors.agentError : colors.textPrimary,
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              testID="conversation-action-cancel"
              onPress={menu.close}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 20,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textSecondary }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

/** Alert.prompt is iOS-only, so the rename field is its own modal. */
export function RenameConversationModal({ rename }: { rename: ConversationRenameState }) {
  const colors = useThemeColors();

  return (
    <>
      <ConversationMenuSheet menu={rename.menu} />
      <Modal
        visible={rename.visible}
        transparent
        animationType="fade"
        onRequestClose={rename.cancel}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
                  <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>
                    Rename
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
