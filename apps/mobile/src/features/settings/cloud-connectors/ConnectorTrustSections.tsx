import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  CONNECTOR_CONSENT_POINTS,
  CONNECTOR_HEALTH_EXPLANATION,
  CONNECTOR_HEALTH_STATE_LABELS,
  connectorHealthCircuitSentence,
  connectorHealthSummary,
  type ConnectorCallHealth,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { MetaText, SectionCard } from '@/src/shared/components/cloud-screen';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { fetchConnectorHealth } from './connectorHealth';

export function ConnectorHealthCard({ connectorIds }: { connectorIds: readonly string[] }) {
  const colors = useThemeColors();
  const [entry, setEntry] = useState<ConnectorCallHealth | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const key = connectorIds.join('|');

  const check = useCallback(
    async (signal?: AbortSignal) => {
      setChecking(true);
      setError(null);
      try {
        const next = await fetchConnectorHealth(key.split('|'), signal);
        if (!signal?.aborted) setEntry(next);
      } catch {
        if (!signal?.aborted) setError('Connector health could not be read.');
      } finally {
        if (!signal?.aborted) setChecking(false);
      }
    },
    [key],
  );

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  const circuit = entry ? connectorHealthCircuitSentence(entry) : null;

  return (
    <SectionCard title="Connection health" description={CONNECTOR_HEALTH_EXPLANATION}>
      {entry === undefined && !error ? <MetaText>Checking…</MetaText> : null}
      {error ? <MetaText>{error}</MetaText> : null}
      {entry === null ? (
        <MetaText>Not called in the last hour, so there is nothing to measure yet.</MetaText>
      ) : null}
      {entry ? (
        <View style={{ gap: 4 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            {CONNECTOR_HEALTH_STATE_LABELS[entry.state]}
          </Text>
          <MetaText>{connectorHealthSummary(entry)}</MetaText>
          {circuit ? <MetaText>{circuit}</MetaText> : null}
        </View>
      ) : null}
      <Button
        title="Check again"
        size="sm"
        variant="outline"
        loading={checking}
        disabled={checking}
        onPress={() => void check()}
      />
    </SectionCard>
  );
}

export function ConnectorConsentNotes() {
  const colors = useThemeColors();
  return (
    <SectionCard title="Before you connect">
      {CONNECTOR_CONSENT_POINTS.map((point) => (
        <View key={point.title} style={{ gap: 2 }}>
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            {point.title}
          </Text>
          <MetaText>{point.body}</MetaText>
        </View>
      ))}
    </SectionCard>
  );
}
