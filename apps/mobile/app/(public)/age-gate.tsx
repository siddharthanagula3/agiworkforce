import { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Shield } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { confirmAgeGate, getAgeThreshold } from '@/src/features/auth/services/ageGate';

const PARENTAL_CONTROLS_RETURN_PATH = '/(app)/settings/parental-controls' as const;

export default function AgeGateScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [ageText, setAgeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [minorNotice, setMinorNotice] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const threshold = getAgeThreshold();
  const canContinue = ageText.trim().length > 0;
  const primaryButtonTextColor = isDark ? colors.black : colors.white;
  const disabledButtonBg = isDark ? colors.surfaceHover : colors.surfaceHover;
  const disabledButtonTextColor = colors.textMuted;
  const returnTo =
    params.returnTo === PARENTAL_CONTROLS_RETURN_PATH ? PARENTAL_CONTROLS_RETURN_PATH : null;

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
    }
  }, [returnTo, router]);

  const handleComplete = useCallback(() => {
    router.replace(returnTo ?? ('/(public)/onboarding' as const));
  }, [returnTo, router]);

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
      handleComplete();
    }
  }, [ageText, handleComplete]);

  const handleMinorContinue = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  const header = returnTo ? (
    <View style={styles.header}>
      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={({ pressed }) => [
          styles.backButton,
          { backgroundColor: pressed ? colors.surfaceHover : colors.transparent },
        ]}
      >
        <ArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Review Age Settings</Text>
    </View>
  ) : null;

  if (minorNotice) {
    return (
      <SafeAreaView
        testID="age-gate-minor-notice"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {header}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { backgroundColor: colors.background, justifyContent: 'center' },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSurface }]}>
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
            Age settings can be reviewed on this device in{' '}
            <Text style={{ color: colors.teal }}>Settings &gt; Parental Controls</Text>.
          </Text>

          <Pressable
            testID="age-gate-minor-continue-btn"
            onPress={handleMinorContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue to app"
            style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
          >
            <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>Continue</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="age-gate-root" style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
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
            Required by DPDP Act 2023, EU AI Act, and Google Play policy. Your age is stored only on
            this device and never shared.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 4,
  },
  scrollContent: {
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
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: 0,
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
    paddingVertical: 14,
    minHeight: 64,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 2,
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
    lineHeight: 22,
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
