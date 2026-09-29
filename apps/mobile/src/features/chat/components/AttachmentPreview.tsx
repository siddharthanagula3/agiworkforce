import { View, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Image } from 'expo-image';
import {
  Lock,
  X,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  ClipboardList,
  AlertCircle,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  isResumable,
  uploadStatusLabel,
  useUploadLifecycleStore,
} from '@/src/features/chat/upload/uploadLifecycle';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';

export interface Attachment {
  id: string;
  uri: string;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  fileSize?: number;
  assetId?: string;
  pastedText?: string;
  sendFailed?: boolean;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onExpandPastedText?: (id: string) => void;
  onRetryUpload?: (id: string) => void;
  privacyShortLabel?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

const SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx', 'ods', 'numbers']);
const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'cs',
  'php',
  'sh',
  'sql',
  'html',
  'css',
  'json',
  'xml',
  'yaml',
  'yml',
  'toml',
]);

function documentIcon(attachment: Attachment): typeof FileIcon {
  const mimeType = attachment.mimeType.toLowerCase();
  const extension = attachment.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType === 'application/pdf' || extension === 'pdf') return FileText;
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv' ||
    SPREADSHEET_EXTENSIONS.has(extension)
  ) {
    return FileSpreadsheet;
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    CODE_EXTENSIONS.has(extension)
  ) {
    return FileCode;
  }
  return FileIcon;
}

function AttachmentImage({ attachment }: { attachment: Attachment }) {
  const stored = resolveGeneratedImageUri(attachment.uri) !== null;
  const { source } = useGeneratedImageSource(attachment.uri, false);
  const imageSource = stored ? source : { uri: attachment.uri };
  if (!imageSource) return null;
  return (
    <Image
      source={imageSource}
      style={{ width: 72, height: 72 }}
      contentFit="cover"
      transition={200}
      recyclingKey={attachment.id}
    />
  );
}

