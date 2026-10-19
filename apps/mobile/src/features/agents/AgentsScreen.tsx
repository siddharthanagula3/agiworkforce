import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Bot } from 'lucide-react-native';
import {
  agentCanChat,
  agentStateLabel,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
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
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { AgentAvatar } from './components/AgentAvatar';
import {
  agentActionError,
  importAgentMarkdown,
  listAgents,
  startAgentConversation,
} from './service';

export const AGENTS_ROUTE = '/(app)/agents';
export const NEW_AGENT_ID = 'new';

export interface AgentSection {
  title: string;
  data: ManagedCloudAgent[];
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

function AgentRow({
  agent,
  starting,
  onOpen,
  onChat,
}: {
  agent: ManagedCloudAgent;
  starting: boolean;
  onOpen: (agent: ManagedCloudAgent) => void;
  onChat: (agent: ManagedCloudAgent) => void;
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

  const sections = useMemo(() => groupAgents(agents), [agents]);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Agents"
        feature="Agents"
        description="Build agents with their own instructions, knowledge, tools and sharing. Switching here does not send Local chats or files to the cloud."
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
        <SectionList
          sections={sections}
          keyExtractor={(agent) => agent.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 6 }}>
              {error ? <ErrorBanner message={error} onRetry={() => void load('refresh')} /> : null}
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
          renderItem={({ item }) => (
            <AgentRow
              agent={item}
              starting={startingId === item.id}
              onOpen={openAgent}
              onChat={(agent) => void chatWithAgent(agent)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              Icon={Bot}
              title="No agents yet"
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
      )}
    </SafeAreaView>
  );
}
