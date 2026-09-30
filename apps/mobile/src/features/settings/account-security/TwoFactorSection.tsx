import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsRow } from '@/src/features/settings/common';
import type { UseStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled } from '@/src/features/auth/services/stepUp';
import { toUserMessage } from '@/services/userMessage';
import {
  regenerateBackupCodes,
  startAuthenticatorSetup,
  turnOffTwoFactor,
  verifyAuthenticatorCode,
  type AccountSecurityStatus,
} from './service';
import { typeScale } from '@/src/ui/theme/tokens';

type Stage =
  | { name: 'idle' }
  | { name: 'enrolling'; secret: string; otpauthUrl: string }
  | { name: 'codes'; codes: string[] };

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        minHeight: 44,
        borderRadius: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? colors.teal : colors.neutralSurface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontSize: typeScale.subhead,
          fontWeight: '600',
          color: primary ? colors.accentText : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TwoFactorSection({
  status,
  statusLabel,
  withStepUp,
  onChanged,
}: {
  status: AccountSecurityStatus | null;
  statusLabel: string;
  withStepUp: UseStepUp['withStepUp'];
  onChanged: () => void;
}) {
  const colors = useThemeColors();
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = status?.twoFactorEnabled === true;
  const available = status?.enrollmentAvailable === true;

  const fail = useCallback((title: string, error: unknown) => {
    if (isStepUpCancelled(error)) return;
    Alert.alert(title, toUserMessage(error, 'Please try again.'));
  }, []);

  const startSetup = useCallback(async () => {
    setBusy(true);
    try {
      const setup = await withStepUp('two_factor.enable', null, (headers) =>
        startAuthenticatorSetup(headers),
      );
      setCode('');
      setStage({ name: 'enrolling', ...setup });
    } catch (error) {
      fail('Could not start setup', error);
    } finally {
      setBusy(false);
    }
  }, [fail, withStepUp]);

  const verify = useCallback(async () => {
    setBusy(true);
    try {
      const codes = await verifyAuthenticatorCode(code.trim());
      setCode('');
      setStage({ name: 'codes', codes });
      onChanged();
    } catch (error) {
      fail('That code did not work', error);
    } finally {
      setBusy(false);
    }
  }, [code, fail, onChanged]);

  const regenerate = useCallback(async () => {
    setBusy(true);
    try {
      const codes = await withStepUp('two_factor.regenerate_backup_codes', null, (headers) =>
        regenerateBackupCodes(headers),
      );
      setStage({ name: 'codes', codes });
      onChanged();
    } catch (error) {
      fail('Could not generate backup codes', error);
    } finally {
      setBusy(false);
    }
  }, [fail, onChanged, withStepUp]);

  const turnOff = useCallback(() => {
    Alert.alert(
      'Turn off two-factor sign-in?',
      'Signing in will need only your password or sign-in method, and your backup codes stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await withStepUp('two_factor.disable', null, (headers) =>
                  turnOffTwoFactor(headers),
                );
                onChanged();
              } catch (error) {
                fail('Could not turn off two-factor sign-in', error);
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [fail, onChanged, withStepUp]);

  const codesText = stage.name === 'codes' ? stage.codes.join('\n') : '';

  return (
    <>
      <SettingsInfo
        title="Two-factor sign-in"
        body="Ask for a code from an authenticator app each time you sign in. Backup codes let you in if you lose that app."
        icon={ShieldCheck}
      />
      <SettingsGroup>
        <SettingsRow label="Authenticator app" icon={KeyRound} value={statusLabel} />
        {status && !enabled ? (
          <SettingsRow
            label="Set up authenticator app"
            icon={ShieldCheck}
            value={available ? undefined : 'Temporarily unavailable'}
            {...(available && !busy ? { onPress: () => void startSetup() } : {})}
          />
        ) : null}
        {enabled ? (
          <SettingsRow
            label="Backup codes"
            icon={KeyRound}
            value={status?.backupCodesReady ? 'Ready' : 'Not set'}
          />
        ) : null}
        {enabled ? (
          <SettingsRow
            label="Generate new backup codes"
            icon={KeyRound}
            {...(available ? {} : { value: 'Temporarily unavailable' })}
            {...(available && !busy ? { onPress: () => void regenerate() } : {})}
          />
        ) : null}
        {enabled ? (
          <SettingsRow
            label="Turn off two-factor"
            icon={ShieldOff}
            destructive
            isLast
            {...(busy ? {} : { onPress: turnOff })}
          />
        ) : null}
      </SettingsGroup>

      <Modal
        visible={stage.name !== 'idle'}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => (stage.name === 'enrolling' ? setStage({ name: 'idle' }) : null)}
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
            {stage.name === 'enrolling' ? (
              <>
                <Text
                  style={{
                    fontSize: typeScale.callout,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                >
                  Set up authenticator app
                </Text>
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                    color: colors.textSecondary,
                  }}
                >
                  Add AGI Workforce to your authenticator app, then enter the 6-digit code it shows.
                  The setup key works for 30 minutes.
                </Text>
                <Text
                  selectable
                  accessibilityLabel="Setup key"
                  style={{
                    fontSize: typeScale.body,
                    letterSpacing: 1,
                    color: colors.textPrimary,
                    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                  }}
                >
                  {stage.secret}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <ActionButton
                    label="Open authenticator app"
                    onPress={() => {
                      Linking.openURL(stage.otpauthUrl).catch(() => {
                        Alert.alert(
                          'No authenticator app found',
                          'Copy the setup key and add it to your authenticator app by hand.',
                        );
                      });
                    }}
                  />
                  <ActionButton
                    label="Copy setup key"
                    onPress={() => void Clipboard.setStringAsync(stage.secret)}
                  />
                </View>
                <TextInput
                  value={code}
                  onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  accessibilityLabel="Authenticator code"
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    fontSize: typeScale.headline,
                    color: colors.textPrimary,
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <ActionButton label="Cancel" onPress={() => setStage({ name: 'idle' })} />
                  <ActionButton
                    label="Turn on"
                    primary
                    disabled={busy || code.length !== 6}
                    onPress={() => void verify()}
                  />
                </View>
                {busy ? <ActivityIndicator color={colors.teal} /> : null}
              </>
            ) : stage.name === 'codes' ? (
              <>
                <Text
                  style={{
                    fontSize: typeScale.callout,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                >
                  Save your backup codes
                </Text>
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                    color: colors.textSecondary,
                  }}
                >
                  Each code works once. Keep them somewhere safe: they are shown only now, and any
                  earlier codes no longer work.
                </Text>
                <Text
                  selectable
                  style={{
                    fontSize: typeScale.body,
                    lineHeight: 24,
                    color: colors.textPrimary,
                    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
                  }}
                >
                  {codesText}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <ActionButton
                    label="Copy codes"
                    onPress={() => void Clipboard.setStringAsync(codesText)}
                  />
                  <ActionButton
                    label="Save or share"
                    onPress={() => {
                      Share.share({
                        title: 'AGI Workforce backup codes',
                        message: codesText,
                      }).catch(() => undefined);
                    }}
                  />
                </View>
                <ActionButton
                  label="I saved these codes"
                  primary
                  onPress={() => setStage({ name: 'idle' })}
                />
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
