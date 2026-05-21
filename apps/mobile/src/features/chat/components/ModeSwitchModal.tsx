import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { formatChatExecutionModeLabel } from '@agiworkforce/types';
import {
  buildLocalToByokHandoffDraft,
  type HandoffPreviewContextItem,
  type LocalToByokHandoffPreview,
} from '@agiworkforce/utils/privacy-handoff';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type AppMode = 'chat' | 'agent' | 'voice' | 'cloud' | 'local';

export interface ModeSwitchModalProps {
  visible: boolean;
  fromMode?: AppMode;
  toMode?: AppMode;
  currentMode?: AppMode;
  sourceSessionId?: string;
  contextItems?: HandoffPreviewContextItem[];
  onConfirm?: (preview?: LocalToByokHandoffPreview | null) => void;
  onCancel?: () => void;
  onSelectMode?: (mode: AppMode) => void;
  onClose?: () => void;
}

function modeLabel(mode?: AppMode): string {
  if (mode === 'local') return formatChatExecutionModeLabel('local_only');
  if (mode === 'cloud') return formatChatExecutionModeLabel('byok');
  if (mode === 'agent') return 'Agent';
  if (mode === 'voice') return 'Voice';
  return 'Chat';
}

async function mobileSha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export function ModeSwitchModal({
  visible,
  fromMode,
  toMode,
  sourceSessionId = 'mobile-chat',
  contextItems = [],
  onConfirm,
  onCancel,
  onClose,
}: ModeSwitchModalProps) {
  const colors = useThemeColors();
  const localLabel = formatChatExecutionModeLabel('local_only');
  const byokLabel = formatChatExecutionModeLabel('byok');
  const requiresHandoffPreview = fromMode === 'local' && toMode === 'cloud';
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [isBuildingPreview, setIsBuildingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const hasBlockingFindings = preview?.redactionReport.blocked ?? false;

  const title = useMemo(() => {
    if (requiresHandoffPreview) return `Review ${byokLabel} fork`;
    return `Switch from ${modeLabel(fromMode)} to ${modeLabel(toMode)}?`;
  }, [byokLabel, fromMode, requiresHandoffPreview, toMode]);

  useEffect(() => {
    if (!visible || !requiresHandoffPreview) {
      setPreview(null);
      setPreviewError(null);
      setIsBuildingPreview(false);
      return;
    }

    let cancelled = false;
    setIsBuildingPreview(true);
    setPreviewError(null);

    buildLocalToByokHandoffDraft({
      sourceSessionId,
      sourceSurface: 'mobile',
      targetSurface: 'mobile',
      selectedContext: contextItems,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      hash: mobileSha256,
    })
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : 'Could not build preview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsBuildingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextItems, requiresHandoffPreview, sourceSessionId, visible]);

  if (!visible) return null;

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
  };

  const handleConfirm = () => {
    if (requiresHandoffPreview && (isBuildingPreview || previewError || hasBlockingFindings)) {
      return;
    }
    onConfirm?.(preview);
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.62)',
          padding: 20,
        }}
      >
        <View
          style={{
            maxHeight: '86%',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceBase,
            padding: 18,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '700' }}>
            {title}
          </Text>
          <Text style={{ marginTop: 8, color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            {requiresHandoffPreview
              ? `${localLabel} chats stay local. Continuing with ${byokLabel} creates a reviewed fork after secret scanning and payload preview.`
              : 'This changes the active model path for the conversation.'}
          </Text>

          {requiresHandoffPreview && (
            <View style={{ marginTop: 16, gap: 12 }}>
              {isBuildingPreview && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color={colors.teal} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    Building handoff preview...
                  </Text>
                </View>
              )}

              {previewError && (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    padding: 12,
                  }}
                >
                  <Text style={{ color: '#fca5a5', fontSize: 13 }}>{previewError}</Text>
                </View>
              )}

              {preview && (
                <>
                  <View
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: hasBlockingFindings ? '#ef4444' : colors.border,
                      backgroundColor: hasBlockingFindings
                        ? 'rgba(239, 68, 68, 0.08)'
                        : colors.surfaceElevated,
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {hasBlockingFindings ? (
                        <AlertTriangle size={16} color="#f87171" />
                      ) : (
                        <CheckCircle2 size={16} color={colors.teal} />
                      )}
                      <Text
                        style={{
                          color: hasBlockingFindings ? '#fca5a5' : colors.textPrimary,
                          fontSize: 13,
                          fontWeight: '700',
                        }}
                      >
                        {hasBlockingFindings
                          ? `${preview.redactionReport.findings.length} sensitive item found`
                          : 'No secrets found'}
                      </Text>
                    </View>
                    <Text
                      style={{
                        marginTop: 6,
                        color: colors.textSecondary,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      Preview hash {preview.draft.previewHashSha256.slice(0, 16)}... covers the
                      exact redacted payload below.
                    </Text>
                  </View>

                  <ScrollView
                    style={{
                      maxHeight: 220,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceElevated,
                    }}
                    contentContainerStyle={{ padding: 12 }}
                  >
                    <Text
                      selectable
                      style={{
                        color: colors.textSecondary,
                        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      {preview.redactedPayload}
                    </Text>
                  </ScrollView>
                </>
              )}
            </View>
          )}

          <View
            style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}
          >
            <Pressable
              onPress={handleCancel}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={
                requiresHandoffPreview &&
                (isBuildingPreview || hasBlockingFindings || !!previewError)
              }
              style={{
                minHeight: 44,
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor:
                  requiresHandoffPreview &&
                  (isBuildingPreview || hasBlockingFindings || previewError)
                    ? colors.border
                    : colors.teal,
                paddingHorizontal: 16,
                opacity: requiresHandoffPreview && previewError ? 0.45 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                {requiresHandoffPreview ? `Continue with ${byokLabel}` : 'Switch'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default ModeSwitchModal;
