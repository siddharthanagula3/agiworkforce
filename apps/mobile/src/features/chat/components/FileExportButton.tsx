/**
 * FileExportButton — bottom sheet for exporting assistant message content.
 *
 * Presented on long-press of assistant messages. Offers:
 *   - Export as PDF
 *   - Export as Text
 *   - Copy to Clipboard
 *   - Share...
 *
 * Uses @gorhom/bottom-sheet for the action sheet and expo-haptics for feedback.
 */

import { useCallback, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import GorhomBottomSheet from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { FileText, FileDown, Copy, Share2, X, Check } from 'lucide-react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Text } from '@/components/ui/text';
import { copyToClipboard } from '@/lib/clipboard';
import { colors } from '@/lib/theme';
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
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAP_POINTS = ['38%'];

const ACTIONS: ActionItem[] = [
  {
    key: 'pdf',
    label: 'Export as PDF',
    sublabel: 'Styled document with formatting',
    icon: <FileText size={20} color={colors.teal} />,
  },
  {
    key: 'text',
    label: 'Export as Text',
    sublabel: 'Plain text file',
    icon: <FileDown size={20} color={colors.warmPeach} />,
  },
  {
    key: 'copy',
    label: 'Copy to Clipboard',
    sublabel: 'Copy the raw message text',
    icon: <Copy size={20} color={colors.textSecondary} />,
  },
  {
    key: 'share',
    label: 'Share...',
    sublabel: 'Export as PDF and open share sheet',
    icon: <Share2 size={20} color={colors.agentActive} />,
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
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const [loading, setLoading] = useState<ExportAction | null>(null);
  const [success, setSuccess] = useState<ExportAction | null>(null);

  // Derive a title from the first line of content if not provided
  const title = titleProp ?? (content.split('\n')[0].slice(0, 60) || 'Chat Export');

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
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

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      index={0}
      enablePanDownToClose
      onChange={(index) => {
        if (index === -1) {
          handleClose();
        }
      }}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 4 }}>
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

            return (
              <Pressable
                key={action.key}
                onPress={() => handleAction(action.key)}
                disabled={loading !== null}
                accessibilityLabel={action.label}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading !== null }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
                  opacity: loading !== null && !isLoading ? 0.4 : 1,
                })}
              >
                {/* Icon / spinner / check */}
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.teal} />
                  ) : isSuccess ? (
                    <Check size={20} color={colors.agentSuccess} />
                  ) : (
                    action.icon
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
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}
