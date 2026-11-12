import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import { FileText, Plus, Trash2, Type } from 'lucide-react-native';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { ALLOWED_ATTACHMENT_MIME_PREFIXES, IMAGE_ATTACHMENT_MIME_TYPES } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import {
  cloudProjectSources,
  useProjectSourceTarget,
  useProjectStore,
  ProjectSourceCancelledError,
  ProjectSourceError,
} from '@/src/features/projects/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { formatBytes } from '@agiworkforce/utils/format';
import { formatRelativeTime } from '@agiworkforce/utils/format';
import { typeScale } from '@/src/ui/theme/tokens';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';

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

interface UploadProgress {
  name: string;
  position: number;
  total: number;
  percent: number | null;
}

const EMPTY_SOURCES: DisplaySource[] = [];

export function uploadProgressLabel({ name, percent }: UploadProgress): string {
  return percent === null ? `Adding ${name}` : `Uploading ${name}, ${percent}%`;
}

function percentOf(bytesSent: number, totalBytes: number): number | null {
  if (totalBytes <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((bytesSent / totalBytes) * 100)));
}

export function projectSourceErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ProjectSourceError && error.message.trim() ? error.message : fallback;
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
    onRemove(source.id);
  }, [source.id, onRemove]);

  return (
    <View
      className="flex-row items-center gap-3 px-4 py-3 rounded-xl mb-2"
      style={{
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: `${colors.teal}18` }}
      >
        <FileText size={18} color={colors.teal} />
      </View>

      <View className="flex-1">
        <Text
          className="text-[14px] font-medium"
          style={{ color: colors.textPrimary }}
          numberOfLines={1}
        >
          {source.name}
        </Text>
        <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
          {formatBytes(source.size)} · {formatRelativeTime(source.addedAt)}
        </Text>
      </View>

      <PressableBox
        onPress={handleRemove}
        className="p-2 rounded-lg"
        style={{ backgroundColor: `${colors.agentError}10` }}
        accessibilityLabel={`Remove ${source.name}`}
        accessibilityRole="button"
      >
        <Trash2 size={15} color={colors.agentError} />
      </PressableBox>
    </View>
  );
}

