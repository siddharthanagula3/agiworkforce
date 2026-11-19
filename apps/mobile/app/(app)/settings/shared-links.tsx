import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Share, RefreshControl, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useFocusEffect } from 'expo-router';
import { Link2, Trash2, AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { CloudSyncBlockedBanner, SettingsScreenShell } from '@/src/features/settings/Common';
import { fetchSharedLinks, revokeSharedLink, type SharedLink } from '@/src/features/shared-links';
import { translatePlural } from '@/src/i18n/plural';

interface LinkSession {
  account: CloudAccountEpoch;
  controller: AbortController;
  active: boolean;
  read: { controller: AbortController } | null;
  mutation: object | null;
}

interface OwnedLinks {
  owner: LinkSession;
  links: SharedLink[];
  complete: boolean;
}

type LoadState =
  | { kind: 'loading' }
  | ({ kind: 'ready' } & OwnedLinks)
  /** Local Mode: the request is refused on-device, so there is nothing to load. */
  | { kind: 'blocked' }
  | { kind: 'error' };

const LOAD_FAILED_MESSAGE = 'Check your connection and try again.';
const INCOMPLETE_LIST_MESSAGE =
  'Some older links may be missing. They stay open until they expire.';
const REVOKE_FAILED_MESSAGE =
  'Could not confirm whether the link was revoked. Refresh the list before trying again.';

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
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const isCloudMode = appMode === 'cloud';
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [scope, setScope] = useState(() => ({ account: captureCloudAccountEpoch() }));
  const sessionRef = useRef<LinkSession | null>(null);
  const linksRef = useRef<OwnedLinks | null>(null);
  const confirmationRef = useRef<object | null>(null);

  const isCurrent = useCallback((owner: LinkSession): boolean => {
    const auth = useAuthStore.getState();
    return (
      sessionRef.current === owner &&
      owner.active &&
      useChatAppModeStore.getState().appMode === 'cloud' &&
      auth.isClerkSignedIn &&
      auth.clerkUserId === owner.account.ownerId &&
      isCloudAccountEpochCurrent(owner.account)
    );
  }, []);

  const retire = useCallback(() => {
    const owner = sessionRef.current;
    sessionRef.current = null;
    linksRef.current = null;
    confirmationRef.current = null;
    if (owner) {
      owner.active = false;
      owner.controller.abort();
      owner.read?.controller.abort();
      owner.read = null;
    }
  }, []);

  const load = useCallback(
    async (owner: LinkSession, refresh = false) => {
      if (!isCurrent(owner) || owner.mutation) return;
      owner.read?.controller.abort();
      const request = { controller: new AbortController() };
      owner.read = request;
      setRefreshing(refresh);
      const ownsRead = () => isCurrent(owner) && owner.read === request;
      try {
        const { links, complete } = await fetchSharedLinks({
          accountEpoch: owner.account,
          signal: request.controller.signal,
        });
        if (!ownsRead()) return;
        const next = { owner, links, complete };
        linksRef.current = next;
        setState({ kind: 'ready', ...next });
      } catch (error) {
        if (!ownsRead()) return;
        linksRef.current = null;
        setState(isEgressBlocked(error) ? { kind: 'blocked' } : { kind: 'error' });
      } finally {
        if (ownsRead()) {
          owner.read = null;
          setRefreshing(false);
        }
      }
    },
    [isCurrent],
  );

  useEffect(() => {
    const invalidate = () => {
      retire();
      setRefreshing(false);
      setRevoking(null);
      setState({
        kind: useChatAppModeStore.getState().appMode === 'cloud' ? 'loading' : 'blocked',
      });
      setScope({ account: captureCloudAccountEpoch() });
    };
    const stopEpoch = subscribeCloudAccountEpochChange(invalidate);
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) invalidate();
    });
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn
      ) {
        invalidate();
      }
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
      setRevoking(null);
      if (!isCloudMode) {
        setState({ kind: 'blocked' });
        return;
      }
      const account = scope.account;
      if (!account || !isClerkSignedIn || account.ownerId !== clerkUserId) {
        setState({ kind: 'error' });
        return;
      }
      const owner: LinkSession = {
        account,
        controller: new AbortController(),
        active: true,
        read: null,
        mutation: null,
      };
      sessionRef.current = owner;
      setState({ kind: 'loading' });
      void load(owner);
      return () => {
        if (sessionRef.current === owner) retire();
      };
    }, [isCloudMode, isClerkSignedIn, clerkUserId, scope, load, retire]),
  );

  const handleRefresh = useCallback(() => {
    const owner = sessionRef.current;
    if (owner) void load(owner, true);
  }, [load]);

  const isCurrentRow = useCallback(
    (owner: LinkSession, link: SharedLink): boolean => {
      const current = linksRef.current;
      return (
        isCurrent(owner) &&
        current?.owner === owner &&
        current.links.some(
          (row) =>
            row.token === link.token &&
            row.shareUrl === link.shareUrl &&
            row.expired === link.expired,
        )
      );
    },
    [isCurrent],
  );

  const handleRevoke = useCallback(
    (owner: LinkSession, link: SharedLink) => {
      if (!isCurrentRow(owner, link) || owner.mutation) return;
      const intent = {};
      confirmationRef.current = intent;
      Alert.alert(
        'Revoke this link?',
        `"${link.title}" will stop opening for anyone who has the URL.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              if (confirmationRef.current === intent) confirmationRef.current = null;
            },
          },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: () => {
              if (confirmationRef.current !== intent || !isCurrent(owner) || owner.mutation) return;
              confirmationRef.current = null;
              const mutation = {};
              owner.mutation = mutation;
              owner.read?.controller.abort();
              owner.read = null;
              setRefreshing(false);
              const ownsMutation = () => isCurrent(owner) && owner.mutation === mutation;
              void (async () => {
                setRevoking(link.token);
                try {
                  await revokeSharedLink(link.token, {
                    accountEpoch: owner.account,
                    signal: owner.controller.signal,
                  });
                  if (!ownsMutation()) return;
                  const current = linksRef.current;
                  if (current?.owner === owner) {
                    const next = {
                      owner,
                      links: current.links.filter((row) => row.token !== link.token),
                      complete: current.complete,
                    };
                    linksRef.current = next;
                    setState({ kind: 'ready', ...next });
                  }
                } catch {
                  if (!ownsMutation()) return;
                  linksRef.current = null;
                  setState({ kind: 'error' });
                  Alert.alert('Could not revoke', REVOKE_FAILED_MESSAGE);
                } finally {
                  if (ownsMutation()) {
                    owner.mutation = null;
                    setRevoking(null);
                  }
                }
              })();
            },
          },
        ],
      );
    },
    [isCurrent, isCurrentRow],
  );

  const handleShare = useCallback(
    async (owner: LinkSession, link: SharedLink) => {
      if (!isCurrentRow(owner, link) || link.expired || owner.mutation) return;
      try {
        await Share.share({ message: link.shareUrl });
      } catch {
        if (isCurrentRow(owner, link)) Alert.alert('Could not share', 'Please try again.');
      }
    },
    [isCurrentRow],
  );

  const visibleState: LoadState = !isCloudMode
    ? { kind: 'blocked' }
    : state.kind === 'ready' && !isCurrent(state.owner)
      ? { kind: 'loading' }
      : state;

  return (
    <SettingsScreenShell
      title="Shared links"
      help={{ docId: 'sharing-conversations', label: 'How shared links work' }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.teal} />
      }
    >
      {visibleState.kind === 'blocked' && (
        <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />
      )}

      {visibleState.kind === 'loading' && (
        <Text style={{ color: c.textSecondary, fontSize: typeScale.footnote, paddingVertical: 24 }}>
          Loading your shared links…
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
            onPress={handleRefresh}
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

      {visibleState.kind === 'ready' && !visibleState.complete && (
        <Text
          testID="shared-links-incomplete"
          style={{ color: c.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
        >
          {INCOMPLETE_LIST_MESSAGE}
        </Text>
      )}

      {visibleState.kind === 'ready' &&
        visibleState.complete &&
        visibleState.links.length === 0 && (
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

      {visibleState.kind === 'ready' &&
        visibleState.links.map((link) => (
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
                {' · '}
                <Text>
                  {link.visibility === 'organization' ? 'Workspace only' : 'Anyone with the link'}
                </Text>
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
                    onPress={() => void handleShare(visibleState.owner, link)}
                    disabled={revoking !== null}
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
                  onPress={() => handleRevoke(visibleState.owner, link)}
                  disabled={revoking !== null}
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
