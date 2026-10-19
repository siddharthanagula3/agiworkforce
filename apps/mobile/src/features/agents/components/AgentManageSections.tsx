import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { FileText, X } from 'lucide-react-native';
import {
  AGENT_FILE_MAX_BYTES,
  AGENT_FILES_MAX,
  AGENT_VERSION_NOTE_MAX_CHARS,
  AGENT_VISIBILITIES,
  agentStateLabel,
  type AgentActivityResponse,
  type AgentFile,
  type AgentShareResponse,
  type AgentUsageResponse,
  type AgentVersion,
  type AgentVisibility,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import {
  Chip,
  ErrorBanner,
  MetaText,
  SectionCard,
  TextField,
  ToggleRow,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  agentActionError,
  deleteAgent,
  deleteAgentFile,
  exportAgentMarkdown,
  getAgentActivity,
  getAgentShare,
  getAgentUsage,
  listAgentFiles,
  listAgentVersions,
  publishAgent,
  restoreAgentVersion,
  setAgentStatus,
  transferAgent,
  updateAgentShare,
  uploadAgentFile,
} from '../service';

const VISIBILITY_LABELS: Record<AgentVisibility, string> = {
  private: 'Only you',
  people: 'Specific people',
  workspace: 'Workspace',
};

export function agentFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function agentShareUserIds(share: AgentShareResponse): string[] {
  return share.members.filter((member) => member.hasAccess).map((member) => member.userId);
}

function useAsyncAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, action: () => Promise<T>, failure: string): Promise<T | null> => {
      if (busy) return null;
      setBusy(key);
      setError(null);
      try {
        return await action();
      } catch (actionError) {
        setError(agentActionError(actionError, failure));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );
  return { busy, error, run };
}

function AgentFilesSection({ agent }: { agent: ManagedCloudAgent }) {
  const colors = useThemeColors();
  const [files, setFiles] = useState<AgentFile[] | null>(null);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    listAgentFiles(agent.id)
      .then((next) => {
        if (!cancelled) setFiles(next);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  const addFile = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    const saved = await run(
      'upload',
      async () => {
        if ((asset.size ?? 0) > AGENT_FILE_MAX_BYTES) {
          throw new Error(`Files can be up to ${agentFileSizeLabel(AGENT_FILE_MAX_BYTES)}.`);
        }
        return uploadAgentFile(agent.id, {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        });
      },
      `Could not add ${asset.name}.`,
    );
    if (saved) setFiles((current) => [...(current ?? []), saved]);
  }, [agent.id, run]);

  const removeFile = useCallback(
    async (file: AgentFile) => {
      const confirmed = await confirmIrreversible({
        title: `Remove ${file.name}?`,
        consequence: `${agent.name} will stop using this file in new chats. You can add it again later.`,
        actionLabel: 'Remove',
      });
      if (!confirmed) return;
      const removed = await run(
        `remove:${file.id}`,
        async () => {
          await deleteAgentFile(agent.id, file.id);
          return true;
        },
        `Could not remove ${file.name}.`,
      );
      if (removed) setFiles((current) => (current ?? []).filter((entry) => entry.id !== file.id));
    },
    [agent.id, agent.name, run],
  );

  return (
    <SectionCard
      title="Knowledge"
      description="Files the agent can read in every chat. Text is extracted when you add a file."
    >
      {files === null ? <MetaText>Loading files…</MetaText> : null}
      {files?.length === 0 ? <MetaText>No files yet.</MetaText> : null}
      {files?.map((file) => (
        <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <FileText size={16} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}
            >
              {file.name}
            </Text>
            <MetaText>{agentFileSizeLabel(file.byteSize)}</MetaText>
          </View>
          <PressableBox
            onPress={() => void removeFile(file)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color={colors.textMuted} />
          </PressableBox>
        </View>
      ))}
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title="Add file"
        size="sm"
        variant="outline"
        loading={busy === 'upload'}
        disabled={busy !== null || (files?.length ?? 0) >= AGENT_FILES_MAX}
        onPress={() => void addFile()}
      />
    </SectionCard>
  );
}

