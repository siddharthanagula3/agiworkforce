import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { ACCOUNT_AGE_REQUIREMENT_NOTICE } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { useAuthStore } from '@/src/features/auth/store';
import { confirmAgeGate, getAgeThreshold, isMinorMode } from '@/src/features/auth/services/ageGate';
import { assureAgeWithOs } from '@/src/features/age-assurance';
import { AgeRefused } from '@/src/features/auth/components/AgeRefused';
import { useAdultEligibilityStore } from '@/src/features/auth/store/adultEligibilityStore';
import {
  AGE_GATE_PATH,
  CLOUD_SIGN_IN_RETURN_PATH,
  ONBOARDING_PATH,
} from '@/src/features/auth/services/rootRouting';
import {
  clearPostAuthIntent,
  peekPostAuthIntent,
  POST_AUTH_INTENT_PARAM,
} from '@/src/features/auth/services/postAuthIntent';

const RETURN_PATHS = [CLOUD_SIGN_IN_RETURN_PATH] as const;
type ReturnPath = (typeof RETURN_PATHS)[number];

export function resolveReturnPath(raw: string | undefined): ReturnPath | null {
  return RETURN_PATHS.find((path) => path === raw) ?? null;
}

export default function AgeGateScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [ageText, setAgeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(isMinorMode);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const signOutAllAccounts = useAuthStore((s) => s.signOutAllAccounts);
  const inputRef = useRef<TextInput>(null);

  const threshold = getAgeThreshold();
  const canContinue = ageText.trim().length > 0;
  const primaryButtonTextColor = isDark ? colors.black : colors.white;
  const disabledButtonBg = colors.surfaceHover;
  const disabledButtonTextColor = colors.textMuted;
  const returnTo = resolveReturnPath(params.returnTo);

  const handleComplete = useCallback(() => {
    if (returnTo === CLOUD_SIGN_IN_RETURN_PATH) {
      const intent = peekPostAuthIntent();
      router.replace(
        intent
          ? { pathname: CLOUD_SIGN_IN_RETURN_PATH, params: { [POST_AUTH_INTENT_PARAM]: intent } }
          : CLOUD_SIGN_IN_RETURN_PATH,
      );
      return;
    }
    router.replace(ONBOARDING_PATH);
  }, [returnTo, router]);

  const osCheckStarted = useRef(false);
  useEffect(() => {
    if (osCheckStarted.current || refused) return;
    osCheckStarted.current = true;
    void assureAgeWithOs().then((record) => {
      if (!record) return;
      if (record.isMinor) {
        setRefused(true);
        return;
      }
      void useAdultEligibilityStore.getState().reportDeviceGateAnswer(null);
      handleComplete();
    });
  }, [handleComplete, refused]);

  const handleContinue = useCallback(() => {
    const parsed = parseInt(ageText.trim(), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 120) {
      setError('Please enter a valid age.');
      return;
    }
    setError(null);
    const record = confirmAgeGate(parsed);
    if (record.isMinor) {
      setRefused(true);
      return;
    }
    void useAdultEligibilityStore.getState().reportDeviceGateAnswer(parsed);
    handleComplete();
  }, [ageText, handleComplete]);

  const handleSignOut = useCallback(async () => {
    await signOutAllAccounts().catch(() => {});
    clearPostAuthIntent();
    router.replace(AGE_GATE_PATH);
  }, [router, signOutAllAccounts]);

  const handleDeviceDataErased = useCallback(() => {
    setAgeText('');
    setError(null);
    setRefused(false);
    router.replace(AGE_GATE_PATH);
  }, [router]);

  if (refused) {
    return (
      <AgeRefused
        scope="device"
        threshold={threshold}
        signedIn={isClerkSignedIn}
        onSignOut={() => void handleSignOut()}
        onDeviceDataErased={handleDeviceDataErased}
      />
    );
  }

  return (
    <SafeAreaView testID="age-gate-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.background }]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSurface }]}>
            <Shield size={40} color={colors.teal} />
          </View>

          <Text
            testID="age-gate-title"
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            Your age
          </Text>

          <Text
            testID="age-gate-subtitle"
            style={[styles.subtitle, { color: colors.textSecondary }]}
          >
            {ACCOUNT_AGE_REQUIREMENT_NOTICE} Enter your age to continue.
          </Text>

          <TextInput
            ref={inputRef}
            testID="age-gate-input"
            value={ageText}
            onChangeText={(t) => {
              setAgeText(t.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="Enter your age"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            accessibilityLabel="Enter your age in years"
            style={[
              styles.ageInput,
              {
                color: colors.textPrimary,
                borderColor: error ? colors.agentError : colors.border,
                backgroundColor: colors.inputSurface,
              },
            ]}
          />

          {error && (
            <Text
              testID="age-gate-error"
              style={[styles.errorText, { color: colors.agentError }]}
              accessibilityRole="alert"
            >
              {error}
            </Text>
          )}

          <Pressable
            testID="age-gate-continue-btn"
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: !canContinue }}
            style={[
              styles.ctaBtn,
              { backgroundColor: canContinue ? colors.teal : disabledButtonBg },
            ]}
          >
            <Text
              style={[
                styles.ctaBtnText,
                { color: canContinue ? primaryButtonTextColor : disabledButtonTextColor },
              ]}
            >
              Continue
            </Text>
          </Pressable>

          <Text
            testID="age-gate-policy-note"
            style={[styles.policyNote, { color: colors.textMuted }]}
          >
            AGI keeps only whether you meet the age, not your age.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    ...contentColumn('form'),
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: typeScale.title1,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: typeScale.body,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  ageInput: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
    fontSize: typeScale.title2,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 12,
  },
  errorText: {
    fontSize: typeScale.footnote,
    textAlign: 'center',
    marginBottom: 12,
  },
  ctaBtn: {
    width: '100%',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  ctaBtnText: {
    fontWeight: '600',
    fontSize: typeScale.headline,
    lineHeight: 22,
  },
  policyNote: {
    fontSize: typeScale.caption,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
