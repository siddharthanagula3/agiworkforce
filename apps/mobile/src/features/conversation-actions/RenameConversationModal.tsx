import { useCallback, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { CONVERSATION_TITLE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
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
export function ActionMenuSheet({ menu }: { menu: ConversationMenuState }) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
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
      <PressableBox
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        onPress={menu.close}
        accessibilityLabel="Dismiss chat actions"
        accessibilityRole="button"
        accessible={false}
      >
        <SafeAreaView edges={['bottom']} style={{ width: '100%' }}>
          <PressableBox
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
                fontSize: typeScale.caption,
                color: colors.textMuted,
                paddingHorizontal: dialogPadding,
                paddingBottom: 8,
              }}
              numberOfLines={1}
            >
              {menu.title}
            </Text>
            <ScrollView style={{ maxHeight: height * 0.6 }} bounces={false}>
              {menu.actions.map((action, index) => (
                <PressableBox
                  key={action.key}
                  testID={`conversation-action-${action.key}`}
                  onPress={() => select(action)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={action.selected ? { selected: true } : undefined}
                  style={{
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingHorizontal: dialogPadding,
                    borderBottomWidth: index < menu.actions.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      fontSize: typeScale.callout,
                      color: action.destructive ? colors.agentError : colors.textPrimary,
                    }}
                  >
                    {action.label}
                  </Text>
                  {action.selected ? <Check size={18} color={colors.textPrimary} /> : null}
                </PressableBox>
              ))}
            </ScrollView>
            <PressableBox
              testID="conversation-action-cancel"
              onPress={menu.close}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: dialogPadding,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textSecondary,
                }}
              >
                Cancel
              </Text>
            </PressableBox>
          </PressableBox>
        </SafeAreaView>
      </PressableBox>
    </Modal>
  );
}

/** Alert.prompt is iOS-only, so the rename field is its own modal. */
export function RenameConversationModal({
  rename,
  inline = false,
}: {
  rename: ConversationRenameState;
  inline?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <>
      <ActionMenuSheet menu={rename.menu} />
      <Modal
        visible={rename.visible && !inline}
        transparent
        animationType="fade"
        onRequestClose={rename.cancel}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <PressableBox
            style={{
              flex: 1,
              backgroundColor: colors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onPress={rename.cancel}
          >
            <PressableBox
              style={{
                width: '100%',
                backgroundColor: colors.surfaceElevated,
                borderRadius: 14,
                padding: dialogPadding,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() => undefined}
            >
              <Text
                style={{
                  fontSize: typeScale.callout,
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
                  fontSize: typeScale.body,
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
                maxLength={CONVERSATION_TITLE_MAX_LENGTH}
                accessibilityLabel="Chat title"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
                <PressableBox
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                  onPress={rename.cancel}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
                    Cancel
                  </Text>
                </PressableBox>
                <PressableBox
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                  onPress={rename.submit}
                  accessibilityRole="button"
                  accessibilityLabel="Submit rename"
                >
                  <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
                    Rename
                  </Text>
                </PressableBox>
              </View>
            </PressableBox>
          </PressableBox>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export function InlineRenameField({ rename }: { rename: ConversationRenameState }) {
  const colors = useThemeColors();
  return (
    <TextInput
      style={{
        flex: 1,
        minHeight: 36,
        borderRadius: 8,
        paddingHorizontal: 8,
        fontSize: typeScale.body,
        color: colors.textPrimary,
        backgroundColor: colors.inputSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
      value={rename.text}
      onChangeText={rename.setText}
      onSubmitEditing={rename.submit}
      onBlur={rename.cancel}
      autoFocus
      selectTextOnFocus
      returnKeyType="done"
      accessibilityLabel="Chat title"
      accessibilityHint="Done saves the new title; leaving the field keeps the old one"
    />
  );
}
