import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  pluginPermissionsToAcknowledge,
  type PluginDirectoryEntryWire,
  type PluginInstallationWire,
  type PluginScanWire,
  type PluginSettingsWire,
  type PluginUpdateOfferWire,
  type PluginVersionsWire,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { fetchConnectorDirectory } from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  Chip,
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
  SectionCard,
  ToggleRow,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { PLUGINS_ROUTE } from './PluginsScreen';
import {
  PLUGIN_COMMUNITY_NOTE,
  PLUGIN_CONNECTORS_NEVER_CONNECTED_NOTE,
  PLUGIN_PERMISSIONS_COPY,
  PLUGIN_SCAN_NONE_COPY,
  PLUGIN_SCAN_VERDICT_COPY,
  pluginCompatibility,
  pluginIncludes,
  pluginWorksWith,
  updateOfferFor,
  versionSwitchSummary,
} from './pluginsModel';
import {
  PluginDependentsError,
  fetchPlugin,
  fetchPluginDirectory,
  fetchPluginInstallations,
  fetchPluginScan,
  fetchPluginSettings,
  fetchPluginUpdates,
  fetchPluginVersions,
  installPlugin,
  movePluginToVersion,
  pluginActionError,
  setPluginEnabled,
  uninstallPlugin,
  updatePluginSettings,
} from './service';

interface PluginDetailState {
  entry: PluginDirectoryEntryWire;
  installation: PluginInstallationWire | undefined;
  scan: PluginScanWire['scan'];
  offer: PluginUpdateOfferWire | undefined;
  versions: PluginVersionsWire | null;
  settings: PluginSettingsWire | null;
  connected: ReadonlySet<string>;
  moreFromPublisher: PluginDirectoryEntryWire[];
}

async function loadPluginDetail(pluginId: string, signal: AbortSignal): Promise<PluginDetailState> {
  const [entry, installations, scan, updates, directory] = await Promise.all([
    fetchPlugin(pluginId, signal),
    fetchPluginInstallations(signal).catch(() => []),
    fetchPluginScan(pluginId).catch(() => null),
    fetchPluginUpdates(signal).catch(() => []),
    fetchConnectorDirectory().catch(() => null),
  ]);
  const installation = installations.find((candidate) => candidate.pluginId === pluginId);
  const [versions, settings, publisherPage] = await Promise.all([
    installation ? fetchPluginVersions(pluginId).catch(() => null) : Promise.resolve(null),
    installation ? fetchPluginSettings(pluginId).catch(() => null) : Promise.resolve(null),
    fetchPluginDirectory({ publisher: entry.publisher.name, limit: 7 }, signal).catch(() => null),
  ]);
  return {
    entry,
    installation,
    scan,
    offer: updateOfferFor(updates, pluginId),
    versions,
    settings,
    connected: new Set(
      (directory?.connectors ?? []).flatMap((connection) =>
        [connection.connectorId, connection.toolConnectorId].filter(
          (id): id is string => typeof id === 'string',
        ),
      ),
    ),
    moreFromPublisher: (publisherPage?.entries ?? []).filter((other) => other.id !== pluginId),
  };
}

function ListLine({ label, values }: { label: string; values: string[] }) {
  const colors = useThemeColors();
  if (values.length === 0) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text
        style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{ color: colors.textPrimary, fontSize: typeScale.footnote, lineHeight: 19 }}
      >
        {values.join(', ')}
      </Text>
    </View>
  );
}

