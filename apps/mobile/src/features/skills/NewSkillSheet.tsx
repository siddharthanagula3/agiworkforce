import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';
import { createPersonalSkill } from './service';

export function NewSkillSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = !saving && Boolean(name.trim() && description.trim() && body.trim());

  const close = useCallback(() => {
    setName('');
    setDescription('');
    setBody('');
    setError(null);
    onClose();
  }, [onClose]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await createPersonalSkill({ name, description, body });
      onCreated();
      close();
    } catch (saveError) {
      setError(toUserMessage(saveError, 'Could not save this skill. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [body, close, description, name, onCreated]);

  const fieldStyle = {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: typeScale.body,
    color: colors.textPrimary,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
      >
        <ScrollView
          style={{
            flexGrow: 0,
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
          >
            New skill
          </Text>
          <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
            A personal skill is only yours. Name it with lowercase letters, numbers and hyphens.
          </Text>
          <TextInput
            value={name}
            onChangeText={(next) => setName(next.toLowerCase())}
            placeholder="weekly-report"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Skill name"
            style={fieldStyle}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="When to use this skill"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Skill description"
            style={fieldStyle}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Instructions the assistant follows when this skill is used"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Skill instructions"
            multiline
            textAlignVertical="top"
            style={{ ...fieldStyle, minHeight: 180 }}
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ fontSize: typeScale.footnote, color: colors.agentError }}
            >
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
            >
              <Text
                style={{
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                  color: colors.textSecondary,
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel="Create skill"
              accessibilityState={{ disabled: !canSave }}
              style={{
                minHeight: 44,
                paddingHorizontal: 16,
                justifyContent: 'center',
                opacity: canSave ? 1 : 0.5,
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.teal} />
              ) : (
                <Text
                  style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.teal }}
                >
                  Create
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