function AgentPublishSection({
  agent,
  dirty,
  onAgent,
}: {
  agent: ManagedCloudAgent;
  dirty: boolean;
  onAgent: (agent: ManagedCloudAgent) => void;
}) {
  const colors = useThemeColors();
  const [note, setNote] = useState('');
  const [versions, setVersions] = useState<AgentVersion[] | null>(null);
  const { busy, error, run } = useAsyncAction();

  const loadVersions = useCallback(() => {
    listAgentVersions(agent.id)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [agent.id]);

  useEffect(loadVersions, [loadVersions, agent.publishedVersion]);

  const publish = useCallback(async () => {
    const next = await run('publish', () => publishAgent(agent.id, note), 'Could not publish.');
    if (next) {
      setNote('');
      onAgent(next);
    }
  }, [agent.id, note, onAgent, run]);

  const restore = useCallback(
    async (version: AgentVersion) => {
      const next = await run(
        `restore:${version.version}`,
        () => restoreAgentVersion(agent.id, version.version),
        `Could not restore version ${version.version}.`,
      );
      if (next) onAgent(next);
    },
    [agent.id, onAgent, run],
  );

  const canPublish = !dirty && (agent.publishedVersion === null || agent.hasUnpublishedChanges);

  return (
    <SectionCard
      title="Publish"
      description="People you share with use the published version. Saving keeps a draft until you publish."
    >
      <MetaText>{agentStateLabel(agent)}</MetaText>
      <TextField
        label="What changed"
        value={note}
        maxLength={AGENT_VERSION_NOTE_MAX_CHARS}
        placeholder="Optional note for this version"
        onChangeText={setNote}
      />
      {dirty ? <MetaText>Save your changes before publishing.</MetaText> : null}
      <Button
        title={agent.publishedVersion === null ? 'Publish' : 'Publish update'}
        accessibilityLabel={
          agent.publishedVersion === null ? 'Publish this agent' : 'Publish this update'
        }
        loading={busy === 'publish'}
        disabled={!canPublish || busy !== null}
        onPress={() => void publish()}
      />
      {error ? <ErrorBanner message={error} /> : null}
      {versions && versions.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            Version history
          </Text>
          {versions.map((version) => (
            <View
              key={version.version}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                  {`Version ${version.version}${
                    version.version === agent.publishedVersion ? ' · Live' : ''
                  }`}
                </Text>
                <MetaText>
                  {[
                    new Date(version.publishedAt).toLocaleDateString(),
                    version.publishedByName,
                    version.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </MetaText>
              </View>
              {version.version !== agent.publishedVersion ? (
                <Button
                  title="Restore"
                  size="sm"
                  variant="outline"
                  loading={busy === `restore:${version.version}`}
                  disabled={busy !== null}
                  accessibilityLabel={`Restore version ${version.version} as the draft`}
                  onPress={() => void restore(version)}
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

function AgentShareSection({ agent }: { agent: ManagedCloudAgent }) {
  const [share, setShare] = useState<AgentShareResponse | null>(null);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    getAgentShare(agent.id)
      .then((next) => {
        if (!cancelled) setShare(next);
      })
      .catch(() => {
        if (!cancelled) setShare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  const apply = useCallback(
    async (visibility: AgentVisibility, userIds: string[]) => {
      const next = await run(
        'share',
        () => updateAgentShare(agent.id, { visibility, userIds }),
        'Could not change who can use this agent.',
      );
      if (next) setShare(next);
    },
    [agent.id, run],
  );

  if (!share) {
    return (
      <SectionCard title="Sharing">
        <MetaText>Loading sharing…</MetaText>
      </SectionCard>
    );
  }

  const options = AGENT_VISIBILITIES.filter(
    (visibility) => visibility !== 'workspace' || share.workspaceName !== null,
  );
  const people = agentShareUserIds(share);

  return (
    <SectionCard
      title="Sharing"
      description={
        agent.publishedVersion === null
          ? 'Publish the agent before anyone else can use it.'
          : 'Choose who can chat with the published version.'
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((visibility) => (
          <Chip
            key={visibility}
            label={
              visibility === 'workspace' && share.workspaceName
                ? share.workspaceName
                : VISIBILITY_LABELS[visibility]
            }
            selected={share.visibility === visibility}
            onPress={busy ? undefined : () => void apply(visibility, people)}
          />
        ))}
      </View>
      {share.visibility === 'people'
        ? share.members.map((member) => (
            <ToggleRow
              key={member.userId}
              label={member.name}
              description={member.email ?? undefined}
              value={member.hasAccess}
              disabled={busy !== null}
              onValueChange={(hasAccess) =>
                void apply(
                  'people',
                  hasAccess
                    ? [...people, member.userId]
                    : people.filter((userId) => userId !== member.userId),
                )
              }
            />
          ))
        : null}
      {share.visibility === 'people' && share.members.length === 0 ? (
        <MetaText>Join or create a workspace to share with specific people.</MetaText>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
    </SectionCard>
  );
}

function AgentActivitySection({ agent }: { agent: ManagedCloudAgent }) {
  const router = useRouter();
  const colors = useThemeColors();
  const [usage, setUsage] = useState<AgentUsageResponse | null>(null);
  const [activity, setActivity] = useState<AgentActivityResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getAgentUsage(agent.id), getAgentActivity(agent.id)]).then(
      ([usageResult, activityResult]) => {
        if (cancelled) return;
        setUsage(usageResult.status === 'fulfilled' ? usageResult.value : null);
        setActivity(activityResult.status === 'fulfilled' ? activityResult.value : null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  return (
    <SectionCard title="Activity">
      {usage ? (
        <MetaText>
          {`Last ${usage.windowDays} days: ${usage.conversations} chats, ${usage.people} people, ${usage.turns} messages`}
        </MetaText>
      ) : (
        <MetaText>Usage is not available right now.</MetaText>
      )}
      {activity?.conversations.length ? (
        <View style={{ gap: 4 }}>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            Recent chats
          </Text>
          {activity.conversations.map((conversation) => (
            <PressableBox
              key={conversation.id}
              onPress={() =>
                router.push({
                  pathname: '/(app)/chat/[id]' as const,
                  params: { id: conversation.id },
                })
              }
              accessibilityRole="link"
              accessibilityLabel={`Open ${conversation.title}`}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}
              >
                {conversation.title}
              </Text>
            </PressableBox>
          ))}
        </View>
      ) : null}
      {activity?.routines.length ? (
        <View style={{ gap: 4 }}>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            Routines
          </Text>
          {activity.routines.map((routine) => (
            <View key={routine.id} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                {routine.name}
              </Text>
              <MetaText>
                {routine.nextExecutionAt
                  ? `${routine.status} · next ${new Date(routine.nextExecutionAt).toLocaleString()}`
                  : routine.status}
              </MetaText>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        title="Add a routine"
        size="sm"
        variant="outline"
        accessibilityHint="Opens Schedules to run this agent on a timer"
        onPress={() => router.push('/(app)/schedules/create' as Parameters<typeof router.push>[0])}
      />
    </SectionCard>
  );
}

function AgentLifecycleSection({
  agent,
  onAgent,
  onDeleted,
}: {
  agent: ManagedCloudAgent;
  onAgent: (agent: ManagedCloudAgent) => void;
  onDeleted: () => void;
}) {
  const [share, setShare] = useState<AgentShareResponse | null>(null);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const { busy, error, run } = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    getAgentShare(agent.id)
      .then((next) => {
        if (!cancelled) setShare(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  const pauseOrResume = useCallback(async () => {
    const next = await run(
      'status',
      () => setAgentStatus(agent.id, agent.status === 'paused' ? 'active' : 'paused'),
      'Could not change the agent status.',
    );
    if (next) onAgent(next);
  }, [agent.id, agent.status, onAgent, run]);

  const retire = useCallback(async () => {
    const confirmed = await confirmIrreversible({
      title: `Retire ${agent.name}?`,
      consequence:
        'Nobody can start new chats with it, including people you shared it with. Its existing chats stay readable.',
      actionLabel: 'Retire',
    });
    if (!confirmed) return;
    const next = await run(
      'retire',
      () => setAgentStatus(agent.id, 'retired'),
      'Could not retire.',
    );
    if (next) onAgent(next);
  }, [agent.id, agent.name, onAgent, run]);

  const transfer = useCallback(async () => {
    const member = share?.members.find((candidate) => candidate.userId === transferTarget);
    if (!member) return;
    const confirmed = await confirmIrreversible({
      title: `Give ${agent.name} to ${member.name}?`,
      consequence: `${member.name} becomes the owner and can edit, share or delete it. You lose edit access and cannot take it back yourself.`,
      actionLabel: 'Transfer',
    });
    if (!confirmed) return;
    const done = await run(
      'transfer',
      async () => {
        await transferAgent(agent.id, member.userId);
        return true;
      },
      'Could not transfer the agent.',
    );
    if (done) onDeleted();
  }, [agent.id, agent.name, onDeleted, run, share, transferTarget]);

  const exportFile = useCallback(async () => {
    const markdown = await run('export', () => exportAgentMarkdown(agent.id), 'Could not export.');
    if (markdown) await Share.share({ title: agent.name, message: markdown });
  }, [agent.id, agent.name, run]);

  const remove = useCallback(async () => {
    const confirmed = await confirmIrreversible({
      title: `Delete ${agent.name}?`,
      consequence:
        'The agent, its files and its version history are deleted for everyone it is shared with. This cannot be undone.',
      actionLabel: 'Delete',
    });
    if (!confirmed) return;
    const done = await run(
      'delete',
      async () => {
        await deleteAgent(agent.id);
        return true;
      },
      'Could not delete the agent.',
    );
    if (done) onDeleted();
  }, [agent.id, agent.name, onDeleted, run]);

  const candidates = share?.members.filter((member) => member.hasAccess) ?? [];

  return (
    <SectionCard title="Manage">
      {agent.status !== 'retired' ? (
        <Button
          title={agent.status === 'paused' ? 'Resume agent' : 'Pause agent'}
          variant="outline"
          loading={busy === 'status'}
          disabled={busy !== null}
          onPress={() => void pauseOrResume()}
        />
      ) : null}
      <Button
        title="Export as Markdown"
        variant="outline"
        loading={busy === 'export'}
        disabled={busy !== null}
        onPress={() => void exportFile()}
      />
      {candidates.length > 0 ? (
        <View style={{ gap: 8 }}>
          <MetaText>Transfer ownership to someone it is shared with</MetaText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {candidates.map((member) => (
              <Chip
                key={member.userId}
                label={member.name}
                selected={transferTarget === member.userId}
                onPress={() => setTransferTarget(member.userId)}
              />
            ))}
          </View>
          <Button
            title="Transfer ownership"
            variant="outline"
            loading={busy === 'transfer'}
            disabled={busy !== null || transferTarget === null}
            onPress={() => void transfer()}
          />
        </View>
      ) : null}
      {agent.status !== 'retired' ? (
        <Button
          title="Retire agent"
          variant="outline"
          loading={busy === 'retire'}
          disabled={busy !== null}
          onPress={() => void retire()}
        />
      ) : null}
      <Button
        title="Delete agent"
        variant="destructive"
        loading={busy === 'delete'}
        disabled={busy !== null}
        onPress={() => void remove()}
      />
      {error ? <ErrorBanner message={error} /> : null}
    </SectionCard>
  );
}

export function AgentManageSections({
  agent,
  dirty,
  onAgent,
  onDeleted,
}: {
  agent: ManagedCloudAgent;
  dirty: boolean;
  onAgent: (agent: ManagedCloudAgent) => void;
  onDeleted: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <AgentFilesSection agent={agent} />
      <AgentPublishSection agent={agent} dirty={dirty} onAgent={onAgent} />
      <AgentShareSection agent={agent} />
      <AgentActivitySection agent={agent} />
      <AgentLifecycleSection agent={agent} onAgent={onAgent} onDeleted={onDeleted} />
    </View>
  );
}
