import { View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Text } from '@/components/ui/text';
import { LoginForm } from '@/src/features/auth/components/LoginForm';
import { OAuthButtons } from '@/src/features/auth/components/OAuthButtons';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useThemeColors } from '@/src/ui/theme';

export default function LoginScreen() {
  const colors = useThemeColors();
  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-1 justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 40, paddingVertical: 32 }}>
            {/* Logo + heading */}
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View
                accessibilityRole="image"
                accessibilityLabel="AGI logo"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.teal,
                }}
              >
                <Text
                  style={{ fontSize: 26, fontWeight: '700', color: colors.accentText }}
                  accessibilityElementsHidden
                >
                  AG
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 30,
                  fontWeight: '700',
                  color: colors.textPrimary,
                  letterSpacing: -0.5,
                  textAlign: 'center',
                }}
              >
                AGI
              </Text>

              <Text
                style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  textAlign: 'center',
                  lineHeight: 20,
                  maxWidth: 280,
                }}
              >
                Cloud access is invite-only. Sign in below if you have an account.
              </Text>
            </View>

            {/* Auth form */}
            <View style={{ gap: 16 }}>
              <LoginForm />
              <OAuthButtons />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
