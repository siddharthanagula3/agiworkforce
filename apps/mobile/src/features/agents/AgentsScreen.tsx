import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Bot, MoreHorizontal } from 'lucide-react-native';
import {
  AGENT_CATALOG,
  AGENT_CATALOG_GROUP_TITLE,
  agentCanChat,
  agentStateLabel,
  type AgentCatalogEntry,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  ScreenHeader,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';
import {
  hiddenSharerIds,
  withoutHiddenAgentSharers,
} from '@/src/features/shared-with-you/hiddenSharers';
import {
  confirmHideSharer,
  sharedReportTarget,
} from '@/src/features/shared-with-you/SharedItemSafetyActions';
import { useThemeColors } from '@/src/ui/theme';
import { HEADER_TEXT_SCALE_LIMIT, typeScale } from '@/src/ui/theme/tokens';
import { AgentAvatar } from './components/AgentAvatar';
import {
  agentActionError,
  importAgentMarkdown,
  listAgents,
  startAgentConversation,
  startCatalogAgentConversation,
} from './service';
import { contentColumn } from '@/src/shared/layout/contentColumn';

export const AGENTS_ROUTE = '/(app)/agents';
export const NEW_AGENT_ID = 'new';

export interface AgentSection {
  title: string;
  data: ManagedCloudAgent[];
}

export type AgentListItem =
  { kind: 'agent'; agent: ManagedCloudAgent } | { kind: 'catalog'; entry: AgentCatalogEntry };

export interface AgentListSection {
  title: string;
  data: AgentListItem[];
}

export type AgentsSegment = 'all' | 'yours' | 'by-agi' | 'shared';

const SEGMENT_LABELS: Record<AgentsSegment, string> = {
  all: 'All',
  yours: 'Yours',
  'by-agi': AGENT_CATALOG_GROUP_TITLE,
  shared: 'Shared',
};

const SEGMENT_SECTION_TITLES: Record<Exclude<AgentsSegment, 'all'>, string> = {
  yours: 'Your agents',
  'by-agi': AGENT_CATALOG_GROUP_TITLE,
  shared: 'Shared with you',
};

let rememberedSegment: AgentsSegment = 'all';

export function __resetAgentsSegmentForTests() {
  rememberedSegment = 'all';
}

export function groupAgents(agents: readonly ManagedCloudAgent[]): AgentSection[] {
  const byName = (left: ManagedCloudAgent, right: ManagedCloudAgent) =>
    left.name.localeCompare(right.name);
  const owned = agents.filter((agent) => agent.isOwner && agent.status !== 'retired').sort(byName);
  const shared = agents
    .filter((agent) => !agent.isOwner && agent.status !== 'retired')
    .sort(byName);
  const retired = agents.filter((agent) => agent.status === 'retired').sort(byName);
  return [
    { title: 'Your agents', data: owned },
    { title: 'Shared with you', data: shared },
    { title: 'Retired', data: retired },
  ].filter((section) => section.data.length > 0);
}

export function agentsSegments(agents: readonly ManagedCloudAgent[]): AgentsSegment[] {
  const hasShared = groupAgents(agents).some(
    (section) => section.title === SEGMENT_SECTION_TITLES.shared,
  );
  return ['all', 'yours', 'by-agi', ...(hasShared ? (['shared'] as const) : [])];
}

export function agentListSections(
  agents: readonly ManagedCloudAgent[],
  segment: AgentsSegment,
): AgentListSection[] {
  const sections: AgentListSection[] = groupAgents(agents).map((section) => ({
    title: section.title,
    data: section.data.map((agent) => ({ kind: 'agent' as const, agent })),
  }));
  const catalog: AgentListSection = {
    title: AGENT_CATALOG_GROUP_TITLE,
    data: AGENT_CATALOG.map((entry) => ({ kind: 'catalog' as const, entry })),
  };
  const yoursAt = sections.findIndex((section) => section.title === SEGMENT_SECTION_TITLES.yours);
  sections.splice(yoursAt + 1, 0, catalog);
  return segment === 'all'
    ? sections
    : sections.filter((section) => section.title === SEGMENT_SECTION_TITLES[segment]);
}

function SegmentBar({
  segments,
  selected,
  onSelect,
}: {
  segments: readonly AgentsSegment[];
  selected: AgentsSegment;
  onSelect: (segment: AgentsSegment) => void;
}) {
  const colors = useThemeColors();
  return (
    <View testID="agents.segments.column" style={contentColumn('reading')}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginTop: 4,
          marginBottom: 4,
          borderRadius: 10,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 3,
        }}
      >
        {segments.map((segment) => {
          const isSelected = selected === segment;
          return (
            <PressableBox
              key={segment}
              onPress={() => onSelect(segment)}
              accessibilityRole="tab"
              accessibilityLabel={SEGMENT_LABELS[segment]}
              accessibilityState={{ selected: isSelected }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={{
                flex: 1,
                minHeight: 36,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 8,
                backgroundColor: isSelected ? colors.surfaceOverlay : colors.transparent,
              }}
            >
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                style={{
                  fontSize: typeScale.footnote,
                  fontWeight: isSelected ? '600' : '500',
                  color: isSelected ? colors.textPrimary : colors.textMuted,
                }}
              >
                {SEGMENT_LABELS[segment]}
              </Text>
            </PressableBox>
          );
        })}
      </View>
    </View>
  );
}

