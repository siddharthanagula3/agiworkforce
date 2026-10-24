import { useCallback, useState } from 'react';
import { View, Share, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useFocusEffect } from 'expo-router';
import { Link2, Trash2, AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { CloudSyncBlockedBanner, SettingsScreenShell } from '@/src/features/settings/Common';
import { fetchSharedLinks, revokeSharedLink, type SharedLink } from '@/src/features/shared-links';
import { translatePlural } from '@/src/i18n/plural';

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
  const c = useThemeColors();
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

  useFocusEffect(
    useCallback(() => {
      if (!isCloudMode) {
        setState({ kind: 'blocked' });
        return;
      }
      setState((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
      void load();
    }, [isCloudMode, load]),
  );

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
    <SettingsScreenShell
      title="Shared links"
      help={{ docId: 'sharing-conversations', label: 'How shared links work' }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.teal} />
      }
    >
      {state.kind === 'blocked' && (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      )}

      {state.kind === 'loading' && (
        <Text style={{ color: c.textSecondary, fontSize: typeScale.footnote, paddingVertical: 24 }}>
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
            <Text
              style={{ color: c.agentWarning, fontSize: typeScale.footnote, fontWeight: '600' }}
            >
              Could not load shared links
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: typeScale.caption, lineHeight: 17 }}>
            {LOAD_FAILED_MESSAGE}
          </Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading shared links"
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
              Retry
            </Text>
          </Pressable>
        </View>
      )}

      {state.kind === 'ready' && state.links.length === 0 && (
        <View testID="shared-links-empty" style={{ flex: 1, justifyContent: 'center' }}>
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
                  fontSize: typeScale.headline,
                  fontWeight: '600',
                  color: c.textPrimary,
                  textAlign: 'center',
                }}
              >
                No shared links yet
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
                Links you share appear here so you can revoke them.
              </Text>
            </View>
          </Card>
        </View>
      )}

      {state.kind === 'ready' &&
        state.links.map((link) => (
          <Card key={link.token}>
            <View style={{ padding: 14, gap: 8 }}>
              <Text
                style={{ color: c.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                numberOfLines={2}
              >
                {link.title}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: typeScale.caption }}>
                {translatePlural('common', 'counts.messages', link.messageCount, {
                  one: '{{count}} message',
                  other: '{{count}} messages',
                })}
                {formatDate(link.createdAt) ? ` · shared ${formatDate(link.createdAt)}` : ''}
              </Text>
              <Text
                style={{
                  color: link.expired ? c.agentWarning : c.textMuted,
                  fontSize: typeScale.caption,
                }}
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
                    <Text
                      style={{ color: c.teal, fontSize: typeScale.footnote, fontWeight: '600' }}
                    >
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
                  <Text
                    style={{
                      color: c.agentError,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                    }}
                  >
                    {revoking === link.token ? 'Revoking…' : 'Revoke'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ))}
    </SettingsScreenShell>
  );
}
