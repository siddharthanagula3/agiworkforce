import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BadgeCheck, Blocks, ChevronRight, MoreHorizontal, Plus } from 'lucide-react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import type {
  PluginDirectoryEntryWire,
  PluginDirectorySortKey,
  PluginDirectorySourceFacet,
  PluginUpdateOfferWire,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { fetchConnectorDirectory } from '@/services/connectors';
import { customizeDestinations } from '@/src/features/customize/CustomizeScreen';
import { ApprovalPolicySummary } from '@/src/features/settings/cloud-connectors/ApprovalPolicySummary';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  Chip,
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { showActionMenu } from '@/src/shared/components/ActionMenuHost';
import { BottomSearchBar, useBottomSearchBarSpace } from '@/src/shared/components/BottomSearchBar';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { ROW_LABEL_TEXT_SCALE_LIMIT, typeScale } from '@/src/ui/theme/tokens';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { InstalledPluginTiles, SCREEN_GUTTER } from './InstalledPluginTiles';
import {
  ADDED_PLUGINS_ROUTE,
  PLUGIN_SHELF_ROW_LIMIT,
  indexInstallations,
  installedTilePlan,
  pluginCategories,
  pluginCategoryKey,
  pluginRowControl,
  pluginShelfCategories,
  pluginStateLabel,
  popularPlugins,
  recommendedPlugins,
  updateOfferFor,
  type PluginCategoryOption,
  type PluginInstallIndex,
} from './pluginsModel';
import {
  fetchPluginDirectory,
  fetchPluginInstallations,
  fetchPluginUpdates,
  pluginActionError,
} from './service';
import { useInstalledPluginDetails } from './useInstalledPluginDetails';
import { usePluginActions, type PluginActionPending } from './usePluginActions';

export const PLUGINS_ROUTE = '/(app)/plugins';

const SOURCE_FILTERS: { id: PluginDirectorySourceFacet | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'builtin', label: 'Built in' },
  { id: 'partner', label: 'Partners' },
  { id: 'marketplace', label: 'Marketplace' },
];

const SORTS: { id: PluginDirectorySortKey; label: string }[] = [
  { id: 'installs', label: 'Popular' },
  { id: 'name', label: 'Name' },
];

const CHIP_ROW_STYLE = { marginHorizontal: -SCREEN_GUTTER } as const;
const CHIP_ROW_CONTENT_STYLE = { paddingHorizontal: SCREEN_GUTTER, gap: 6 } as const;

const ROW_PADDING = 14;
const ROW_ICON_SIZE = 40;
const ROW_GAP = 12;
const ROW_DIVIDER_INSET = ROW_PADDING + ROW_ICON_SIZE + ROW_GAP;

const ROW_CONTROL_SIZE = 44;
const SEARCH_BAR_CLEARANCE = 16;

interface PluginListContext {
  installed: PluginInstallIndex;
  pending: PluginActionPending | null;
  onOpen: (entry: PluginDirectoryEntryWire) => void;
  onInstall: (entry: PluginDirectoryEntryWire) => void;
  onMore: (entry: PluginDirectoryEntryWire) => void;
}