function CatalogRow({
  entry,
  starting,
  onChat,
}: {
  entry: AgentCatalogEntry;
  starting: boolean;
  onChat: (entry: AgentCatalogEntry) => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={() => onChat(entry)}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}. ${entry.description}`}
      accessibilityHint="Starts a chat"
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AgentAvatar icon={entry.icon} accentColor={entry.accentColor} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {entry.name}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}
        >
          {entry.description}
        </Text>
      </View>
      <Button
        title="Chat"
        size="sm"
        variant="outline"
        loading={starting}
        accessibilityLabel={`Chat with ${entry.name}`}
        onPress={() => onChat(entry)}
      />
    </PressableBox>
  );
}

function AgentRow({
  agent,
  starting,
  onOpen,
  onChat,
  onMore,
}: {
  agent: ManagedCloudAgent;
  starting: boolean;
  onOpen: (agent: ManagedCloudAgent) => void;
  onChat: (agent: ManagedCloudAgent) => void;
  onMore?: (agent: ManagedCloudAgent) => void;
}) {
  const colors = useThemeColors();
  const state = agentStateLabel(agent);
  return (
    <PressableBox
      onPress={() => onOpen(agent)}
      accessibilityRole="button"
      accessibilityLabel={`${agent.name}. ${state}`}
      accessibilityHint="Opens the agent"
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AgentAvatar icon={agent.icon} accentColor={agent.accentColor} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {agent.name}
        </Text>
        {agent.description ? (
          <Text
            numberOfLines={2}
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}
          >
            {agent.description}
          </Text>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>{state}</Text>
      </View>
      {agentCanChat(agent) ? (
        <Button
          title="Chat"
          size="sm"
          variant="outline"
          loading={starting}
          accessibilityLabel={`Chat with ${agent.name}`}
          onPress={() => onChat(agent)}
        />
      ) : null}
      {onMore ? (
        <PressableBox
          onPress={() => onMore(agent)}
          accessibilityRole="button"
          accessibilityLabel={`Report or hide ${agent.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <MoreHorizontal size={18} color={colors.textSecondary} />
        </PressableBox>
      ) : null}
    </PressableBox>
  );
}

