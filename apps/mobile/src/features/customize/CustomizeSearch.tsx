import { useCallback, useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Blocks,
  Bot,
  ChevronRight,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import {
  CONNECTOR_DIRECTORY_SEARCH_MAX_LENGTH,
  type ManagedCloudAgent,
  type PluginDirectoryEntryWire,
} from '@agiworkforce/cloud-contracts';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  browseConnectorListings,
  fetchConnectorDirectory,
  type ConnectedConnector,
  type ConnectorListing,
} from '@/services/connectors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { listAgents } from '@/src/features/agents/service';
import { fetchPluginDirectory } from '@/src/features/plugins/service';
import { fetchSkillCatalog, type ManagedSkillSummary } from '@/src/features/skills/service';
import { ConnectorLogo } from '@/src/features/settings/cloud-connectors/ConnectorLogo';
import { useCapability } from '@/src/lib/Capabilities';
import { ErrorBanner, LoadingRows, MetaText } from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

import {
  agentSearchRows,
  connectorSearchRows,
  CUSTOMIZE_SEARCH_GROUP_ORDER,
  CUSTOMIZE_SEARCH_GROUP_ROWS,
  CUSTOMIZE_SEARCH_GROUP_TITLES,
  CUSTOMIZE_SEARCH_LOCAL_NOTE,
  CUSTOMIZE_SEARCH_PLUGIN_LIMIT,
  customizeSearchTerm,
  destinationSearchRows,
  pluginSearchRows,
  skillSearchRows,
  type CustomizeSearchDestination,
  type CustomizeSearchGroupKey,
  type CustomizeSearchRow,
} from './customizeSearchModel';

const TAP_SIZE = 44;
const ICON_SIZE = 40;
const SEARCH_LABEL = 'Search Customize';
const LOAD_FAILED = 'Could not load all results';

type RouterPush = ReturnType<typeof useRouter>['push'];

const GROUP_ICONS: Record<Exclude<CustomizeSearchGroupKey, 'connectors'>, LucideIcon> = {
  skills: Sparkles,
  agents: Bot,
  plugins: Blocks,
};

function routeFor(row: CustomizeSearchRow): Parameters<RouterPush>[0] {
  switch (row.group) {
    case 'skills':
      return {
        pathname: '/(app)/skills/[name]',
        params: { name: row.routeId },
      } as unknown as Parameters<RouterPush>[0];
    case 'connectors':
      return {
        pathname: '/(app)/connectors/[id]',
        params: { id: row.routeId },
      } as unknown as Parameters<RouterPush>[0];
    case 'agents':
      return {
        pathname: '/(app)/agents/[id]',
        params: { id: row.routeId },
      } as unknown as Parameters<RouterPush>[0];
    case 'plugins':
      return {
        pathname: '/(app)/plugins/[id]',
        params: { id: row.routeId },
      } as unknown as Parameters<RouterPush>[0];
  }
}

export function CustomizeSearchButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SEARCH_LABEL}
      style={{
        width: TAP_SIZE,
        height: TAP_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Search size={21} color={colors.textPrimary} />
    </PressableBox>
  );
}

