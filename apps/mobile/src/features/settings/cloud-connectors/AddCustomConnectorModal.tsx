/**
 * AddCustomConnectorModal — add a user-owned custom remote-MCP connector.
 *
 * Reuses the same server route as the web app (`POST /api/connectors/custom`),
 * which validates the URL (https, public host, no embedded credentials) and
 * enforces the per-tier limit. No OAuth app registration is needed, so this
 * works today. Client-side we only do cheap pre-checks; the server is
 * authoritative and its error message is surfaced verbatim.
 */
import { useState, useCallback } from 'react';
import { Modal, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { addCustomConnector, type CustomConnectorResult } from '@/services/connectors';

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
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName('');
    setUrl('');
    setAuthToken('');
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  const canSubmit = name.trim().length > 0 && isLikelyHttpsUrl(url) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const connector = await addCustomConnector({ name, url, authToken });
      reset();
      onAdded(connector);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this connector.');
      setSubmitting(false);
    }
  }, [canSubmit, name, url, authToken, reset, onAdded, onClose]);

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
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View
          style={{
            backgroundColor: colors.surfaceBase,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
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

          {error ? <Text style={{ fontSize: 13, color: '#ef4444' }}>{error}</Text> : null}

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
                  style={{ color: canSubmit ? '#ffffff' : colors.textMuted, fontWeight: '700' }}
                >
                  Add
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
