import { useState } from 'react';
import { ActivityIndicator, View, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import {
  X,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
  ClipboardList,
  AlertCircle,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { useThemeColors, type ColorScheme, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  isResumable,
  isUploadInFlight,
  uploadStatusLabel,
  useUploadLifecycleStore,
} from '@/src/features/chat/upload/uploadLifecycle';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { AuthorizedImage } from '@/src/features/image/components/AuthorizedImage';
import { ImageFullScreen } from './ImageFullScreen';

export interface Attachment {
  id: string;
  uri: string;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  fileSize?: number;
  assetId?: string;
  pickerAssetId?: string;
  pastedText?: string;
  sendFailed?: boolean;
  unavailable?: boolean;
}

export interface PreparingAttachment {
  id: string;
  failed: boolean;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onExpandPastedText?: (id: string) => void;
  onRetryUpload?: (id: string) => void;
  privacyShortLabel?: string;
  preparing?: readonly PreparingAttachment[];
  onDismissPreparing?: (id: string) => void;
  numberImages?: boolean;
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

const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'key', 'odp']);
const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'pages', 'odt', 'rtf']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'log']);

interface DocumentKind {
  Icon: typeof FileIcon;
  label: string;
}

const PDF_KIND: DocumentKind = { Icon: FileText, label: 'PDF' };
const SPREADSHEET_KIND: DocumentKind = { Icon: FileSpreadsheet, label: 'Spreadsheet' };
const CODE_KIND: DocumentKind = { Icon: FileCode, label: 'Code' };
const PRESENTATION_KIND: DocumentKind = { Icon: Presentation, label: 'Presentation' };
const DOCUMENT_KIND: DocumentKind = { Icon: FileType, label: 'Document' };
const TEXT_KIND: DocumentKind = { Icon: FileText, label: 'Text' };
const FILE_KIND: DocumentKind = { Icon: FileIcon, label: 'File' };

function documentKind(attachment: Pick<Attachment, 'mimeType' | 'fileName'>): DocumentKind {
  const mimeType = attachment.mimeType.toLowerCase();
  const extension = attachment.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType === 'application/pdf' || extension === 'pdf') return PDF_KIND;
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv' ||
    mimeType === 'text/tab-separated-values' ||
    SPREADSHEET_EXTENSIONS.has(extension)
  ) {
    return SPREADSHEET_KIND;
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.endsWith('/xml') ||
    mimeType.endsWith('+xml') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    CODE_EXTENSIONS.has(extension)
  ) {
    return CODE_KIND;
  }
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint') ||
    PRESENTATION_EXTENSIONS.has(extension)
  ) {
    return PRESENTATION_KIND;
  }
  if (
    mimeType.includes('wordprocessing') ||
    mimeType === 'application/msword' ||
    DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return DOCUMENT_KIND;
  }
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return TEXT_KIND;
  return FILE_KIND;
}

