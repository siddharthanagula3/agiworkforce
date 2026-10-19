import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  MemberOrganizationPluginsResponse,
  PluginMarketplaceEntry,
  PluginMarketplaceInstallation,
  PluginMarketplaceSourceSummary,
  PluginSubmissionSummary,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  CloudFeatureGate,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
  SectionCard,
  TextField,
  ToggleRow,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { PLUGINS_ROUTE } from './PluginsScreen';
import {
  SUBMISSION_STATUS_LABELS,
  WORKSPACE_PREFERENCE_LABELS,
  addMarketplace,
  fetchMarketplaceEntries,
  fetchMarketplaceInstallations,
  fetchMarketplaces,
  fetchPluginSubmissions,
  fetchWorkspacePlugins,
  installMarketplaceEntry,
  refreshMarketplace,
  removeMarketplace,
  removeMarketplaceInstallation,
  submitMarketplaceEntry,
  updateWorkspacePlugin,
  withdrawPluginSubmission,
} from './sourcesService';

interface SourcesState {
  workspace: MemberOrganizationPluginsResponse | null;
  marketplaces: PluginMarketplaceSourceSummary[];
  entries: PluginMarketplaceEntry[];
  installations: PluginMarketplaceInstallation[];
  submissions: PluginSubmissionSummary[];
}

async function loadSources(signal: AbortSignal): Promise<SourcesState> {
  const [workspace, marketplaces, entries, installations, submissions] = await Promise.all([
    fetchWorkspacePlugins(signal).catch(() => null),
    fetchMarketplaces(signal),
    fetchMarketplaceEntries(signal),
    fetchMarketplaceInstallations(signal),
    fetchPluginSubmissions(signal).catch(() => []),
  ]);
  return { workspace, marketplaces, entries, installations, submissions };
}

