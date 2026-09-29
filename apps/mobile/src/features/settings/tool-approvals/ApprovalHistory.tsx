import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MANAGED_CLOUD_APPROVAL_HISTORY_PATH } from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_ACTION_LABELS, getToolDisplayLabel } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { api } from '@/services/api';
import { SettingsGroup } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const HISTORY_LIMIT = 50;

interface ApprovalHistoryEntry {
  id: string;
  toolName: string;
  decision: 'approved' | 'rejected';
  conversationId: string | null;
  createdAt: string;
}

type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; approvals: ApprovalHistoryEntry[] };

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

export function ApprovalHistory() {
  const colors = useThemeColors();
  const router = useRouter();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await api.get<{ approvals?: ApprovalHistoryEntry[] }>(
        `${MANAGED_CLOUD_APPROVAL_HISTORY_PATH}?limit=${HISTORY_LIMIT}`,
      );
      setState({ status: 'ready', approvals: data?.approvals ?? [] });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          fontWeight: '600',
          marginBottom: 8,
        }}
      >
        Approval history
      </Text>
      {state.status === 'loading' ? (
        <View accessibilityLabel="Loading approval history" style={{ paddingVertical: 16 }}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : state.status === 'error' ? (
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel="Approval history could not load. Try again"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            Approval history could not load. Tap to try again.
          </Text>
        </Pressable>
      ) : state.approvals.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
          No tool approvals yet.
        </Text>
      ) : (
        <SettingsGroup>
          {state.approvals.map((entry, index) => {
            const verdict =
              entry.decision === 'approved'
                ? TOOL_APPROVAL_ACTION_LABELS.allowed
                : TOOL_APPROVAL_ACTION_LABELS.denied;
            const tool = getToolDisplayLabel(entry.toolName).displayName;
            const when = formatTimestamp(entry.createdAt);
            const conversationId = entry.conversationId;
            return (
              <Pressable
                key={entry.id}
                disabled={!conversationId}
                onPress={
                  conversationId
                    ? () =>
                        router.push({
                          pathname: '/(app)/chat/[id]' as const,
                          params: { id: conversationId },
                        })
                    : undefined
                }
                accessibilityRole={conversationId ? 'button' : 'text'}
                accessibilityLabel={`${verdict} ${tool}, ${when}`}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderBottomWidth: index === state.approvals.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontSize: typeScale.body }}
                >
                  <Text style={{ fontWeight: '600' }}>{verdict}</Text> {tool}
                </Text>
                <Text
                  style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}
                >
                  {when}
                </Text>
              </Pressable>
            );
          })}
        </SettingsGroup>
      )}
    </View>
  );
}
