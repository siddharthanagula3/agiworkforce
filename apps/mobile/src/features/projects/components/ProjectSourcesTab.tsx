import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, Plus, Trash2 } from 'lucide-react-native';
import { ALLOWED_ATTACHMENT_MIME_PREFIXES, IMAGE_ATTACHMENT_MIME_TYPES } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  cloudProjectSources,
  useProjectSourceTarget,
  useProjectStore,
} from '@/src/features/projects/store';
import { formatBytes } from '@agiworkforce/utils/format';
import { formatRelativeTime } from '@agiworkforce/utils/format';

interface ProjectSourcesTabProps {
  projectId: string;
}

interface DisplaySource {
  id: string;
  name: string;
  size: number;
  addedAt: string;
}

/** Derived from the shared attachment allowlist the upload path and the server both enforce. */
export const PROJECT_SOURCE_MIME_TYPES: readonly string[] = [
  ...IMAGE_ATTACHMENT_MIME_TYPES,
  ...ALLOWED_ATTACHMENT_MIME_PREFIXES.map((prefix) =>
    prefix.endsWith('/') ? `${prefix}*` : prefix,
  ),
];

const EMPTY_SOURCES: DisplaySource[] = [];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function SourceRow({
  source,
  onRemove,
}: {
  source: DisplaySource;
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

function Notice({ title, body }: { title: string; body: string }) {
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
        {title}
      </Text>
      <Text
        className="text-[13px] text-center leading-[19px]"
        style={{ color: colors.textSecondary }}
      >
        {body}
      </Text>
    </View>
  );
}

export function ProjectSourcesTab({ projectId }: ProjectSourcesTabProps) {
  const colors = useThemeColors();
  const target = useProjectSourceTarget(projectId);
  const projects = useProjectStore((s) => s.projects);
  const addSource = useProjectStore((s) => s.addSource);
  const removeSource = useProjectStore((s) => s.removeSource);

  const [cloudSources, setCloudSources] = useState<DisplaySource[]>(EMPTY_SOURCES);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const localSources = useMemo<DisplaySource[]>(
    () =>
      (projects.find((project) => project.id === projectId)?.sources ?? []).map((source) => ({
        id: source.id,
        name: source.name,
        size: source.size,
        addedAt: source.addedAt,
      })),
    [projectId, projects],
  );

  const refreshCloudSources = useCallback(async () => {
    try {
      const files = await cloudProjectSources.list(projectId);
      if (!mounted.current) return;
      setCloudSources(
        files.map((file) => ({
          id: file.id,
          name: file.fileName,
          size: file.byteCount,
          addedAt: file.addedAt,
        })),
      );
      setLoadError(null);
    } catch (error) {
      if (!mounted.current) return;
      setLoadError(errorMessage(error, 'Could not load this project’s sources.'));
    }
  }, [projectId]);

  useEffect(() => {
    if (target !== 'cloud') {
      setCloudSources(EMPTY_SOURCES);
      setLoadError(null);
      return;
    }
    setBusy(true);
    void refreshCloudSources().finally(() => {
      if (mounted.current) setBusy(false);
    });
  }, [target, refreshCloudSources]);

  const sources = target === 'cloud' ? cloudSources : localSources;

  const handleAddSources = useCallback(async () => {
    if (target === 'unknown') {
      Alert.alert('Project unavailable', 'This project is no longer available on this device.');
      return;
    }

    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [...PROJECT_SOURCE_MIME_TYPES],
      });
    } catch {
      Alert.alert('Error', 'Could not pick files. Please try again.');
      return;
    }
    if (result.canceled) return;

    setBusy(true);
    const failures: string[] = [];
    for (const asset of result.assets) {
      try {
        await addSource(projectId, {
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          size: asset.size ?? 0,
          uri: asset.uri,
        });
      } catch (error) {
        failures.push(errorMessage(error, `"${asset.name}" could not be added.`));
      }
    }
    if (target === 'cloud') await refreshCloudSources();
    if (!mounted.current) return;
    setBusy(false);
    if (failures.length > 0) {
      Alert.alert('Some sources were not added', failures.join('\n\n'));
    }
  }, [projectId, target, addSource, refreshCloudSources]);

  const handleRemove = useCallback(
    async (sourceId: string) => {
      try {
        await removeSource(projectId, sourceId);
        if (target === 'cloud') await refreshCloudSources();
      } catch (error) {
        Alert.alert('Could not remove source', errorMessage(error, 'Please try again.'));
      }
    },
    [projectId, target, removeSource, refreshCloudSources],
  );

  const handleRemovePress = useCallback(
    (sourceId: string) => {
      void handleRemove(sourceId);
    },
    [handleRemove],
  );

  return (
    <View className="flex-1">
      {/* Add sources button */}
      <View className="px-4 pt-4 pb-2">
        <Pressable
          onPress={() => void handleAddSources()}
          disabled={busy || target === 'unknown'}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
          style={{
            backgroundColor: `${colors.teal}18`,
            borderWidth: 1,
            borderColor: `${colors.teal}35`,
            opacity: busy || target === 'unknown' ? 0.5 : 1,
          }}
          accessibilityRole="button"
          accessibilityLabel="Add sources"
          accessibilityState={{ disabled: busy || target === 'unknown' }}
        >
          {busy ? <ActivityIndicator size="small" color={colors.teal} /> : null}
          <Plus size={16} color={colors.teal} />
          <Text className="text-[14px] font-semibold" style={{ color: colors.teal }}>
            Add sources
          </Text>
        </Pressable>
      </View>

      {target === 'unknown' ? (
        <Notice
          title="Project unavailable"
          body="This project is no longer available on this device, so sources cannot be added."
        />
      ) : loadError ? (
        <Notice title="Could not load sources" body={loadError} />
      ) : sources.length === 0 ? (
        <Notice title="No sources added yet" body="Add files to give the project more context." />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} onRemove={handleRemovePress} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
