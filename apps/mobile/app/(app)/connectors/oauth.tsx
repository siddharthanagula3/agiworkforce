import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  CONNECTOR_OAUTH_APP_RETURN_URL,
  type ConnectorOAuthCallbackStatus,
} from '@agiworkforce/cloud-contracts';
import { completeConnectorAuthorization } from '@/services/connectors';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGoBack } from '@/src/shared/hooks/useGoBack';

function announceReturnOutcome(outcome: ConnectorOAuthCallbackStatus | 'error'): void {
  if (outcome === 'connected' || outcome === 'invalid_state') return;
  if (outcome === 'denied') {
    Alert.alert('Not connected', 'The authorization was declined. Nothing was connected.');
    return;
  }
  Alert.alert(
    'Could not finish connecting',
    'The authorization did not finish. Nothing was connected. Try again in a moment.',
  );
}

export default function ConnectorOAuthReturnRoute() {
  const router = useRouter();
  const colors = useThemeColors();
  const handleCancel = useGoBack('/(app)/connectors');
  const params = useLocalSearchParams<{
    state?: string;
    code?: string;
    iss?: string;
    error?: string;
  }>();

  useEffect(() => {
    let cancelled = false;
    const returned = new URL(CONNECTOR_OAUTH_APP_RETURN_URL);
    for (const key of ['state', 'code', 'iss', 'error'] as const) {
      const value = params[key];
      if (typeof value === 'string' && value) returned.searchParams.set(key, value);
    }
    void completeConnectorAuthorization(returned.toString())
      .catch((error: unknown) => {
        console.warn('[connectors] finishing the sign-in failed', error);
        return 'error' as const;
      })
      .then((outcome) => {
        if (cancelled) return;
        router.replace('/(app)/connectors' as Parameters<typeof router.replace>[0]);
        announceReturnOutcome(outcome);
      });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}
      accessibilityLabel="Finishing the connection"
    >
      <LoadingIndicator />
      <Pressable
        onPress={handleCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={{ marginTop: 24, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}
