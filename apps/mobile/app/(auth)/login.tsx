import { View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { LoginForm } from '@/components/auth/LoginForm';
import { OAuthButtons } from '@/components/auth/OAuthButtons';

export default function LoginScreen() {
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
