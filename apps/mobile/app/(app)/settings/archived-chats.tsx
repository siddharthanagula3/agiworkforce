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
import { useAuthStore } from '@/src/features/auth/store';
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; conversations: ArchivedConversation[]; hasMore: boolean; nextOffset: number }
  | { kind: 'error'; message: string };

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
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const loadConversations = useChatMessageStore((state) => state.loadConversations);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const page = await fetchArchivedConversations(0, signal);
      if (signal?.aborted) return;
      setState({
        kind: 'ready',
        conversations: page.conversations,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      });
    } catch (error) {
      if (signal?.aborted) return;
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load archived chats.',
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

  const handleLoadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchArchivedConversations(state.nextOffset);
      setState((current) => {
        if (current.kind !== 'ready') return current;
        const seen = new Set(current.conversations.map((conversation) => conversation.id));
        return {
          kind: 'ready',
          conversations: [
            ...current.conversations,
            ...page.conversations.filter((conversation) => !seen.has(conversation.id)),
          ],
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
      });
    } catch (error) {
      Alert.alert(
        'Could not load more',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoadingMore(false);
    }
  }, [state]);

  const removeFromList = useCallback((id: string) => {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            conversations: current.conversations.filter((conversation) => conversation.id !== id),
          }
        : current,
    );
  }, []);

  const handleRestore = useCallback(
    (conversation: ArchivedConversation) => {
      void (async () => {
        setBusyId(conversation.id);
        try {
          await restoreArchivedConversation(conversation.id);
          removeFromList(conversation.id);
          await loadConversations();
        } catch (error) {
          Alert.alert(
            'Could not restore',
            error instanceof Error ? error.message : 'Please try again.',
          );
        } finally {
          setBusyId(null);
        }
      })();
    },
    [loadConversations, removeFromList],
  );

  const handleDelete = useCallback(
    (conversation: ArchivedConversation) => {
      Alert.alert(
        'Delete this chat?',
        `"${conversation.title}" and its messages will be permanently deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusyId(conversation.id);
                try {
                  await deleteArchivedConversation(conversation.id);
                  removeFromList(conversation.id);
                } catch (error) {
                  Alert.alert(
                    'Could not delete',
                    error instanceof Error ? error.message : 'Please try again.',
                  );
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
    Alert.alert(
      'Delete all archived chats?',
      'Every archived chat and its messages will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const deleted = await deleteAllArchivedConversations();
                setState({ kind: 'ready', conversations: [], hasMore: false, nextOffset: 0 });
                Alert.alert(
                  'Archived chats deleted',
                  `${deleted} chat${deleted === 1 ? '' : 's'} deleted.`,
                );
              } catch (error) {
                Alert.alert(
                  'Could not delete',
                  error instanceof Error ? error.message : 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  }, []);

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
            onSignIn={() => router.push('/(auth)/login' as Parameters<typeof router.push>[0])}
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

        {state.kind === 'loading' && appMode === 'cloud' && (
          <Text style={{ color: c.textSecondary, fontSize: 13, paddingVertical: 24 }}>
            Loading your archived chats…
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
            accessibilityLabel={`Could not load archived chats. ${state.message}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} color={c.agentWarning} />
              <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
                Could not load archived chats
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {state.message}
            </Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading archived chats"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'ready' && state.conversations.length === 0 && (
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
                  fontSize: 17,
                  fontWeight: '600',
                  color: c.textPrimary,
                  textAlign: 'center',
                }}
              >
                No archived chats
              </Text>
              <Text
                style={{
                  fontSize: 13,
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

        {state.kind === 'ready' &&
          state.conversations.map((conversation) => (
            <Card key={conversation.id}>
              <View style={{ padding: 14, gap: 8 }}>
                <Text
                  style={{ color: c.textPrimary, fontSize: 15, fontWeight: '600' }}
                  numberOfLines={2}
                >
                  {conversation.title}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
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
                    <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
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
                    <Text style={{ color: c.agentError, fontSize: 13, fontWeight: '600' }}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}

        {state.kind === 'ready' && state.hasMore && (
          <Pressable
            onPress={() => void handleLoadMore()}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityLabel="Load more archived chats"
            style={{ alignSelf: 'center', paddingVertical: 14 }}
          >
            <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Text>
          </Pressable>
        )}

        {state.kind === 'ready' && state.conversations.length > 0 && (
          <Pressable
            onPress={handleDeleteAll}
            accessibilityRole="button"
            accessibilityLabel="Delete all archived chats"
            style={{ alignSelf: 'center', paddingVertical: 14, marginTop: 4 }}
          >
            <Text style={{ color: c.agentError, fontSize: 13, fontWeight: '600' }}>
              Delete all archived chats
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
