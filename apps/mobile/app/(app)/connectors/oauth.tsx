import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { CONNECTOR_OAUTH_APP_RETURN_URL } from '@agiworkforce/cloud-contracts';
import { completeConnectorAuthorization } from '@/services/connectors';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useGoBack } from '@/src/shared/hooks/useGoBack';

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
      })
      .finally(() => {
        if (!cancelled) router.replace('/(app)/connectors' as Parameters<typeof router.replace>[0]);
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
      <ActivityIndicator color={colors.textPrimary} />
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
