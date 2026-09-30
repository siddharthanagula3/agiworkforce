import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ConnectorCallEntry, ConnectorCallOutcome } from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { fetchConnectorCalls } from '@/services/connectors';
import { typeScale } from '@/src/ui/theme/tokens';

const OUTCOME_LABEL: Record<ConnectorCallOutcome, string> = {
  succeeded: 'Worked',
  failed: 'Failed',
  blocked: 'Blocked here',
};

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  return durationMs < 1000 ? `${Math.round(durationMs)} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

function formatOccurredAt(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ConnectorCallLog({ connectorId }: { connectorId: string }) {
  const colors = useThemeColors();
  const [calls, setCalls] = useState<ConnectorCallEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const outcomeColor: Record<ConnectorCallOutcome, string> = {
    succeeded: colors.agentSuccess,
    failed: colors.agentError,
    blocked: colors.agentWarning,
  };

  useEffect(() => {
    let active = true;
    setFailed(false);
    fetchConnectorCalls(connectorId)
      .then((entries) => {
        if (active) setCalls(entries);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, connectorId]);

  return (
    <View style={{ marginBottom: 18, gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '700' }}>
        Recent calls
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption, lineHeight: 18 }}>
        What this connector was asked to do and whether it answered. Arguments and results are never
        recorded.
      </Text>
      {failed ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
            The call log could not be read.
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading recent calls"
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.footnote, fontWeight: '600' }}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : calls === null ? (
        <View
          accessibilityLabel="Reading the call log"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <ActivityIndicator size="small" color={colors.teal} />
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            Reading the call log
          </Text>
        </View>
      ) : calls.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
          This connector has not been called yet, so there is nothing to show.
        </Text>
      ) : (
        calls.map((call) => {
          const duration = formatDuration(call.durationMs);
          return (
            <View
              key={`${call.occurredAt}-${call.toolName}`}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 2,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
                >
                  {call.toolName}
                </Text>
                <Text
                  style={{
                    color: outcomeColor[call.outcome],
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                  }}
                >
                  {OUTCOME_LABEL[call.outcome]}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                {duration ? `${duration} · ` : ''}
                {formatOccurredAt(call.occurredAt)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}
