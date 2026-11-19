import { useCallback, useState } from 'react';
import { Alert, Modal, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, MessageCircle, Share2, X } from 'lucide-react-native';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { Button } from '@/components/ui/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import {
  FULL_SCREEN_TOUCH_TARGET,
  useFullScreenChrome,
} from '@/src/features/chat/chrome/fullScreenChrome';
import { useDismissOnScreenBlur } from '@/src/features/artifacts/useDismissOnScreenBlur';
import { shareFile } from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import { ArtifactViewer } from './ArtifactViewer';
import { localFileCopy } from './useLocalFileCopy';
import { artifactViewerKind, type FileViewerSource } from './viewerKind';

const CLOSE_LABEL = 'Close file';
const OPEN_CHAT_LABEL = 'Open chat';

const HEADER_ICON_TARGET = {
  minWidth: FULL_SCREEN_TOUCH_TARGET,
  minHeight: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export interface FileViewerScreenProps {
  source: FileViewerSource | null;
  page?: number;
  onClose: () => void;
  isCurrent?: () => boolean;
  onOpenChat?: () => void;
}

function useShareFile(source: FileViewerSource, isCurrent: (() => boolean) | undefined) {
  const [sharing, setSharing] = useState(false);
  const share = useCallback(() => {
    if (sharing) return;
    setSharing(true);
    void localFileCopy(source.url, source.fileName)
      .then((uri) => (isCurrent ? shareFile(uri, { isCurrent }) : shareFile(uri)))
      .catch((error: unknown) => {
        if (isCurrent?.() === false) return;
        Alert.alert('Could not share file', toUserMessage(error, 'Try again in a moment.'));
      })
      .finally(() => setSharing(false));
  }, [isCurrent, sharing, source]);
  return { share, sharing };
}

export function FileViewerScreen({
  source,
  page,
  onClose,
  isCurrent,
  onOpenChat,
}: FileViewerScreenProps) {
  if (!source) return null;
  return (
    <OpenFileViewer
      source={source}
      {...(page ? { page } : {})}
      onClose={onClose}
      {...(isCurrent ? { isCurrent } : {})}
      {...(onOpenChat ? { onOpenChat } : {})}
    />
  );
}

function OpenFileViewer({
  source,
  page,
  onClose,
  isCurrent,
  onOpenChat,
}: {
  source: FileViewerSource;
  page?: number;
  onClose: () => void;
  isCurrent?: () => boolean;
  onOpenChat?: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { share, sharing } = useShareFile(source, isCurrent);
  useDismissOnScreenBlur(true, onClose);
  const chrome = useFullScreenChrome({
    surface: 'file-viewer',
    back: { onPress: onClose, label: CLOSE_LABEL },
    close: { onPress: onClose, label: CLOSE_LABEL },
  });
  const kind = artifactViewerKind({ origin: 'file', ...source });
  const details = [
    typeof source.byteCount === 'number' && source.byteCount > 0
      ? formatAttachmentSize(source.byteCount)
      : null,
    page && page > 0 ? `Page ${page}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={chrome.onRequestClose}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          testID="file-viewer-screen"
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: spacing.lg,
              paddingRight: spacing.xs,
              paddingVertical: spacing.xs,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.textPrimary }}
              >
                {source.title}
              </Text>
              {details ? (
                <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                  {details}
                </Text>
              ) : null}
            </View>
            {onOpenChat ? (
              <PressableBox
                testID="file-viewer-open-chat"
                onPress={onOpenChat}
                accessibilityRole="button"
                accessibilityLabel={OPEN_CHAT_LABEL}
                style={HEADER_ICON_TARGET}
              >
                <MessageCircle size={18} color={colors.textSecondary} />
              </PressableBox>
            ) : null}
            <PressableBox
              testID="file-viewer-share"
              onPress={share}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityLabel={`Share ${source.fileName}`}
              accessibilityState={{ disabled: sharing, busy: sharing }}
              style={HEADER_ICON_TARGET}
            >
              {sharing ? (
                <LoadingIndicator size="small" />
              ) : (
                <Share2 size={18} color={colors.textSecondary} />
              )}
            </PressableBox>
            <PressableBox
              {...chrome.close}
              style={{ ...chrome.close.style, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} color={colors.textSecondary} />
            </PressableBox>
          </View>
          <View style={{ flex: 1 }}>
            {kind ? (
              <ArtifactViewer
                source={{ origin: 'file', ...source }}
                {...(page && page > 0 ? { page } : {})}
              />
            ) : (
              <View
                testID="file-viewer-unsupported"
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: spacing['2xl'],
                  gap: spacing.md,
                }}
              >
                <FileText size={28} color={colors.textMuted} />
                <Text
                  style={{
                    fontSize: typeScale.callout,
                    color: colors.textPrimary,
                    textAlign: 'center',
                  }}
                >
                  Preview isn’t available for this file type.
                </Text>
                <Button title="Share" variant="secondary" size="sm" onPress={share} />
              </View>
            )}
          </View>
        </View>
      </PageSheetSafeArea>
    </Modal>
  );
}
