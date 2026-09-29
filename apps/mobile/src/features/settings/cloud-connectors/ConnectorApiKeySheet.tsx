import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { ApiHttpError } from '@/services/apiErrors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  fetchConnectorCredentialStatus,
  saveConnectorApiKey,
  type ConnectorCredentialStatusResponse,
} from '@/services/connectors';

const HEADER_PLACEMENT = 'header';

function connectorKeyFailureMessage(error: unknown, connectorName: string): string {
  const status = error instanceof ApiHttpError ? error.status : null;
  if (status === 400) return `${connectorName} did not accept that key. Check it and try again.`;
  if (status === 403) return `Your organization does not allow ${connectorName}.`;
  if (status === 502) {
    return `${connectorName} could not be reached, so the key was not saved. Try again later.`;
  }
  if (status === 503) return 'Keys cannot be stored right now. Nothing was saved. Try again later.';
  return 'The key was not saved. Try again.';
}

export interface ConnectorApiKeySheetProps {
  credentialsPath: string | null;
  connectorName: string;
  onClose: () => void;
  onConnected: () => void;
}

export function ConnectorApiKeySheet({
  credentialsPath,
  connectorName,
  onClose,
  onConnected,
}: ConnectorApiKeySheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [spec, setSpec] = useState<ConnectorCredentialStatusResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSpec(null);
    setLoadFailed(false);
    setApiKey('');
    setSaveError(null);
    setSaving(false);
    if (!credentialsPath) return;
    const account = captureCloudAccountEpoch();
    let cancelled = false;
    fetchConnectorCredentialStatus(credentialsPath)
      .then((next) => {
        if (!cancelled && isCloudAccountEpochCurrent(account)) setSpec(next);
      })
      .catch(() => {
        if (!cancelled && isCloudAccountEpochCurrent(account)) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, credentialsPath]);

  const acceptsKey = spec?.placement === HEADER_PLACEMENT;
  const cannotConnect = spec !== null && !acceptsKey;
  const documentationUrl = spec?.documentationUrl ?? null;
  const canSubmit = acceptsKey && apiKey.trim().length > 0 && !saving;

  const submit = useCallback(async () => {
    if (!credentialsPath || !canSubmit) return;
    const account = captureCloudAccountEpoch();
    setSaving(true);
    setSaveError(null);
    try {
      await saveConnectorApiKey(credentialsPath, apiKey);
      if (!isCloudAccountEpochCurrent(account)) return;
      setApiKey('');
      onConnected();
    } catch (error) {
      if (!isCloudAccountEpochCurrent(account)) return;
      setSaveError(connectorKeyFailureMessage(error, spec?.name ?? connectorName));
    } finally {
      if (isCloudAccountEpochCurrent(account)) setSaving(false);
    }
  }, [apiKey, canSubmit, connectorName, credentialsPath, onConnected, spec?.name]);

  const close = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);

  const openDocumentation = useCallback(async (url: string) => {
    const opened = await openUntrustedUrlInAppBrowser(url);
    if (!opened) {
      Alert.alert('Could not open this page', 'No browser was available to open the link.');
    }
  }, []);

  return (
    <Modal
      visible={credentialsPath !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            backgroundColor: colors.surfaceBase,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: dialogPadding,
            paddingTop: 20,
            paddingBottom: 20 + insets.bottom,
            gap: 12,
          }}
        >
          <Text
            style={{ fontSize: typeScale.headline, fontWeight: '700', color: colors.textPrimary }}
          >
            Connect {connectorName}
          </Text>

          {loadFailed ? (
            <Text
              style={{ fontSize: typeScale.footnote, lineHeight: 19, color: colors.agentError }}
            >
              Could not check how {connectorName} takes a key. Try again.
            </Text>
          ) : !spec ? (
            <View
              accessibilityLabel={`Checking how ${connectorName} takes a key`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
            >
              <ActivityIndicator color={colors.teal} />
              <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
                Checking how {connectorName} takes a key…
              </Text>
            </View>
          ) : !acceptsKey ? (
            <Text
              style={{ fontSize: typeScale.footnote, lineHeight: 19, color: colors.textSecondary }}
            >
              {spec.name} takes its key in the request {spec.placement}, which AGI Workforce does
              not send, so it cannot be connected.
            </Text>
          ) : (
            <>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                  color: colors.textSecondary,
                }}
              >
                {spec.name} needs an API key. AGI Cloud tests it with {spec.name}, then stores it
                encrypted.
              </Text>
              <Input
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="API key"
                accessibilityLabel={`${spec.name} API key`}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!saving}
                onSubmitEditing={() => void submit()}
                {...(saveError ? { error: saveError } : {})}
              />
              <Text
                style={{ fontSize: typeScale.caption, lineHeight: 17, color: colors.textSecondary }}
              >
                Sent as the {spec.headerName} header on every request.
                {spec.connected ? ' A key is already saved, and a new one replaces it.' : ''}
              </Text>
              {spec.description ? (
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 17,
                    color: colors.textSecondary,
                  }}
                >
                  {spec.description}
                </Text>
              ) : null}
              {documentationUrl ? (
                <PressableBox
                  onPress={() => void openDocumentation(documentationUrl)}
                  accessibilityRole="link"
                  accessibilityLabel={`Where to find the ${spec.name} API key`}
                  style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
                >
                  <Text
                    style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.teal }}
                  >
                    Where to find this key
                  </Text>
                </PressableBox>
              ) : null}
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Button
              title={cannotConnect ? 'Close' : 'Cancel'}
              variant="outline"
              onPress={close}
              disabled={saving}
              style={{ flex: 1 }}
            />
            {loadFailed ? (
              <Button
                title="Try again"
                onPress={() => setAttempt((value) => value + 1)}
                style={{ flex: 1 }}
              />
            ) : acceptsKey ? (
              <Button
                title={spec?.connected ? 'Test and replace' : 'Test and save'}
                onPress={() => void submit()}
                disabled={!canSubmit}
                loading={saving}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