function PluginRowControl({
  entry,
  context,
}: {
  entry: PluginDirectoryEntryWire;
  context: PluginListContext;
}) {
  const colors = useThemeColors();
  const control = pluginRowControl(entry, context.installed.get(entry.id));
  if (control === 'none') return null;
  const working = context.pending?.pluginId === entry.id;
  const install = control === 'install';
  const Icon = install ? Plus : MoreHorizontal;
  return (
    <PressableBox
      onPress={() => (install ? context.onInstall(entry) : context.onMore(entry))}
      disabled={context.pending !== null}
      accessibilityRole="button"
      accessibilityLabel={install ? `Install ${entry.name}` : `More actions for ${entry.name}`}
      accessibilityState={{ disabled: context.pending !== null, busy: working }}
      style={({ pressed }) => ({
        width: ROW_CONTROL_SIZE,
        height: ROW_CONTROL_SIZE,
        marginRight: ROW_PADDING / 2,
        borderRadius: ROW_CONTROL_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      {working ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Icon size={install ? 20 : 18} color={colors.textSecondary} />
      )}
    </PressableBox>
  );
}

function PluginRow({
  entry,
  context,
}: {
  entry: PluginDirectoryEntryWire;
  context: PluginListContext;
}) {
  const colors = useThemeColors();
  const state = pluginStateLabel(entry, context.installed.get(entry.id));
  const working = context.pending?.pluginId === entry.id;
  const hasControl = pluginRowControl(entry, context.installed.get(entry.id)) !== 'none';
  const stacked = useLargeTextRows();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <PressableBox
        onPress={() => context.onOpen(entry)}
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel={`${entry.name} by ${entry.publisher.name}. ${state}`}
        accessibilityState={{ disabled: working, busy: working }}
        style={({ pressed }) => ({
          flex: 1,
          padding: ROW_PADDING,
          paddingRight: hasControl ? ROW_GAP / 2 : ROW_PADDING,
          flexDirection: 'row',
          alignItems: 'center',
          gap: ROW_GAP,
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
        })}
      >
        <View
          style={{
            width: ROW_ICON_SIZE,
            height: ROW_ICON_SIZE,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.neutralSurface,
          }}
        >
          <Blocks size={18} color={colors.textPrimary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              {...(stacked
                ? { maxFontSizeMultiplier: ROW_LABEL_TEXT_SCALE_LIMIT }
                : { numberOfLines: 1 })}
              style={{
                flexShrink: 1,
                color: colors.textPrimary,
                fontSize: typeScale.body,
                fontWeight: '600',
              }}
            >
              {entry.name}
            </Text>
            {entry.verified ? (
              <BadgeCheck size={14} color={colors.textSecondary} accessibilityLabel="Verified" />
            ) : null}
          </View>
          <Text
            numberOfLines={2}
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}
          >
            {entry.description}
          </Text>
          <MetaText>{`${entry.publisher.name} · ${state}`}</MetaText>
        </View>
      </PressableBox>
      <PluginRowControl entry={entry} context={context} />
    </View>
  );
}

function PluginGroup({
  entries,
  context,
}: {
  entries: PluginDirectoryEntryWire[];
  context: PluginListContext;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: cardRadius,
        borderCurve: 'continuous',
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      {entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? (
            <View
              style={{ height: 1, backgroundColor: colors.border, marginLeft: ROW_DIVIDER_INSET }}
            />
          ) : null}
          <PluginRow entry={entry} context={context} />
        </View>
      ))}
    </View>
  );
}

