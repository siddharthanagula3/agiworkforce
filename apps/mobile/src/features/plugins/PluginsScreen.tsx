import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BadgeCheck, Blocks, Search } from 'lucide-react-native';
import type {
  PluginDirectoryEntryWire,
  PluginDirectorySortKey,
  PluginDirectorySourceFacet,
  PluginUpdateOfferWire,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { fetchConnectorDirectory } from '@/services/connectors';
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
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  featuredPlugins,
  indexInstallations,
  pluginCategories,
  pluginStateLabel,
  recommendedPlugins,
  type PluginInstallIndex,
} from './pluginsModel';
import {
  fetchPluginDirectory,
  fetchPluginInstallations,
  fetchPluginUpdates,
  pluginActionError,
} from './service';

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

function PluginRow({
  entry,
  installed,
  onOpen,
}: {
  entry: PluginDirectoryEntryWire;
  installed: PluginInstallIndex;
  onOpen: (entry: PluginDirectoryEntryWire) => void;
}) {
  const colors = useThemeColors();
  const state = pluginStateLabel(entry, installed.get(entry.id));
  return (
    <PressableBox
      onPress={() => onOpen(entry)}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name} by ${entry.publisher.name}. ${state}`}
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 14,
        flexDirection: 'row',
        gap: 12,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
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
            numberOfLines={1}
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
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ paddingTop: 14, gap: 2 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textSecondary, fontSize: typeScale.caption, fontWeight: '700' }}
      >
        {title.toUpperCase()}
      </Text>
      {note ? <MetaText>{note}</MetaText> : null}
    </View>
  );
}

export function PluginsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
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
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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
            if (!isCloudAccountEpochCurrent(account)) return;
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
            if (isCloudAccountEpochCurrent(account)) setLoading(false);
          });
      },
      query.search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [access.ready, query, reload]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPluginDirectory({ ...query, cursor: nextCursor });
      setEntries((current) => [...current, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch (moreError) {
      setError(pluginActionError(moreError, 'Could not load more plugins.'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, query]);

  const openPlugin = useCallback(
    (entry: PluginDirectoryEntryWire) =>
      router.push({ pathname: '/(app)/plugins/[id]' as const, params: { id: entry.id } }),
    [router],
  );

  const featured = useMemo(() => featuredPlugins(entries, installed), [entries, installed]);
  const recommended = useMemo(
    () =>
      recommendedPlugins(entries, installed, connected, new Set(featured.map((entry) => entry.id))),
    [connected, entries, featured, installed],
  );
  const installedEntries = useMemo(
    () => entries.filter((entry) => installed.has(entry.id)),
    [entries, installed],
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
        description="Plugins bundle skills, connectors and agents you can add to AGI Cloud. Switching here does not send Local chats or files to the cloud."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  const renderRows = (list: PluginDirectoryEntryWire[]) =>
    list.map((entry) => (
      <PluginRow key={entry.id} entry={entry} installed={installed} onOpen={openPlugin} />
    ));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title="Plugins"
        onBack={goBack}
        trailing={
          <Button
            title="Sources"
            size="sm"
            variant="outline"
            accessibilityLabel="Workspace plugins, marketplaces and submissions"
            onPress={() =>
              router.push('/(app)/plugins/sources' as Parameters<typeof router.push>[0])
            }
          />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={loading && entries.length > 0}
            onRefresh={() => setReload((value) => value + 1)}
            tintColor={colors.textPrimary}
          />
        }
      >
        <View
          style={{
            height: 44,
            borderRadius: 14,
            paddingHorizontal: 13,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            backgroundColor: colors.inputSurface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search plugins"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search plugins"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.body,
              paddingVertical: 0,
            }}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
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
          </View>
        </ScrollView>
        {categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip
                label="Every category"
                selected={category === null}
                onPress={() => setCategory(null)}
              />
              {categories.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={category === name}
                  onPress={() => setCategory(category === name ? null : name)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {error ? (
          <ErrorBanner message={error} onRetry={() => setReload((value) => value + 1)} />
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
            {!filtering && featured.length > 0 ? (
              <>
                <SectionTitle title="Featured" note="Verified plugins people install most" />
                {renderRows(featured)}
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
            {!filtering && installedEntries.length > 0 ? (
              <>
                <SectionTitle title="Installed" />
                {renderRows(installedEntries)}
              </>
            ) : null}
            <SectionTitle title={filtering ? 'Results' : 'All plugins'} />
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
    </SafeAreaView>
  );
}
