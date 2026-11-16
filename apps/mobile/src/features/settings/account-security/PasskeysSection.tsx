import { useState, type ReactElement } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLink, Fingerprint } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { ApiHttpError } from '@/services/apiErrors';
import { toUserMessage } from '@/services/userMessage';
import { ScreenHeader } from '@/src/shared/components/cloud-screen';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import type { UseStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled, StepUpCancelledError } from '@/src/features/auth/services/stepUp';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/Common';
import { removeSignInKey, type SignInKey, type SignInKeys } from './service';

const FOOTNOTE =
  'Use passkeys or security keys to sign in. They resist phishing better than passwords.';
const PAGE_TITLE = 'Passkeys and security keys';

function kindLabel(key: SignInKey): string {
  return key.kind === 'passkey' ? 'Passkey' : 'Security key';
}

function removalFailure(error: unknown): string {
  if (error instanceof ApiHttpError && error.status === 409 && error.message.trim()) {
    return error.message;
  }
  return toUserMessage(error, 'Please try again.');
}

function KeyRow({
  signInKey,
  isLast,
  busy,
  onRemove,
  onOpenWeb,
}: {
  signInKey: SignInKey;
  isLast: boolean;
  busy: boolean;
  onRemove?: () => void;
  onOpenWeb?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        minHeight: 56,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Fingerprint size={19} color={colors.textSecondary} />
      <View
        accessible
        style={{ flex: 1 }}
        accessibilityLabel={`${signInKey.name}. ${kindLabel(signInKey)}`}
      >
        <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
          {signInKey.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
          {kindLabel(signInKey)}
        </Text>
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${signInKey.name}`}
          accessibilityState={{ disabled: busy }}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              color: colors.agentError,
              fontSize: typeScale.subhead,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Removing…' : 'Remove'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onOpenWeb}
          accessibilityRole="button"
          accessibilityLabel={`Manage ${signInKey.name} on the web`}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>Web</Text>
        </Pressable>
      )}
    </View>
  );
}

export function PasskeysSection({
  keys,
  webKeys,
  open,
  onOpenChange,
  ownerId,
  withStepUp,
  stepUpModal,
  onRetry,
  onChanged,
  onOpenWeb,
}: {
  keys: SignInKeys | null;
  webKeys: SignInKey[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string | null;
  withStepUp: UseStepUp['withStepUp'];
  stepUpModal: ReactElement | null;
  onRetry: () => void;
  onChanged: () => void;
  onOpenWeb: () => void;
}) {
  const colors = useThemeColors();
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (keys?.state === 'unavailable') return null;

  const remove = async (signInKey: SignInKey, account: CloudAccountEpoch) => {
    if (!isCloudAccountEpochCurrent(account)) return;
    setRemovingId(signInKey.id);
    try {
      await withStepUp('account_security.change', signInKey.id, (headers) => {
        if (!isCloudAccountEpochCurrent(account)) throw new StepUpCancelledError();
        return removeSignInKey(signInKey.id, headers, account);
      });
      if (isCloudAccountEpochCurrent(account)) onChanged();
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account) || isStepUpCancelled(error)) return;
      if (error instanceof ApiHttpError && error.status === 404) {
        onChanged();
        return;
      }
      Alert.alert(`Could not remove ${signInKey.name}`, removalFailure(error));
    } finally {
      if (isCloudAccountEpochCurrent(account)) setRemovingId(null);
    }
  };

  const confirmRemove = (signInKey: SignInKey) => {
    if (removingId !== null) return;
    const account = captureCloudAccountEpoch();
    if (!account || account.ownerId !== ownerId) return;
    Alert.alert(`Remove ${signInKey.name}?`, 'It can no longer sign in to your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(signInKey, account) },
    ]);
  };

  const rowValue =
    keys === null
      ? 'Checking…'
      : keys.state === 'listed'
        ? String(keys.items.length + webKeys.length)
        : keys.state === 'verification_required'
          ? 'Web'
          : 'Unavailable · Retry';
  const rowPress =
    keys === null
      ? undefined
      : keys.state === 'listed'
        ? () => onOpenChange(true)
        : keys.state === 'verification_required'
          ? onOpenWeb
          : onRetry;

  return (
    <>
      <SettingsGroup footnote={FOOTNOTE}>
        <SettingsRow
          label={PAGE_TITLE}
          icon={Fingerprint}
          value={rowValue}
          onPress={rowPress}
          isLast
        />
      </SettingsGroup>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => onOpenChange(false)}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
          <ScreenHeader title={PAGE_TITLE} onBack={() => onOpenChange(false)} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36 }}
          >
            {keys?.state === 'listed' ? (
              keys.items.length + webKeys.length === 0 ? (
                <View
                  style={{
                    borderRadius: cardRadius,
                    backgroundColor: colors.surfaceElevated,
                    padding: 14,
                    marginBottom: 24,
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
                    No passkeys or security keys yet.
                  </Text>
                </View>
              ) : (
                <SettingsGroup>
                  {keys.items.map((signInKey, index) => (
                    <KeyRow
                      key={signInKey.id}
                      signInKey={signInKey}
                      isLast={webKeys.length === 0 && index === keys.items.length - 1}
                      busy={removingId === signInKey.id}
                      onRemove={() => confirmRemove(signInKey)}
                    />
                  ))}
                  {webKeys.map((signInKey, index) => (
                    <KeyRow
                      key={`web:${signInKey.id}`}
                      signInKey={signInKey}
                      isLast={index === webKeys.length - 1}
                      busy={false}
                      onOpenWeb={onOpenWeb}
                    />
                  ))}
                </SettingsGroup>
              )
            ) : (
              <SettingsGroup>
                <SettingsRow
                  label={PAGE_TITLE}
                  icon={Fingerprint}
                  value={rowValue}
                  onPress={rowPress}
                  isLast
                />
              </SettingsGroup>
            )}
            <SettingsGroup>
              <SettingsRow
                label="Add a passkey or security key"
                icon={ExternalLink}
                value="Web"
                onPress={onOpenWeb}
                isLast
              />
            </SettingsGroup>
          </ScrollView>
        </SafeAreaView>
        {stepUpModal}
      </Modal>
    </>
  );
}
