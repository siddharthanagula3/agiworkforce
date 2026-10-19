import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { resolveGeneratedFileUri, type LiveVoiceToolFile } from '@agiworkforce/cloud-contracts';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { downloadGeneratedFile, shareFile } from '@/services/fileCreation';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const GENERATED_FILE_PATH = /^\/api\/files\/[A-Za-z0-9_-]+(?:\?.*)?$/;

export function openableVoiceFiles(files: readonly LiveVoiceToolFile[]): LiveVoiceToolFile[] {
  return files.filter((file) => GENERATED_FILE_PATH.test(file.uri));
}

export function VoiceToolFiles({ files }: { files: readonly LiveVoiceToolFile[] }) {
  const colors = useThemeColors();
  const [opening, setOpening] = useState<string | null>(null);
  const openable = openableVoiceFiles(files);
  if (openable.length === 0) return null;

  const open = async (file: LiveVoiceToolFile) => {
    if (opening) return;
    setOpening(file.uri);
    try {
      const localUri = await downloadGeneratedFile(
        resolveGeneratedFileUri(file.uri, API_URL),
        file.name,
      );
      await shareFile(localUri);
    } catch {
      Alert.alert('Could not open this file', 'The file could not be downloaded.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      {openable.map((file) => (
        <PressableBox
          key={file.uri}
          testID="live-voice-tool-file"
          onPress={() => void open(file)}
          disabled={opening !== null}
          accessibilityRole="button"
          accessibilityLabel={`Open ${file.name}`}
          accessibilityState={{ busy: opening === file.uri, disabled: opening !== null }}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          {opening === file.uri ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <FileText size={16} color={colors.textSecondary} />
          )}
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.footnote,
              fontWeight: '600',
              textDecorationLine: 'underline',
            }}
          >
            {`Open ${file.name}`}
          </Text>
        </PressableBox>
      ))}
    </View>
  );
}
