/**
 * ProjectSourcesTab — knowledge-file browser for the project detail screen.
 *
 * Shows attached files (name, size, date), "Add sources" CTA using
 * expo-document-picker, and an empty state when no sources are present.
 *
 * Sources live in the local project store.
 */

import { useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, Plus, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useProjectStore } from '@/src/features/projects/store';
import type { ProjectSource } from '@/src/features/projects/store';
import { formatBytes } from '@agiworkforce/utils/format';
import { formatRelativeTime } from '@agiworkforce/utils/format';

interface ProjectSourcesTabProps {
  projectId: string;
}

const EMPTY_PROJECT_SOURCES: ProjectSource[] = [];

function SourceRow({
  source,
  onRemove,
}: {
  source: ProjectSource;
  onRemove: (id: string) => void;
}) {
  const colors = useThemeColors();

  const handleRemove = useCallback(() => {
    Alert.alert('Remove source', `Remove "${source.name}" from this project?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemove(source.id) },
    ]);
  }, [source.id, source.name, onRemove]);

  return (
    <View
      className="flex-row items-center gap-3 px-4 py-3 rounded-xl mb-2"
      style={{
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* File icon */}
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: `${colors.teal}18` }}
      >
        <FileText size={18} color={colors.teal} />
      </View>

      {/* Name + meta */}
      <View className="flex-1">
        <Text
          className="text-[14px] font-medium"
          style={{ color: colors.textPrimary }}
          numberOfLines={1}
        >
          {source.name}
        </Text>
        <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
          {formatBytes(source.size)} · {formatRelativeTime(source.addedAt)}
        </Text>
      </View>

      {/* Remove */}
      <Pressable
        onPress={handleRemove}
        className="p-2 rounded-lg"
        style={{ backgroundColor: `${colors.agentError}10` }}
        accessibilityLabel={`Remove ${source.name}`}
        accessibilityRole="button"
      >
        <Trash2 size={15} color={colors.agentError} />
      </Pressable>
    </View>
  );
}

function EmptyState() {
  const colors = useThemeColors();
  return (
    <View className="items-center justify-center py-16 px-6">
      <View
        className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
        style={{ backgroundColor: `${colors.textMuted}14` }}
      >
        <FileText size={28} color={colors.textMuted} />
      </View>
      <Text
        className="text-[15px] font-semibold text-center mb-2"
        style={{ color: colors.textPrimary }}
      >
        No sources added yet
      </Text>
      <Text
        className="text-[13px] text-center leading-[19px]"
        style={{ color: colors.textSecondary }}
      >
        Add files to give the project more context.
      </Text>
    </View>
  );
}

export function ProjectSourcesTab({ projectId }: ProjectSourcesTabProps) {
  const colors = useThemeColors();
  const projects = useProjectStore((s) => s.projects);
  const sources = useMemo(
    () => projects.find((project) => project.id === projectId)?.sources ?? EMPTY_PROJECT_SOURCES,
    [projectId, projects],
  );
  const addSource = useProjectStore((s) => s.addSource);
  const removeSource = useProjectStore((s) => s.removeSource);

  const handleAddSources = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      for (const asset of result.assets) {
        addSource(projectId, {
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          size: asset.size ?? 0,
          uri: asset.uri,
        });
      }
    } catch {
      Alert.alert('Error', 'Could not pick files. Please try again.');
    }
  }, [projectId, addSource]);

  const handleRemove = useCallback(
    (sourceId: string) => {
      removeSource(projectId, sourceId);
    },
    [projectId, removeSource],
  );

  return (
    <View className="flex-1">
      {/* Add sources button */}
      <View className="px-4 pt-4 pb-2">
        <Pressable
          onPress={handleAddSources}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
          style={{
            backgroundColor: `${colors.teal}18`,
            borderWidth: 1,
            borderColor: `${colors.teal}35`,
          }}
          accessibilityRole="button"
          accessibilityLabel="Add sources"
        >
          <Plus size={16} color={colors.teal} />
          <Text className="text-[14px] font-semibold" style={{ color: colors.teal }}>
            Add sources
          </Text>
        </Pressable>
      </View>

      {/* List or empty state */}
      {sources.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} onRemove={handleRemove} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
