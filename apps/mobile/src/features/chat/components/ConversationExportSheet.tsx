/**
 * ConversationExportSheet
 *
 * A bottom sheet that presents export options for an entire conversation.
 * Options: PDF, Text, Markdown, Copy All.
 * Each option generates the export and opens the native share sheet.
 *
 * Regression: this previously used @gorhom/bottom-sheet's plain (non-modal)
 * BottomSheet. There is no BottomSheetModalProvider in this app, so a plain
 * BottomSheet renders inline rather than in a native modal window layer —
 * the four export options were visible on screen but completely absent from
 * the accessibility tree (confirmed live: VoiceOver, and any accessibility-
 * driven automation, could not find "Export as Text" etc. at all). Same root
 * cause and same proven fix as FileExportButton.tsx in this directory: a
 * native Modal, which renders through its own window and is immune to this.
 */

import React, { useCallback, useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, File, Hash, Copy, CheckCircle2, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { copyToClipboard } from '@/lib/clipboard';
import {
  exportConversationToPDF,
  exportConversationToText,
  exportToMarkdown,
  formatConversationAsMarkdown,
  shareFile,
} from '@/services/fileCreation';
import type { ChatMessage } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationExportSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the sheet should close. */
  onClose: () => void;
  /** All messages in the conversation to export. */
  messages: ChatMessage[];
  /** Conversation title used as the document heading and file name. */
  title: string;
}

type ExportOptionKey = 'pdf' | 'text' | 'markdown' | 'copy';

interface ExportOption {
  key: ExportOptionKey;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPORT_OPTIONS: ExportOption[] = [
  {
    key: 'pdf',
    label: 'Export as PDF',
    description: 'Styled document with role headers',
    Icon: File,
  },
  {
    key: 'text',
    label: 'Export as Text',
    description: 'Plain text with role labels',
    Icon: FileText,
  },
  {
    key: 'markdown',
    label: 'Export as Markdown',
    description: 'Markdown with ## headers per message',
    Icon: Hash,
  },
  {
    key: 'copy',
    label: 'Copy All Messages',
    description: 'Copy full conversation to clipboard',
    Icon: Copy,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationExportSheet({
  visible,
  onClose,
  messages,
  title,
}: ConversationExportSheetProps) {
  const { colors } = useTheme();

  const [loadingKey, setLoadingKey] = useState<ExportOptionKey | null>(null);
  const [copiedKey, setCopiedKey] = useState<'copy' | null>(null);

  const handleClose = useCallback(() => {
    setLoadingKey(null);
    setCopiedKey(null);
    onClose();
  }, [onClose]);

  const handleExport = useCallback(
    async (key: ExportOptionKey) => {
      const filtered = messages.filter((m) => !m.isStreaming && m.content.trim());
      if (filtered.length === 0) {
        Alert.alert('Nothing to Export', 'This conversation has no messages yet.');
        return;
      }

      if (key === 'copy') {
        const md = formatConversationAsMarkdown(filtered, title);
        const success = await copyToClipboard(md);
        if (success) {
          setCopiedKey('copy');
          setTimeout(() => setCopiedKey(null), 2000);
        }
        handleClose();
        return;
      }

      setLoadingKey(key);
      try {
        let result;
        if (key === 'pdf') {
          result = await exportConversationToPDF(filtered, title);
        } else if (key === 'text') {
          result = await exportConversationToText(filtered, title);
        } else {
          // markdown — format the full conversation and export as .md file
          const md = formatConversationAsMarkdown(filtered, title);
          result = await exportToMarkdown(md, title);
        }

        handleClose();
        await shareFile(result.uri);
      } catch (err) {
        Alert.alert(
          'Export Failed',
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        );
      } finally {
        setLoadingKey(null);
      }
    },
    [messages, title, handleClose],
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
        // accessible=false: without this, this Pressable becomes a leaf
        // accessibility element and swallows every descendant, exactly the
        // bug being fixed here — see FileExportButton.tsx for the same
        // pattern and rationale.
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
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="subheading">Export Conversation</Text>
                <Text
                  style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </View>
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                accessibilityLabel="Close export menu"
                accessibilityRole="button"
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Options */}
            <View style={{ paddingTop: 8, paddingBottom: 16 }}>
              {EXPORT_OPTIONS.map((option, index) => {
                const isLoading = loadingKey === option.key;
                const isCopied = option.key === 'copy' && copiedKey === 'copy';
                const isDisabled = loadingKey !== null;

                const IconComponent = isCopied ? CheckCircle2 : option.Icon;
                const iconColor = isCopied
                  ? colors.agentSuccess
                  : isDisabled
                    ? colors.textMuted
                    : colors.teal;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      if (!isDisabled) handleExport(option.key);
                    }}
                    disabled={isDisabled}
                    accessibilityLabel={option.label}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      gap: 14,
                      opacity: isDisabled && !isLoading ? 0.45 : 1,
                      backgroundColor:
                        pressed && !isDisabled ? colors.surfaceHover : colors.transparent,
                      borderBottomWidth: index < EXPORT_OPTIONS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    })}
                  >
                    {/* Icon container */}
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: isCopied ? colors.successSurface : colors.accentSurface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={colors.teal} />
                      ) : (
                        <IconComponent size={18} color={iconColor} />
                      )}
                    </View>

                    {/* Label + description */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '500',
                          color: isCopied ? colors.agentSuccess : colors.textPrimary,
                        }}
                      >
                        {isCopied ? 'Copied!' : option.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                        {option.description}
                      </Text>
                    </View>
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
