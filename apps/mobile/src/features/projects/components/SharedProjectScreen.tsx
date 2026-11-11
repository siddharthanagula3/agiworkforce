import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, Users } from 'lucide-react-native';
import type {
  ManagedCloudProject,
  ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { hiddenSharerIds } from '@/src/features/shared-with-you/hiddenSharers';
import { SharedItemSafetyActions } from '@/src/features/shared-with-you/SharedItemSafetyActions';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/Common';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import { cloudProjectSources } from '@/src/features/projects/store';
import {
  ACCESS_LABELS,
  PROJECT_SHARED_CONTEXT_COPY,
  fetchProjectSharing,
  memberName,
} from '@/src/features/projects/projectSharing';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const SHARED_PROJECT_UNAVAILABLE = 'This shared project could not be opened.';

interface SharedProjectView {
  project: ManagedCloudProject;
  ownerName: string | null;
  accountId: string | null;
}

type SharedProjectFiles =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; files: ManagedCloudProjectKnowledgeFile[] };

export function SharedProjectScreen({ projectId }: { projectId: string }) {
  const colors = useThemeColors();
  const [view, setView] = useState<SharedProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [filesState, setFilesState] = useState<SharedProjectFiles>({ status: 'loading' });
  const [filesAttempt, setFilesAttempt] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const account = captureCloudAccountEpoch();
    void Promise.all([
      managedCloudProjects.getProject(projectId, { signal: controller.signal }),
      fetchProjectSharing(controller.signal).catch(() => null),
    ])
      .then(([project, overview]) => {
        if (controller.signal.aborted) return;
        const owner = overview?.members.find((member) => member.userId === project.ownerUserId);
        const accountId = overview?.currentUserId ?? account?.ownerId ?? null;
        if (!accountId || (account && !isCloudAccountEpochCurrent(account))) {
          setError(SHARED_PROJECT_UNAVAILABLE);
          return;
        }
        setHidden(hiddenSharerIds(accountId).has(project.ownerUserId));
        setView({ project, ownerName: owner ? memberName(owner) : null, accountId });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(toUserMessage(cause, SHARED_PROJECT_UNAVAILABLE));
        }
      });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const account = captureCloudAccountEpoch();
    const isCurrent = () => !cancelled && (!account || isCloudAccountEpochCurrent(account));
    setFilesState({ status: 'loading' });
    cloudProjectSources
      .list(projectId)
      .then((files) => {
        if (isCurrent()) setFilesState({ status: 'ready', files });
      })
      .catch(() => {
        if (isCurrent()) setFilesState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, filesAttempt]);

  if (error) {
    return (
      <SettingsScreenShell title="Shared project" backHref="/(app)/(tabs)/projects">
        <SettingsInfo title="Project unavailable" body={error} />
      </SettingsScreenShell>
    );
  }

  if (!view) {
    return (
      <SettingsScreenShell title="Shared project" backHref="/(app)/(tabs)/projects">
        <LoadingIndicator accessibilityLabel="Loading shared project" />
      </SettingsScreenShell>
    );
  }

  if (hidden) {
    return (
      <SettingsScreenShell title="Shared project" backHref="/(app)/(tabs)/projects">
        <SettingsInfo testID="shared-project-hidden" title="Hidden" body="You hid this sharer." />
      </SettingsScreenShell>
    );
  }

  const { project, ownerName, accountId } = view;
  const access = project.sharedAccess === 'write' ? ACCESS_LABELS.write : ACCESS_LABELS.read;
  return (
    <SettingsScreenShell
      title="Shared project"
      backHref="/(app)/(tabs)/projects"
      help={{ docId: 'projects', label: 'How projects work' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Users size={18} color={colors.textSecondary} />
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            fontWeight: '600',
          }}
        >
          {project.name}
        </Text>
      </View>
      <Text
        testID="shared-project-access"
        style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginBottom: 16 }}
      >
        {ownerName ? `Shared with you by ${ownerName} · ${access}` : `Shared with you · ${access}`}
      </Text>
      {project.ownerUserId === accountId ? null : (
        <View style={{ marginBottom: 16 }}>
          <SharedItemSafetyActions
            item={{ kind: 'project', id: project.id, sharerId: project.ownerUserId }}
            title={project.name}
            ownerName={ownerName ?? 'sharer'}
            accountId={accountId}
            onHidden={() => {
              setHidden(true);
              router.replace('/(app)/(tabs)/projects');
            }}
          />
        </View>
      )}

      <SettingsInfo title="What is shared" body={PROJECT_SHARED_CONTEXT_COPY} />

      {project.description?.trim() ? (
        <SettingsInfo title="Description" body={project.description.trim()} />
      ) : null}
      {project.instructions?.trim() ? (
        <SettingsInfo title="Instructions" body={project.instructions.trim()} />
      ) : null}

      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
          marginBottom: 8,
        }}
      >
        FILES
      </Text>
      {filesState.status === 'loading' ? (
        <LoadingIndicator accessibilityLabel="Loading project files" />
      ) : filesState.status === 'failed' ? (
        <View style={{ marginBottom: 24 }}>
          <Text
            accessibilityRole="alert"
            style={{ color: colors.agentError, fontSize: typeScale.footnote, marginBottom: 8 }}
          >
            Could not load this project’s files.
          </Text>
          <Pressable
            onPress={() => setFilesAttempt((attempt) => attempt + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading project files"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>Retry</Text>
          </Pressable>
        </View>
      ) : filesState.files.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginBottom: 24 }}>
          No files in this project.
        </Text>
      ) : (
        <SettingsGroup>
          {filesState.files.map((file, index) => (
            <View
              key={file.id}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: index === filesState.files.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <FileText size={16} color={colors.textSecondary} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}
              >
                {file.fileName}
              </Text>
            </View>
          ))}
        </SettingsGroup>
      )}
    </SettingsScreenShell>
  );
}
