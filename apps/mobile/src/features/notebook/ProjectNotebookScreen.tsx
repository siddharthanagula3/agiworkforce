import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Search } from 'lucide-react-native';
import {
  PROJECT_STUDIO_OUTPUTS,
  type ManagedCloudProjectKnowledgeFile,
  type ProjectStudioOutput,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  CloudFeatureGate,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
  SectionCard,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  listNotebookSources,
  notebookSourceCanReindex,
  notebookSourceStatus,
  reindexNotebookSource,
  searchNotebookSources,
  startStudioOutput,
} from './service';

function StudioTile({
  output,
  busy,
  disabled,
  onPress,
}: {
  output: ProjectStudioOutput;
  busy: boolean;
  disabled: boolean;
  onPress: (output: ProjectStudioOutput) => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={() => onPress(output)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Create ${output.label.toLowerCase()}`}
      accessibilityHint={output.description}
      accessibilityState={{ disabled, busy }}
      style={{
        width: '48%',
        minHeight: 76,
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 12,
        gap: 4,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        opacity: disabled && !busy ? 0.6 : 1,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}>
        {busy ? 'Starting…' : output.label}
      </Text>
      <MetaText>{output.description}</MetaText>
    </PressableBox>
  );
}

export function ProjectNotebookScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const projectId = typeof id === 'string' ? id : '';
  const projectName = typeof name === 'string' && name ? name : 'Project';
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(`/(app)/projects/${encodeURIComponent(projectId)}`);
  const [sources, setSources] = useState<ManagedCloudProjectKnowledgeFile[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!access.ready || !projectId) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    listNotebookSources(projectId, controller.signal)
      .then((files) => {
        if (isCloudAccountEpochCurrent(account)) setSources(files);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setSources([]);
        setError(cloudActionError(loadError, 'Could not load this project’s sources.'));
      });
    return () => controller.abort();
  }, [access.ready, attempt, projectId]);

  const matches = useMemo(() => searchNotebookSources(sources ?? [], query), [query, sources]);

  const create = useCallback(
    async (output: ProjectStudioOutput) => {
      if (starting) return;
      setStarting(output.id);
      setError(null);
      try {
        const conversationId = await startStudioOutput({ projectId, output });
        router.push({ pathname: '/(app)/chat/[id]' as const, params: { id: conversationId } });
      } catch (startError) {
        setError(
          cloudActionError(startError, `Could not start the ${output.label.toLowerCase()}.`),
        );
      } finally {
        setStarting(null);
      }
    },
    [projectId, router, starting],
  );

  const reindex = useCallback(
    async (file: ManagedCloudProjectKnowledgeFile) => {
      setReindexing(file.id);
      setError(null);
      try {
        await reindexNotebookSource(projectId, file.id);
        setAttempt((value) => value + 1);
      } catch (reindexError) {
        setError(cloudActionError(reindexError, `Could not read ${file.fileName} again.`));
      } finally {
        setReindexing(null);
      }
    },
    [projectId],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Notebook"
        feature="Project notebooks"
        description="Notebooks run in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const hasSources = (sources?.length ?? 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title={projectName} onBack={goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
      >
        {error ? <ErrorBanner message={error} /> : null}
        <SectionCard
          title="Create from your sources"
          description="Each opens a new chat in this project, grounded in its sources."
        >
          {!hasSources && sources !== null ? (
            <MetaText>Add a source to this project first.</MetaText>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'space-between',
            }}
          >
            {PROJECT_STUDIO_OUTPUTS.map((output) => (
              <StudioTile
                key={output.id}
                output={output}
                busy={starting === output.id}
                disabled={starting !== null || !hasSources}
                onPress={(chosen) => void create(chosen)}
              />
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Sources">
          <View
            style={{
              height: 44,
              borderRadius: 12,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.inputSurface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search sources"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search sources"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: typeScale.body,
                paddingVertical: 0,
              }}
            />
          </View>
          {sources === null ? (
            <LoadingRows count={2} />
          ) : matches.length === 0 ? (
            <MetaText>
              {query.trim() ? `No sources match “${query.trim()}”.` : 'No sources yet.'}
            </MetaText>
          ) : (
            matches.map((file) => (
              <View
                key={file.id}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <FileText size={16} color={colors.textSecondary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}
                  >
                    {file.fileName}
                  </Text>
                  {file.summary ? (
                    <Text
                      numberOfLines={2}
                      style={{
                        color: colors.textSecondary,
                        fontSize: typeScale.caption,
                        lineHeight: 17,
                      }}
                    >
                      {file.summary}
                    </Text>
                  ) : null}
                  <MetaText>{notebookSourceStatus(file)}</MetaText>
                </View>
                {notebookSourceCanReindex(file) ? (
                  <Button
                    title="Read again"
                    size="sm"
                    variant="outline"
                    loading={reindexing === file.id}
                    disabled={reindexing !== null}
                    accessibilityLabel={`Read ${file.fileName} again`}
                    onPress={() => void reindex(file)}
                  />
                ) : null}
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
