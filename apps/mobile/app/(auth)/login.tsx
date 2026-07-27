import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { X } from 'lucide-react-native';
import { AgiMark } from '@/components/ui/AgiMark';
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
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: colors.accentSurface,
              }}
            >
              <AgiMark size={24} spinning accentColor={colors.agentWarning} />
            </View>
            <View>
              <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
                AGI
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                }}
              >
                Cloud account
              </Text>
            </View>
          </View>
          <Pressable
            testID="cloud-sign-in-dismiss"
            accessibilityRole="button"
            accessibilityLabel="Close Cloud sign in"
            accessibilityHint="Returns to Local Mode"
            hitSlop={8}
            onPress={() => router.replace('/(app)')}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <X size={20} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>
        <Text
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: 25,
            fontWeight: '700',
            letterSpacing: -0.6,
          }}
        >
          One account. Every surface.
        </Text>
        <Text style={{ marginTop: 6, color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
          Sign in or create an account for AGI Cloud. Local Mode stays private and account-free.
        </Text>
        <View
          accessibilityLabel="AGI account surfaces"
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          {['Web', 'Desktop', 'Mobile'].map((surface, index) => (
            <View
              key={surface}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: index === 2 ? colors.agentWarning : colors.textMuted,
                }}
              />
              <Text
                style={{
                  marginLeft: 7,
                  color: index === 2 ? colors.textPrimary : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {surface}
              </Text>
              {index < 2 ? (
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    marginHorizontal: 10,
                    backgroundColor: colors.border,
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
      </View>
      <View style={{ flex: 1 }} testID="cloud-sign-in-screen">
        <AuthView mode="signInOrUp" isDismissible={false} />
      </View>
    </SafeAreaView>
  );
}
