import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  agentSelectionIncludes,
  toggleAgentSelection,
  type ManagedCloudAgent,
} from '@agiworkforce/cloud-contracts';
import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';

import { Text } from '@/components/ui/text';
import { fetchConnectorDirectory } from '@/services/connectors';
import { listAgents } from '@/src/features/agents/service';
import { Chip, MetaText, ToggleRow } from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface Choice {
  id: string;
  name: string;
}

export function ScheduleAccessSection({
  agentId,
  connectors,
  onAgentChange,
  onConnectorsChange,
}: {
  agentId: string | null;
  connectors: string[] | null;
  onAgentChange: (agentId: string | null) => void;
  onConnectorsChange: (connectors: string[] | null) => void;
}) {
  const colors = useThemeColors();
  const [agents, setAgents] = useState<ManagedCloudAgent[]>([]);
  const [connected, setConnected] = useState<Choice[] | null>(null);
  const showConnectors = connectorsReleased();

  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((next) => {
        if (!cancelled) setAgents(next.filter((agent) => agent.status === 'active'));
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    if (showConnectors) {
      fetchConnectorDirectory()
        .then((directory) => {
          if (cancelled) return;
          setConnected(
            directory.connectors
              .map((connection) => ({
                id: connection.toolConnectorId ?? connection.connectorId,
                name: connection.name ?? connection.connectorId,
              }))
              .sort((left, right) => left.name.localeCompare(right.name)),
          );
        })
        .catch(() => {
          if (!cancelled) setConnected([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [showConnectors]);

  const optionIds = (connected ?? []).map((choice) => choice.id);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Agent
        </Text>
        <MetaText>
          Run this schedule as one of your agents, with its instructions and tools.
        </MetaText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="No agent" selected={agentId === null} onPress={() => onAgentChange(null)} />
          {agents.map((agent) => (
            <Chip
              key={agent.id}
              label={agent.name}
              selected={agentId === agent.id}
              onPress={() => onAgentChange(agent.id)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Connectors
        </Text>
        {!showConnectors ? (
          <MetaText>{CONNECTORS_COMING_SOON_MESSAGE}</MetaText>
        ) : (
          <>
            <MetaText>
              A run can use tools only from the connectors turned on here. A tool that needs your
              approval still pauses the run until you approve or deny it.
            </MetaText>
            <ToggleRow
              label="Every connected connector"
              value={connectors === null}
              onValueChange={(all) => onConnectorsChange(all ? null : [])}
            />
            {connected === null ? (
              <MetaText>Loading…</MetaText>
            ) : connected.length === 0 ? (
              <MetaText>No connectors are connected.</MetaText>
            ) : (
              connected.map((choice) => (
                <ToggleRow
                  key={choice.id}
                  label={choice.name}
                  value={agentSelectionIncludes(connectors, choice.id)}
                  onValueChange={(included) =>
                    onConnectorsChange(
                      toggleAgentSelection(connectors, optionIds, choice.id, included),
                    )
                  }
                />
              ))
            )}
          </>
        )}
      </View>
    </View>
  );
}