function SectionTitle({
  title,
  note,
  hint,
  onPress,
  onLayout,
}: {
  title: string;
  note?: string;
  hint?: string;
  onPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const colors = useThemeColors();
  const heading = (
    <Text
      accessibilityRole={onPress ? undefined : 'header'}
      style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
    >
      {title}
    </Text>
  );
  return (
    <View style={{ paddingTop: 14, gap: 2 }} onLayout={onLayout}>
      {onPress ? (
        <PressableBox
          onPress={onPress}
          accessibilityRole="header"
          accessibilityLabel={title}
          accessibilityHint={hint}
          style={{
            minHeight: ROW_CONTROL_SIZE,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {heading}
          <ChevronRight size={18} color={colors.textMuted} />
        </PressableBox>
      ) : (
        heading
      )}
      {note ? <MetaText>{note}</MetaText> : null}
    </View>
  );
}

export function PluginsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const searchSpace = useBottomSearchBarSpace();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<PluginDirectorySourceFacet | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<PluginDirectorySortKey>('installs');
  const [entries, setEntries] = useState<PluginDirectoryEntryWire[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, number> | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [installed, setInstalled] = useState<PluginInstallIndex>(new Map());
  const [updates, setUpdates] = useState<PluginUpdateOfferWire[]>([]);
  const [connected, setConnected] = useState<ReadonlySet<string>>(new Set());
  const [shelves, setShelves] = useState<ReadonlyMap<string, PluginDirectoryEntryWire[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const pagingRequest = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const allPluginsOffset = useRef(0);
  const focusedBefore = useRef(false);
  const [scrollPending, setScrollPending] = useState(false);

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      source: source ?? undefined,
      category: category ?? undefined,
      sort,
    }),
    [category, search, sort, source],
  );
  const filtering = Boolean(query.search || query.source || query.category);

  useEffect(() => {
    if (!access.ready) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    pagingRequest.current?.abort();
    pagingRequest.current = null;
    setLoadingMore(false);
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        void Promise.all([
          fetchPluginDirectory(query, controller.signal),
          fetchPluginInstallations(controller.signal).catch(() => []),
          fetchPluginUpdates(controller.signal).catch(() => []),
          fetchConnectorDirectory().catch(() => null),
        ])
          .then(([page, installations, offers, directory]) => {
            if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
            setEntries(page.entries);
            setByCategory((current) => page.stats?.byCategory ?? current);
            setNextCursor(page.nextCursor);
            setInstalled(indexInstallations(installations));
            setUpdates(offers);
            setConnected(
              new Set(
                (directory?.connectors ?? []).flatMap((connection) =>
                  [connection.connectorId, connection.toolConnectorId].filter(
                    (id): id is string => typeof id === 'string',
                  ),
                ),
              ),
            );
          })
          .catch((loadError: unknown) => {
            if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
            setError(
              pluginActionError(loadError, 'Could not load plugins. Check your connection.'),
            );
          })
          .finally(() => {
            if (!controller.signal.aborted && isCloudAccountEpochCurrent(account)) {
              setLoading(false);
            }
          });
      },
      query.search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      pagingRequest.current?.abort();
      pagingRequest.current = null;
    };
  }, [access.ready, query, reload]);

  const shelfSignature = useMemo(
    () => JSON.stringify(pluginShelfCategories(byCategory)),
    [byCategory],
  );
  const shelfOptions = useMemo(
    () => JSON.parse(shelfSignature) as PluginCategoryOption[],
    [shelfSignature],
  );

  useEffect(() => {
    if (!access.ready || shelfOptions.length === 0) {
      setShelves((current) => (current.size === 0 ? current : new Map()));
      return;
    }
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    void Promise.all(
      shelfOptions.map((option) =>
        fetchPluginDirectory(
          { category: option.value, sort: 'installs', limit: PLUGIN_SHELF_ROW_LIMIT },
          controller.signal,
        ).then(
          (page) => [option.key, page.entries] as const,
          () => [option.key, [] as PluginDirectoryEntryWire[]] as const,
        ),
      ),
    ).then((results) => {
      if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
      setShelves(new Map(results.filter(([, rows]) => rows.length > 0)));
    });
    return () => controller.abort();
  }, [access.ready, reload, shelfOptions]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const controller = new AbortController();
    pagingRequest.current = controller;
    setLoadingMore(true);
    try {
      const page = await fetchPluginDirectory({ ...query, cursor: nextCursor }, controller.signal);
      if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
      setEntries((current) => {
        const known = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !known.has(entry.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (moreError) {
      if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
      setError(pluginActionError(moreError, 'Could not load more plugins.'));
    } finally {
      if (pagingRequest.current === controller) {
        pagingRequest.current = null;
        setLoadingMore(false);
      }
    }
  }, [loadingMore, nextCursor, query]);

  const openPlugin = useCallback(
    (entry: PluginDirectoryEntryWire) =>
      router.push({ pathname: '/(app)/plugins/[id]' as const, params: { id: entry.id } }),
    [router],
  );

  const refreshInstallations = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!account) return;
    const [installations, offers] = await Promise.all([
      fetchPluginInstallations().catch(() => null),
      fetchPluginUpdates().catch(() => null),
    ]);
    if (!isCloudAccountEpochCurrent(account)) return;
    if (!installations) {
      setReload((value) => value + 1);
      return;
    }
    setInstalled(indexInstallations(installations));
    if (offers) setUpdates(offers);
  }, []);

  const accessReady = useRef(access.ready);
  useEffect(() => {
    accessReady.current = access.ready;
  }, [access.ready]);
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      if (accessReady.current) void refreshInstallations();
    }, [refreshInstallations]),
  );

  const handleFailure = useCallback(
    (message: string, entry: PluginDirectoryEntryWire) => Alert.alert(entry.name, message),
    [],
  );
  const { pending, requestInstall, setEnabled, remove } = usePluginActions({
    onChanged: refreshInstallations,
    onFailure: handleFailure,
  });

  const openMenu = useCallback(
    (entry: PluginDirectoryEntryWire) => {
      const installation = installed.get(entry.id);
      if (!installation) return;
      const offer = updateOfferFor(updates, entry.id);
      showActionMenu({
        title: entry.name,
        dismissLabel: 'Cancel',
        actions: [
          { key: 'details', label: 'View details', run: () => openPlugin(entry) },
          {
            key: 'enabled',
            label: installation.enabled ? 'Turn off' : 'Turn on',
            run: () => void setEnabled(entry, !installation.enabled),
          },
          ...(offer
            ? [
                {
                  key: 'update',
                  label: `Update to ${offer.latestVersion}`,
                  run: () => openPlugin(entry),
                },
              ]
            : []),
          {
            key: 'remove',
            label: 'Remove',
            destructive: true,
            run: () => void remove(entry),
          },
        ],
      });
    },
    [installed, openPlugin, remove, setEnabled, updates],
  );

  const listContext = useMemo<PluginListContext>(
    () => ({
      installed,
      pending,
      onOpen: openPlugin,
      onInstall: (entry) => void requestInstall(entry),
      onMore: openMenu,
    }),
    [installed, openMenu, openPlugin, pending, requestInstall],
  );

  const scrollToAllPlugins = useCallback(() => {
    setScrollPending(false);
    scrollRef.current?.scrollTo({ y: allPluginsOffset.current, animated: true });
  }, []);

  const showAllPlugins = useCallback(() => {
    if (sort === 'installs') {
      scrollToAllPlugins();
      return;
    }
    setLoading(true);
    setScrollPending(true);
    setSort('installs');
  }, [scrollToAllPlugins, sort]);

  useEffect(() => {
    if (!scrollPending || loading) return;
    const frame = requestAnimationFrame(scrollToAllPlugins);
    return () => cancelAnimationFrame(frame);
  }, [loading, scrollPending, scrollToAllPlugins]);

  const showShelfCategory = useCallback(
    (option: PluginCategoryOption) => {
      const chip = pluginCategories(entries, byCategory).find(
        (candidate) => candidate.key === option.key,
      );
      setLoading(true);
      setScrollPending(true);
      setCategory(chip?.value ?? option.value);
    },
    [byCategory, entries],
  );

  const openSectionMenu = useCallback(
    () =>
      showActionMenu({
        title: 'Customize',
        dismissLabel: 'Cancel',
        actions: [
          ...customizeDestinations(FEATURES).map((destination) => ({
            key: destination.key,
            label: destination.title,
            selected: destination.key === 'plugins',
            run: () => {
              if (destination.key !== 'plugins') {
                router.replace(destination.route as Parameters<typeof router.replace>[0]);
              }
            },
          })),
          {
            key: 'sources',
            label: 'Sources',
            run: () => router.push('/(app)/plugins/sources' as Parameters<typeof router.push>[0]),
          },
        ],
      }),
    [router],
  );

  const popular = useMemo(() => popularPlugins(entries), [entries]);
  const recommended = useMemo(
    () =>
      recommendedPlugins(entries, installed, connected, new Set(popular.map((entry) => entry.id))),
    [connected, entries, installed, popular],
  );
  const knownEntries = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry] as const)),
    [entries],
  );
  const installedPlan = useMemo(
    () => installedTilePlan(filtering ? [] : [...installed.values()]),
    [filtering, installed],
  );
  const installedIds = useMemo(
    () => installedPlan.tiles.map((installation) => installation.pluginId),
    [installedPlan],
  );
  const { details: installedDetails } = useInstalledPluginDetails(
    installedIds,
    knownEntries,
    reload,
  );
  const installedTiles = useMemo(
    () =>
      installedIds.map((id) => {
        const detail = installedDetails.get(id);
        return { id, name: detail?.status === 'loaded' ? detail.entry.name : id };
      }),
    [installedDetails, installedIds],
  );
  const openAdded = useCallback(
    () => router.push(ADDED_PLUGINS_ROUTE as Parameters<typeof router.push>[0]),
    [router],
  );
  const openInstalledPlugin = useCallback(
    (id: string) => router.push({ pathname: '/(app)/plugins/[id]' as const, params: { id } }),
    [router],
  );
  const categories = useMemo(() => pluginCategories(entries, byCategory), [byCategory, entries]);
  const updateNames = useMemo(
    () =>
      updates
        .map(
          (offer) => entries.find((entry) => entry.id === offer.pluginId)?.name ?? offer.pluginId,
        )
        .join(', '),
    [entries, updates],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Plugins"
        feature="Plugins"
        description="Plugins live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const renderRows = (list: PluginDirectoryEntryWire[]) => (
    <PluginGroup entries={list} context={listContext} />
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Plugins" onBack={goBack} onTitlePress={openSectionMenu} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: SCREEN_GUTTER,
          paddingBottom: searchSpace + SEARCH_BAR_CLEARANCE,
          gap: 10,
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading && entries.length > 0}
            onRefresh={() => setReload((value) => value + 1)}
            tintColor={colors.textPrimary}
          />
        }
      >
        <ApprovalPolicySummary
          label="Permissions"
          helper={`Choose when ${PRODUCT_BRAND} asks before a plugin acts.`}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={CHIP_ROW_STYLE}
          contentContainerStyle={CHIP_ROW_CONTENT_STYLE}
        >
          {SOURCE_FILTERS.map((filter) => (
            <Chip
              key={filter.label}
              label={filter.label}
              selected={source === filter.id}
              onPress={() => setSource(filter.id)}
            />
          ))}
          {SORTS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              accessibilityLabel={`Sort by ${option.label.toLowerCase()}`}
              selected={sort === option.id}
              onPress={() => setSort(option.id)}
            />
          ))}
        </ScrollView>
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={CHIP_ROW_STYLE}
            contentContainerStyle={CHIP_ROW_CONTENT_STYLE}
          >
            <Chip
              label="Every category"
              selected={category === null}
              onPress={() => setCategory(null)}
            />
            {categories.map((option) => {
              const selected = category !== null && pluginCategoryKey(category) === option.key;
              return (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={selected}
                  onPress={() => setCategory(selected ? null : option.value)}
                />
              );
            })}
          </ScrollView>
        ) : null}
        {error ? (
          <ErrorBanner message={error} onRetry={() => setReload((value) => value + 1)} />
        ) : null}
        {installedTiles.length > 0 ? (
          <>
            <SectionTitle
              title="Installed"
              hint="Shows every plugin you added"
              onPress={openAdded}
            />
            <InstalledPluginTiles
              tiles={installedTiles}
              overflow={installedPlan.overflow}
              onOpen={openInstalledPlugin}
              onShowAll={openAdded}
            />
          </>
        ) : null}
        {loading && entries.length === 0 ? (
          <LoadingRows />
        ) : entries.length === 0 ? (
          <EmptyState
            Icon={Blocks}
            title={filtering ? 'No matching plugins' : 'No plugins yet'}
            body={
              filtering
                ? 'Try a different name, category or source.'
                : 'Plugins added to this AGI Cloud deployment appear here.'
            }
          />
        ) : (
          <>
            {!filtering && updates.length > 0 ? (
              <>
                <SectionTitle title="Updates available" note={updateNames} />
                {renderRows(
                  entries.filter((entry) => updates.some((offer) => offer.pluginId === entry.id)),
                )}
              </>
            ) : null}
            {!filtering && popular.length > 0 ? (
              <>
                <SectionTitle
                  title="Popular"
                  note="Verified plugins people install most"
                  hint="Shows every plugin, most installed first"
                  onPress={showAllPlugins}
                />
                {renderRows(popular)}
              </>
            ) : null}
            {!filtering && recommended.length > 0 ? (
              <>
                <SectionTitle
                  title="Recommended for you"
                  note="They use connectors you already connected"
                />
                {renderRows(recommended)}
              </>
            ) : null}
            {!filtering
              ? shelfOptions.map((option) => {
                  const rows = shelves.get(option.key);
                  if (!rows) return null;
                  return (
                    <Fragment key={option.key}>
                      <SectionTitle
                        title={option.label}
                        hint={`Shows every plugin in ${option.label}`}
                        onPress={() => showShelfCategory(option)}
                      />
                      {renderRows(rows)}
                    </Fragment>
                  );
                })
              : null}
            <SectionTitle
              title={filtering ? 'Results' : 'All plugins'}
              onLayout={(event) => {
                allPluginsOffset.current = event.nativeEvent.layout.y;
                if (scrollPending && !loading) scrollToAllPlugins();
              }}
            />
            {renderRows(entries)}
            {nextCursor ? (
              <Button
                title="Show more"
                variant="outline"
                loading={loadingMore}
                onPress={() => void loadMore()}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <BottomSearchBar
          testID="plugins-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search plugins"
          accessibilityLabel="Search plugins"
          clearAccessibilityLabel="Clear plugin search"
        />
      </View>
    </SafeAreaView>
  );
}
