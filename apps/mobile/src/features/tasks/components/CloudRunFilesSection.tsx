import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { FileText, Share } from 'lucide-react-native';
import { resolveGeneratedFileUri } from '@agiworkforce/cloud-contracts';
import { formatBytes } from '@agiworkforce/utils/format';
import { Text } from '@/components/ui/text';
import { PressableBox } from '@/components/ui/pressable-box';
import { API_URL } from '@/lib/constants';
import { downloadGeneratedFile, shareFile } from '@/services/fileCreation';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { CloudRunProducedFile } from '../runPresentation';

export function CloudRunFilesSection({ files }: { files: CloudRunProducedFile[] }) {
  const colors = useThemeColors();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = async (file: CloudRunProducedFile) => {
    if (openingId) return;
    setOpeningId(file.artifactId);
    try {
      const localUri = await downloadGeneratedFile(
        resolveGeneratedFileUri(file.uri, API_URL),
        file.name,
      );
      await shareFile(localUri);
    } catch {
      Alert.alert('Could not open this file', 'The file could not be downloaded.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {`Files · ${files.length}`}
      </Text>
      {files.map((file) => {
        const opening = openingId === file.artifactId;
        return (
          <PressableBox
            key={file.artifactId}
            onPress={() => void open(file)}
            disabled={openingId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Open or share ${file.name}`}
            accessibilityState={{ busy: opening, disabled: openingId !== null }}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: 14,
              borderCurve: 'continuous',
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <FileText size={18} color={colors.textSecondary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}
              >
                {file.name}
              </Text>
              {file.sizeBytes !== undefined ? (
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  {formatBytes(file.sizeBytes, 1)}
                </Text>
              ) : null}
            </View>
            {opening ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Share size={18} color={colors.textSecondary} />
            )}
          </PressableBox>
        );
      })}
    </View>
  );
}