export function PluginSourcesScreen() {
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(PLUGINS_ROUTE);
  const [state, setState] = useState<SourcesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [ref, setRef] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!access.ready) return;
    const controller = new AbortController();
    loadSources(controller.signal)
      .then(setState)
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(cloudActionError(loadError, 'Could not load your plugin sources.'));
        setState(
          (current) =>
            current ?? {
              workspace: null,
              marketplaces: [],
              entries: [],
              installations: [],
              submissions: [],
            },
        );
      });
    return () => controller.abort();
  }, [access.ready, attempt]);

  const run = useCallback(async (key: string, action: () => Promise<unknown>, failure: string) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      setAttempt((value) => value + 1);
      return true;
    } catch (actionError) {
      setError(cloudActionError(actionError, failure));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const installationsByEntry = useMemo(
    () =>
      new Map(
        (state?.installations ?? []).map((installation) => [installation.entryId, installation]),
      ),
    [state?.installations],
  );
  const submittedEntries = useMemo(
    () =>
      new Set(
        (state?.submissions ?? [])
          .filter(
            (submission) => submission.status === 'pending' || submission.status === 'approved',
          )
          .map((submission) => submission.entryId),
      ),
    [state?.submissions],
  );

  const removeSource = useCallback(
    async (source: PluginMarketplaceSourceSummary) => {
      const confirmed = await confirmIrreversible({
        title: `Remove ${source.name}?`,
        consequence:
          'Its plugins leave your directory. Plugins you already installed from it stay installed.',
        actionLabel: 'Remove',
      });
      if (confirmed) {
        await run(
          `source:${source.id}`,
          () => removeMarketplace(source.id),
          'Could not remove that marketplace.',
        );
      }
    },
    [run],
  );

  const uninstallEntry = useCallback(
    async (entry: PluginMarketplaceEntry, installation: PluginMarketplaceInstallation) => {
      const confirmed = await confirmIrreversible({
        title: `Remove ${entry.name}?`,
        consequence: 'Its skills stop loading in your Cloud chats and its settings are cleared.',
        actionLabel: 'Remove',
      });
      if (confirmed) {
        await run(
          `entry:${entry.id}`,
          () => removeMarketplaceInstallation(installation.id),
          `Could not remove ${entry.name}.`,
        );
      }
    },
    [run],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Plugin sources"
        feature="Plugins"
        description="Plugin sources belong to your AGI Cloud account. Switching here does not send Local chats or files to the cloud."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Plugin sources" onBack={goBack} />
      {state === null ? (
        <LoadingRows count={3} />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
        >
          {error ? <ErrorBanner message={error} /> : null}

          {state.workspace?.organizationName ? (
            <SectionCard
              title={`From ${state.workspace.organizationName}`}
              description="Plugins your workspace publishes for its members."
            >
              {state.workspace.plugins.length === 0 ? (
                <MetaText>Your workspace has not published any plugins.</MetaText>
              ) : null}
              {state.workspace.plugins.map((plugin) => (
                <View key={plugin.id} style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.body,
                      fontWeight: '600',
                    }}
                  >
                    {plugin.name}
                  </Text>
                  <MetaText>{`${WORKSPACE_PREFERENCE_LABELS[plugin.installPreference] ?? plugin.installPreference} · Version ${plugin.version}`}</MetaText>
                  {plugin.installPreference === 'required' ? null : (
                    <ToggleRow
                      label="Installed"
                      value={plugin.installed}
                      disabled={busy !== null}
                      onValueChange={(installed) =>
                        void run(
                          `org:${plugin.id}`,
                          () => updateWorkspacePlugin(plugin.id, { installed }),
                          `Could not change ${plugin.name}.`,
                        )
                      }
                    />
                  )}
                  {plugin.installed ? (
                    <ToggleRow
                      label="Turned on"
                      value={plugin.enabled}
                      disabled={busy !== null}
                      onValueChange={(enabled) =>
                        void run(
                          `org:${plugin.id}`,
                          () => updateWorkspacePlugin(plugin.id, { enabled }),
                          `Could not change ${plugin.name}.`,
                        )
                      }
                    />
                  ) : null}
                </View>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard
            title="Add a marketplace"
            description="Sync a plugin marketplace from a GitHub repository or git URL."
          >
            <TextField
              label="Repository URL"
              value={repositoryUrl}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://github.com/owner/marketplace"
              onChangeText={setRepositoryUrl}
            />
            <TextField
              label="Branch or tag (optional)"
              value={ref}
              autoCapitalize="none"
              onChangeText={setRef}
            />
            <Button
              title="Sync marketplace"
              loading={busy === 'add'}
              disabled={busy !== null || !repositoryUrl.trim()}
              onPress={() =>
                void run(
                  'add',
                  () => addMarketplace(repositoryUrl, ref),
                  'That marketplace could not be synced.',
                ).then((done) => {
                  if (done) {
                    setRepositoryUrl('');
                    setRef('');
                  }
                })
              }
            />
          </SectionCard>

          {state.marketplaces.map((source) => {
            const sourceEntries = state.entries.filter((entry) => entry.sourceId === source.id);
            return (
              <SectionCard key={source.id} title={source.name}>
                <MetaText>
                  {[
                    source.repositoryUrl,
                    `${source.entryCount} ${source.entryCount === 1 ? 'plugin' : 'plugins'}`,
                    source.lastSyncedAt
                      ? `synced ${new Date(source.lastSyncedAt).toLocaleDateString()}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </MetaText>
                {source.status === 'error' && source.lastError ? (
                  <MetaText>{source.lastError}</MetaText>
                ) : null}
                {sourceEntries.map((entry) => {
                  const installation = installationsByEntry.get(entry.id);
                  return (
                    <View key={entry.id} style={{ gap: 6, paddingTop: 6 }}>
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: typeScale.subhead,
                          fontWeight: '600',
                        }}
                      >
                        {entry.name}
                      </Text>
                      <MetaText>{entry.description}</MetaText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {installation ? (
                          <Button
                            title="Remove"
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            accessibilityLabel={`Remove ${entry.name}`}
                            onPress={() => void uninstallEntry(entry, installation)}
                          />
                        ) : (
                          <Button
                            title="Install"
                            size="sm"
                            loading={busy === `entry:${entry.id}`}
                            disabled={busy !== null}
                            accessibilityLabel={`Install ${entry.name}`}
                            onPress={() =>
                              void run(
                                `entry:${entry.id}`,
                                () => installMarketplaceEntry(entry.id),
                                `Could not install ${entry.name}.`,
                              )
                            }
                          />
                        )}
                        {source.kind === 'repository' || submittedEntries.has(entry.id) ? null : (
                          <Button
                            title="Submit to directory"
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            accessibilityLabel={`Submit ${entry.name} to the directory`}
                            onPress={() =>
                              void run(
                                `submit:${entry.id}`,
                                () => submitMarketplaceEntry(entry.id),
                                `Could not submit ${entry.name}.`,
                              )
                            }
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    title="Sync again"
                    size="sm"
                    variant="outline"
                    loading={busy === `refresh:${source.id}`}
                    disabled={busy !== null}
                    accessibilityLabel={`Sync ${source.name} again`}
                    onPress={() =>
                      void run(
                        `refresh:${source.id}`,
                        () => refreshMarketplace(source.id),
                        'That marketplace could not be synced.',
                      )
                    }
                  />
                  <Button
                    title="Remove marketplace"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    accessibilityLabel={`Remove ${source.name}`}
                    onPress={() => void removeSource(source)}
                  />
                </View>
              </SectionCard>
            );
          })}

          {state.submissions.length > 0 ? (
            <SectionCard
              title="Your submissions"
              description="Plugins you sent to the public directory and where each review stands."
            >
              {state.submissions.map((submission) => (
                <View key={submission.id} style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      fontWeight: '600',
                    }}
                  >
                    {submission.name}
                  </Text>
                  <MetaText>{`${SUBMISSION_STATUS_LABELS[submission.status]} · Version ${submission.version} · scan ${submission.scanVerdict === 'pass' ? 'passed' : 'needs review'}`}</MetaText>
                  {submission.reviewNote ? <MetaText>{submission.reviewNote}</MetaText> : null}
                  {submission.status === 'pending' ? (
                    <Button
                      title="Withdraw"
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      accessibilityLabel={`Withdraw ${submission.name}`}
                      onPress={() =>
                        void run(
                          `withdraw:${submission.id}`,
                          () => withdrawPluginSubmission(submission.id),
                          'Could not withdraw that submission.',
                        )
                      }
                    />
                  ) : null}
                </View>
              ))}
            </SectionCard>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
