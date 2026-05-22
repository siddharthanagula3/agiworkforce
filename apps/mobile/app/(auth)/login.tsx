import { View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Text } from '@/components/ui/text';
import { LoginForm } from '@/src/features/auth/components/LoginForm';
import { OAuthButtons } from '@/src/features/auth/components/OAuthButtons';
import { FEATURES } from '@/lib/v1FeatureFlags';

export default function LoginScreen() {
  // v1 local-only: auth UI is gated off. Bounce to the app shell instead of
  // returning null (which stranded users on a blank screen when the auth
  // guard in app/_layout.tsx redirected here on a 401).
  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-1 justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-8">
            {/* Logo + Title */}
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-2xl bg-teal-500 items-center justify-center">
                <Text className="text-2xl font-bold text-white">AG</Text>
              </View>
              <Text variant="heading" className="text-center">
                AGI Workforce
              </Text>
              <Text className="text-center text-white/50">
                Your AI desktop agent, in your pocket.
              </Text>
            </View>

            {/* Auth form */}
            <LoginForm />
            <OAuthButtons />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
