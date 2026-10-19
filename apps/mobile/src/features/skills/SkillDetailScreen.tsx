import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { fetchConnectorDirectory } from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import {
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
import { NewSkillSheet } from './NewSkillSheet';
import {
  SKILL_ENTRY_FILE,
  deletePersonalSkill,
  fetchInstalledSkillNames,
  fetchSkillBody,
  fetchSkillCatalog,
  fetchSkillFileText,
  fetchSkillFiles,
  installSkill,
  isAuthoredSkill,
  isPluginOwnedSkill,
  isSkillInstalled,
  isTextSkillFile,
  pluginOwnedNote,
  skillActionFailureMessage,
  uninstallSkill,
  type ManagedSkillSummary,
  type SkillDraftInput,
  type SkillFileEntry,
} from './service';

export const SKILLS_ROUTE = '/(app)/skills';

interface SkillDetail {
  skill: ManagedSkillSummary;
  installed: boolean;
  body: string | null;
  files: SkillFileEntry[];
  connected: ReadonlySet<string>;
}

async function loadSkillDetail(name: string, signal: AbortSignal): Promise<SkillDetail | null> {
  const [catalog, installed, directory] = await Promise.all([
    fetchSkillCatalog(signal),
    fetchInstalledSkillNames(signal),
    fetchConnectorDirectory().catch(() => null),
  ]);
  const skill = catalog.find((candidate) => candidate.name === name);
  if (!skill) return null;
  const [body, files] = await Promise.all([
    fetchSkillBody(name, signal).catch(() => null),
    fetchSkillFiles(name, signal).catch(() => []),
  ]);
  return {
    skill,
    installed: isSkillInstalled(skill, installed),
    body,
    files,
    connected: new Set(
      (directory?.connectors ?? []).flatMap((connection) =>
        [connection.connectorId, connection.toolConnectorId].filter(
          (id): id is string => typeof id === 'string',
        ),
      ),
    ),
  };
}

export function skillTemplateDraft(skill: ManagedSkillSummary, body: string): SkillDraftInput {
  return { name: `${skill.name}-copy`, description: skill.description, body };
}

export function SkillDetailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { name: param } = useLocalSearchParams<{ name?: string }>();
  const name = typeof param === 'string' ? param : '';
  const access = useCloudFeatureAccess();
  const goBack = useGoBack(SKILLS_ROUTE);
  const [detail, setDetail] = useState<SkillDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openFile, setOpenFile] = useState<{ path: string; text: string } | null>(null);
  const [sheet, setSheet] = useState<'edit' | 'template' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!access.ready || !name || !FEATURES.skills) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    setLoadError(null);
    loadSkillDetail(name, controller.signal)
      .then((next) => {
        if (isCloudAccountEpochCurrent(account)) setDetail(next);
      })
      .catch(() => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setLoadError('Could not load this skill. Check your connection and try again.');
      });
    return () => controller.abort();
  }, [access.ready, attempt, name]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  const toggle = useCallback(
    async (enable: boolean) => {
      if (!detail || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        if (enable) await installSkill(detail.skill.name);
        else await uninstallSkill(detail.skill.name);
        refresh();
      } catch (error) {
        setActionError(skillActionFailureMessage(error, enable));
      } finally {
        setBusy(false);
      }
    },
    [busy, detail, refresh],
  );

  const remove = useCallback(async () => {
    if (!detail) return;
    const confirmed = await confirmIrreversible({
      title: `Delete ${detail.skill.name}?`,
      consequence:
        'The skill and its instructions are deleted from your account and stop loading in every chat. This cannot be undone.',
      actionLabel: 'Delete',
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deletePersonalSkill(detail.skill.name);
      router.replace(SKILLS_ROUTE as Parameters<typeof router.replace>[0]);
    } catch (error) {
      setActionError(skillActionFailureMessage(error, false));
    } finally {
      setBusy(false);
    }
  }, [detail, router]);

  const showFile = useCallback(
    async (file: SkillFileEntry) => {
      if (!detail) return;
      if (file.path === SKILL_ENTRY_FILE && detail.body !== null) {
        setOpenFile({ path: file.path, text: detail.body });
        return;
      }
      try {
        setOpenFile({
          path: file.path,
          text: await fetchSkillFileText(detail.skill.name, file.path),
        });
      } catch {
        setActionError(`Could not open ${file.path}.`);
      }
    },
    [detail],
  );

  const skill = detail?.skill;
  const body = detail?.body ?? null;
  const sheetDraft = useMemo<SkillDraftInput | undefined>(() => {
    if (!skill || body === null || sheet === null) return undefined;
    return sheet === 'edit'
      ? { name: skill.name, description: skill.description, body }
      : skillTemplateDraft(skill, body);
  }, [body, sheet, skill]);

  if (!FEATURES.skills) return <FeatureUnavailable feature="Skills" />;
  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Skill"
        feature="Skills"
        description="Skills run in AGI Cloud. Switching here does not send Local chats or files to the cloud."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const authored = skill ? isAuthoredSkill(skill) : false;
  const pluginOwned = skill ? isPluginOwnedSkill(skill) : false;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title={name || 'Skill'} onBack={goBack} />
      {loadError ? (
        <EmptyState
          title="Could not load this skill"
          body={loadError}
          action={<Button title="Try again" variant="outline" onPress={refresh} />}
        />
      ) : detail === undefined ? (
        <LoadingRows count={3} />
      ) : detail === null || !skill ? (
        <EmptyState title="Skill not found" body="It may have been removed or renamed." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}>
          <SectionCard>
            <Text
              selectable
              style={{ color: colors.textPrimary, fontSize: typeScale.body, lineHeight: 22 }}
            >
              {skill.description || 'No description provided.'}
            </Text>
            <MetaText>
              {[
                skill.version ? `Version ${skill.version}` : null,
                skill.lifecycle === 'draft' ? 'Coming later' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Version unknown'}
            </MetaText>
            {pluginOwned ? <MetaText>{pluginOwnedNote(skill)}</MetaText> : null}
            {skill.lifecycle === 'included' && !authored && !pluginOwned ? (
              <ToggleRow
                label="Turned on"
                description="Turned-on skills load in your Cloud chats when a task needs them."
                value={detail.installed}
                disabled={busy}
                onValueChange={(enable) => void toggle(enable)}
              />
            ) : null}
            {actionError ? <ErrorBanner message={actionError} /> : null}
          </SectionCard>

          {skill.requiredTools?.length || skill.requiredConnectors?.length ? (
            <SectionCard title="Needs">
              {skill.requiredTools?.length ? (
                <MetaText>{`Tools: ${skill.requiredTools.join(', ')}`}</MetaText>
              ) : null}
              {skill.requiredConnectors?.map((connector) => {
                const connected = detail.connected.has(connector);
                return (
                  <View
                    key={connector}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                        {connector}
                      </Text>
                      <MetaText>{connected ? 'Connected' : 'Not connected'}</MetaText>
                    </View>
                    {!connected ? (
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

          {detail.files.length > 0 ? (
            <SectionCard
              title="Files"
              description="The instructions and the reference files and scripts bundled with them."
            >
              {detail.files.map((file) => {
                const previewable = isTextSkillFile(file.path);
                return (
                  <PressableBox
                    key={file.path}
                    onPress={previewable ? () => void showFile(file) : undefined}
                    disabled={!previewable}
                    accessibilityRole="button"
                    accessibilityLabel={
                      previewable ? `Open ${file.path}` : `${file.path}, no preview`
                    }
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <FileText size={16} color={colors.textSecondary} />
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                    >
                      {file.path}
                    </Text>
                    <MetaText>
                      {file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`}
                    </MetaText>
                  </PressableBox>
                );
              })}
              {openFile ? (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                    }}
                  >
                    {openFile.path}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.footnote,
                      lineHeight: 19,
                    }}
                  >
                    {openFile.text}
                  </Text>
                  <Button
                    title="Close file"
                    size="sm"
                    variant="ghost"
                    onPress={() => setOpenFile(null)}
                  />
                </View>
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard title="Make your own">
            {authored ? (
              <>
                <Button
                  title="Edit instructions"
                  variant="outline"
                  disabled={busy || detail.body === null}
                  onPress={() => setSheet('edit')}
                />
                <Button
                  title="Delete skill"
                  variant="destructive"
                  disabled={busy}
                  onPress={() => void remove()}
                />
              </>
            ) : (
              <Button
                title="Use as a template"
                variant="outline"
                disabled={detail.body === null}
                accessibilityHint="Starts a new personal skill from this one's instructions"
                onPress={() => setSheet('template')}
              />
            )}
          </SectionCard>
        </ScrollView>
      )}
      {skill && sheetDraft ? (
        <NewSkillSheet
          visible
          onClose={() => setSheet(null)}
          onCreated={() => {
            setSheet(null);
            refresh();
          }}
          initialDraft={sheetDraft}
          editingName={sheet === 'edit' ? skill.name : undefined}
        />
      ) : null}
    </SafeAreaView>
  );
}
