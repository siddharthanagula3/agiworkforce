import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';

const MINIMUM_PASSWORD_LENGTH = 8;

interface ChangePasswordModalProps {
  visible: boolean;
  hasPassword: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (change: { currentPassword: string | null; newPassword: string }) => void;
  children?: ReactNode;
}

export function ChangePasswordModal({
  visible,
  hasPassword,
  saving,
  onCancel,
  onSubmit,
  children,
}: ChangePasswordModalProps) {
  const colors = useThemeColors();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (visible) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [visible]);

  const problem =
    newPassword.length > 0 && newPassword.length < MINIMUM_PASSWORD_LENGTH
      ? `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
      : confirmPassword.length > 0 && confirmPassword !== newPassword
        ? 'The new passwords do not match.'
        : null;
  const ready =
    (!hasPassword || currentPassword.length > 0) &&
    newPassword.length >= MINIMUM_PASSWORD_LENGTH &&
    confirmPassword === newPassword &&
    !saving;

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    textContentType: 'password' | 'newPassword',
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={!saving}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        accessibilityLabel={label}
        style={[
          styles.input,
          {
            backgroundColor: colors.inputSurface,
            borderColor: colors.border,
            color: colors.textPrimary,
          },
        ]}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView style={styles.flex} behavior={keyboardAvoidingBehavior('modal')}>
        <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
          <View
            style={[
              styles.dialog,
              { backgroundColor: colors.surfaceBase, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {hasPassword ? 'Change password' : 'Set a password'}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {hasPassword
                ? 'Your other signed-in sessions are signed out when the password changes.'
                : 'Your account signs in without a password. You confirm it is you before one is set.'}
            </Text>
            {hasPassword
              ? field('Current password', currentPassword, setCurrentPassword, 'password')
              : null}
            {field('New password', newPassword, setNewPassword, 'newPassword')}
            {field('Confirm new password', confirmPassword, setConfirmPassword, 'newPassword')}
            {problem ? (
              <Text accessibilityRole="alert" style={[styles.body, { color: colors.agentError }]}>
                {problem}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <Button title="Cancel" variant="ghost" disabled={saving} onPress={onCancel} />
              <Button
                title={hasPassword ? 'Change password' : 'Set password'}
                loading={saving}
                disabled={!ready}
                onPress={() =>
                  onSubmit({ currentPassword: hasPassword ? currentPassword : null, newPassword })
                }
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    padding: dialogPadding,
    borderWidth: 1,
    gap: 12,
  },
  title: { fontSize: typeScale.headline, fontWeight: '600' },
  body: { fontSize: typeScale.subhead, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: typeScale.footnote },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: typeScale.body,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