export function PluginDetailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const pluginId = typeof id === 'string' ? id : '';
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(PLUGINS_ROUTE);
  const [state, setState] = useState<PluginDetailState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chosenVersion, setChosenVersion] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!access.ready || !pluginId) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    setLoadError(null);
    loadPluginDetail(pluginId, controller.signal)
      .then((next) => {
        if (isCloudAccountEpochCurrent(account)) setState(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setLoadError(pluginActionError(error, 'Could not load this plugin.'));
      });
    return () => controller.abort();
  }, [access.ready, attempt, pluginId]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  const act = useCallback(
    async (key: string, action: () => Promise<unknown>, failure: string) => {
      if (busy) return false;
      setBusy(key);
      setActionError(null);
      try {
        await action();
        refresh();
        return true;
      } catch (error) {
        setActionError(pluginActionError(error, failure));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, refresh],
  );

  const entry = state?.entry;
  const installation = state?.installation;
  const compatibility = useMemo(() => (entry ? pluginCompatibility(entry) : null), [entry]);
  const includes = useMemo(() => (entry ? pluginIncludes(entry) : null), [entry]);

  const install = useCallback(() => {
    if (!entry) return;
    void act('install', () => installPlugin(entry.id), `Could not install ${entry.name}.`);
  }, [act, entry]);

  const uninstall = useCallback(async () => {
    if (!entry) return;
    const confirmed = await confirmIrreversible({
      title: `Remove ${entry.name}?`,
      consequence: `Its skills and agents stop loading in your Cloud chats and its settings are cleared. You can install it again later.`,
      actionLabel: 'Remove',
    });
    if (!confirmed) return;
    setBusy('uninstall');
    setActionError(null);
    try {
      await uninstallPlugin(entry.id);
      refresh();
    } catch (error) {
      if (error instanceof PluginDependentsError) {
        const together = await confirmIrreversible({
          title: `Remove ${entry.name} and what needs it?`,
          consequence: `${error.message} Removing them together also removes ${error.dependents
            .map((dependent) => dependent.name)
            .join(', ')}.`,
          actionLabel: 'Remove all',
        });
        if (together) {
          try {
            await uninstallPlugin(entry.id, true);
            refresh();
          } catch (secondError) {
            setActionError(pluginActionError(secondError, `Could not remove ${entry.name}.`));
          }
        }
      } else {
        setActionError(pluginActionError(error, `Could not remove ${entry.name}.`));
      }
    } finally {
      setBusy(null);
    }
  }, [entry, refresh]);

  const toggleEnabled = useCallback(
    (enabled: boolean) => {
      if (!entry) return;
      void act(
        'enabled',
        () => setPluginEnabled(entry.id, enabled),
        `Could not turn ${entry.name} ${enabled ? 'on' : 'off'}.`,
      );
    },
    [act, entry],
  );

  const switchVersion = useCallback(
    async (toVersion: string, summary: string) => {
      if (!entry || !state?.versions) return;
      const confirmed = await confirmIrreversible({
        title: `Switch to version ${toVersion}?`,
        consequence: `${summary} The plugin stays on this version for your account until you choose another.`,
        actionLabel: 'Switch',
      });
      if (!confirmed) return;
      const acknowledged = pluginPermissionsToAcknowledge(state.versions, toVersion);
      void act(
        'version',
        () => movePluginToVersion(entry.id, toVersion, acknowledged),
        `Could not move ${entry.name} to ${toVersion}.`,
      );
    },
    [act, entry, state?.versions],
  );

  const toggleSkill = useCallback(
    (skill: string, enabled: boolean) => {
      if (!entry || !state?.settings) return;
      const current = state.settings.enabledSkills;
      const next = enabled ? [...current, skill] : current.filter((name) => name !== skill);
      void act(
        `skill:${skill}`,
        () => updatePluginSettings(entry.id, { enabledSkills: next }),
        `Could not change ${skill}.`,
      );
    },
    [act, entry, state?.settings],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Plugin"
        feature="Plugins"
        description="Plugins install into AGI Cloud. Switching here does not send Local chats or files to the cloud."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title={entry?.name ?? 'Plugin'} onBack={goBack} />
      {loadError && !state ? (
        <EmptyState
          title="Could not load this plugin"
          body={loadError}
          action={<Button title="Try again" variant="outline" onPress={refresh} />}
        />
      ) : !state || !entry || !compatibility || !includes ? (
        <LoadingRows count={4} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}>
          <SectionCard>
            <Text
              selectable
              style={{ color: colors.textPrimary, fontSize: typeScale.body, lineHeight: 22 }}
            >
              {entry.description}
            </Text>
            <MetaText>
              {[
                entry.publisher.name,
                entry.verified ? 'Verified' : null,
                entry.category,
                `Version ${installation?.installedVersion ?? entry.version}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </MetaText>
            {pluginWorksWith(entry).length > 0 ? (
              <MetaText>{`Works with ${pluginWorksWith(entry).join(', ')}`}</MetaText>
            ) : null}
            {entry.publisher.kind !== 'first-party' ? (
              <MetaText>{PLUGIN_COMMUNITY_NOTE}</MetaText>
            ) : null}
            {compatibility.warning ? (
              <Text
                accessibilityRole="alert"
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 19,
                }}
              >
                {compatibility.warning}
              </Text>
            ) : null}
            {installation ? (
              <>
                <ToggleRow
                  label="Turned on"
                  description="Its skills and agents load in your Cloud chats while this is on."
                  value={installation.enabled}
                  disabled={busy !== null}
                  onValueChange={toggleEnabled}
                />
                <Button
                  title="Remove plugin"
                  variant="outline"
                  loading={busy === 'uninstall'}
                  disabled={busy !== null}
                  onPress={() => void uninstall()}
                />
              </>
            ) : (
              <Button
                title={compatibility.installable ? 'Install' : 'Not available on mobile'}
                loading={busy === 'install'}
                disabled={
                  !compatibility.installable || busy !== null || state.scan?.verdict === 'block'
                }
                onPress={install}
              />
            )}
            {actionError ? <ErrorBanner message={actionError} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {entry.homepageUrl ? (
                <Chip
                  label="Homepage"
                  onPress={() => void openUntrustedUrlInAppBrowser(entry.homepageUrl)}
                />
              ) : null}
              {entry.repositoryUrl ? (
                <Chip
                  label="Repository"
                  onPress={() => void openUntrustedUrlInAppBrowser(entry.repositoryUrl)}
                />
              ) : null}
            </View>
          </SectionCard>

          <SectionCard title="What it includes">
            <ListLine label="Skills" values={includes.skills} />
            <ListLine label="Agents" values={includes.agents} />
            <ListLine label="MCP servers" values={includes.mcpServers} />
            {includes.commands > 0 ? <MetaText>{`${includes.commands} commands`}</MetaText> : null}
            {includes.hooks ? <MetaText>Runs hooks around tool calls</MetaText> : null}
            {(entry.dependencies ?? []).length > 0 ? (
              <ListLine
                label="Also installs"
                values={(entry.dependencies ?? []).map((dependency) => dependency.name)}
              />
            ) : null}
            {includes.skills.length + includes.agents.length + includes.mcpServers.length === 0 ? (
              <MetaText>This plugin ships no skills the Cloud app can load.</MetaText>
            ) : null}
          </SectionCard>

          {entry.requiredConnectors.length > 0 ? (
            <SectionCard title="Connectors" description={PLUGIN_CONNECTORS_NEVER_CONNECTED_NOTE}>
              {entry.requiredConnectors.map((connector) => {
                const isConnected = state.connected.has(connector);
                return (
                  <View
                    key={connector}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                        {connector}
                      </Text>
                      <MetaText>{isConnected ? 'Connected' : 'Not connected'}</MetaText>
                    </View>
                    {!isConnected ? (
                      <Button
                        title="Connect"
                        size="sm"
                        variant="outline"
                        accessibilityLabel={`Connect ${connector}`}
                        onPress={() =>
                          router.push({
                            pathname: '/(app)/connectors/[id]' as const,
                            params: { id: connector },
                          })
                        }
                      />
                    ) : null}
                  </View>
                );
              })}
            </SectionCard>
          ) : null}

          {entry.permissions.length + entry.capabilities.length > 0 ? (
            <SectionCard title="Permissions" description={PLUGIN_PERMISSIONS_COPY}>
              <ListLine label="Asks for" values={entry.permissions} />
              <ListLine label="Capabilities" values={entry.capabilities} />
            </SectionCard>
          ) : null}

          <SectionCard title="Security scan">
            <MetaText>
              {state.scan
                ? `${PLUGIN_SCAN_VERDICT_COPY[state.scan.verdict]} Scanned ${new Date(state.scan.scannedAt).toLocaleDateString()}.`
                : PLUGIN_SCAN_NONE_COPY}
            </MetaText>
            {state.scan?.findings.map((finding) => (
              <MetaText key={`${finding.path}:${finding.line}`}>
                {`${finding.severity === 'block' ? 'Blocks' : 'Review'}: ${finding.message} (${finding.path}:${finding.line})`}
              </MetaText>
            ))}
          </SectionCard>

          {installation && state.versions ? (
            <SectionCard title="Version">
              <MetaText>{`Installed version ${installation.installedVersion}`}</MetaText>
              {state.offer ? (
                <View style={{ gap: 8 }}>
                  <MetaText>{versionSwitchSummary(state.offer)}</MetaText>
                  {state.offer.diff.changelog ? (
                    <MetaText>{state.offer.diff.changelog}</MetaText>
                  ) : null}
                  <Button
                    title={`Update to ${state.offer.latestVersion}`}
                    loading={busy === 'version'}
                    disabled={busy !== null}
                    onPress={() =>
                      void switchVersion(
                        state.offer!.latestVersion,
                        versionSwitchSummary(state.offer!),
                      )
                    }
                  />
                </View>
              ) : null}
              {state.versions.versions.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <MetaText>Choose a version to stay on</MetaText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {state.versions.versions.map((version) => (
                      <Chip
                        key={version.version}
                        label={
                          version.version === installation.installedVersion
                            ? `${version.version} (installed)`
                            : version.version
                        }
                        selected={chosenVersion === version.version}
                        onPress={() => setChosenVersion(version.version)}
                      />
                    ))}
                  </View>
                  <Button
                    title="Switch version"
                    variant="outline"
                    disabled={
                      busy !== null ||
                      !chosenVersion ||
                      chosenVersion === installation.installedVersion
                    }
                    onPress={() =>
                      chosenVersion
                        ? void switchVersion(
                            chosenVersion,
                            `Moves from ${installation.installedVersion} to ${chosenVersion}.`,
                          )
                        : undefined
                    }
                  />
                </View>
              ) : null}
            </SectionCard>
          ) : null}

          {installation && state.settings && includes.skills.length > 0 ? (
            <SectionCard
              title="Customize"
              description="Choose which of its skills load in your chats."
            >
              {includes.skills.map((skill) => (
                <ToggleRow
                  key={skill}
                  label={skill}
                  value={state.settings!.enabledSkills.includes(skill)}
                  disabled={busy !== null}
                  onValueChange={(enabled) => toggleSkill(skill, enabled)}
                />
              ))}
            </SectionCard>
          ) : null}

          {entry.examplePrompts.length > 0 ? (
            <SectionCard title="Try asking">
              {(state.settings?.examplePrompts ?? entry.examplePrompts).map((prompt) => (
                <Text
                  key={prompt}
                  selectable
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    lineHeight: 19,
                  }}
                >
                  {prompt}
                </Text>
              ))}
            </SectionCard>
          ) : null}

          {state.moreFromPublisher.length > 0 ? (
            <SectionCard title={`More from ${entry.publisher.name}`}>
              {state.moreFromPublisher.map((other) => (
                <PressableBox
                  key={other.id}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/plugins/[id]' as const,
                      params: { id: other.id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${other.name}`}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                    }}
                  >
                    {other.name}
                  </Text>
                  <MetaText>{other.description}</MetaText>
                </PressableBox>
              ))}
            </SectionCard>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