function UploadProgressRow({
  progress,
  onCancel,
}: {
  progress: UploadProgress;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  const label = uploadProgressLabel(progress);
  const position = `File ${progress.position} of ${progress.total}`;
  return (
    <View
      className="flex-row items-center gap-3 px-4 py-2 mx-4 mb-2 rounded-xl"
      style={{
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
      testID="project-source-upload-progress"
    >
      <LoadingIndicator size="small" />
      <View className="flex-1" accessible accessibilityLiveRegion="polite">
        <Text
          className="text-sm font-medium"
          style={{ color: colors.textPrimary }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          {position}
        </Text>
      </View>
      <PressableBox
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel adding sources"
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3"
        style={{ backgroundColor: `${colors.textMuted}14` }}
      >
        <Text className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
          Cancel
        </Text>
      </PressableBox>
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
      <Text className="text-sm text-center leading-[19px]" style={{ color: colors.textSecondary }}>
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
  const [, setAccountRevision] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [textEditorState, setTextEditorState] = useState({ session: 0, revision: 0, open: false });
  const textEditorRef = useRef(textEditorState);
  const textEditorOpen = textEditorState.open;
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const mounted = useRef(true);
  const lifetimeRef = useRef(0);
  const requestRef = useRef(0);
  const uploadRef = useRef<AbortController | null>(null);
  const viewRef = useRef({ projectId, target, generation: 0 });
  if (viewRef.current.projectId !== projectId || viewRef.current.target !== target) {
    viewRef.current = { projectId, target, generation: viewRef.current.generation + 1 };
  }
  const renderedGeneration = viewRef.current.generation;
  const account = target === 'cloud' ? captureCloudAccountEpoch() : null;
  const ownerId = account?.ownerId;
  const epoch = account?.epoch;
  const renderedAccount = useMemo(() => {
    if (target !== 'cloud') return undefined;
    return ownerId !== undefined && epoch !== undefined ? { ownerId, epoch } : null;
  }, [target, ownerId, epoch]);
  const captureContext = useCallback(() => {
    const lifetime = lifetimeRef.current;
    const accountEpoch = renderedAccount;
    return {
      accountEpoch,
      isCurrent: () =>
        mounted.current &&
        lifetime === lifetimeRef.current &&
        renderedGeneration === viewRef.current.generation &&
        projectId === viewRef.current.projectId &&
        target === viewRef.current.target &&
        (target !== 'cloud' || isCloudAccountEpochCurrent(accountEpoch)),
    };
  }, [projectId, target, renderedGeneration, renderedAccount]);

  const resetTextEditor = useCallback(() => {
    const next = { session: textEditorRef.current.session + 1, revision: 0, open: false };
    textEditorRef.current = next;
    setTextEditorState(next);
    setTextTitle('');
    setTextBody('');
  }, []);

  const openTextEditor = useCallback(() => {
    if (!captureContext().isCurrent() || textEditorRef.current.open) return;
    const next = { session: textEditorRef.current.session + 1, revision: 0, open: true };
    textEditorRef.current = next;
    setTextEditorState(next);
  }, [captureContext]);

  const closeTextEditor = useCallback(() => {
    if (
      !captureContext().isCurrent() ||
      !textEditorState.open ||
      textEditorRef.current.session !== textEditorState.session
    )
      return;
    resetTextEditor();
  }, [captureContext, resetTextEditor, textEditorState.open, textEditorState.session]);

  const editTextSource = useCallback(
    (field: 'title' | 'body', value: string) => {
      if (
        !captureContext().isCurrent() ||
        !textEditorRef.current.open ||
        textEditorRef.current.session !== textEditorState.session
      )
        return;
      const next = { ...textEditorRef.current, revision: textEditorRef.current.revision + 1 };
      textEditorRef.current = next;
      setTextEditorState(next);
      if (field === 'title') setTextTitle(value);
      else setTextBody(value);
    },
    [captureContext, textEditorState.session],
  );

  useEffect(() => {
    return subscribeCloudAccountEpochChange(() => {
      if (viewRef.current.target !== 'cloud') return;
      viewRef.current.generation += 1;
      setAccountRevision((revision) => revision + 1);
      requestRef.current += 1;
      uploadRef.current?.abort();
      uploadRef.current = null;
      setCloudSources(EMPTY_SOURCES);
      setLoadError(null);
      setUploadProgress(null);
      resetTextEditor();
      setBusy(false);
    });
  }, [resetTextEditor]);

  useEffect(() => {
    uploadRef.current?.abort();
    uploadRef.current = null;
    setUploadProgress(null);
    resetTextEditor();
    return () => {
      uploadRef.current?.abort();
    };
  }, [projectId, target, resetTextEditor]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifetimeRef.current += 1;
      uploadRef.current?.abort();
    };
  }, []);

  const cancelUpload = useCallback(() => {
    uploadRef.current?.abort();
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
    const context = captureContext();
    if (!context.isCurrent()) return;
    const request = ++requestRef.current;
    setBusy(true);
    try {
      const files = await cloudProjectSources.list(projectId, context.accountEpoch);
      if (!context.isCurrent() || requestRef.current !== request) return;
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
      if (!context.isCurrent() || requestRef.current !== request) return;
      setLoadError(
        projectSourceErrorMessage(error, 'Could not load this project’s sources. Retry.'),
      );
    } finally {
      if (context.isCurrent() && requestRef.current === request) setBusy(false);
    }
  }, [projectId, captureContext]);

  useEffect(() => {
    if (target !== 'cloud') {
      requestRef.current += 1;
      setCloudSources(EMPTY_SOURCES);
      setLoadError(null);
      setBusy(false);
      return;
    }
    void refreshCloudSources();
  }, [target, refreshCloudSources]);

  const sources = target === 'cloud' ? cloudSources : localSources;

  const handleAddSources = useCallback(async () => {
    if (target === 'unknown') {
      Alert.alert('Project unavailable', 'This project is no longer available on this device.');
      return;
    }

    const context = captureContext();
    if (!context.isCurrent()) return;
    if (uploadRef.current) return;
    const controller = new AbortController();
    uploadRef.current = controller;
    setBusy(true);
    try {
      let result: DocumentPicker.DocumentPickerResult;
      try {
        result = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
          type: [...PROJECT_SOURCE_MIME_TYPES],
        });
      } catch {
        if (context.isCurrent()) Alert.alert('Error', 'Could not pick files. Please try again.');
        return;
      }
      if (!context.isCurrent() || controller.signal.aborted || result.canceled) return;

      const failures: string[] = [];
      const total = result.assets.length;
      for (const [index, asset] of result.assets.entries()) {
        if (!context.isCurrent() || controller.signal.aborted) break;
        setUploadProgress({ name: asset.name, position: index + 1, total, percent: null });
        try {
          await addSource(
            projectId,
            {
              name: asset.name,
              mimeType: asset.mimeType ?? 'application/octet-stream',
              size: asset.size ?? 0,
              uri: asset.uri,
            },
            {
              accountEpoch: context.accountEpoch,
              signal: controller.signal,
              onProgress: ({ bytesSent, totalBytes }) => {
                if (!context.isCurrent() || controller.signal.aborted) return;
                const percent = percentOf(bytesSent, totalBytes);
                setUploadProgress((current) =>
                  current && current.position === index + 1 && current.percent !== percent
                    ? { ...current, percent }
                    : current,
                );
              },
            },
          );
        } catch (error) {
          if (
            !context.isCurrent() ||
            error instanceof ProjectSourceCancelledError ||
            controller.signal.aborted
          )
            break;
          failures.push(
            projectSourceErrorMessage(error, `"${asset.name}" could not be added. Try again.`),
          );
        }
      }
      if (!context.isCurrent()) return;
      setUploadProgress(null);
      if (target === 'cloud') await refreshCloudSources();
      if (!context.isCurrent()) return;
      if (failures.length > 0) {
        Alert.alert('Some sources were not added', failures.join('\n\n'));
      }
    } finally {
      if (uploadRef.current === controller) {
        uploadRef.current = null;
        if (context.isCurrent()) {
          setUploadProgress(null);
          setBusy(false);
        }
      }
    }
  }, [projectId, target, addSource, refreshCloudSources, captureContext]);

  const handleSaveText = useCallback(async () => {
    const editorIsCurrent = () => textEditorState.open && textEditorRef.current === textEditorState;
    if (!editorIsCurrent()) return;
    const context = captureContext();
    if (!context.isCurrent()) return;
    if (uploadRef.current) return;
    const body = textBody.trim();
    if (!body || !cacheDirectory) return;
    const baseName =
      textTitle
        .trim()
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .trim() || 'Text';
    const name = baseName.toLowerCase().endsWith('.txt') ? baseName : `${baseName}.txt`;
    const uri = `${cacheDirectory}project-text-${uuidv7()}.txt`;
    setBusy(true);
    const controller = new AbortController();
    uploadRef.current = controller;
    try {
      await writeAsStringAsync(uri, body);
      if (!context.isCurrent() || controller.signal.aborted) return;
      await addSource(
        projectId,
        {
          name,
          mimeType: 'text/plain',
          size: new TextEncoder().encode(body).length,
          uri,
        },
        { signal: controller.signal, accountEpoch: context.accountEpoch },
      );
      if (!context.isCurrent()) return;
      if (target === 'cloud') await refreshCloudSources();
      if (context.isCurrent() && editorIsCurrent()) closeTextEditor();
    } catch (error) {
      if (!context.isCurrent() || controller.signal.aborted || !editorIsCurrent()) return;
      Alert.alert(
        'Text was not added',
        projectSourceErrorMessage(error, 'Check your connection and try again.'),
      );
    } finally {
      if (uploadRef.current === controller) {
        uploadRef.current = null;
        if (context.isCurrent()) setBusy(false);
      }
    }
  }, [
    addSource,
    closeTextEditor,
    projectId,
    refreshCloudSources,
    target,
    textBody,
    textTitle,
    textEditorState,
    captureContext,
  ]);

  const handleRemove = useCallback(
    async (sourceId: string) => {
      const context = captureContext();
      if (!context.isCurrent()) return;
      try {
        await removeSource(projectId, sourceId, context.accountEpoch);
        if (!context.isCurrent()) return;
        if (target === 'cloud') await refreshCloudSources();
      } catch (error) {
        if (!context.isCurrent()) return;
        Alert.alert(
          'Could not remove source',
          projectSourceErrorMessage(error, 'Please try again.'),
        );
      }
    },
    [projectId, target, removeSource, refreshCloudSources, captureContext],
  );

  const handleRemovePress = useCallback(
    (sourceId: string) => {
      const context = captureContext();
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (!context.isCurrent() || !source) return;
      Alert.alert('Remove source', `Remove "${source.name}" from this project?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (context.isCurrent()) void handleRemove(sourceId);
          },
        },
      ]);
    },
    [captureContext, handleRemove, sources],
  );

  return (
    <View className="flex-1">
      <View className="px-4 pt-4 pb-2">
        <PressableBox
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
          {busy ? <LoadingIndicator size="small" /> : null}
          <Plus size={16} color={colors.teal} />
          <Text className="text-[14px] font-semibold" style={{ color: colors.teal }}>
            Add sources
          </Text>
        </PressableBox>
        <PressableBox
          onPress={openTextEditor}
          disabled={busy || target === 'unknown'}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl mt-2"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: busy || target === 'unknown' ? 0.5 : 1,
          }}
          accessibilityRole="button"
          accessibilityLabel="Add text"
          accessibilityState={{ disabled: busy || target === 'unknown' }}
        >
          <Type size={16} color={colors.textPrimary} />
          <Text className="text-[14px] font-semibold" style={{ color: colors.textPrimary }}>
            Add text
          </Text>
        </PressableBox>
      </View>

      {uploadProgress ? (
        <UploadProgressRow progress={uploadProgress} onCancel={cancelUpload} />
      ) : null}

      <Modal
        visible={textEditorOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeTextEditor}
      >
        <KeyboardAvoidingView
          accessibilityViewIsModal
          behavior={keyboardAvoidingBehavior('modal')}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        >
          <View
            style={{
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              paddingBottom: 32,
              gap: 12,
            }}
          >
            <Text
              style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
            >
              Add text
            </Text>
            <TextInput
              value={textTitle}
              onChangeText={(value) => editTextSource('title', value)}
              placeholder="Title"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Text source title"
              maxLength={120}
              style={{
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                color: colors.textPrimary,
              }}
            />
            <TextInput
              value={textBody}
              onChangeText={(value) => editTextSource('body', value)}
              placeholder="Paste or type the text this project should use"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Text source content"
              multiline
              textAlignVertical="top"
              style={{
                minHeight: 160,
                maxHeight: 320,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                color: colors.textPrimary,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <PressableBox
                onPress={closeTextEditor}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </PressableBox>
              <PressableBox
                onPress={() => void handleSaveText()}
                disabled={busy || !textBody.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add"
                accessibilityState={{ disabled: busy || !textBody.trim() }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  opacity: busy || !textBody.trim() ? 0.5 : 1,
                }}
              >
                {busy ? (
                  <LoadingIndicator size="small" />
                ) : (
                  <Text style={{ color: colors.teal, fontWeight: '600' }}>Add</Text>
                )}
              </PressableBox>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {target === 'unknown' ? (
        <Notice
          title="Project unavailable"
          body="This project is no longer available on this device, so sources cannot be added."
        />
      ) : loadError ? (
        <View className="items-center">
          <Notice title="Could not load sources" body={loadError} />
          <PressableBox
            onPress={() => void refreshCloudSources()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Retry loading project sources"
            accessibilityState={{ disabled: busy }}
            className="min-h-[48px] min-w-[140px] items-center justify-center rounded-xl px-5"
            style={{ backgroundColor: colors.surfaceElevated }}
          >
            <Text style={{ color: colors.textPrimary }}>Try Again</Text>
          </PressableBox>
        </View>
      ) : sources.length === 0 ? (
        <Notice
          title="No sources added yet"
          body="Add files or text to give the project more context."
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
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
