import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Share, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Link2, Trash2, AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CloudSyncBlockedBanner } from '@/src/features/settings/common';
import { fetchSharedLinks, revokeSharedLink, type SharedLink } from '@/src/features/shared-links';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; links: SharedLink[] }
  /** Local Mode: the request is refused on-device, so there is nothing to load. */
  | { kind: 'blocked' }
  | { kind: 'error' };

const LOAD_FAILED_MESSAGE = 'Check your connection and try again.';
const REVOKE_FAILED_MESSAGE = 'The link is still active. Please try again.';

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function isEgressBlocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'EGRESS_BLOCKED_LOCAL_MODE'
  );
}

export default function SharedLinksScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudMode = appMode === 'cloud';
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const links = await fetchSharedLinks();
      setState({ kind: 'ready', links });
    } catch (error) {
      setState(isEgressBlocked(error) ? { kind: 'blocked' } : { kind: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!isCloudMode) {
      setState({ kind: 'blocked' });
      return;
    }
    setState({ kind: 'loading' });
    void load();
  }, [isCloudMode, load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    if (!isCloudMode) return;
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [isCloudMode, load]);

  const handleRevoke = useCallback(
    (link: SharedLink) => {
      Alert.alert(
        'Revoke this link?',
        `"${link.title}" will stop opening for anyone who has the URL.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setRevoking(link.token);
                try {
                  await revokeSharedLink(link.token);
                  await load();
                } catch {
                  Alert.alert('Could not revoke', REVOKE_FAILED_MESSAGE);
                } finally {
                  setRevoking(null);
                }
              })();
            },
          },
        ],
      );
    },
    [load],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <View
        style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
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
          Shared Links
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.teal} />
        }
      >
        {state.kind === 'blocked' && (
          <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
        )}

        {state.kind === 'loading' && (
          <Text style={{ color: c.textSecondary, fontSize: 13, paddingVertical: 24 }}>
            Loading your shared links…
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
            accessibilityLabel={`Could not load shared links. ${LOAD_FAILED_MESSAGE}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} color={c.agentWarning} />
              <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
                Could not load shared links
              </Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {LOAD_FAILED_MESSAGE}
            </Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading shared links"
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'ready' && state.links.length === 0 && (
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
                <Link2 size={26} color={c.teal} strokeWidth={1.5} />
              </View>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: '600',
                  color: c.textPrimary,
                  textAlign: 'center',
                }}
              >
                No shared links yet
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
                Share a conversation to publish a read-only link. It will appear here so you can
                revoke it later.
              </Text>
            </View>
          </Card>
        )}

        {state.kind === 'ready' &&
          state.links.map((link) => (
            <Card key={link.token}>
              <View style={{ padding: 14, gap: 8 }}>
                <Text
                  style={{ color: c.textPrimary, fontSize: 15, fontWeight: '600' }}
                  numberOfLines={2}
                >
                  {link.title}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  {link.messageCount} message{link.messageCount === 1 ? '' : 's'}
                  {formatDate(link.createdAt) ? ` · shared ${formatDate(link.createdAt)}` : ''}
                </Text>
                <Text
                  style={{ color: link.expired ? c.agentWarning : c.textMuted, fontSize: 12 }}
                  accessibilityLabel={
                    link.expired ? 'This link has expired' : `Expires ${formatDate(link.expiresAt)}`
                  }
                >
                  {link.expired
                    ? 'Expired, no longer opens'
                    : `Expires ${formatDate(link.expiresAt)}`}
                </Text>

                <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                  {/* An expired link no longer opens, so offering to share it
                      again would hand someone a dead URL. */}
                  {!link.expired && (
                    <Pressable
                      onPress={() => void Share.share({ message: link.shareUrl })}
                      accessibilityRole="button"
                      accessibilityLabel={`Share link to ${link.title}`}
                    >
                      <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
                        Share link
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleRevoke(link)}
                    disabled={revoking === link.token}
                    accessibilityRole="button"
                    accessibilityLabel={`Revoke link to ${link.title}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                  >
                    <Trash2 size={13} color={c.agentError} />
                    <Text style={{ color: c.agentError, fontSize: 13, fontWeight: '600' }}>
                      {revoking === link.token ? 'Revoking…' : 'Revoke'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}
