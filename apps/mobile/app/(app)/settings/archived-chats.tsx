import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Archive, Trash2, AlertCircle, RotateCcw } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { CloudAccountRequired, CloudSyncBlockedBanner } from '@/src/features/settings/Common';
import {
  deleteAllArchivedConversations,
  deleteArchivedConversation,
  fetchArchivedConversations,
  restoreArchivedConversation,
  type ArchivedConversation,
} from '@/src/features/archived-chats';
import { translatePlural } from '@/src/i18n/plural';

interface ArchivedList {
  conversations: ArchivedConversation[];
  hasMore: boolean;
  nextOffset: number;
}

interface ArchivedSession {
  account: CloudAccountEpoch;
  active: boolean;
  controller: AbortController;
  read: { controller: AbortController } | null;
  mutation: object | null;
  list: ArchivedList | null;
}

type LoadState =
  | { kind: 'loading'; owner: ArchivedSession | null }
  | ({ kind: 'ready'; owner: ArchivedSession; list: ArchivedList } & ArchivedList)
  | { kind: 'error'; owner: ArchivedSession; message: string };

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated date unavailable';
  return `Updated ${date.toLocaleDateString()}`;
}

export default function ArchivedChatsScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const loadConversations = useChatMessageStore((state) => state.loadConversations);

  const [state, setState] = useState<LoadState>({ kind: 'loading', owner: null });
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scope, setScope] = useState(() => ({ account: captureCloudAccountEpoch() }));
  const sessionRef = useRef<ArchivedSession | null>(null);

  const isCurrent = useCallback((owner: ArchivedSession) => {
    const auth = useAuthStore.getState();
    return (
      sessionRef.current === owner &&
      owner.active &&
      isCloudAccountEpochCurrent(owner.account) &&
      useChatAppModeStore.getState().appMode === 'cloud' &&
      auth.isClerkLoaded &&
      auth.isClerkSignedIn &&
      auth.clerkUserId === owner.account.ownerId
    );
  }, []);

  const retire = useCallback(() => {
    const owner = sessionRef.current;
    sessionRef.current = null;
    if (owner) {
      owner.active = false;
      owner.controller.abort();
      owner.read?.controller.abort();
      owner.read = null;
      owner.list = null;
    }
  }, []);

  const load = useCallback(
    async (owner: ArchivedSession, refresh = false, more = false, expectedList?: ArchivedList) => {
      if (!isCurrent(owner) || owner.mutation) return;
      const base = owner.list;
      if (more && (!base?.hasMore || owner.read || base !== expectedList)) return;
      owner.read?.controller.abort();
      const request = { controller: new AbortController() };
      owner.read = request;
      setRefreshing(refresh);
      setLoadingMore(more);
      if (!more) {
        owner.list = null;
        setState({ kind: 'loading', owner });
      }
      const ownsRead = () =>
        isCurrent(owner) && owner.read === request && (!more || owner.list === base);
      try {
        const page = await fetchArchivedConversations(
          more && base ? base.nextOffset : 0,
          owner.account,
          request.controller.signal,
        );
        if (!ownsRead()) return;
        const seen = new Set(base?.conversations.map((conversation) => conversation.id));
        const next: ArchivedList = {
          ...page,
          conversations:
            more && base
              ? [
                  ...base.conversations,
                  ...page.conversations.filter((conversation) => !seen.has(conversation.id)),
                ]
              : page.conversations,
        };
        owner.list = next;
        owner.read = null;
        setRefreshing(false);
        setLoadingMore(false);
        setState({ kind: 'ready', owner, list: next, ...next });
      } catch {
        if (!ownsRead()) return;
        if (more) {
          Alert.alert('Could not load more', 'Refresh archived chats and try again.');
        } else {
          owner.list = null;
          setState({ kind: 'error', owner, message: 'Could not load archived chats. Retry.' });
        }
      } finally {
        if (ownsRead()) {
          owner.read = null;
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [isCurrent],
  );

  useEffect(() => {
    const invalidate = () => {
      retire();
      setRefreshing(false);
      setLoadingMore(false);
      setBusyId(null);
      setState({ kind: 'loading', owner: null });
      setScope({ account: captureCloudAccountEpoch() });
    };
    const stopEpoch = subscribeCloudAccountEpochChange(invalidate);
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) invalidate();
    });
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn ||
        next.isClerkLoaded !== previous.isClerkLoaded
      )
        invalidate();
    });
    return () => {
      stopEpoch();
      stopMode();
      stopAuth();
      retire();
    };
  }, [retire]);

  useFocusEffect(
    useCallback(() => {
      retire();
      setRefreshing(false);
      setLoadingMore(false);
      setBusyId(null);
      setState({ kind: 'loading', owner: null });
      const account = scope.account;
      if (
        appMode !== 'cloud' ||
        !isClerkLoaded ||
        !isClerkSignedIn ||
        !account ||
        account.ownerId !== clerkUserId
      )
        return;
      const owner: ArchivedSession = {
        account,
        active: true,
        controller: new AbortController(),
        read: null,
        mutation: null,
        list: null,
      };
      sessionRef.current = owner;
      void load(owner);
      return () => {
        if (sessionRef.current === owner) retire();
      };
    }, [appMode, isClerkLoaded, isClerkSignedIn, clerkUserId, scope, load, retire]),
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleRefresh = useCallback(() => {
    const owner = state.owner;
    if (owner) void load(owner, true);
  }, [load, state.owner]);

  const mutate = useCallback(
    (owner: ArchivedSession, kind: 'restore' | 'delete' | 'bulk', id?: string) => {
      if (!isCurrent(owner) || owner.mutation || (kind !== 'bulk' && !id)) return;
      const mutation = {};
      owner.mutation = mutation;
      owner.read?.controller.abort();
      owner.read = null;
      setRefreshing(false);
      setLoadingMore(false);
      setBusyId(id ?? '*');
      const ownsMutation = () => isCurrent(owner) && owner.mutation === mutation;
      void (async () => {
        let restored = false;
        try {
          if (kind === 'restore' && id) {
            await restoreArchivedConversation(id, owner.account, owner.controller.signal);
            restored = true;
          } else if (kind === 'delete' && id) {
            await deleteArchivedConversation(id, owner.account, owner.controller.signal);
          } else {
            const deleted = await deleteAllArchivedConversations(
              owner.account,
              owner.controller.signal,
            );
            if (ownsMutation()) {
              Alert.alert(
                'Archived chats deleted',
                translatePlural('settings', 'counts.deletedArchivedChats', deleted, {
                  one: 'Deleted {{count}} archived chat.',
                  other: 'Deleted {{count}} archived chats.',
                }),
              );
            }
          }
        } catch {
          if (ownsMutation()) {
            Alert.alert(
              kind === 'restore' ? 'Could not restore' : 'Could not delete',
              kind === 'restore'
                ? 'Could not confirm the restore. Refresh archived chats before trying again.'
                : 'Could not confirm the deletion. Refresh archived chats before trying again.',
            );
          }
        } finally {
          if (ownsMutation()) {
            owner.mutation = null;
            setBusyId(null);
            void load(owner);
          }
        }
        if (!restored || !isCurrent(owner)) return;
        let refreshFailed = false;
        try {
          await loadConversations();
          refreshFailed = Boolean(useChatMessageStore.getState().conversationLoadError);
        } catch {
          refreshFailed = true;
        }
        if (refreshFailed && isCurrent(owner)) {
          Alert.alert('Chat restored', 'Refresh your chats to see it in the list.');
        }
      })();
    },
    [isCurrent, load, loadConversations],
  );

  const handleRestore = useCallback(
    (conversation: ArchivedConversation, owner: ArchivedSession) => {
      mutate(owner, 'restore', conversation.id);
    },
    [mutate],
  );

  const handleDelete = useCallback(
    (conversation: ArchivedConversation, owner: ArchivedSession) => {
      if (!isCurrent(owner) || owner.mutation) return;
      let consumed = false;
      Alert.alert(
        'Delete this chat?',
        `"${conversation.title}" is removed from every device; restore it from Recently deleted on the web.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              consumed = true;
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (consumed) return;
              consumed = true;
              mutate(owner, 'delete', conversation.id);
            },
          },
        ],
      );
    },
    [isCurrent, mutate],
  );

  const handleDeleteAll = useCallback(
    (owner: ArchivedSession) => {
      if (!isCurrent(owner) || owner.mutation) return;
      let consumed = false;
      Alert.alert(
        'Delete all archived chats?',
        'Every archived chat is removed from every device; restore them from Recently deleted on the web.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              consumed = true;
            },
          },
          {
            text: 'Delete all',
            style: 'destructive',
            onPress: () => {
              if (consumed) return;
              consumed = true;
              mutate(owner, 'bulk');
            },
          },
        ],
      );
    },
    [isCurrent, mutate],
  );

  const visibleState: LoadState =
    state.owner && isCurrent(state.owner) ? state : { kind: 'loading', owner: null };

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
        Archived Chats
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
            onSignIn={() => router.push(beginCloudPostAuthIntent('cloud-archived-chats'))}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      {header}

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 44 }}
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

        {visibleState.kind === 'loading' && appMode === 'cloud' && (
          <Text
            style={{ color: c.textSecondary, fontSize: typeScale.footnote, paddingVertical: 24 }}
          >
            Loading your archived chats…
          </Text>
        )}

        {visibleState.kind === 'error' && (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.warningBorder,
              backgroundColor: c.warningSurface,
              padding: 14,
            }}
            accessible
            accessibilityLabel={`Could not load archived chats. ${visibleState.message}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} color={c.agentWarning} />
              <Text
                style={{ color: c.agentWarning, fontSize: typeScale.footnote, fontWeight: '600' }}
              >
                Could not load archived chats
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: typeScale.caption, lineHeight: 17 }}>
              {visibleState.message}
            </Text>
            <Pressable
              onPress={() => {
                if (state.owner) void load(state.owner);
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading archived chats"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {visibleState.kind === 'ready' && visibleState.conversations.length === 0 && (
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
                <Archive size={26} color={c.teal} strokeWidth={1.5} />
              </View>
              <Text
                style={{
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                  color: c.textPrimary,
                  textAlign: 'center',
                }}
              >
                No archived chats
              </Text>
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: c.textSecondary,
                  textAlign: 'center',
                  lineHeight: 18,
                  maxWidth: 280,
                }}
              >
                Chats you archive appear here to restore any time.
              </Text>
            </View>
          </Card>
        )}

        {visibleState.kind === 'ready' &&
          visibleState.conversations.map((conversation) => (
            <Card key={conversation.id}>
              <View style={{ padding: 14, gap: 8 }}>
                <Text
                  style={{ color: c.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                  numberOfLines={2}
                >
                  {conversation.title}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: typeScale.caption }}>
                  {formatUpdatedAt(conversation.updatedAt)}
                </Text>

                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  <Pressable
                    onPress={() => handleRestore(conversation, visibleState.owner)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${conversation.title}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                  >
                    <RotateCcw size={13} color={c.teal} />
                    <Text
                      style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}
                    >
                      {busyId === conversation.id ? 'Working…' : 'Restore'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(conversation, visibleState.owner)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${conversation.title}`}
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
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}

        {visibleState.kind === 'ready' && visibleState.hasMore && (
          <Pressable
            onPress={() => void load(visibleState.owner, false, true, visibleState.list)}
            disabled={loadingMore || busyId !== null}
            accessibilityRole="button"
            accessibilityLabel="Load more archived chats"
            style={{ alignSelf: 'center', paddingVertical: 14 }}
          >
            <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Text>
          </Pressable>
        )}

        {visibleState.kind === 'ready' && visibleState.conversations.length > 0 && (
          <Pressable
            onPress={() => handleDeleteAll(visibleState.owner)}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel="Delete all archived chats"
            style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}
          >
            <Text style={{ color: c.agentError, fontSize: typeScale.footnote, fontWeight: '600' }}>
              Delete all archived chats
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
