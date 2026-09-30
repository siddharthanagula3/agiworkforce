import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { AuthView } from '@clerk/expo/native';
import { X } from 'lucide-react-native';
import { AgiMark } from '@/components/ui/AgiMark';
import { API_URL } from '@/lib/constants';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { CLERK_NATIVE_AUTH_OPTIONS } from '@/src/integrations/clerk';
import {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_LEAD,
  FREE_PLAN_TRAINING_NOTICE_TAIL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
} from '@agiworkforce/compliance';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  clearPostAuthIntent,
  parsePostAuthIntent,
  POST_AUTH_INTENT_PARAM,
  stagePostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';
import {
  completePendingPostAuthIntentForLoadedSession,
  resetPostAuthDestinationToLocal,
} from '@/src/features/auth/actions/postAuthIntent';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { MobileSignUp } from '@/src/features/auth/components/MobileSignUp';
import { MobileSignIn } from '@/src/features/auth/components/MobileSignIn';

export default function LoginScreen() {
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [nativeSignUpFallback, setNativeSignUpFallback] = useState(false);
  const [nativeSignInFallback, setNativeSignInFallback] = useState(false);
  const router = useRouter();
  const colors = useThemeColors();
  const { isLoaded, isSignedIn, userId } = useAuth(CLERK_NATIVE_AUTH_OPTIONS);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const subscriptionTier = useTierStore((state) => state.tier);
  const termsUserId = useTermsAcceptanceStore((state) => state.userId);
  const termsStatus = useTermsAcceptanceStore((state) => state.status);
  const termsVersion = useTermsAcceptanceStore((state) => state.currentVersion);
  const termsError = useTermsAcceptanceStore((state) => state.error);
  const completionRef = useRef({ isSignedIn, userId, termsUserId, termsStatus, cloudUnlocked });
  completionRef.current = { isSignedIn, userId, termsUserId, termsStatus, cloudUnlocked };
  const [termsConfirmation, setTermsConfirmation] = useState<{
    userId: string;
    version: string;
  } | null>(null);
  const termsConfirmed =
    termsStatus === 'required' &&
    termsConfirmation?.userId === userId &&
    termsConfirmation?.version === termsVersion;
  const params = useLocalSearchParams<{ postAuthIntent?: string | string[] }>();
  const postAuthIntent = parsePostAuthIntent(params[POST_AUTH_INTENT_PARAM]);

  useLayoutEffect(() => {
    if (postAuthIntent) {
      stagePostAuthIntent(postAuthIntent);
      completePendingPostAuthIntentForLoadedSession({
        isLoaded,
        isSignedIn: isSignedIn === true,
        userId,
        termsAccepted: termsUserId === userId && termsStatus === 'accepted',
        cloudUnlocked,
        subscriptionTier,
      });
      return;
    }
    clearPostAuthIntent();
    resetPostAuthDestinationToLocal();
  }, [
    cloudUnlocked,
    isLoaded,
    isSignedIn,
    postAuthIntent,
    subscriptionTier,
    termsStatus,
    termsUserId,
    userId,
  ]);

  useEffect(
    () => () => {
      if (!isAgeGateConfirmed()) return;
      const completion = completionRef.current;
      if (
        completion.isSignedIn &&
        completion.termsUserId === completion.userId &&
        completion.termsStatus === 'accepted' &&
        completion.cloudUnlocked
      )
        return;
      if (clearPostAuthIntent()) resetPostAuthDestinationToLocal();
    },
    [],
  );

  const handleDismiss = () => {
    clearPostAuthIntent();
    resetPostAuthDestinationToLocal();
    router.replace('/(app)');
  };

  if (!FEATURES.auth) return <Redirect href="/(app)" />;
  if (isLoaded && isSignedIn) {
    if (termsUserId === userId && (termsStatus === 'required' || termsStatus === 'error')) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
          <ScrollView
            testID="mobile-terms-review"
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24, gap: 18, flexGrow: 1 }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.title2, fontWeight: '700' }}
            >
              Review the Terms for AGI Cloud
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 21 }}
            >
              {termsStatus === 'required'
                ? `Version dated ${termsVersion}. Your agreement will be recorded with your account.`
                : termsError}
            </Text>
            {termsStatus === 'required' ? (
              <>
                <Pressable
                  testID="mobile-terms-checkbox"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termsConfirmed }}
                  onPress={() => {
                    if (!userId || !termsVersion) return;
                    setTermsConfirmation(termsConfirmed ? null : { userId, version: termsVersion });
                  }}
                  style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: typeScale.headline }}>
                    {termsConfirmed ? '☑' : '☐'}
                  </Text>
                  <Text style={{ color: colors.textPrimary, flex: 1, lineHeight: 21 }}>
                    I agree to the Terms of Service, including the arbitration clause and
                    class-action waiver, and acknowledge the Privacy Policy.
                  </Text>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  {(
                    [
                      ['Read Terms', '/terms'],
                      ['Read Privacy Policy', '/privacy'],
                    ] as const
                  ).map(([label, path]) => (
                    <Pressable
                      key={path}
                      accessibilityRole="link"
                      onPress={() => void openExternalUrl(new URL(path, API_URL).toString())}
                    >
                      <Text style={{ color: colors.teal }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  testID="mobile-terms-accept"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !termsConfirmed }}
                  disabled={!termsConfirmed}
                  onPress={() => {
                    if (!userId || !termsConfirmed) return;
                    const currentTerms = useTermsAcceptanceStore.getState();
                    if (
                      currentTerms.userId === userId &&
                      currentTerms.currentVersion === termsConfirmation?.version
                    ) {
                      void currentTerms.accept(userId);
                    }
                  }}
                  style={{
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: colors.teal,
                    opacity: termsConfirmed ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: colors.surfaceBase, fontWeight: '700' }}>
                    Agree and continue
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                testID="mobile-terms-retry"
                accessibilityRole="button"
                onPress={() => {
                  setTermsConfirmation(null);
                  if (userId) void useTermsAcceptanceStore.getState().verify(userId);
                }}
              >
                <Text style={{ color: colors.teal, fontWeight: '700' }}>Retry Terms check</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={handleDismiss}>
              <Text style={{ color: colors.textSecondary }}>Continue in Local Mode</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <ActivityIndicator testID="cloud-sign-in-completing" color={colors.teal} size="large" />
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {userId ? 'Checking your AGI Cloud access…' : 'Finishing sign-in…'}
          </Text>
          <Pressable accessibilityRole="button" onPress={handleDismiss}>
            <Text style={{ color: colors.teal, fontWeight: '700' }}>Continue in Local Mode</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceElevated }}>
      <View
        testID="cloud-sign-in-header"
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AgiMark size={20} mono />
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '700' }}
          >
            AGI
          </Text>
        </View>
        <Pressable
          testID="cloud-sign-in-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Close Cloud sign in"
          accessibilityHint="Returns to Local Mode"
          onPress={handleDismiss}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <X size={20} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }} testID="cloud-sign-in-screen">
        {authMode === 'signIn' && !nativeSignInFallback ? (
          <MobileSignIn
            postAuthIntent={postAuthIntent}
            onNativeFallback={() => setNativeSignInFallback(true)}
            onSignUp={() => {
              setNativeSignUpFallback(false);
              setAuthMode('signUp');
            }}
          />
        ) : authMode === 'signUp' && !nativeSignUpFallback ? (
          <MobileSignUp
            postAuthIntent={postAuthIntent}
            onNativeFallback={() => setNativeSignUpFallback(true)}
            onSignIn={() => {
              setNativeSignInFallback(false);
              setAuthMode('signIn');
            }}
          />
        ) : (
          <AuthView key={authMode} mode={authMode} isDismissible={false} />
        )}
      </View>
      {authMode === 'signUp' && nativeSignUpFallback ? (
        <View
          testID="cloud-sign-up-data-use"
          style={{ paddingHorizontal: 24, paddingTop: 6, alignItems: 'center', gap: 4 }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            {FREE_PLAN_TRAINING_NOTICE_TITLE}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.caption,
              lineHeight: 18,
              textAlign: 'center',
            }}
          >
            {FREE_PLAN_TRAINING_NOTICE_LEAD} {FREE_PLAN_TRAINING_DATA_DISCLOSURE}{' '}
            {FREE_PLAN_TRAINING_NOTICE_TAIL}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Read how Free model providers may use your data"
            onPress={() => void openExternalUrl(new URL('/data-use', API_URL).toString())}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.caption, fontWeight: '600' }}>
              How Free model data is used
            </Text>
          </Pressable>
        </View>
      ) : null}
      {(authMode === 'signIn' && nativeSignInFallback) || nativeSignUpFallback ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
            {authMode === 'signIn' ? 'New to AGI?' : 'Already have an account?'}
          </Text>
          <Pressable
            testID={`cloud-auth-${authMode === 'signIn' ? 'signUp' : 'signIn'}`}
            accessibilityRole="button"
            onPress={() => {
              setNativeSignUpFallback(false);
              setNativeSignInFallback(false);
              setAuthMode(authMode === 'signIn' ? 'signUp' : 'signIn');
            }}
            style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
              {authMode === 'signIn' ? 'Create an account' : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {authMode === 'signIn' || nativeSignUpFallback ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: 8,
            paddingHorizontal: 20,
            gap: 12,
          }}
        >
          {(
            [
              ['Terms', '/terms'],
              ['Privacy', '/privacy'],
              ['Data use', '/data-use'],
              ['Acceptable use', '/acceptable-use'],
            ] as const
          ).map(([label, path]) => (
            <Pressable
              key={path}
              accessibilityRole="link"
              onPress={() => void openExternalUrl(new URL(path, API_URL).toString())}
            >
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
