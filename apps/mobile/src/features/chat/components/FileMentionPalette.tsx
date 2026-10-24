import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FileText, Image as ImageIcon } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import type { Attachment } from './AttachmentPreview';

const SEARCH_DELAY_MS = 250;
const MAX_RESULTS = 6;
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface MentionFile {
  id: string;
  fileName: string;
  isImage: boolean;
  attachment: Attachment;
}

export function FileMentionPalette({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (attachment: Attachment) => void;
}) {
  const colors = useThemeColors();
  const [files, setFiles] = useState<MentionFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchLibraryPage({ limit: MAX_RESULTS, ...(query ? { search: query } : {}) })
        .then((page) => {
          if (cancelled) return;
          setFiles(
            page.assets
              .filter((asset) => asset.kind !== 'video')
              .map((asset) => ({
                id: asset.id,
                fileName: asset.fileName,
                isImage: asset.kind === 'image',
                attachment: {
                  id: `library-${asset.id}`,
                  uri: asset.uri,
                  mimeType: asset.mimeType,
                  fileName: asset.fileName,
                  ...(asset.byteCount != null ? { fileSize: asset.byteCount } : {}),
                  assetId: asset.id,
                },
              })),
          );
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (files.length === 0) return null;

  return (
    <View
      testID="file-mention-palette"
      accessibilityLabel="Files to mention"
      style={{
        marginBottom: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceOverlay,
        overflow: 'hidden',
      }}
    >
      {files.map((file) => {
        const Icon = file.isImage ? ImageIcon : FileText;
        return (
          <Pressable
            key={file.id}
            onPress={() => onSelect(file.attachment)}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${file.fileName}`}
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
            }}
          >
            <Icon size={16} color={colors.textSecondary} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}
            >
              {file.fileName}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