export function CustomizeSearchBar({
  value,
  onChangeText,
  onCancel,
  localOnly,
}: {
  value: string;
  onChangeText: (next: string) => void;
  onCancel: () => void;
  localOnly: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flex: 1,
            minHeight: TAP_SIZE,
            borderRadius: 14,
            borderCurve: 'continuous',
            paddingLeft: 13,
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
            value={value}
            onChangeText={onChangeText}
            autoFocus
            maxFontSizeMultiplier={2}
            maxLength={CONNECTOR_DIRECTORY_SEARCH_MAX_LENGTH}
            placeholder={SEARCH_LABEL}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={SEARCH_LABEL}
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
          {value.length > 0 ? (
            <PressableBox
              onPress={() => onChangeText('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={{
                width: TAP_SIZE,
                height: TAP_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={colors.textMuted} />
            </PressableBox>
          ) : (
            <View style={{ width: 13 }} />
          )}
        </View>
        <PressableBox
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
          style={{ minHeight: TAP_SIZE, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>Cancel</Text>
        </PressableBox>
      </View>
      {localOnly ? <MetaText>{CUSTOMIZE_SEARCH_LOCAL_NOTE}</MetaText> : null}
    </View>
  );
}

function ResultIcon({ row }: { row: CustomizeSearchRow }) {
  const colors = useThemeColors();
  if (row.group === 'connectors') return <ConnectorLogo size={ICON_SIZE} />;
  const Icon = GROUP_ICONS[row.group];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: ICON_SIZE / 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSurface,
      }}
    >
      <Icon size={ICON_SIZE / 2} color={colors.textPrimary} />
    </View>
  );
}

function ResultRow({ row, onOpen }: { row: CustomizeSearchRow; onOpen: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={row.description ? `${row.title}. ${row.description}` : row.title}
      accessibilityHint="Opens details"
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <ResultIcon row={row} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {row.title}
        </Text>
        {row.description ? (
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}
          >
            {row.description}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </PressableBox>
  );
}

function GroupHeading({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ minHeight: TAP_SIZE, justifyContent: 'center' }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
      >
        {title}
      </Text>
    </View>
  );
}

function NoResults({ term, onClear }: { term: string; onClear: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
      <Text
        accessibilityRole="header"
        numberOfLines={3}
        style={{
          color: colors.textPrimary,
          fontSize: typeScale.callout,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {`Nothing matches "${term}"`}
      </Text>
      <Button title="Clear" variant="outline" onPress={onClear} />
    </View>
  );
}

type Loader<T> = (signal: AbortSignal) => Promise<T>;

interface SourceState<T> {
  load: Loader<T>;
  attempt: number;
  status: 'ready' | 'failed';
  data: T | null;
}

type SourceStatus = 'idle' | 'loading' | 'ready' | 'failed';

function useSearchSource<T>(
  load: Loader<T> | null,
  attempt: number,
): { status: SourceStatus; data: T | null } {
  const [state, setState] = useState<SourceState<T> | null>(null);

  useEffect(() => {
    if (!load) return;
    const account = captureCloudAccountEpoch();
    if (!account) {
      setState({ load, attempt, status: 'failed', data: null });
      return;
    }
    const controller = new AbortController();
    const settle = (next: Pick<SourceState<T>, 'status' | 'data'>) => {
      if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
      setState({ load, attempt, ...next });
    };
    load(controller.signal)
      .then((data) => settle({ status: 'ready', data }))
      .catch(() => settle({ status: 'failed', data: null }));
    return () => controller.abort();
  }, [load, attempt]);

  if (!load) return { status: 'idle', data: null };
  if (state && state.load === load && state.attempt === attempt) return state;
  return { status: 'loading', data: null };
}

function useDebouncedTerm(term: string): string {
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), SEARCH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);
  return debounced;
}

interface ConnectorSearchData {
  listings: ConnectorListing[];
  connections: ConnectedConnector[];
}

function ResultGroups({
  rows,
  onOpen,
}: {
  rows: Record<CustomizeSearchGroupKey, CustomizeSearchRow[]>;
  onOpen: (row: CustomizeSearchRow) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<CustomizeSearchGroupKey>>(new Set());
  const colors = useThemeColors();
  return (
    <>
      {CUSTOMIZE_SEARCH_GROUP_ORDER.map((group) => {
        const groupRows = rows[group];
        if (groupRows.length === 0) return null;
        const title = CUSTOMIZE_SEARCH_GROUP_TITLES[group];
        const showAll = expanded.has(group);
        const visible = showAll ? groupRows : groupRows.slice(0, CUSTOMIZE_SEARCH_GROUP_ROWS);
        return (
          <View key={group}>
            <GroupHeading title={title} />
            {visible.map((row) => (
              <ResultRow key={row.key} row={row} onOpen={() => onOpen(row)} />
            ))}
            {visible.length < groupRows.length ? (
              <PressableBox
                onPress={() => setExpanded((current) => new Set(current).add(group))}
                accessibilityRole="button"
                accessibilityLabel={`Show all ${groupRows.length} ${title.toLowerCase()}`}
                style={{ minHeight: TAP_SIZE, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
                  {`Show all ${groupRows.length}`}
                </Text>
              </PressableBox>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function CloudResults({ query, onClear }: { query: string; onClear: () => void }) {
  const router = useRouter();
  const term = customizeSearchTerm(query);
  const debounced = useDebouncedTerm(term);
  const connectorsAllowed = useCapability('canUseConnectors');
  const connectorsOn = FEATURES.connectors && connectorsAllowed;
  const [attempt, setAttempt] = useState(0);

  const loadConnectors = useMemo<Loader<ConnectorSearchData> | null>(() => {
    if (!debounced || !connectorsOn) return null;
    return async () => {
      const [page, directory] = await Promise.all([
        browseConnectorListings({ search: debounced }),
        fetchConnectorDirectory(),
      ]);
      return { listings: page.entries, connections: directory.connectors };
    };
  }, [connectorsOn, debounced]);

  const loadPlugins = useMemo<Loader<PluginDirectoryEntryWire[]> | null>(() => {
    if (!debounced) return null;
    return async (signal) =>
      (
        await fetchPluginDirectory(
          { search: debounced, limit: CUSTOMIZE_SEARCH_PLUGIN_LIMIT },
          signal,
        )
      ).entries;
  }, [debounced]);

  const skills = useSearchSource<ManagedSkillSummary[]>(
    FEATURES.skills ? fetchSkillCatalog : null,
    attempt,
  );
  const agents = useSearchSource<ManagedCloudAgent[]>(listAgents, attempt);
  const connectors = useSearchSource(loadConnectors, attempt);
  const plugins = useSearchSource(loadPlugins, attempt);

  const sources = [skills, agents, connectors, plugins];
  const loading = term !== debounced || sources.some((source) => source.status === 'loading');
  const failed = sources.some((source) => source.status === 'failed');

  const settled = term === debounced;
  const rows = useMemo(
    () => ({
      skills: skillSearchRows(skills.data ?? [], term),
      connectors: connectors.data
        ? connectorSearchRows({
            listings: settled ? connectors.data.listings : [],
            connections: connectors.data.connections,
            term,
            bankLinking: FEATURES.bankLinking,
          })
        : [],
      agents: agentSearchRows(agents.data ?? [], term),
      plugins: pluginSearchRows(settled ? (plugins.data ?? []) : []),
    }),
    [agents.data, connectors.data, plugins.data, settled, skills.data, term],
  );
  const total = CUSTOMIZE_SEARCH_GROUP_ORDER.reduce((sum, group) => sum + rows[group].length, 0);

  const open = useCallback((row: CustomizeSearchRow) => router.push(routeFor(row)), [router]);

  if (!term) return null;

  return (
    <View style={{ gap: 6 }}>
      {failed && !loading ? (
        <ErrorBanner message={LOAD_FAILED} onRetry={() => setAttempt((current) => current + 1)} />
      ) : null}
      <ResultGroups rows={rows} onOpen={open} />
      {loading && total === 0 ? <LoadingRows count={3} /> : null}
      {!loading && !failed && total === 0 ? <NoResults term={term} onClear={onClear} /> : null}
    </View>
  );
}

function LocalResults({
  query,
  destinations,
  onClear,
}: {
  query: string;
  destinations: readonly CustomizeSearchDestination[];
  onClear: () => void;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const term = customizeSearchTerm(query);
  if (!term) return null;
  const matched = destinationSearchRows(destinations, term);
  if (matched.length === 0) return <NoResults term={term} onClear={onClear} />;
  return (
    <View>
      {matched.map(({ key, title, body, route, Icon }) => (
        <PressableBox
          key={key}
          onPress={() => router.push(route as Parameters<RouterPush>[0])}
          accessibilityRole="link"
          accessibilityLabel={title}
          accessibilityHint={body}
          style={({ pressed }) => ({
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon size={20} color={colors.textPrimary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              {title}
            </Text>
            <MetaText>{body}</MetaText>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </PressableBox>
      ))}
    </View>
  );
}

export function CustomizeSearchResults({
  query,
  destinations,
  onClear,
}: {
  query: string;
  destinations: readonly CustomizeSearchDestination[];
  onClear: () => void;
}) {
  const access = useCloudFeatureAccess();
  if (!access.ready) {
    return <LocalResults query={query} destinations={destinations} onClear={onClear} />;
  }
  return <CloudResults key={access.ownerId} query={query} onClear={onClear} />;
}