export function AgentsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const access = useCloudFeatureAccess();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  const [agents, setAgents] = useState<ManagedCloudAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [reporting, setReporting] = useState<ManagedCloudAgent | null>(null);
  const [hiddenSharers, setHiddenSharers] = useState<ReadonlySet<string>>(new Set());
  const [segment, setSegment] = useState<AgentsSegment>(rememberedSegment);

  const load = useCallback(
    async (reason: 'initial' | 'refresh', signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== access.ownerId) return;
      if (reason === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await listAgents(signal);
        if (isCloudAccountEpochCurrent(account)) setAgents(next);
      } catch (loadError) {
        if (signal?.aborted || !isCloudAccountEpochCurrent(account)) return;
        setError(agentActionError(loadError, 'Could not load agents. Check your connection.'));
      } finally {
        if (isCloudAccountEpochCurrent(account)) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [access.ownerId],
  );

  useEffect(() => {
    if (!access.ready) {
      setAgents([]);
      return;
    }
    const controller = new AbortController();
    void load('initial', controller.signal);
    return () => controller.abort();
  }, [access.ready, load]);

  const openAgent = useCallback(
    (agent: ManagedCloudAgent) =>
      router.push({ pathname: '/(app)/agents/[id]' as const, params: { id: agent.id } }),
    [router],
  );

  const chatWithAgent = useCallback(
    async (agent: ManagedCloudAgent) => {
      if (startingId) return;
      setStartingId(agent.id);
      setError(null);
      try {
        const conversationId = await startAgentConversation(agent.id);
        router.push({ pathname: '/(app)/chat/[id]' as const, params: { id: conversationId } });
      } catch (chatError) {
        setError(agentActionError(chatError, `Could not start a chat with ${agent.name}.`));
      } finally {
        setStartingId(null);
      }
    },
    [router, startingId],
  );

  const chatWithCatalogAgent = useCallback(
    async (entry: AgentCatalogEntry) => {
      if (startingId) return;
      const account = captureCloudAccountEpoch();
      setStartingId(`catalog:${entry.id}`);
      setError(null);
      try {
        const started = await startCatalogAgentConversation(entry);
        if (!isCloudAccountEpochCurrent(account)) return;
        setAgents((current) => [
          started.agent,
          ...current.filter((agent) => agent.id !== started.agent.id),
        ]);
        router.push({
          pathname: '/(app)/chat/[id]' as const,
          params: { id: started.conversationId },
        });
      } catch (chatError) {
        if (isCloudAccountEpochCurrent(account)) {
          setError(agentActionError(chatError, `Could not start ${entry.name}.`));
        }
      } finally {
        setStartingId(null);
      }
    },
    [router, startingId],
  );

  const importAgent = useCallback(async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/markdown', 'text/plain', 'text/x-markdown'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setImporting(true);
    try {
      const markdown = await readAsStringAsync(asset.uri);
      const created = await importAgentMarkdown(markdown);
      setAgents((current) => [created, ...current.filter((agent) => agent.id !== created.id)]);
      openAgent(created);
    } catch (importError) {
      setError(agentActionError(importError, 'Could not import that agent file.'));
    } finally {
      setImporting(false);
    }
  }, [openAgent]);

  useEffect(() => {
    setHiddenSharers(access.ownerId ? hiddenSharerIds(access.ownerId) : new Set());
  }, [access.ownerId]);

  const visibleAgents = useMemo(
    () => withoutHiddenAgentSharers(hiddenSharers, agents),
    [agents, hiddenSharers],
  );
  const segments = useMemo(() => agentsSegments(visibleAgents), [visibleAgents]);
  const activeSegment = segments.includes(segment) ? segment : 'all';
  const sections = useMemo(
    () => agentListSections(visibleAgents, activeSegment),
    [visibleAgents, activeSegment],
  );

  const selectSegment = useCallback((next: AgentsSegment) => {
    rememberedSegment = next;
    setSegment(next);
  }, []);

  const chooseSafetyAction = useCallback(
    (agent: ManagedCloudAgent) => {
      const sharerId = agent.ownerUserId;
      const accountId = access.ownerId;
      if (!sharerId || !accountId) return;
      const ownerName = agent.ownerName ?? 'sharer';
      Alert.alert(agent.name, undefined, [
        { text: 'Report', onPress: () => setReporting(agent) },
        {
          text: `Hide ${ownerName}`,
          style: 'destructive',
          onPress: () =>
            void confirmHideSharer(accountId, sharerId, ownerName).then((hidden) => {
              if (hidden) setHiddenSharers(hiddenSharerIds(accountId));
            }),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [access.ownerId],
  );

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Agents"
        feature="Agents"
        description="Agents run in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader
        title="Agents"
        onBack={goBack}
        trailing={
          <Button
            title="New"
            size="sm"
            accessibilityLabel="Create an agent"
            onPress={() =>
              router.push({ pathname: '/(app)/agents/[id]' as const, params: { id: NEW_AGENT_ID } })
            }
          />
        }
      />
      {loading && agents.length === 0 ? (
        <LoadingRows />
      ) : (
        <>
          <SegmentBar segments={segments} selected={activeSegment} onSelect={selectSegment} />
          <SectionList<AgentListItem, AgentListSection>
            sections={sections}
            keyExtractor={(item) =>
              item.kind === 'agent' ? item.agent.id : `catalog:${item.entry.id}`
            }
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{
              ...contentColumn('reading'),
              paddingHorizontal: 16,
              paddingBottom: 40,
              gap: 10,
              flexGrow: 1,
            }}
            ListHeaderComponent={
              <View style={{ gap: 10, paddingBottom: 6 }}>
                {error ? (
                  <ErrorBanner message={error} onRetry={() => void load('refresh')} />
                ) : null}
                <Button
                  title="Import from file"
                  variant="outline"
                  size="sm"
                  loading={importing}
                  accessibilityHint="Creates an agent from an exported Markdown file"
                  onPress={() => void importAgent()}
                />
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text
                accessibilityRole="header"
                style={{
                  paddingTop: 12,
                  color: colors.textSecondary,
                  fontSize: typeScale.caption,
                  fontWeight: '700',
                }}
              >
                {section.title.toUpperCase()}
              </Text>
            )}
            renderItem={({ item }) =>
              item.kind === 'catalog' ? (
                <CatalogRow
                  entry={item.entry}
                  starting={startingId === `catalog:${item.entry.id}`}
                  onChat={(entry) => void chatWithCatalogAgent(entry)}
                />
              ) : (
                <AgentRow
                  agent={item.agent}
                  starting={startingId === item.agent.id}
                  onOpen={openAgent}
                  onChat={(agent) => void chatWithAgent(agent)}
                  onMore={
                    !item.agent.isOwner && item.agent.ownerUserId ? chooseSafetyAction : undefined
                  }
                />
              )
            }
            ListEmptyComponent={
              <EmptyState
                Icon={Bot}
                title="No agents here yet"
                body="Create an agent with its own instructions, files, tools and model, then chat with it or share it."
                action={
                  <Button
                    title="Create an agent"
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/agents/[id]' as const,
                        params: { id: NEW_AGENT_ID },
                      })
                    }
                  />
                }
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load('refresh')}
                tintColor={colors.textPrimary}
              />
            }
          />
        </>
      )}
      {reporting?.ownerUserId ? (
        <ReportSheet
          visible
          onClose={() => setReporting(null)}
          target={sharedReportTarget(
            { kind: 'agent', id: reporting.id, sharerId: reporting.ownerUserId },
            reporting.name,
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}
