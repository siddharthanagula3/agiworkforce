import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  Check,
  Users,
  UserPlus,
  UserRound,
  Trash2,
} from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CloudAccountRequired, CloudSyncBlockedBanner } from '@/src/features/settings/common';
import {
  WORKSPACE_ROLES,
  addWorkspaceMember,
  fetchWorkspaceMembers,
  fetchWorkspaceOverview,
  removeWorkspaceMember,
  setActiveWorkspace,
  updateWorkspaceMemberRole,
  type WorkspaceMember,
  type WorkspaceOverview,
  type WorkspaceRole,
} from '@/src/features/team';
import { useChatStore } from '@/stores/chatStore';

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

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const overview = await fetchWorkspaceOverview(signal);
      if (signal?.aborted) return;
      const members = overview.workspace
        ? await fetchWorkspaceMembers(overview.workspace.id, signal)
        : [];
      if (signal?.aborted) return;
      setState({ kind: 'ready', overview, members });
    } catch (error) {
      if (signal?.aborted) return;
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load your workspace.',
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
          await setActiveWorkspace(organizationId);
          await useChatStore.getState().loadConversations();
          await load();
        } catch (error) {
          Alert.alert(
            'Could not switch workspace',
            error instanceof Error ? error.message : 'Please try again.',
          );
        } finally {
          setSwitchingWorkspace(false);
        }
      })();
    },
    [load],
  );

  const handleAddMember = useCallback(() => {
    if (state.kind !== 'ready' || !state.overview.workspace) return;
    const workspaceId = state.overview.workspace.id;

    if (Platform.OS !== 'ios') {
      void openExternalUrl(WEB_TEAM_URL);
      return;
    }

    Alert.prompt(
      'Add a member',
      'Enter the email of an existing AGI account. There is no invitation email — the account must already exist.',
      (email: string) => {
        const trimmed = email.trim();
        if (!trimmed.includes('@')) {
          Alert.alert('Enter a valid email', 'That does not look like an email address.');
          return;
        }
        void (async () => {
          try {
            await addWorkspaceMember(workspaceId, trimmed, 'member');
            await load();
          } catch (error) {
            Alert.alert(
              'Could not add member',
              error instanceof Error ? error.message : 'Please try again.',
            );
          }
        })();
      },
      'plain-text',
    );
  }, [load, state]);

  const handleChangeRole = useCallback(
    (member: WorkspaceMember) => {
      Alert.alert(
        member.name,
        'Choose a role for this member.',
        [
          ...WORKSPACE_ROLES.map((role) => ({
            text: `${member.role === role ? '✓ ' : ''}${titleCase(role)}`,
            onPress: () => {
              if (role === member.role) return;
              void (async () => {
                setBusyMemberId(member.id);
                try {
                  await updateWorkspaceMemberRole(member.id, role);
                  await load();
                } catch (error) {
                  Alert.alert(
                    'Could not change role',
                    error instanceof Error ? error.message : 'Please try again.',
                  );
                } finally {
                  setBusyMemberId(null);
                }
              })();
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ].filter(Boolean),
      );
    },
    [load],
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
              } catch (error) {
                Alert.alert(
                  'Could not remove member',
                  error instanceof Error ? error.message : 'Please try again.',
                );
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
        style={{ flex: 1, color: c.textPrimary, fontSize: 20, fontWeight: '700', marginLeft: 4 }}
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
            onSignIn={() => router.push('/(auth)/login' as Parameters<typeof router.push>[0])}
          />
        </View>
      </SafeAreaView>
    );
  }

  const overview = state.kind === 'ready' ? state.overview : null;
  const workspace = overview?.workspace ?? null;
  const canManage = overview?.access.canManageTeam ?? false;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
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
          <Text style={{ color: c.textSecondary, fontSize: 13, paddingVertical: 24 }}>
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
              <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
                Could not load your workspace
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {state.message}
            </Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading your workspace"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'ready' && state.overview.workspaces.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <Text
              style={{
                fontSize: 11,
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
                    <Text style={{ flex: 1, color: c.textPrimary, fontSize: 15 }} numberOfLines={1}>
                      {row.name}
                    </Text>
                    {selected && <Check size={16} color={c.teal} />}
                  </Pressable>
                );
              })}
            </Card>
          </View>
        )}

        {/* Not entitled — say which plan the account is actually on rather than
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
              <Text style={{ fontSize: 17, fontWeight: '600', color: c.textPrimary }}>
                Workspace administration
              </Text>
              <Text
                style={{
                  fontSize: 13,
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
              <Text style={{ fontSize: 17, fontWeight: '600', color: c.textPrimary }}>
                No workspace yet
              </Text>
              <Text
                style={{
                  fontSize: 13,
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
                <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
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
                <Text style={{ fontSize: 18, fontWeight: '700', color: c.textPrimary }}>
                  {workspace.name}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{workspace.slug}</Text>
                <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 6 }}>
                  {planLabel(workspace.plan)} ·{' '}
                  {workspace.maxMembers === null
                    ? `${workspace.memberCount} member${workspace.memberCount === 1 ? '' : 's'}`
                    : `${workspace.memberCount} of ${workspace.maxMembers} seats used`}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
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
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>Members</Text>
              {canManage && (
                <Pressable
                  onPress={handleAddMember}
                  accessibilityRole="button"
                  accessibilityLabel="Add a member"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <UserPlus size={14} color={c.teal} />
                  <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>Add</Text>
                </Pressable>
              )}
            </View>

            {state.members.map((member) => (
              <Card key={member.id}>
                <View style={{ padding: 14, gap: 6 }}>
                  <Text
                    style={{ color: c.textPrimary, fontSize: 15, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {member.name}
                    {member.isCurrentUser ? ' (you)' : ''}
                  </Text>
                  {member.email ? (
                    <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {member.email}
                    </Text>
                  ) : null}
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>{titleCase(member.role)}</Text>

                  {/* The server refuses self-removal and blocks admins from
                      removing owners, so those controls are not offered. */}
                  {canManage && !member.isCurrentUser && (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                      <Pressable
                        onPress={() => handleChangeRole(member)}
                        disabled={busyMemberId === member.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Change role for ${member.name}`}
                      >
                        <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
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
                          <Text style={{ color: c.agentError, fontSize: 13, fontWeight: '600' }}>
                            Remove
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            ))}

            <Pressable
              onPress={() => void openExternalUrl(WEB_TEAM_URL)}
              accessibilityRole="button"
              accessibilityLabel="Open workspace settings on the web"
              style={{ alignSelf: 'center', paddingVertical: 16 }}
            >
              <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
                Rename or delete this workspace on the web
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
