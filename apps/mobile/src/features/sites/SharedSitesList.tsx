import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { LayoutGrid, MailCheck, MoreHorizontal } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';
import {
  fetchProjectSharing,
  type ProjectSharingOverview,
} from '@/src/features/projects/projectSharing';
import {
  confirmHideSharer,
  sharedReportTarget,
} from '@/src/features/shared-with-you/SharedItemSafetyActions';
import {
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import type { CloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  listSitesSharedWithMe,
  sharedSiteRows,
  type SharedSite,
  type SiteSharedWithMe,
} from './service';
import { hiddenSharedSiteTokens, hideSharedSite } from './hiddenSharedSites';
import { useSitesListLifetime, type SitesListLifetime } from './useSitesListLifetime';

type LoadMode = 'first' | 'more' | 'refresh';

interface SharedData {
  overview: ProjectSharingOverview | null;
  invited: SiteSharedWithMe[];
  nextCursor: string | null;
  emailVerified: boolean;
}

interface SharedState {
  view: SitesListLifetime;
  data: SharedData | null;
  pending: LoadMode | null;
  failure: { mode: LoadMode; message: string } | null;
}

const NO_SHARED_SITES = {
  title: 'No shared sites yet',
  body: 'Sites people share with you will appear here.',
};
const VERIFY_EMAIL = {
  title: 'Verify your email to see sites shared with you',
  body: 'Sharing matches the confirmed email on your account.',
};

function SharedSiteRow({
  site,
  onOpen,
  onMore,
}: {
  site: SharedSite;
  onOpen: () => void;
  onMore: () => void;
}) {
  const colors = useThemeColors();
  const name = site.title.trim() || 'Untitled site';
  const subtitle = [
    site.updatedAt ? `Updated ${new Date(site.updatedAt).toLocaleDateString()}` : null,
    site.sharedBy ? `Shared by ${site.sharedBy}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <PressableBox
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${name}. ${subtitle}` : name}
        style={{ flex: 1, minHeight: 44, padding: 14, gap: 4 }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {name}
        </Text>
        {subtitle ? <MetaText>{subtitle}</MetaText> : null}
      </PressableBox>
      <PressableBox
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${name}`}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreHorizontal size={18} color={colors.textSecondary} />
      </PressableBox>
    </View>
  );
}

export function SharedSitesList({ access }: { access: CloudFeatureAccess }) {
  const colors = useThemeColors();
  const view = useSitesListLifetime(access);
  const [state, setState] = useState<SharedState | null>(null);
  const [, setHiddenChanges] = useState(0);
  const [reporting, setReporting] = useState<SharedSite | null>(null);
  const visible = state?.view === view && view.isCurrent() ? state : null;
  const displayed = useRef<SharedState | null>(null);
  displayed.current = visible;
  const data = visible?.data ?? null;
  const pending = visible?.pending ?? null;
  const failure = visible?.failure ?? null;

  const load = useCallback(
    async (mode: LoadMode) => {
      const retained = displayed.current?.view === view ? displayed.current.data : null;
      if (mode === 'more' && !retained?.nextCursor) return;
      const read = view.beginRead();
      if (!read) return;
      const keep = mode === 'first' ? null : retained;
      setState((current) =>
        read.isCurrent() ? { view, data: keep, pending: mode, failure: null } : current,
      );
      try {
        let next: SharedData;
        if (mode === 'more' && retained?.nextCursor) {
          const page = await listSitesSharedWithMe(retained.nextCursor, read.authority);
          next = {
            ...retained,
            invited: [...retained.invited, ...page.items],
            nextCursor: page.nextCursor,
            emailVerified: page.emailVerified,
          };
        } else {
          const [page, overview] = await Promise.all([
            listSitesSharedWithMe(null, read.authority),
            fetchProjectSharing(read.authority.signal),
          ]);
          next = {
            overview,
            invited: page.items,
            nextCursor: page.nextCursor,
            emailVerified: page.emailVerified,
          };
        }
        if (!read.isCurrent()) return;
        setState((current) =>
          read.isCurrent() ? { view, data: next, pending: null, failure: null } : current,
        );
      } catch (loadError) {
        if (!read.isCurrent()) return;
        const message = cloudActionError(loadError, 'Could not load sites shared with you.');
        setState((current) =>
          read.isCurrent()
            ? { view, data: keep, pending: null, failure: { mode, message } }
            : current,
        );
      }
    },
    [view],
  );

  useEffect(() => {
    void load('first');
    return () => view.cancelRead();
  }, [load, view]);

  const clerkUserId = useAuthStore((auth) => auth.clerkUserId);
  const hiddenTokens = hiddenSharedSiteTokens(clerkUserId);
  const rows = data
    ? sharedSiteRows(data.invited, data.overview).filter((site) => !hiddenTokens.has(site.token))
    : [];

  const chooseSafetyAction = (site: SharedSite) => {
    const accountId = data?.overview?.currentUserId ?? null;
    const sharerId = site.sharerId;
    const name = site.title.trim() || 'Untitled site';
    const hideAction =
      accountId && sharerId && site.sharedBy
        ? [
            {
              text: `Hide ${site.sharedBy}`,
              style: 'destructive' as const,
              onPress: () =>
                void confirmHideSharer(accountId, sharerId, site.sharedBy ?? '').then((hidden) => {
                  if (hidden) setHiddenChanges((count) => count + 1);
                }),
            },
          ]
        : !sharerId && clerkUserId
          ? [
              {
                text: 'Hide this site',
                style: 'destructive' as const,
                onPress: () =>
                  void confirmIrreversible({
                    title: `Hide ${name}?`,
                    consequence: 'It will no longer show in Shared with you on this phone.',
                    actionLabel: 'Hide',
                  }).then((confirmed) => {
                    if (!confirmed) return;
                    hideSharedSite(clerkUserId, site.token);
                    setHiddenChanges((count) => count + 1);
                  }),
              },
            ]
          : [];
    Alert.alert(name, undefined, [
      { text: 'Report', onPress: () => setReporting(site) },
      ...hideAction,
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!visible) return <LoadingRows />;

  const unverified = data !== null && !data.emailVerified;
  const showEmpty = rows.length === 0 && !pending && !failure;

  return (
    <>
      <FlatList
        data={rows}
        extraData={visible}
        keyExtractor={(site) => site.token}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 4 }}>
            {failure && failure.mode !== 'more' ? (
              <ErrorBanner
                message={failure.message}
                onRetry={() => {
                  if (!pending && view.isCurrent()) void load(failure.mode);
                }}
              />
            ) : null}
            {unverified && rows.length > 0 ? <MetaText>{VERIFY_EMAIL.title}</MetaText> : null}
          </View>
        }
        renderItem={({ item }) => (
          <SharedSiteRow
            site={item}
            onOpen={() => void openUntrustedUrlInAppBrowser(item.url)}
            onMore={() => chooseSafetyAction(item)}
          />
        )}
        ListFooterComponent={
          data?.nextCursor ? (
            pending === 'more' ? (
              <MetaText>Loading more sites…</MetaText>
            ) : failure?.mode === 'more' ? (
              <ErrorBanner
                message={failure.message}
                onRetry={() => {
                  if (!pending && view.isCurrent()) void load('more');
                }}
              />
            ) : (
              <Button
                title="Load more"
                variant="outline"
                disabled={!!pending}
                onPress={() => {
                  if (!pending && view.isCurrent()) void load('more');
                }}
              />
            )
          ) : null
        }
        ListEmptyComponent={
          pending ? (
            <LoadingRows />
          ) : showEmpty ? (
            unverified ? (
              <EmptyState Icon={MailCheck} title={VERIFY_EMAIL.title} body={VERIFY_EMAIL.body} />
            ) : (
              <EmptyState
                Icon={LayoutGrid}
                title={NO_SHARED_SITES.title}
                body={NO_SHARED_SITES.body}
              />
            )
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={pending === 'refresh'}
            onRefresh={() => {
              if (view.isCurrent()) void load('refresh');
            }}
            tintColor={colors.textPrimary}
          />
        }
      />
      {reporting ? (
        <ReportSheet
          visible
          title="Report this item"
          onClose={() => setReporting(null)}
          target={
            reporting.sharerId
              ? sharedReportTarget(
                  { kind: 'artifact', id: reporting.reportId, sharerId: reporting.sharerId },
                  reporting.title,
                )
              : {
                  messageId: reporting.reportId,
                  conversationId: 'shared:artifact',
                  contentExcerpt: reporting.title,
                  subject: { kind: 'shared-item', id: reporting.reportId },
                }
          }
        />
      ) : null}
    </>
  );
}
