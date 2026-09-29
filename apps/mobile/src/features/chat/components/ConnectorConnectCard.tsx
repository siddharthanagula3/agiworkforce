import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plug } from 'lucide-react-native';
import type { ConnectorConnectRequest } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

function headlineFor(request: ConnectorConnectRequest): string {
  if (request.connectUrl === null) return `${request.connectorName} can’t be connected here`;
  switch (request.reason) {
    case 'not_connected':
      return `Connect ${request.connectorName}`;
    case 'insufficient_scope':
      return `${request.connectorName} needs more permission`;
    default:
      return `Reconnect ${request.connectorName}`;
  }
}

function explanationFor(request: ConnectorConnectRequest): string {
  if (request.connectUrl === null) {
    return `This needs your authorization, but no ${request.connectorName} authorization app is configured, so there is nothing to connect to yet.`;
  }
  switch (request.reason) {
    case 'not_connected':
      return `This needs access to your ${request.connectorName} account, which isn’t connected yet.`;
    case 'authorization_expired':
      return `Your ${request.connectorName} authorization expired or was revoked, so the request couldn’t run.`;
    case 'insufficient_scope':
      return `Your ${request.connectorName} authorization doesn’t cover what was asked for.`;
    case 'authorization_unavailable':
      return `${request.connectorName} rejected the stored authorization for this account, so the request couldn’t run.`;
  }
}

export function ConnectorConnectCard({
  request,
  onRetryTurn,
}: {
  request: ConnectorConnectRequest;
  onRetryTurn?: () => void;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const connectable = request.connectUrl !== null;
  const buttonStyle = {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center' as const,
  };
  return (
    <View
      style={{
        marginTop: 8,
        padding: 12,
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.neutralSurface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Plug size={16} color={colors.textSecondary} />
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.subhead,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
        >
          {headlineFor(request)}
        </Text>
      </View>
      <Text style={{ fontSize: typeScale.footnote, lineHeight: 18, color: colors.textSecondary }}>
        {explanationFor(request)}
      </Text>
      {connectable ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/connectors/[id]',
                params: { id: request.connectorId },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${request.reason === 'not_connected' ? 'Connect' : 'Reconnect'} ${request.connectorName}`}
            style={{ ...buttonStyle, backgroundColor: colors.teal }}
          >
            <Text
              style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.accentText }}
            >
              {request.reason === 'not_connected' ? 'Connect' : 'Reconnect'}
            </Text>
          </Pressable>
          {onRetryTurn ? (
            <Pressable
              onPress={onRetryTurn}
              accessibilityRole="button"
              accessibilityLabel="Retry this turn"
              style={{ ...buttonStyle, borderWidth: 1, borderColor: colors.border }}
            >
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                  color: colors.textPrimary,
                }}
              >
                Retry this turn
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
