import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  Check,
  Users,
  UserRound,
  Trash2,
} from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { getBillingPlanPricing, isOrganizationAdminRole } from '@agiworkforce/types';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CloudAccountRequired, CloudSyncBlockedBanner } from '@/src/features/settings/common';
import {
  WORKSPACE_ROLES,
  fetchWorkspaceMembers,
  fetchWorkspaceOverview,
  removeWorkspaceMember,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
  type WorkspaceMember,
  type WorkspaceOverview,
  type WorkspaceRole,
} from '@/src/features/team';
import { RolePickerModal } from '@/src/features/team/RolePickerModal';
import { WorkspaceAdministration } from '@/src/features/team/WorkspaceAdministration';
import { switchWorkspace } from '@/src/features/team/switchWorkspace';
import { translatePlural } from '@/src/i18n/plural';
import { useStepUp } from '@/src/features/auth/hooks/useStepUp';
import { isStepUpCancelled } from '@/src/features/auth/services/stepUp';

const WEB_TEAM_URL = 'https://agiworkforce.com/settings/team';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; overview: WorkspaceOverview; members: WorkspaceMember[] }
  | { kind: 'error'; message: string };

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function planLabel(plan: string): string {
  return getBillingPlanPricing(plan).label;
}

export default function WorkspaceScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [roleTarget, setRoleTarget] = useState<WorkspaceMember | null>(null);
  const { withStepUp, modal: stepUpModal } = useStepUp();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const overview = await fetchWorkspaceOverview(signal);
      if (signal?.aborted) return;
      const members = overview.workspace
        ? await fetchWorkspaceMembers(overview.workspace.id, signal)
        : [];
      if (signal?.aborted) return;
      setState({ kind: 'ready', overview, members });
    } catch {
      if (signal?.aborted) return;
      setState({
        kind: 'error',
        message: 'Could not load your workspace. Retry.',
      });
    }
  }, []);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSelectWorkspace = useCallback(
    (organizationId: string | null) => {
      setSwitchingWorkspace(true);
      void (async () => {
        try {
          if (await switchWorkspace(organizationId)) await load();
        } finally {
          setSwitchingWorkspace(false);
        }
      })();
    },
    [load],
  );

  const applyRole = useCallback(
    (member: WorkspaceMember, role: WorkspaceRole) => {
      void (async () => {
        setBusyMemberId(member.id);
        try {
          await updateWorkspaceMemberRole(member.id, role);
          await load();
        } catch {
          Alert.alert('Could not change role', 'The member’s role was not changed. Retry.');
        } finally {
          setBusyMemberId(null);
        }
      })();
    },
    [load],
  );

  const transferOwnership = useCallback(
    (member: WorkspaceMember) => {
      if (state.kind !== 'ready' || !state.overview.workspace) return;
      const workspace = state.overview.workspace;
      void (async () => {
        setBusyMemberId(member.id);
        try {
          await withStepUp('organization.transfer_ownership', workspace.id, (headers) =>
            transferWorkspaceOwnership(workspace.id, member.userId, headers),
          );
          await load();
        } catch (error) {
          if (isStepUpCancelled(error)) return;
          Alert.alert('Could not transfer ownership', 'Ownership was not transferred. Retry.');
        } finally {
          setBusyMemberId(null);
        }
      })();
    },
    [load, state, withStepUp],
  );

  const isWorkspaceOwner =
    state.kind === 'ready' && state.overview.workspace?.currentUserRole === 'owner';
  const assignableRoles = WORKSPACE_ROLES.filter((role) => role !== 'owner' || isWorkspaceOwner);
  const ownershipConsequence =
    roleTarget && state.kind === 'ready' && state.overview.workspace
      ? `${roleTarget.name} becomes the owner of ${state.overview.workspace.name}, with billing, workspace deletion and every administrative control. You become an Admin and lose those controls immediately. Only ${roleTarget.name} can transfer ownership back.`
      : null;

  const handleChangeRole = useCallback((member: WorkspaceMember) => setRoleTarget(member), []);

  const chooseRole = useCallback(
    (member: WorkspaceMember, role: WorkspaceRole) => {
      setRoleTarget(null);
      if (role === 'owner') transferOwnership(member);
      else applyRole(member, role);
    },
    [applyRole, transferOwnership],
  );

  const handleRemoveMember = useCallback(
    (member: WorkspaceMember) => {
      Alert.alert('Remove from workspace?', `${member.name} will lose access to this workspace.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyMemberId(member.id);
              try {
                await removeWorkspaceMember(member.id);
                await load();
              } catch {
                Alert.alert('Could not remove member', 'Check the member list before retrying.');
              } finally {
                setBusyMemberId(null);
              }
            })();
          },
        },
      ]);
    },
    [load],
  );

  const header = (
    <View style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
      <Pressable
        onPress={handleBack}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? c.surfaceHover : c.transparent,
        })}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ArrowLeft size={22} color={c.textPrimary} />
      </Pressable>
      <Text
        style={{
          flex: 1,
          color: c.textPrimary,
          fontSize: typeScale.title3,
          fontWeight: '700',
          marginLeft: 4,
        }}
      >
        Workspace
      </Text>
    </View>
  );

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
        <StatusBar style={statusBarStyle} />
        {header}
        <View className="flex-1 px-4">
          <CloudAccountRequired
            isLoading={!isClerkLoaded}
            onSignIn={() => router.push(beginCloudPostAuthIntent('cloud-workspace'))}
          />
        </View>
      </SafeAreaView>
    );
  }

  const overview = state.kind === 'ready' ? state.overview : null;
  const workspace = overview?.workspace ?? null;
  const canManage = overview?.access.canManageTeam ?? false;
  const canManageMembers =
    canManage && workspace !== null && isOrganizationAdminRole(workspace.currentUserRole);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      {stepUpModal}
      <RolePickerModal
        member={roleTarget}
        roles={assignableRoles}
        ownershipConsequence={ownershipConsequence}
        onCancel={() => setRoleTarget(null)}
        onChoose={chooseRole}
      />
      <StatusBar style={statusBarStyle} />
      {header}

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.teal} />
        }
      >
        {appMode !== 'cloud' ? (
          <View style={{ marginBottom: 12 }}>
            <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
          </View>
        ) : null}

        {state.kind === 'loading' && appMode === 'cloud' && (
          <Text
            style={{ color: c.textSecondary, fontSize: typeScale.footnote, paddingVertical: 24 }}
          >
            Loading your workspace…
          </Text>
        )}

        {state.kind === 'error' && (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.warningBorder,
              backgroundColor: c.warningSurface,
              padding: 14,
            }}
            accessible
            accessibilityLabel={`Could not load your workspace. ${state.message}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} color={c.agentWarning} />
              <Text
                style={{ color: c.agentWarning, fontSize: typeScale.footnote, fontWeight: '600' }}
              >
                Could not load your workspace
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: typeScale.caption, lineHeight: 17 }}>
              {state.message}
            </Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading your workspace"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'ready' && state.overview.workspaces.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <Text
              style={{
                fontSize: typeScale.caption,
                fontWeight: '700',
                letterSpacing: 1,
                color: c.textMuted,
                marginBottom: 8,
              }}
            >
              ACTIVE WORKSPACE
            </Text>
            <Card>
              {[
                { id: null as string | null, name: 'Personal', Icon: UserRound },
                ...state.overview.workspaces.map((membership) => ({
                  id: membership.id as string | null,
                  name: membership.name,
                  Icon: Building2,
                })),
              ].map((row, index) => {
                const selected = state.overview.activeWorkspaceId === row.id;
                return (
                  <Pressable
                    key={row.id ?? 'personal'}
                    onPress={() => {
                      if (!selected && !switchingWorkspace) handleSelectWorkspace(row.id);
                    }}
                    disabled={switchingWorkspace}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: switchingWorkspace }}
                    accessibilityLabel={`Switch to ${row.name}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: c.border,
                      opacity: switchingWorkspace && !selected ? 0.5 : 1,
                    }}
                  >
                    <row.Icon size={16} color={c.textSecondary} />
                    <Text
                      style={{ flex: 1, color: c.textPrimary, fontSize: typeScale.body }}
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                    {selected && <Check size={16} color={c.teal} />}
                  </Pressable>
                );
              })}
            </Card>
          </View>
        )}

        {/* Not entitled, say which plan the account is actually on rather than
            hiding the section and leaving the user guessing. */}
        {state.kind === 'ready' && !canManage && (
          <Card>
            <View className="items-center py-8 gap-3">
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: c.accentSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={26} color={c.teal} strokeWidth={1.5} />
              </View>
              <Text
                style={{ fontSize: typeScale.headline, fontWeight: '600', color: c.textPrimary }}
              >
                Workspace administration
              </Text>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: c.textSecondary,
                  textAlign: 'center',
                  lineHeight: 18,
                  maxWidth: 300,
                }}
              >
                This needs a provisioned Team or Enterprise plan. Your current plan is{' '}
                {planLabel(overview?.access.plan ?? 'free')}.
              </Text>
            </View>
          </Card>
        )}

        {/* Entitled, but no workspace exists yet. Creation stays on web. */}
        {state.kind === 'ready' && canManage && !workspace && (
          <Card>
            <View className="items-center py-8 gap-3">
              <Text
                style={{ fontSize: typeScale.headline, fontWeight: '600', color: c.textPrimary }}
              >
                No workspace yet
              </Text>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: c.textSecondary,
                  textAlign: 'center',
                  lineHeight: 18,
                  maxWidth: 300,
                }}
              >
                Create your workspace on the web, then manage its members from here.
              </Text>
              <Pressable
                onPress={() => void openExternalUrl(WEB_TEAM_URL)}
                accessibilityRole="button"
                accessibilityLabel="Create a workspace on the web"
              >
                <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
                  Create on web
                </Text>
              </Pressable>
            </View>
          </Card>
        )}

        {state.kind === 'ready' && workspace && (
          <>
            <Card>
              <View style={{ padding: 16, gap: 4 }}>
                <Text
                  style={{ fontSize: typeScale.headline, fontWeight: '700', color: c.textPrimary }}
                >
                  {workspace.name}
                </Text>
                <Text style={{ fontSize: typeScale.caption, color: c.textMuted }}>
                  {workspace.slug}
                </Text>
                <Text
                  style={{ fontSize: typeScale.footnote, color: c.textSecondary, marginTop: 6 }}
                >
                  {planLabel(workspace.plan)} ·{' '}
                  {workspace.maxMembers === null
                    ? translatePlural('settings', 'counts.members', workspace.memberCount, {
                        one: '{{count}} member',
                        other: '{{count}} members',
                      })
                    : `${workspace.memberCount} of ${workspace.maxMembers} seats used`}
                </Text>
                <Text style={{ fontSize: typeScale.caption, color: c.textMuted, marginTop: 2 }}>
                  You are {titleCase(workspace.currentUserRole)}
                </Text>
              </View>
            </Card>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 18,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: typeScale.body, fontWeight: '600', color: c.textPrimary }}>
                Members
              </Text>
            </View>

            {state.members.map((member) => (
              <Card key={member.id}>
                <View style={{ padding: 14, gap: 6 }}>
                  <Text
                    style={{ color: c.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {member.name}
                    {member.isCurrentUser ? ' (you)' : ''}
                  </Text>
                  {member.email ? (
                    <Text
                      style={{ color: c.textSecondary, fontSize: typeScale.caption }}
                      numberOfLines={1}
                    >
                      {member.email}
                    </Text>
                  ) : null}
                  <Text style={{ color: c.textMuted, fontSize: typeScale.caption }}>
                    {titleCase(member.role)}
                  </Text>

                  {/* The server refuses self-removal and blocks admins from
                      removing owners, so those controls are not offered. */}
                  {canManageMembers && !member.isCurrentUser && (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                      <Pressable
                        onPress={() => handleChangeRole(member)}
                        disabled={busyMemberId === member.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Change role for ${member.name}`}
                      >
                        <Text
                          style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}
                        >
                          {busyMemberId === member.id ? 'Working…' : 'Change role'}
                        </Text>
                      </Pressable>
                      {member.role !== 'owner' && (
                        <Pressable
                          onPress={() => handleRemoveMember(member)}
                          disabled={busyMemberId === member.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${member.name}`}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                        >
                          <Trash2 size={13} color={c.agentError} />
                          <Text
                            style={{
                              color: c.agentError,
                              fontSize: typeScale.footnote,
                              fontWeight: '600',
                            }}
                          >
                            Remove
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            ))}

            {canManage && workspace ? (
              <View style={{ marginTop: 18 }}>
                <WorkspaceAdministration organizationId={workspace.id} />
              </View>
            ) : null}

            <Pressable
              onPress={() => void openExternalUrl(WEB_TEAM_URL)}
              accessibilityRole="button"
              accessibilityLabel="Open workspace settings on the web"
              style={{ alignSelf: 'center', paddingVertical: 16 }}
            >
              <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
                Rename or delete this workspace on the web
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
