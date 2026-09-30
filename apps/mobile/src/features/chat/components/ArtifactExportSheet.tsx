import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FileCode, FileDown, FileText, X, type LucideIcon } from 'lucide-react-native';

import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { shareFile } from '@/services/fileCreation';
import {
  artifactExportOptions,
  exportArtifact,
  type ArtifactExportFormat,
  type ArtifactExportOption,
} from '@/src/features/chat/utils/artifactExport';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { Artifact } from '@/types/chat';

const FORMAT_ICONS: Readonly<Record<ArtifactExportFormat, LucideIcon>> = {
  markdown: FileText,
  pdf: FileDown,
  docx: FileText,
  text: FileText,
  source: FileCode,
};

interface ArtifactExportSheetProps {
  artifact: Pick<Artifact, 'type' | 'language' | 'title'>;
  content: string;
  visible: boolean;
  onClose: () => void;
}

export function ArtifactExportSheet({
  artifact,
  content,
  visible,
  onClose,
}: ArtifactExportSheetProps) {
  const colors = useThemeColors();
  const [exporting, setExporting] = useState<ArtifactExportFormat | null>(null);
  const options = useMemo(() => artifactExportOptions(artifact), [artifact]);

  const handleExport = useCallback(
    async (option: ArtifactExportOption) => {
      if (exporting) return;
      setExporting(option.format);
      try {
        const uri = await exportArtifact(content, artifact.title, option);
        await shareFile(uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } catch {
        Alert.alert('Download failed', `Could not save this as ${option.label}. Try again.`);
      } finally {
        setExporting(null);
      }
    },
    [artifact.title, content, exporting, onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
        accessibilityLabel="Dismiss download options"
        accessibilityRole="button"
        accessible={false}
      >
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => undefined}
            accessible={false}
          >
            <View style={styles.header}>
              <Text
                style={{
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                Download as
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="Close download options"
                accessibilityRole="button"
                style={styles.closeButton}
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={{ gap: 4 }}>
              {options.map((option) => {
                const Icon = FORMAT_ICONS[option.format];
                const busy = exporting === option.format;
                return (
                  <Pressable
                    key={option.format}
                    onPress={() => void handleExport(option)}
                    disabled={exporting !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Download as ${option.label}`}
                    accessibilityHint={option.detail}
                    accessibilityState={{ disabled: exporting !== null, busy }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                      opacity: exporting !== null && !busy ? 0.4 : 1,
                    })}
                  >
                    <View style={[styles.iconWell, { backgroundColor: colors.neutralSurface }]}>
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : (
                        <Icon size={20} color={colors.textSecondary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: typeScale.body,
                          fontWeight: '500',
                          color: colors.textPrimary,
                        }}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          color: colors.textMuted,
                          marginTop: 2,
                        }}
                      >
                        {option.detail}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
