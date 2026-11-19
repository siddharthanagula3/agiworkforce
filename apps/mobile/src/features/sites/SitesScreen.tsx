import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Globe, Plus } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  Chip,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useChatStore } from '@/stores/chatStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  SITE_VISIBILITY_LABELS,
  listPublishedSitesPage,
  siteName,
  type PublishedSitePage,
} from './service';
import { SharedSitesList } from './SharedSitesList';
import { useSitesListLifetime, type SitesListLifetime } from './useSitesListLifetime';

interface SitesListState {
  view: SitesListLifetime;
  page: { cursor: string | null; list: PublishedSitePage } | null;
  pending: { cursor: string | null; refreshing: boolean } | null;
  failure: { cursor: string | null; message: string } | null;
  isCurrentRead: () => boolean;
}

export const SITES_ROUTE = '/(app)/sites';

const NEW_SITE_PROMPT = 'Build a one-page website for ';
type SitesTab = 'yours' | 'shared';

const NOTHING_PUBLISHED = {
  title: 'Nothing published',
  body: 'Tap + to build a site, or publish an artifact from a Cloud chat.',
};
const NO_NEWER_SITES = {
  title: 'No newer sites',
  body: 'Use Older to see the sites you published earlier.',
};
const NO_MORE_SITES = {
  title: 'No more sites',
  body: 'Go back to the first page to see your newest sites.',
};

function sitesEmptyCopy(page: SitesListState['page']): { title: string; body: string } {
  if (page && page.cursor !== null) return NO_MORE_SITES;
  if (page && typeof page.list.nextCursor === 'string') return NO_NEWER_SITES;
  return NOTHING_PUBLISHED;
}

