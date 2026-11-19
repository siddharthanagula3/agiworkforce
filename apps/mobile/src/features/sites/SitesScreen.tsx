import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Globe } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  SITE_VISIBILITY_LABELS,
  listPublishedSitesPage,
  siteName,
  type PublishedSitePage,
} from './service';
import { useSitesListLifetime, type SitesListLifetime } from './useSitesListLifetime';

interface SitesListState {
  view: SitesListLifetime;
  page: { cursor: string | null; list: PublishedSitePage } | null;
  pending: { cursor: string | null; refreshing: boolean } | null;
  failure: { cursor: string | null; message: string } | null;
  isCurrentRead: () => boolean;
}

export const SITES_ROUTE = '/(app)/sites';

export function SitesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const view = useSitesListLifetime(access);
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

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Published sites"
        feature="Published sites"
        description="Published sites live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Published sites" onBack={goBack} />
      {!visible ? (
        <LoadingRows />
      ) : (
        <FlatList
          data={page?.list.sites ?? []}
          extraData={visible}
          keyExtractor={(site) => site.token}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 4 }}>
              <MetaText>
                {page
                  ? `${page.list.sites.length} sites on this page. ${
                      page.list.nextCursor === undefined
                        ? 'Page coverage is unknown.'
                        : page.list.nextCursor === null
                          ? 'No older sites reported.'
                          : 'Older sites are available.'
                    }`
                  : 'Published sites'}
              </MetaText>
              {pending ? (
                <MetaText>
                  {page
                    ? 'Loading a replacement page. The previous page is shown and unavailable.'
                    : 'Loading sites…'}
                </MetaText>
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
            ) : (
              <EmptyState
                Icon={Globe}
                title={
                  page?.cursor === null && page.list.nextCursor === null && !failure
                    ? 'Nothing published'
                    : 'No sites on this page'
                }
                body={
                  page?.cursor === null && page.list.nextCursor === null && !failure
                    ? 'Publish an artifact from a Cloud chat to get a link people can open.'
                    : 'Pull to refresh the first page or use the available page controls.'
                }
              />
            )
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
    </SafeAreaView>
  );
}
