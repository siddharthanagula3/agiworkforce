import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { X } from 'lucide-react-native';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { CLERK_NATIVE_AUTH_OPTIONS } from '@/src/integrations/clerk';
import { useThemeColors } from '@/src/ui/theme';

/**
 * Cloud sign-in screen.
 *
 * Renders Clerk's prebuilt native AuthView (combined sign-in-or-up). The native
 * component syncs the Clerk session automatically — no setActive() call. Once
 * signed in, we redirect into the app. Dismissing returns to Local Mode.
 */
export default function LoginScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isLoaded, isSignedIn } = useAuth(CLERK_NATIVE_AUTH_OPTIONS);

  // Build gate: when cloud auth is disabled, Local Mode is the only path.
  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  if (isLoaded && isSignedIn) return <Redirect href="/(app)" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View
        testID="cloud-sign-in-header"
        style={{
          height: 64,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingHorizontal: 16,
        }}
      >
        <Pressable
          testID="cloud-sign-in-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Close Cloud sign in"
          accessibilityHint="Returns to Local Mode"
          hitSlop={8}
          onPress={() => router.replace('/(app)')}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }} testID="cloud-sign-in-screen">
        <AuthView mode="signInOrUp" isDismissible={false} />
      </View>
    </SafeAreaView>
  );
}
