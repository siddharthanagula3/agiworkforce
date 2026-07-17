/**
 * FileExportButton — bottom sheet for exporting assistant message content.
 *
 * Presented on long-press of assistant messages. Offers:
 *   - Export as PDF
 *   - Export as Text
 *   - Copy to Clipboard
 *   - Share...
 *
 * Regression: this previously used @gorhom/bottom-sheet's plain (non-modal)
 * BottomSheet, which positions itself relative to its nearest ancestor rather
 * than the screen. Since this component is mounted inside MessageBubble — a
 * row inside the virtualized message list — the sheet was clipped to that
 * row's small bounds and never visible, silently no-opping "Export Message...".
 * No BottomSheetModalProvider exists in this app to fix it the @gorhom way, so
 * this uses React Native's native Modal instead — the same proven pattern as
 * MessageEditModal.tsx in this directory, which renders via a native window
 * layer and is immune to list-item clipping.
 */

import { useCallback, useState } from 'react';
import { View, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FileText, FileDown, Copy, Share2, X, Check } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { copyToClipboard } from '@/lib/clipboard';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { exportToPDF, exportToText, shareFile, type ExportResult } from '@/services/fileCreation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileExportButtonProps {
  /** The message content to export */
  content: string;
  /** Title for the exported document (defaults to truncated content) */
  title?: string;
  /** Whether the bottom sheet is visible */
  visible: boolean;
  /** Called when the sheet should close */
  onClose: () => void;
}

type ExportAction = 'pdf' | 'text' | 'copy' | 'share';

interface ActionItem {
  key: ExportAction;
  label: string;
  sublabel: string;
  icon: typeof FileText;
  iconColorToken: keyof ColorScheme;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIONS: ActionItem[] = [
  {
    key: 'pdf',
    label: 'Export as PDF',
    sublabel: 'Styled document with formatting',
    icon: FileText,
    iconColorToken: 'teal',
  },
  {
    key: 'text',
    label: 'Export as Text',
    sublabel: 'Plain text file',
    icon: FileDown,
    iconColorToken: 'textSecondary',
  },
  {
    key: 'copy',
    label: 'Copy to Clipboard',
    sublabel: 'Copy the raw message text',
    icon: Copy,
    iconColorToken: 'textSecondary',
  },
  {
    key: 'share',
    label: 'Share...',
    sublabel: 'Export as PDF and open share sheet',
    icon: Share2,
    iconColorToken: 'agentActive',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileExportButton({
  content,
  title: titleProp,
  visible,
  onClose,
}: FileExportButtonProps) {
  const colors = useThemeColors();
  const [loading, setLoading] = useState<ExportAction | null>(null);
  const [success, setSuccess] = useState<ExportAction | null>(null);

  // Derive a title from the first line of content if not provided
  const title = titleProp ?? (content.split('\n')[0].slice(0, 60) || 'Chat Export');

  const handleClose = useCallback(() => {
    setLoading(null);
    setSuccess(null);
    onClose();
  }, [onClose]);

  const showSuccess = useCallback((action: ExportAction) => {
    setSuccess(action);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      setSuccess(null);
    }, 1500);
  }, []);

  const handleAction = useCallback(
    async (action: ExportAction) => {
      if (loading) return;
      setLoading(action);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      try {
        let result: ExportResult | null = null;

        switch (action) {
          case 'pdf':
            result = await exportToPDF(content, title);
            showSuccess(action);
            break;

          case 'text':
            result = await exportToText(content, title);
            showSuccess(action);
            break;

          case 'copy':
            await copyToClipboard(content);
            showSuccess(action);
            break;

          case 'share': {
            result = await exportToPDF(content, title);
            await shareFile(result.uri);
            showSuccess(action);
            break;
          }
        }
      } catch (err) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Error state clears after a moment so the user can retry
        setLoading(null);
      } finally {
        setLoading(null);
      }
    },
    [content, title, loading, showSuccess],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={handleClose}
        accessibilityLabel="Dismiss export menu"
        accessibilityRole="button"
        // accessible=false: without this, a Pressable with a label/role becomes a
        // leaf accessibility element and swallows every descendant — the whole
        // sheet (all 4 export actions, the close button) would be invisible to
        // VoiceOver, reachable only as one opaque "Dismiss export menu" node.
        // The dedicated "Close export menu" X button remains the labeled,
        // accessible dismiss path; this backdrop only needs to stay tappable for
        // sighted users, which accessible=false does not affect.
        accessible={false}
      >
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => undefined}
            accessible={false}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                Export Message
              </Text>
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                accessibilityLabel="Close export menu"
                accessibilityRole="button"
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Action list */}
            <View style={{ gap: 4 }}>
              {ACTIONS.map((action) => {
                const isLoading = loading === action.key;
                const isSuccess = success === action.key;
                const ActionIcon = action.icon;

                return (
                  // No `style` prop on Pressable — see MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
                  // (docs/agent-context/known-flaws.md): a function-style `style`
                  // prop silently drops flexDirection/alignItems/padding in this
                  // stack, which would stack the icon above the label instead of
                  // beside it. `children`-as-function keeps pressed state while
                  // every real style lives on a plain View.
                  <Pressable
                    key={action.key}
                    onPress={() => handleAction(action.key)}
                    disabled={loading !== null}
                    accessibilityLabel={action.label}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading !== null }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 14,
                          paddingVertical: 14,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                          opacity: loading !== null && !isLoading ? 0.4 : 1,
                        }}
                      >
                        {/* Icon / spinner / check */}
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: colors.neutralSurface,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isLoading ? (
                            <ActivityIndicator size="small" color={colors.teal} />
                          ) : isSuccess ? (
                            <Check size={20} color={colors.agentSuccess} />
                          ) : (
                            <ActionIcon size={20} color={colors[action.iconColorToken]} />
                          )}
                        </View>

                        {/* Label */}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: '500',
                              color: isSuccess ? colors.agentSuccess : colors.textPrimary,
                            }}
                          >
                            {isSuccess ? 'Done!' : action.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.textMuted,
                              marginTop: 2,
                            }}
                          >
                            {action.sublabel}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  safeArea: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
});