export function SitesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const view = useSitesListLifetime(access);
  const createConversation = useChatStore((s) => s.createConversation);
  const [tab, setTab] = useState<SitesTab>('yours');
  const [sharedOpened, setSharedOpened] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [state, setState] = useState<SitesListState | null>(null);
  const visible = state?.view === view && view.isCurrent() ? state : null;
  const displayed = useRef<SitesListState | null>(null);
  displayed.current = visible;
  const page = visible?.page ?? null;
  const pending = visible?.pending ?? null;
  const failure = visible?.failure ?? null;
  const canUseDisplay = () =>
    !!visible && view.isCurrent() && displayed.current === visible && visible.isCurrentRead();

  const load = useCallback(
    async (cursor: string | null = null, refreshing = false) => {
      const retained = displayed.current?.view === view ? displayed.current.page : null;
      const read = view.beginRead();
      if (!read) return;
      setState((current) =>
        read.isCurrent()
          ? {
              view,
              page: retained,
              pending: { cursor, refreshing },
              failure: null,
              isCurrentRead: read.isCurrent,
            }
          : current,
      );
      try {
        const list = await listPublishedSitesPage(cursor, read.authority.signal, read.authority);
        if (!read.isCurrent()) return;
        setState((current) =>
          read.isCurrent()
            ? {
                view,
                page: { cursor, list },
                pending: null,
                failure: null,
                isCurrentRead: read.isCurrent,
              }
            : current,
        );
      } catch (loadError) {
        if (!read.isCurrent()) return;
        const message = cloudActionError(loadError, 'Could not load your published sites.');
        // Only this new display reauthorizes retained rows after a failed replacement.
        setState((current) =>
          read.isCurrent()
            ? {
                view,
                page: retained,
                pending: null,
                failure: { cursor, message },
                isCurrentRead: read.isCurrent,
              }
            : current,
        );
      }
    },
    [view],
  );

  useEffect(() => {
    void load();
    return () => view.cancelRead();
  }, [load, view]);

  const siteCount = page?.list.sites.length ?? 0;
  const sitesWord = siteCount === 1 ? 'site' : 'sites';
  const multiplePages =
    page !== null && (page.cursor !== null || typeof page.list.nextCursor === 'string');
  const pageNote =
    multiplePages && siteCount > 0
      ? page.cursor === null
        ? `Showing your ${siteCount} newest ${sitesWord}.`
        : `Showing ${siteCount} older ${sitesWord}.`
      : null;

  const emptyCopy = failure ? null : sitesEmptyCopy(page);

  const selectTab = (next: SitesTab) => {
    if (next === 'shared') setSharedOpened(true);
    setTab(next);
  };

  const startSite = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const conversationId = await createConversation();
      router.push({
        pathname: '/(app)/chat/[id]' as const,
        params: { id: conversationId, prompt: NEW_SITE_PROMPT },
      });
    } catch (createFailure) {
      setCreateError(cloudActionError(createFailure, 'Could not start a new site.'));
    } finally {
      setCreating(false);
    }
  };

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Sites"
        feature="Sites"
        description="Sites live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title="Sites"
        onBack={goBack}
        trailing={
          <PressableBox
            onPress={() => void startSite()}
            disabled={creating}
            accessibilityRole="button"
            accessibilityLabel="New site"
            accessibilityState={{ disabled: creating }}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: creating ? 0.5 : 1,
            }}
          >
            <Plus size={22} color={colors.textPrimary} />
          </PressableBox>
        }
      />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        <Chip label="Yours" selected={tab === 'yours'} onPress={() => selectTab('yours')} />
        <Chip
          label="Shared with you"
          selected={tab === 'shared'}
          onPress={() => selectTab('shared')}
        />
      </View>
      {createError ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ErrorBanner message={createError} />
        </View>
      ) : null}
      <View style={{ flex: 1, display: tab === 'yours' ? 'flex' : 'none' }}>
        {!visible ? (
          <LoadingRows />
        ) : (
          <FlatList
            data={page?.list.sites ?? []}
            extraData={visible}
            keyExtractor={(site) => site.token}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 40,
              gap: 10,
              flexGrow: 1,
            }}
            ListHeaderComponent={
              <View style={{ gap: 10, paddingBottom: 4 }}>
                {pageNote ? <MetaText>{pageNote}</MetaText> : null}
                {pending && !page ? <MetaText>Loading sites…</MetaText> : null}
                {pending && page && !pending.refreshing ? (
                  <MetaText>Loading more sites…</MetaText>
                ) : null}
                {failure ? (
                  <ErrorBanner
                    message={failure.message}
                    onRetry={() => {
                      if (canUseDisplay() && !pending) void load(failure.cursor);
                    }}
                  />
                ) : null}
                {page?.list.nextCursor ? (
                  <Button
                    title="Older"
                    variant="outline"
                    disabled={!!pending}
                    onPress={() => {
                      if (canUseDisplay() && !pending) void load(page.list.nextCursor);
                    }}
                  />
                ) : null}
                {page && page.cursor !== null ? (
                  <Button
                    title="Back to first page"
                    variant="outline"
                    disabled={!!pending}
                    onPress={() => {
                      if (canUseDisplay() && !pending) void load(null);
                    }}
                  />
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <PressableBox
                onPress={() => {
                  if (!canUseDisplay() || pending) return;
                  router.push({
                    pathname: '/(app)/sites/[token]' as const,
                    params: { token: item.token },
                  });
                }}
                disabled={!!pending}
                accessibilityRole="button"
                accessibilityLabel={`${siteName(item)}. ${SITE_VISIBILITY_LABELS[item.visibility]}`}
                style={{
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  padding: 14,
                  gap: 4,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
                >
                  {siteName(item)}
                </Text>
                <MetaText>
                  {[
                    SITE_VISIBILITY_LABELS[item.visibility],
                    item.version > 0 ? `Version ${item.version}` : null,
                    `Updated ${new Date(item.updatedAt).toLocaleDateString()}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </MetaText>
              </PressableBox>
            )}
            ListEmptyComponent={
              pending ? (
                <LoadingRows />
              ) : emptyCopy ? (
                <EmptyState Icon={Globe} title={emptyCopy.title} body={emptyCopy.body} />
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={pending?.refreshing ?? false}
                onRefresh={() => {
                  // Refresh has no cursor authority and may supersede a same-view read.
                  if (view.isCurrent()) void load(null, true);
                }}
                tintColor={colors.textPrimary}
              />
            }
          />
        )}
      </View>
      {sharedOpened ? (
        <View style={{ flex: 1, display: tab === 'shared' ? 'flex' : 'none' }}>
          <SharedSitesList access={access} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
