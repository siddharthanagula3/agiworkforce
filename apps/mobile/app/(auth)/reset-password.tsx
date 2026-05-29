/**
 * reset-password.tsx
 *
 * Password reset is owned by the Web/Clerk account surface. Mobile v1 keeps
 * this route as a gated deep-link placeholder so old links do not crash.
 */
import { useState, useEffect } from 'react';
import { View, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

export default function ResetPasswordScreen() {
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  // Expo Router passes URL fragment params as query params when the route is
  // matched via a deep link.
  //
  // Account recovery is web-owned. This route only prevents stale deep links
  // from falling through to unrelated handlers.
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    type?: string;
    recovery?: string;
  }>();

  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FEATURES.auth) return;
    void params;
    setError('Password reset is handled on the AGI web account page.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      void password;
      Alert.alert('Password reset', 'Open agiworkforce.com/login to reset your password.', [
        { text: 'OK', onPress: () => router.replace({ pathname: '/(auth)/login' as const }) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!FEATURES.auth) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: themeColors.textPrimary }}>
          Set new password
        </Text>

        {error && <Text style={{ color: themeColors.agentError, fontSize: 14 }}>{error}</Text>}

        {!sessionReady && !error && (
          <View style={{ alignItems: 'center', padding: 24 }}>
            <ActivityIndicator color={themeColors.teal} />
            <Text style={{ color: themeColors.textMuted, marginTop: 8 }}>
              Validating recovery link…
            </Text>
          </View>
        )}

        {sessionReady && (
          <>
            <TextInput
              placeholder="New password"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={{
                borderWidth: 1,
                borderColor: themeColors.border,
                borderRadius: 12,
                padding: 14,
                color: themeColors.textPrimary,
                fontSize: 16,
              }}
            />
            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
              style={{
                borderWidth: 1,
                borderColor: themeColors.border,
                borderRadius: 12,
                padding: 14,
                color: themeColors.textPrimary,
                fontSize: 16,
              }}
            />
            <Pressable
              onPress={handleReset}
              disabled={loading}
              style={{
                backgroundColor: loading ? themeColors.teal + '88' : themeColors.teal,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                {loading ? 'Updating…' : 'Update password'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
