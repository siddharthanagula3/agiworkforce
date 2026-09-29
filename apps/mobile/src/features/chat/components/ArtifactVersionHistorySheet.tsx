import { useMemo } from 'react';
import { FlatList, Modal, View } from 'react-native';
import { X } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { dialogPadding, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  summarizeArtifactVersions,
  type VersionedContent,
} from '@/src/features/artifacts/versionSummary';

interface ArtifactVersionHistorySheetProps {
  visible: boolean;
  versions: readonly VersionedContent[];
  shownIndex: number;
  onOpen: (index: number) => void;
  onRestore: (index: number) => void;
  onClose: () => void;
}

export function ArtifactVersionHistorySheet({
  visible,
  versions,
  shownIndex,
  onOpen,
  onRestore,
  onClose,
}: ArtifactVersionHistorySheetProps) {
  const colors = useThemeColors();
  const summaries = useMemo(() => summarizeArtifactVersions(versions), [versions]);
  const latestIndex = versions.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      accessibilityViewIsModal
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: colors.surfaceBase, padding: dialogPadding }}
        testID="artifact-version-history"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            Version history
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close version history"
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <FlatList
          data={summaries}
          keyExtractor={(summary) => String(summary.index)}
          renderItem={({ item }) => {
            const isShown = item.index === shownIndex;
            const isLatest = item.index === latestIndex;
            const title = isLatest
              ? `Version ${item.index + 1}, current`
              : `Version ${item.index + 1}`;
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Pressable
                  onPress={() => onOpen(item.index)}
                  accessibilityRole="button"
                  accessibilityLabel={[title, item.when, item.change].filter(Boolean).join(', ')}
                  accessibilityHint="Shows this version"
                  accessibilityState={{ selected: isShown }}
                  testID={`artifact-version-row-${item.index}`}
                  style={{ flex: 1, minHeight: 56, paddingVertical: 10 }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.body,
                      fontWeight: isShown ? '600' : '400',
                    }}
                  >
                    {title}
                  </Text>
                  {item.when ? (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: typeScale.footnote,
                        marginTop: 2,
                      }}
                    >
                      {item.when}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.footnote,
                      marginTop: 2,
                    }}
                  >
                    {item.change}
                  </Text>
                </Pressable>
                {isLatest ? null : (
                  <Pressable
                    onPress={() => onRestore(item.index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore version ${item.index + 1}`}
                    testID={`artifact-version-restore-${item.index}`}
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: typeScale.footnote,
                        fontWeight: '500',
                      }}
                    >
                      Restore
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}
