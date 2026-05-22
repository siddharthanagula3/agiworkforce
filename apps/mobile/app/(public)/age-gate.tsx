/**
 * Age-gate screen — first-run, appears BEFORE the onboarding hero.
 *
 * Policy compliance:
 *   - DPDP Act 2023 (India): 18+ for data processing without parental consent
 *   - EU AI Act Article 5(1)(b): minor protection from manipulative AI
 *   - Google Play GenAI policy: age gate required for general-audience apps
 *   - COPPA (US): 13+ minimum
 *
 * Flow:
 *   1. User enters their age (numeric input)
 *   2. `confirmAgeGate(age)` is called — persists result + detects minor status
 *   3. If minor: show minor-safe notice, then continue to onboarding
 *   4. If adult: continue to onboarding immediately
 *
 * Minor mode is stored in MMKV and checked by contentFilter at prompt time.
 * No parental-consent flow in v1 — minor-safe mode is a content filter only.
 */
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { confirmAgeGate, getAgeThreshold } from '@/src/features/auth/services/ageGate';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AgeGateScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [ageText, setAgeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [minorNotice, setMinorNotice] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const threshold = getAgeThreshold();

  const handleContinue = useCallback(() => {
    const parsed = parseInt(ageText.trim(), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 120) {
      setError('Please enter a valid age.');
      return;
    }
    setError(null);
    const record = confirmAgeGate(parsed);
    if (record.isMinor) {
      setMinorNotice(true);
    } else {
      router.replace({ pathname: '/(public)/onboarding' as const });
    }
  }, [ageText, router]);

  const handleMinorContinue = useCallback(() => {
    router.replace({ pathname: '/(public)/onboarding' as const });
  }, [router]);

  if (minorNotice) {
    return (
      <SafeAreaView
        testID="age-gate-minor-notice"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={styles.iconWrap}>
            <Shield size={40} color={colors.teal} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            Minor-safe mode enabled
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Since you are under {threshold} years old in your region, AGI will apply age-appropriate
            content filtering for your protection.
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            A parent or guardian can review these settings in{' '}
            <Text style={{ color: colors.teal }}>Settings &gt; Privacy</Text>.
          </Text>

          <Pressable
            testID="age-gate-minor-continue-btn"
            onPress={handleMinorContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue to app"
            style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
          >
            <Text style={[styles.ctaBtnText, { color: colors.black }]}>Continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="age-gate-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View style={styles.iconWrap}>
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
            AGI is designed for users {threshold} and older in your region. Please enter your age to
            continue.
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
                borderColor: error ? '#ef4444' : colors.border,
                backgroundColor: 'rgba(255,255,255,0.04)',
              },
            ]}
          />

          {error && (
            <Text
              testID="age-gate-error"
              style={[styles.errorText, { color: '#ef4444' }]}
              accessibilityRole="alert"
            >
              {error}
            </Text>
          )}

          <Pressable
            testID="age-gate-continue-btn"
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
          >
            <Text style={[styles.ctaBtnText, { color: colors.black }]}>Continue</Text>
          </Pressable>

          <Text
            testID="age-gate-policy-note"
            style={[styles.policyNote, { color: colors.textMuted }]}
          >
            Required by DPDP Act 2023, EU AI Act, and Google Play policy. Your age is stored only on
            this device and never shared.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(62,184,196,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  ageInput: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
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
    fontSize: 17,
  },
  policyNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
});
