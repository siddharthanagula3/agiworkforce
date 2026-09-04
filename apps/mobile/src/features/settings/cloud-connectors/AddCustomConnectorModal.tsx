import { useState, useCallback, useLayoutEffect, useRef } from 'react';
import {
  Modal,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { addCustomConnector, type CustomConnectorResult } from '@/services/connectors';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

export interface AddCustomConnectorModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded: (connector: CustomConnectorResult) => void;
}

export function isLikelyHttpsUrl(value: string): boolean {
  const v = value.trim();
  return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
}

export function AddCustomConnectorModal({
  visible,
  onClose,
  onAdded,
}: AddCustomConnectorModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formScopeRef = useRef<AccountScopedUiState | null>(null);
  const wasVisibleRef = useRef(false);

  const reset = useCallback(() => {
    setName('');
    setUrl('');
    setAuthToken('');
    setError(null);
    setSubmitting(false);
  }, []);

  const isFormScopeCurrent = useCallback((scope: AccountScopedUiState | null) => {
    return (
      scope?.scope === 'cloud' &&
      isAccountScopedUiStateCurrent(scope, useChatAppModeStore.getState().appMode)
    );
  }, []);

  useLayoutEffect(() => {
    const opened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (opened) {
      reset();
      formScopeRef.current = appMode === 'cloud' ? captureAccountScopedUiState('cloud') : null;
    }

    if (!visible) {
      formScopeRef.current = null;
      reset();
      return;
    }

    if (isFormScopeCurrent(formScopeRef.current)) return;
    formScopeRef.current = null;
    reset();
    onClose();
  }, [appMode, clerkUserId, isFormScopeCurrent, onClose, reset, visible]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    formScopeRef.current = null;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  const canSubmit = name.trim().length > 0 && isLikelyHttpsUrl(url) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    const requestScope = formScopeRef.current;
    if (!isFormScopeCurrent(requestScope)) {
      formScopeRef.current = null;
      reset();
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const connector = await addCustomConnector({ name, url, authToken });
      if (!isFormScopeCurrent(requestScope)) return;
      formScopeRef.current = null;
      reset();
      onAdded(connector);
      onClose();
    } catch (err) {
      if (!isFormScopeCurrent(requestScope)) return;
      setError(err instanceof Error ? err.message : 'Could not add this connector.');
      setSubmitting(false);
    }
  }, [authToken, canSubmit, isFormScopeCurrent, name, onAdded, onClose, reset, url]);

  const inputStyle = {
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
  } as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      {/*
       * KeyboardAvoidingView belongs INSIDE <Modal>, RN renders a Modal into its
       * own native window, so an ancestor outside it does nothing. This sheet is
       * bottom-anchored and every one of its three fields sits below the fold of
       * an open keyboard, so without this the user could not see what they were
       * typing nor reach the Add button, and there is no tap-outside dismiss.
       */}
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            backgroundColor: colors.surfaceBase,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 20 + insets.bottom,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
            Add custom MCP connector
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            Connect a remote MCP server by its HTTPS URL. Its tools become available to the model.
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name (e.g. My Tools)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Connector name"
            autoCapitalize="words"
            style={inputStyle}
          />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://mcp.example.com/sse"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Connector URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={inputStyle}
          />
          <TextInput
            value={authToken}
            onChangeText={setAuthToken}
            placeholder="Auth token (optional)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Auth token (optional)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={inputStyle}
          />

          {error ? <Text style={{ fontSize: 13, color: colors.agentError }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Add connector"
              accessibilityState={{ disabled: !canSubmit }}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: canSubmit ? colors.teal : colors.surfaceElevated,
              }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text
                  style={{
                    color: canSubmit ? colors.accentText : colors.textMuted,
                    fontWeight: '700',
                  }}
                >
                  Add
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
