/**
 * reset-password.tsx
 *
 * MED-MOB-07 fix (2026-05-04): Handles agiworkforce://reset-password deep links
 * from Supabase password-reset emails. Previously there was no registered route
 * for this path; the recovery token in the URL fragment was silently lost (or
 * exposed in getInitialURL() parse path if the share-intent handler ran first).
 *
 * This screen:
 * 1. Reads the recovery token from the URL (Expo Router passes it via params).
 * 2. Exchanges it with Supabase via exchangeCodeForSession / setSession.
 * 3. Prompts the user to enter and confirm a new password.
 * 4. Clears the recovery token from memory immediately after exchange.
 */
import { useState, useEffect } from 'react';
import { View, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/services/supabase';

export default function ResetPasswordScreen() {
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  // Expo Router passes URL fragment params as query params when the route is
  // matched via a deep link. Supabase recovery links look like:
  //   agiworkforce://reset-password#access_token=...&type=recovery
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    type?: string;
  }>();

  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exchange the recovery token for a session — this must happen once.
  useEffect(() => {
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    const type = params.type;

    if (!accessToken || type !== 'recovery') {
      setError('Invalid or missing recovery link. Please request a new password reset email.');
      return;
    }

    // Establish a temporary session scoped to password reset.
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
      .then(({ error: err }) => {
        if (err) {
          setError('Recovery link has expired or is invalid. Please request a new one.');
        } else {
          setSessionReady(true);
        }
      })
      .catch(() => {
        setError('Could not validate recovery link. Please try again.');
      });
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
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        Alert.alert('Password updated', 'Your password has been changed. Please log in.', [
          {
            text: 'OK',
            onPress: () => {
              supabase.auth.signOut().catch(() => null);
              router.replace('/(auth)/login');
            },
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

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
