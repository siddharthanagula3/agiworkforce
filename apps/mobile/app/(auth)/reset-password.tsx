import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
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
    const opened = await openExternalUrl('https://agiworkforce.com/login');
    if (opened) {
      return;
    }
    Alert.alert(
      'Could not open account recovery',
      'Visit agiworkforce.com/login in your browser and choose Forgot password.',
    );
  }, [params]);

  const handleOpenAccountRecovery = useCallback(async () => {
    const opened = await openExternalUrl('https://agiworkforce.com/recover');
    if (opened) return;
    Alert.alert(
      'Could not open account recovery',
      'Visit agiworkforce.com/recover in your browser.',
    );
  }, []);

  const handleBackToSignIn = useCallback(() => {
    router.replace({ pathname: '/(auth)/login' as const });
  }, [router]);

  if (!FEATURES.auth) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text
          style={{
            fontSize: typeScale.title2,
            lineHeight: 30,
            fontWeight: '700',
            color: themeColors.textPrimary,
          }}
        >
          Recover your AGI account
        </Text>

        <Text style={{ color: themeColors.textMuted, fontSize: typeScale.body, lineHeight: 22 }}>
          For account security, password recovery opens in your AGI web account. If you lost the
          email address or two-factor device on the account, a person can verify it is yours and
          restore access. Local Mode data on this device stays separate.
        </Text>

        <View style={{ gap: 10 }}>
          <Button title="Open Web Account" size="lg" onPress={handleOpenWebRecovery} />
          <Button
            title="Lost Your Email or Two-Factor Device?"
            size="lg"
            variant="outline"
            onPress={handleOpenAccountRecovery}
          />
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
