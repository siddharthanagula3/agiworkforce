import { View, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { X, FileText } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Image/file attachment preview strip shown above the chat input bar.
 * Displays thumbnails in a horizontal scrollable row.
 */

export interface Attachment {
  /** Unique ID for the attachment */
  id: string;
  /** Local file URI */
  uri: string;
  /** MIME type (e.g., 'image/jpeg', 'application/pdf') */
  mimeType: string;
  /** Original file name */
  fileName: string;
  /** Image width (for images only) */
  width?: number;
  /** Image height (for images only) */
  height?: number;
  /** File size in bytes */
  fileSize?: number;
}

interface AttachmentPreviewProps {
  /** List of attachments to display */
  attachments: Attachment[];
  /** Called when user removes an attachment */
  onRemove: (id: string) => void;
}

/** Format file size to human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Check if MIME type is an image */
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function AttachmentThumbnail({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleRemove = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onRemove();
  };

  const imageAttachment = isImage(attachment.mimeType);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify()}
      className="relative mr-2"
    >
      {imageAttachment ? (
        <View
          className="rounded-xl overflow-hidden"
          style={{
            width: 72,
            height: 72,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Image
            source={{ uri: attachment.uri }}
            style={{ width: 72, height: 72 }}
            contentFit="cover"
            transition={200}
            recyclingKey={attachment.id}
          />
        </View>
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
          <FileText size={24} color={colors.textMuted} />
          <Text
            className="text-[9px] text-white/50 mt-1 text-center"
            numberOfLines={2}
          >
            {attachment.fileName}
          </Text>
          {attachment.fileSize ? (
            <Text className="text-[8px] text-white/30">
              {formatFileSize(attachment.fileSize)}
            </Text>
          ) : null}
        </View>
      )}

      {/* Remove button */}
      <Pressable
        onPress={handleRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.surfaceOverlay, borderWidth: 1, borderColor: colors.border }}
        accessibilityLabel={`Remove ${attachment.fileName}`}
        accessibilityRole="button"
        hitSlop={8}
      >
        <X size={10} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="px-4 pt-2"
    >
      <View className="flex-row items-center">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8 }}
        >
          {attachments.map((attachment) => (
            <AttachmentThumbnail
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemove(attachment.id)}
            />
          ))}
        </ScrollView>

        {/* Badge showing count if multiple */}
        {attachments.length > 1 && (
          <View
            className="ml-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.surfaceOverlay }}
          >
            <Text className="text-[10px] text-white/60 font-medium">
              {attachments.length}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}
