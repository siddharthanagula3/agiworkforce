import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { X } from 'lucide-react-native';
import { FEATURES } from '@/lib/v1FeatureFlags';
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
  const { isLoaded, isSignedIn } = useAuth();

  // Build gate: when cloud auth is disabled, Local Mode is the only path.
  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  if (isLoaded && isSignedIn) return <Redirect href="/(app)" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View style={{ flex: 1 }} testID="cloud-sign-in-screen">
        <AuthView mode="signInOrUp" isDismissible={false} />
      </View>
      <Pressable
        testID="cloud-sign-in-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Close Cloud sign in"
        accessibilityHint="Returns to Local Mode"
        hitSlop={8}
        onPress={() => router.replace('/(app)')}
        style={{
          position: 'absolute',
          top: 8,
          right: 12,
          zIndex: 10,
          elevation: 10,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
        }}
      >
        <X size={20} color={colors.textPrimary} strokeWidth={2} />
      </Pressable>
    </SafeAreaView>
  );
}