function AttachmentThumbnail({
  attachment,
  onRemove,
  onExpandPastedText,
  onRetryUpload,
  privacyShortLabel,
  colors,
}: {
  attachment: Attachment;
  onRemove: (id: string) => void;
  onExpandPastedText?: (id: string) => void;
  onRetryUpload?: (id: string) => void;
  privacyShortLabel?: string;
  colors: ColorScheme;
}) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const upload = useUploadLifecycleStore((s) => s.uploads[attachment.id]);
  const cancelUpload = useUploadLifecycleStore((s) => s.cancel);
  const uploading = upload?.phase === 'uploading';
  const uploadLabel = uploadStatusLabel(upload);
  const canRetryUpload = isResumable(upload) && onRetryUpload !== undefined;

  const handleRemove = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (uploading) {
      cancelUpload(attachment.id);
      return;
    }
    onRemove(attachment.id);
  };

  const imageAttachment = isImage(attachment.mimeType);
  const isPastedText = Boolean(attachment.pastedText);
  const sendFailed = attachment.sendFailed === true;
  const DocumentIcon = documentIcon(attachment);

  return (
    <Animated.View
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      layout={Layout.springify()}
      className="relative mr-2"
      accessibilityLabel={
        sendFailed ? `${attachment.fileName} was not sent. Send again to retry.` : undefined
      }
    >
      {imageAttachment ? (
        <View
          className="rounded-xl overflow-hidden"
          style={{
            width: 72,
            height: 72,
            backgroundColor: colors.surfaceElevated,
          }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            attachment.fileSize
              ? `${attachment.fileName}, ${formatFileSize(attachment.fileSize)}`
              : attachment.fileName
          }
        >
          <AttachmentImage attachment={attachment} />
        </View>
      ) : isPastedText ? (
        <PressableBox
          className="rounded-xl items-center justify-center p-2"
          style={{
            width: 72,
            height: 72,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={() => onExpandPastedText?.(attachment.id)}
          disabled={!onExpandPastedText}
          accessibilityLabel={`Pasted text, ${formatFileSize(attachment.fileSize ?? 0)}`}
          accessibilityHint="Expands the pasted text back into the message input"
          accessibilityRole="button"
        >
          <ClipboardList size={24} color={colors.textMuted} />
          <Text className="text-xs mt-1 text-center" style={{ color: colors.textMuted }}>
            Pasted text
          </Text>
          {attachment.fileSize ? (
            <Text className="text-xs" style={{ color: colors.textMuted }}>
              {formatFileSize(attachment.fileSize)}
            </Text>
          ) : null}
        </PressableBox>
      ) : (
        <View
          className="rounded-xl items-center justify-center p-2"
          style={{
            width: 72,
            height: 72,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <DocumentIcon size={24} color={colors.textMuted} />
          <Text
            className="text-xs mt-1 text-center"
            style={{ color: colors.textMuted }}
            numberOfLines={2}
          >
            {attachment.fileName}
          </Text>
          {attachment.fileSize ? (
            <Text className="text-xs" style={{ color: colors.textMuted }}>
              {formatFileSize(attachment.fileSize)}
            </Text>
          ) : null}
        </View>
      )}

      {/* Remove button, hitSlop 12 lifts the 20pt circle to a 44pt target */}
      <PressableBox
        onPress={handleRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full items-center justify-center"
        style={{
          backgroundColor: colors.surfaceOverlay,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        accessibilityLabel={
          uploading ? `Cancel upload of ${attachment.fileName}` : `Remove ${attachment.fileName}`
        }
        accessibilityRole="button"
        testID={`attachment-${uploading ? 'cancel' : 'remove'}-${attachment.id}`}
        hitSlop={12}
      >
        <X size={10} color={colors.textSecondary} />
      </PressableBox>

      {uploading ? (
        <View
          testID={`attachment-progress-${attachment.id}`}
          accessibilityLabel={`${attachment.fileName}, ${uploadLabel}`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(upload.progress * 100) }}
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 6,
            height: 3,
            borderRadius: 2,
            overflow: 'hidden',
            backgroundColor: colors.progressTrack,
          }}
        >
          <View
            style={{
              width: `${Math.round(upload.progress * 100)}%`,
              height: '100%',
              backgroundColor: colors.agentActive,
            }}
          />
        </View>
      ) : null}

      {canRetryUpload ? (
        <PressableBox
          onPress={() => onRetryUpload?.(attachment.id)}
          accessibilityRole="button"
          accessibilityLabel={`${uploadLabel}. Retry uploading ${attachment.fileName}`}
          testID={`attachment-retry-${attachment.id}`}
          hitSlop={12}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSurface,
          }}
        >
          <RotateCcw size={16} color={colors.textPrimary} />
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}
          >
            Retry
          </Text>
        </PressableBox>
      ) : null}

      {sendFailed ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.dangerBorder,
            backgroundColor: colors.dangerSurface,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <AlertCircle size={16} color={colors.agentError} />
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.agentError }}
          >
            Not sent
          </Text>
        </View>
      ) : null}

      {/* Privacy chip, outbound destination per attachment */}
      {privacyShortLabel ? (
        <View
          accessibilityLabel={`Outbound destination: ${privacyShortLabel}`}
          style={{
            position: 'absolute',
            bottom: -4,
            left: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 9999,
            backgroundColor: colors.scrim,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Lock size={11} color={colors.textPrimary} />
          <Text
            style={{
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {privacyShortLabel}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

export function AttachmentPreview({
  attachments,
  onRemove,
  onExpandPastedText,
  onRetryUpload,
  privacyShortLabel,
}: AttachmentPreviewProps) {
  const colors = useThemeColors();
  if (attachments.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      className="px-4 pt-2"
    >
      <View className="flex-row items-center">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
          accessibilityLabel="Attached files"
        >
          {attachments.map((attachment) => (
            <AttachmentThumbnail
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemove}
              onExpandPastedText={onExpandPastedText}
              onRetryUpload={onRetryUpload}
              privacyShortLabel={privacyShortLabel}
              colors={colors}
            />
          ))}
        </ScrollView>

        {/* Badge showing count if multiple */}
        {attachments.length > 1 && (
          <View
            className="ml-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.surfaceOverlay }}
          >
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {attachments.length}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
