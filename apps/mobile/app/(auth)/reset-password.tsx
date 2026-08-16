import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { openExternalUrl } from '@/lib/safeOpenURL';

export default function ResetPasswordScreen() {
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    type?: string;
    recovery?: string;
  }>();

  const handleOpenWebRecovery = useCallback(async () => {
    void params;
    const opened = await openExternalUrl('https://agiworkforce.com/auth/reset-password');
    if (opened) {
      return;
    }
    Alert.alert(
      'Could not open account recovery',
      'Visit agiworkforce.com/auth/reset-password in your browser.',
    );
  }, [params]);

  const handleBackToSignIn = useCallback(() => {
    router.replace({ pathname: '/(auth)/login' as const });
  }, [router]);

  if (!FEATURES.auth) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: '700',
            color: themeColors.textPrimary,
          }}
        >
          Recover your AGI account
        </Text>

        <Text style={{ color: themeColors.textMuted, fontSize: 15, lineHeight: 22 }}>
          For account security, password recovery opens in your AGI web account. Local Mode data on
          this device stays separate.
        </Text>

        <View style={{ gap: 10 }}>
          <Button title="Open Web Account" size="lg" onPress={handleOpenWebRecovery} />
          <Button
            title="Back to Sign In"
            size="lg"
            variant="outline"
            onPress={handleBackToSignIn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