function AttachmentThumbnail({
  attachment,
  onRemove,
  onExpandPastedText,
  onRetryUpload,
  onViewImage,
  privacyShortLabel,
  imageNumber,
  imageCount,
  imageMode,
  colors,
}: {
  attachment: Attachment;
  onRemove: (id: string) => void;
  onExpandPastedText?: (id: string) => void;
  onRetryUpload?: (id: string) => void;
  onViewImage: (attachment: Attachment) => void;
  privacyShortLabel?: string;
  imageNumber?: number;
  imageCount: number;
  imageMode: boolean;
  colors: ColorScheme;
}) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const upload = useUploadLifecycleStore((s) => s.uploads[attachment.id]);
  const cancelUpload = useUploadLifecycleStore((s) => s.cancel);
  const uploading = isUploadInFlight(upload);
  const verifying = upload?.phase === 'verifying';
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
  const unavailable = attachment.unavailable === true;
  const { Icon: DocumentIcon, label: kindLabel } = documentKind(attachment);
  const destination = privacyShortLabel ? `, goes to ${privacyShortLabel}` : '';
  const sizeLabel = attachment.fileSize ? formatAttachmentSize(attachment.fileSize) : null;
  const orderLabel =
    imageNumber === undefined
      ? ''
      : `, image ${imageNumber} of ${imageCount}${imageNumber === 1 && imageMode ? ', the picture to edit' : ''}`;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      layout={Layout.springify()}
      className="relative mr-2"
      accessibilityLabel={
        unavailable
          ? `${attachment.fileName} is no longer available. Remove it.`
          : sendFailed && !canRetryUpload
            ? `${attachment.fileName} was not sent. Send again to retry.`
            : undefined
      }
    >
      {imageAttachment ? (
        <PressableBox
          testID={`attachment-view-${attachment.id}`}
          className="rounded-xl overflow-hidden"
          style={{
            width: 72,
            height: 72,
            backgroundColor: colors.surfaceElevated,
          }}
          onPress={() => onViewImage(attachment)}
          disabled={unavailable}
          accessibilityRole="imagebutton"
          accessibilityLabel={
            sizeLabel
              ? `${attachment.fileName}, ${sizeLabel}${orderLabel}${destination}`
              : `${attachment.fileName}${orderLabel}${destination}`
          }
          accessibilityHint="Shows the picture full screen"
        >
          <AuthorizedImage
            uri={attachment.uri}
            name={attachment.fileName}
            style={{ width: 72, height: 72 }}
            recyclingKey={attachment.id}
          />
          {imageNumber !== undefined ? (
            <View
              testID={`attachment-number-${attachment.id}`}
              pointerEvents="none"
              style={{ position: 'absolute', top: 4, left: 7 }}
            >
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '700',
                  color: colors.white,
                  textShadowColor: colors.black,
                  textShadowRadius: 3,
                  textShadowOffset: { width: 0, height: 0 },
                }}
              >
                {imageNumber}
              </Text>
            </View>
          ) : null}
        </PressableBox>
      ) : isPastedText ? (
        <PressableBox
          className="rounded-xl items-center justify-center p-2"
          style={{
            width: 96,
            minHeight: 72,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={() => onExpandPastedText?.(attachment.id)}
          disabled={!onExpandPastedText}
          accessibilityLabel={`Pasted text, ${formatAttachmentSize(attachment.fileSize ?? 0)}${destination}`}
          accessibilityHint="Expands the pasted text back into the message input"
          accessibilityRole="button"
        >
          <ClipboardList size={24} color={colors.textMuted} />
          <Text
            className="text-sm mt-1 text-center"
            style={{ color: colors.textMuted }}
            numberOfLines={1}
          >
            Pasted text
          </Text>
          {attachment.fileSize ? (
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              {formatAttachmentSize(attachment.fileSize)}
            </Text>
          ) : null}
        </PressableBox>
      ) : (
        <View
          className="rounded-xl items-center justify-center p-2"
          style={{
            width: 96,
            minHeight: 72,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          accessible
          accessibilityLabel={`${attachment.fileName}, ${kindLabel}${sizeLabel ? `, ${sizeLabel}` : ''}${destination}`}
        >
          <DocumentIcon size={24} color={colors.textMuted} />
          <Text
            className="text-sm mt-1 text-center"
            style={{ color: colors.textMuted }}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {attachment.fileName}
          </Text>
          <Text className="text-sm" style={{ color: colors.textMuted }} numberOfLines={1}>
            {sizeLabel ? `${kindLabel} · ${sizeLabel}` : kindLabel}
          </Text>
        </View>
      )}

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

      {unavailable ? (
        <View
          testID={`attachment-unavailable-${attachment.id}`}
          pointerEvents="none"
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
            paddingHorizontal: 4,
            gap: 2,
          }}
        >
          <AlertCircle size={16} color={colors.agentError} />
          <Text
            numberOfLines={2}
            style={{
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.agentError,
              textAlign: 'center',
            }}
          >
            No longer available
          </Text>
        </View>
      ) : canRetryUpload ? (
        <PressableBox
          onPress={() => onRetryUpload?.(attachment.id)}
          accessibilityRole="button"
          accessibilityLabel={`${sendFailed ? 'Not sent. ' : ''}${uploadLabel}. Retry uploading ${attachment.fileName}`}
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
            borderColor: sendFailed ? colors.dangerBorder : colors.warningBorder,
            backgroundColor: sendFailed ? colors.dangerSurface : colors.warningSurface,
          }}
        >
          <RotateCcw size={16} color={colors.textPrimary} />
          <Text
            style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textPrimary }}
          >
            Retry
          </Text>
        </PressableBox>
      ) : verifying ? (
        <View
          testID={`attachment-verifying-${attachment.id}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 12,
            backgroundColor: colors.scrim,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.white }}>
            Verifying
          </Text>
        </View>
      ) : sendFailed ? (
        <View
          testID={`attachment-not-sent-${attachment.id}`}
          pointerEvents="none"
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

      <PressableBox
        onPress={handleRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full items-center justify-center"
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
    </Animated.View>
  );
}

function PreparingThumbnail({
  item,
  onDismiss,
  colors,
}: {
  item: PreparingAttachment;
  onDismiss?: (id: string) => void;
  colors: ColorScheme;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      className="relative mr-2"
      testID={`attachment-preparing-${item.id}`}
    >
      <View
        className="rounded-xl items-center justify-center"
        style={{
          width: 72,
          height: 72,
          gap: 2,
          backgroundColor: item.failed ? colors.dangerSurface : colors.surfaceElevated,
          borderWidth: 1,
          borderColor: item.failed ? colors.dangerBorder : colors.border,
        }}
        accessible
        accessibilityRole={item.failed ? 'text' : 'progressbar'}
        accessibilityLabel={item.failed ? 'Attachment not added' : 'Adding attachment'}
      >
        {item.failed ? (
          <>
            <AlertCircle size={16} color={colors.agentError} />
            <Text
              style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.agentError }}
            >
              Not added
            </Text>
          </>
        ) : (
          <ActivityIndicator color={colors.textMuted} />
        )}
      </View>
      {item.failed && onDismiss ? (
        <PressableBox
          onPress={() => onDismiss(item.id)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full items-center justify-center"
          style={{
            backgroundColor: colors.surfaceOverlay,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          accessibilityLabel="Remove the attachment that could not be added"
          accessibilityRole="button"
          hitSlop={12}
        >
          <X size={10} color={colors.textSecondary} />
        </PressableBox>
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
  preparing = [],
  onDismissPreparing,
  numberImages = false,
}: AttachmentPreviewProps) {
  const colors = useThemeColors();
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const viewed = viewing ? attachments.find((attachment) => attachment.id === viewing.id) : null;
  if (attachments.length === 0 && preparing.length === 0) return null;
  const imageIds = attachments.filter((a) => isImage(a.mimeType)).map((a) => a.id);
  const numbered = numberImages && imageIds.length >= 2;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      className="pb-2"
    >
      <View className="flex-row items-center">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
          accessibilityLabel="Attached files"
        >
          {attachments.map((attachment) => {
            const imageIndex = imageIds.indexOf(attachment.id);
            return (
              <AttachmentThumbnail
                key={attachment.id}
                attachment={attachment}
                onRemove={onRemove}
                onExpandPastedText={onExpandPastedText}
                onRetryUpload={onRetryUpload}
                onViewImage={setViewing}
                privacyShortLabel={privacyShortLabel}
                imageNumber={numbered && imageIndex >= 0 ? imageIndex + 1 : undefined}
                imageCount={imageIds.length}
                imageMode={numberImages}
                colors={colors}
              />
            );
          })}
          {preparing.map((item) => (
            <PreparingThumbnail
              key={item.id}
              item={item}
              onDismiss={onDismissPreparing}
              colors={colors}
            />
          ))}
        </ScrollView>
      </View>
      <ImageFullScreen
        imageUrl={viewed?.uri ?? null}
        visible={Boolean(viewed)}
        onClose={() => setViewing(null)}
      />
    </Animated.View>
  );
}
