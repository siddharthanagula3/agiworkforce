import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { ChevronRight, Users } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { SettingsGroup } from '@/src/features/settings/common';
import {
  ACCESS_LABELS,
  canManageProjectSharing,
  fetchProjectSharing,
  memberAccess,
  memberName,
  setProjectMemberAccess,
  shareAudience,
  shareProject,
  stopSharingProject,
  type ProjectMemberAccess,
  type ProjectShareAudience,
  type ProjectSharingOverview,
  type SharingMember,
} from '@/src/features/projects/projectSharing';
import { refreshCloudProjectDetails } from '@/src/features/projects/service';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

const AUDIENCE_LABELS: Readonly<Record<ProjectShareAudience, string>> = {
  workspace: 'Everyone in the workspace can view',
  invited: 'Only people you invite',
};

function OutlineButton({
  label,
  onPress,
  disabled,
  destructive,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text
        style={{
          color: destructive ? colors.agentError : colors.textPrimary,
          fontSize: typeScale.subhead,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProjectMembersSection({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const colors = useThemeColors();
  const [overview, setOverview] = useState<ProjectSharingOverview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchProjectSharing(signal);
      if (!signal?.aborted) setOverview(next);
    } catch (cause) {
      if (!signal?.aborted) {
        setOverview(null);
        setError(toUserMessage(cause, 'Could not load who can access this project.'));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = useCallback(
    (work: () => Promise<void>, failure: string) => {
      setBusy(true);
      setError(null);
      void work()
        .then(() => Promise.all([load(), refreshCloudProjectDetails()]))
        .catch((cause: unknown) => setError(toUserMessage(cause, failure)))
        .finally(() => setBusy(false));
    },
    [load],
  );

  if (overview === undefined) {
    return (
      <ActivityIndicator
        accessibilityLabel="Loading who can access this project"
        color={colors.textSecondary}
        style={{ marginBottom: 24 }}
      />
    );
  }

  if (overview === null) {
    return (
      <Text
        testID="project-members-personal"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.footnote,
          lineHeight: 18,
          marginBottom: 24,
        }}
      >
        {error ??
          'Only you can open this project. Projects in a workspace can be shared with its members.'}
      </Text>
    );
  }

  const shared = overview.sharedProjects.find((entry) => entry.projectId === projectId);
  const canManage = canManageProjectSharing(overview, true);
  const people = overview.members.filter((member) => member.userId !== overview.currentUserId);

  const chooseAccess = (member: SharingMember) => {
    if (!shared) return;
    const options: ProjectMemberAccess[] = member.canEditProjects
      ? ['read', 'write', 'none']
      : ['read', 'none'];
    Alert.alert(memberName(member), `Choose what ${memberName(member)} can do in ${projectName}.`, [
      ...options.map((access) => ({
        text: ACCESS_LABELS[access],
        onPress: () =>
          run(
            () => setProjectMemberAccess(projectId, member.userId, access),
            'Could not change their access. Try again.',
          ),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmStopSharing = () =>
    Alert.alert(
      'Stop sharing this project?',
      `Workspace members can no longer open ${projectName}, its instructions or its files. Their own chats in it stay with them. You can share it again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () =>
            run(() => stopSharingProject(projectId), 'Could not stop sharing. Try again.'),
        },
      ],
    );

  return (
    <View testID="project-members-section" style={{ marginBottom: 24, gap: 12 }}>
      {shared ? (
        <>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
          >
            {`${AUDIENCE_LABELS[shareAudience(shared)]}.`}
          </Text>
          <SettingsGroup>
            <View accessibilityLabel={`People with access to ${projectName}`}>
              {[
                ...overview.members.filter((member) => member.userId === shared.ownerUserId),
                ...people.filter((member) => member.userId !== shared.ownerUserId),
              ].map((member, index, list) => {
                const isProjectOwner = member.userId === shared.ownerUserId;
                const label = isProjectOwner
                  ? 'Owner'
                  : ACCESS_LABELS[memberAccess(shared, member)];
                const row = (
                  <View
                    style={{
                      minHeight: 52,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderBottomWidth: index === list.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Users size={17} color={colors.textSecondary} />
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}
                    >
                      {memberName(member)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                      {label}
                    </Text>
                    {canManage && !isProjectOwner ? (
                      <ChevronRight size={16} color={colors.textMuted} />
                    ) : null}
                  </View>
                );
                return canManage && !isProjectOwner ? (
                  <Pressable
                    key={member.userId}
                    onPress={() => chooseAccess(member)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`${memberName(member)}, ${label}. Change access`}
                  >
                    {row}
                  </Pressable>
                ) : (
                  <View key={member.userId}>{row}</View>
                );
              })}
            </View>
          </SettingsGroup>
          {canManage ? (
            <OutlineButton
              testID="project-members-stop-sharing"
              label="Stop sharing"
              destructive
              disabled={busy}
              onPress={confirmStopSharing}
            />
          ) : null}
        </>
      ) : canManage ? (
        <>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
          >
            {
              'Only you can open this project; sharing includes its instructions and files, not chats.'
            }
          </Text>
          <View style={{ gap: 8 }}>
            <OutlineButton
              testID="project-members-share-workspace"
              label="Share with the workspace"
              disabled={busy}
              onPress={() =>
                run(() => shareProject(projectId, 'workspace'), 'Could not share this project.')
              }
            />
            <OutlineButton
              testID="project-members-share-invited"
              label="Share with people I choose"
              disabled={busy}
              onPress={() =>
                run(() => shareProject(projectId, 'invited'), 'Could not share this project.')
              }
            />
          </View>
        </>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 18 }}>
          This project is not shared. Your workspace role does not let you share your work.
        </Text>
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
