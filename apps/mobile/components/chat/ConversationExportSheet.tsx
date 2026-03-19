/**
 * ConversationExportSheet
 *
 * A bottom sheet that presents export options for an entire conversation.
 * Options: PDF, Text, Markdown, Copy All.
 * Each option generates the export and opens the native share sheet.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FileText, File, Hash, Copy, CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/useTheme';
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
  /** Ref used by the parent to open/close this sheet. */
  sheetRef: React.RefObject<BottomSheet | null>;
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
  sheetRef,
  messages,
  title,
}: ConversationExportSheetProps) {
  const snapPoints = useMemo(() => ['42%'], []);
  const { colors } = useTheme();

  const [loadingKey, setLoadingKey] = useState<ExportOptionKey | null>(null);
  const [copiedKey, setCopiedKey] = useState<'copy' | null>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
  }, [sheetRef]);

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
    <BottomSheet
      ref={sheetRef as React.RefObject<BottomSheet>}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 36 }}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text variant="subheading">Export Conversation</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
          {title}
        </Text>
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
                backgroundColor: pressed && !isDisabled ? 'rgba(255,255,255,0.04)' : 'transparent',
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
                  backgroundColor: isCopied ? 'rgba(16,185,129,0.12)' : 'rgba(33,128,141,0.12)',
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
    </BottomSheet>
  );
}
