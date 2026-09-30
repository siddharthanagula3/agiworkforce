import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Archive, Trash2, AlertCircle, RotateCcw } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { CloudAccountRequired, CloudSyncBlockedBanner } from '@/src/features/settings/common';
import {
  deleteAllArchivedConversations,
  deleteArchivedConversation,
  fetchArchivedConversations,
  restoreArchivedConversation,
  type ArchivedConversation,
} from '@/src/features/archived-chats';
import { translatePlural } from '@/src/i18n/plural';

type LoadState =
  | { kind: 'loading'; account: CloudAccountEpoch | null }
  | {
      kind: 'ready';
      account: CloudAccountEpoch;
      conversations: ArchivedConversation[];
      hasMore: boolean;
      nextOffset: number;
    }
  | { kind: 'error'; account: CloudAccountEpoch; message: string };

function isCurrentCloudScope(account: CloudAccountEpoch | null): account is CloudAccountEpoch {
  return isCloudAccountEpochCurrent(account) && useChatAppModeStore.getState().appMode === 'cloud';
}

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

  const [state, setState] = useState<LoadState>({ kind: 'loading', account: null });
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const account = captureCloudAccountEpoch();
    if (!isCurrentCloudScope(account)) return;
    setState({ kind: 'loading', account });
    try {
      const page = await fetchArchivedConversations(0, signal);
      if (signal?.aborted || !isCurrentCloudScope(account)) return;
      setState({
        kind: 'ready',
        account,
        conversations: page.conversations,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      });
    } catch {
      if (signal?.aborted || !isCurrentCloudScope(account)) return;
      setState({
        kind: 'error',
        account,
        message: 'Could not load archived chats. Retry.',
      });
    }
  }, []);

  useEffect(() => {
    if (!isClerkSignedIn || appMode !== 'cloud') return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [appMode, clerkUserId, isClerkSignedIn, load]);

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

  const handleLoadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.hasMore) return;
    const account = state.account;
    if (!isCurrentCloudScope(account)) return;
    setLoadingMore(true);
    try {
      const page = await fetchArchivedConversations(state.nextOffset);
      if (!isCurrentCloudScope(account)) return;
      setState((current) => {
        if (
          current.kind !== 'ready' ||
          current.account.ownerId !== account.ownerId ||
          current.account.epoch !== account.epoch
        )
          return current;
        const seen = new Set(current.conversations.map((conversation) => conversation.id));
        return {
          kind: 'ready',
          account,
          conversations: [
            ...current.conversations,
            ...page.conversations.filter((conversation) => !seen.has(conversation.id)),
          ],
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
      });
    } catch {
      if (isCurrentCloudScope(account)) {
        Alert.alert('Could not load more', 'Refresh archived chats and try again.');
      }
    } finally {
      setLoadingMore(false);
    }
  }, [state]);

  const removeFromList = useCallback((id: string, account: CloudAccountEpoch) => {
    setState((current) =>
      current.kind === 'ready' &&
      current.account.ownerId === account.ownerId &&
      current.account.epoch === account.epoch
        ? {
            ...current,
            conversations: current.conversations.filter((conversation) => conversation.id !== id),
          }
        : current,
    );
  }, []);

  const handleRestore = useCallback(
    (conversation: ArchivedConversation) => {
      const account = captureCloudAccountEpoch();
      if (!isCurrentCloudScope(account)) return;
      void (async () => {
        setBusyId(conversation.id);
        try {
          await restoreArchivedConversation(conversation.id);
          if (!isCurrentCloudScope(account)) return;
          removeFromList(conversation.id, account);
        } catch {
          if (isCurrentCloudScope(account)) {
            Alert.alert('Could not restore', 'The chat is still archived. Try again.');
          }
          return;
        } finally {
          setBusyId(null);
        }
        try {
          if (!isCurrentCloudScope(account)) return;
          await loadConversations();
        } catch {
          if (isCurrentCloudScope(account)) {
            Alert.alert('Chat restored', 'Refresh your chats to see it in the list.');
          }
        }
      })();
    },
    [loadConversations, removeFromList],
  );

  const handleDelete = useCallback(
    (conversation: ArchivedConversation) => {
      const account = captureCloudAccountEpoch();
      if (!isCurrentCloudScope(account)) return;
      Alert.alert(
        'Delete this chat?',
        `"${conversation.title}" and its messages are removed from every device on this account. You can restore it from Recently deleted in Settings on the web.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              if (!isCurrentCloudScope(account)) return;
              void (async () => {
                setBusyId(conversation.id);
                try {
                  await deleteArchivedConversation(conversation.id);
                  if (isCurrentCloudScope(account)) removeFromList(conversation.id, account);
                } catch {
                  if (isCurrentCloudScope(account)) {
                    Alert.alert('Could not delete', 'Refresh archived chats and try again.');
                  }
                } finally {
                  setBusyId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [removeFromList],
  );

  const handleDeleteAll = useCallback(() => {
    const account = captureCloudAccountEpoch();
    if (!isCurrentCloudScope(account)) return;
    Alert.alert(
      'Delete all archived chats?',
      'Every archived chat and its messages are removed from every device on this account. You can restore them from Recently deleted in Settings on the web.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            if (!isCurrentCloudScope(account)) return;
            void (async () => {
              try {
                const deleted = await deleteAllArchivedConversations();
                if (!isCurrentCloudScope(account)) return;
                setState({
                  kind: 'ready',
                  account,
                  conversations: [],
                  hasMore: false,
                  nextOffset: 0,
                });
                Alert.alert(
                  'Archived chats deleted',
                  translatePlural('settings', 'counts.deletedArchivedChats', deleted, {
                    one: 'Deleted {{count}} archived chat.',
                    other: 'Deleted {{count}} archived chats.',
                  }),
                );
              } catch {
                if (isCurrentCloudScope(account)) {
                  Alert.alert('Could not delete', 'Refresh archived chats before trying again.');
                }
              }
            })();
          },
        },
      ],
    );
  }, []);

  const currentAccount = captureCloudAccountEpoch();
  const visibleState: LoadState =
    appMode === 'cloud' &&
    isClerkSignedIn &&
    currentAccount &&
    state.account &&
    currentAccount.ownerId === state.account.ownerId &&
    currentAccount.epoch === state.account.epoch
      ? state
      : { kind: 'loading', account: null };

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
              onPress={() => void load()}
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
                Archive a chat to move it out of your chat list without deleting it. Archived chats
                appear here and can be restored at any time.
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
                    onPress={() => handleRestore(conversation)}
                    disabled={busyId === conversation.id}
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
                    onPress={() => handleDelete(conversation)}
                    disabled={busyId === conversation.id}
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
            onPress={() => void handleLoadMore()}
            disabled={loadingMore}
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
            onPress={handleDeleteAll}
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
