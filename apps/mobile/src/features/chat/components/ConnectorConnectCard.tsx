import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plug } from 'lucide-react-native';
import { getToolDisplayLabel, type ConnectorConnectRequest } from '@agiworkforce/types';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  authorizeConnectorInApp,
  connectConnector,
  fetchConnectorDirectory,
  startConnectorOAuth,
  type InAppConnectorAuthorization,
} from '@/services/connectors';
import { connectorAuthorizationNotice } from '@/src/features/settings/cloud-connectors/connectorAuthorizationOutcome';
import { connectorFailureMessage } from '@/src/features/settings/cloud-connectors/connectorFailureMessage';
import { askConnectorConsent } from '@/src/features/settings/cloud-connectors/connectorConsent';
import {
  connectorConnectExplanation,
  connectorConnectHeadline,
} from '@/src/features/chat/utils/connectorConnectSentences';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const MAX_VISIBLE_SCOPES = 8;

type ConnectPhase = 'idle' | 'connecting' | 'connected';

function scopeSummary(scopes: readonly string[]): string {
  const visible = scopes.slice(0, MAX_VISIBLE_SCOPES);
  const hidden = scopes.length - visible.length;
  return hidden > 0 ? `${visible.join(', ')}, +${hidden} more` : visible.join(', ');
}

async function connectionListed(connectorId: string): Promise<boolean> {
  try {
    const directory = await fetchConnectorDirectory();
    return directory.connectors.some((connection) => connection.connectorId === connectorId);
  } catch {
    return false;
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
  const [phase, setPhase] = useState<ConnectPhase>('idle');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const reconnecting = request.reason !== 'not_connected';
  const settle = useCallback(
    async (outcome: InAppConnectorAuthorization) => {
      const live =
        outcome === 'connected' || (!reconnecting && (await connectionListed(request.connectorId)));
      if (!mounted.current) return;
      setPhase(live ? 'connected' : 'idle');
      if (live || (reconnecting && outcome === 'invalid_state')) return;
      const notice = connectorAuthorizationNotice(request.connectorName, outcome);
      if (notice) Alert.alert(notice.title, notice.body);
    },
    [reconnecting, request.connectorId, request.connectorName],
  );

  const connect = useCallback(() => {
    if (phase === 'connecting') return;
    setPhase('connecting');
    void (async () => {
      try {
        let start: { authorizeUrl: string; appReturn: boolean };
        if (!reconnecting) {
          const allowed = await askConnectorConsent({
            id: request.connectorId,
            name: request.connectorName,
            providerSignIn: request.scopes.length > 0,
          });
          if (!mounted.current) return;
          if (!allowed) {
            setPhase('idle');
            return;
          }
          const result = await connectConnector(request.connectorId);
          if (result.kind === 'connected') {
            if (mounted.current) setPhase('connected');
            return;
          }
          if (result.kind === 'credentials-required') {
            if (mounted.current) setPhase('idle');
            router.push({
              pathname: '/(app)/connectors/[id]',
              params: { id: request.connectorId },
            });
            return;
          }
          start = result;
        } else {
          start = await startConnectorOAuth(request.connectorId);
        }
        if (start.appReturn) {
          await settle(await authorizeConnectorInApp(start.authorizeUrl));
          return;
        }
        const opened = await openUntrustedUrlInAppBrowser(start.authorizeUrl);
        if (!mounted.current) return;
        if (!opened) {
          setPhase('idle');
          Alert.alert(
            `Could not open ${request.connectorName} authorization`,
            'No browser was available to complete the authorization. Nothing was connected.',
          );
          return;
        }
        await settle('dismissed');
      } catch (error) {
        if (!mounted.current) return;
        setPhase('idle');
        Alert.alert(
          `Could not connect ${request.connectorName}`,
          connectorFailureMessage(error, reconnecting ? 'reauthorize' : 'connect'),
        );
      }
    })();
  }, [
    phase,
    reconnecting,
    request.connectorId,
    request.connectorName,
    request.scopes.length,
    router,
    settle,
  ]);

  const actionLabel = request.reason === 'not_connected' ? 'Connect' : 'Reconnect';
  const toolLabel = getToolDisplayLabel(request.qualifiedToolName).displayName;
  const buttonStyle = {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center' as const,
  };

  return (
    <View
      testID="connector-connect-card"
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
          {phase === 'connected'
            ? `${request.connectorName} is connected`
            : connectorConnectHeadline(request)}
        </Text>
      </View>
      <Text style={{ fontSize: typeScale.footnote, lineHeight: 18, color: colors.textSecondary }}>
        {connectorConnectExplanation(request)}
      </Text>
      <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
        {`Requested by ${request.connectorName} · ${toolLabel}`}
      </Text>
      {request.scopes.length > 0 ? (
        <Text
          testID="connector-connect-card.scopes"
          style={{ fontSize: typeScale.caption, color: colors.textMuted }}
        >
          {`${connectable ? 'This will request' : 'Would request'}: ${scopeSummary(request.scopes)}`}
        </Text>
      ) : null}
      {connectable ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {phase === 'connected' ? null : (
            <Pressable
              onPress={connect}
              disabled={phase === 'connecting'}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel} ${request.connectorName}`}
              accessibilityState={{
                disabled: phase === 'connecting',
                busy: phase === 'connecting',
              }}
              style={{
                ...buttonStyle,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.teal,
              }}
            >
              {phase === 'connecting' ? <LoadingIndicator size={14} accessible={false} /> : null}
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                  color: colors.accentText,
                }}
              >
                {phase === 'connecting' ? 'Connecting…' : actionLabel}
              </Text>
            </Pressable>
          )}
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
      {connectable ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {`Connecting opens ${request.connectorName} and brings you back here. It does not resume this turn; use Retry this turn after you return.`}
        </Text>
      ) : null}
    </View>
  );
}
