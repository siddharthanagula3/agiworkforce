/**
 * Cloud waitlist capture sheet — surfaces when the user taps the locked Cloud
 * side of the ModeToggle (or any other cloud-gated entry point).
 *
 * Four internal states:
 *   1. `entry`      — email + country form
 *   2. `submitting` — loading state during onSubmit()
 *   3. `confirmed`  — success state with rank
 *   4. `error`      — submission failure with retry
 *
 * The caller wires `onSubmit({email, country})` to the Web/API persistence
 * layer. The component is unopinionated about how the row is stored.
 */
import { useState } from 'react';
import {
  Modal,
  View,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Cloud as CloudIcon, X, Check, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';

export interface WaitlistSubmission {
  email: string;
  country: string | null;
}

export interface WaitlistResult {
  rank: number;
}

export interface CloudWaitlistSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Persists the waitlist row. Must throw on failure. Returns the new rank
   * so the confirmation screen can show "#N in line".
   */
  onSubmit: (submission: WaitlistSubmission) => Promise<WaitlistResult>;
  /** Default country shown in the picker. Inferred from device locale upstream. */
  defaultCountry?: { code: string; name: string; flag: string };
  /** Callback after the user closes the sheet from the confirmed state. */
  onJoined?: (result: WaitlistResult) => void;
}

type SheetState = 'entry' | 'submitting' | 'confirmed' | 'error';

const DEFAULT_COUNTRY = { code: 'IN', name: 'India', flag: '🇮🇳' };

export function CloudWaitlistSheet({
  visible,
  onClose,
  onSubmit,
  defaultCountry = DEFAULT_COUNTRY,
  onJoined,
}: CloudWaitlistSheetProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [state, setState] = useState<SheetState>('entry');
  const [email, setEmail] = useState('');
  const [country] = useState(defaultCountry);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaitlistResult | null>(null);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submitting = state === 'submitting';

  const triggerHaptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(style);
    }
  };

  const reset = () => {
    setState('entry');
    setEmail('');
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    if (submitting) return;
    if (state === 'confirmed' && result) {
      onJoined?.(result);
    }
    onClose();
    // Reset *after* close so the next opening starts fresh
    setTimeout(reset, 250);
  };

  const handleSubmit = async () => {
    if (!isValidEmail) {
      setError('Enter a valid email address.');
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    setError(null);
    setState('submitting');
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await onSubmit({
        email: email.trim().toLowerCase(),
        country: country.code,
      });
      setResult(res);
      setState('confirmed');
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setState('error');
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleRetry = () => {
    setState('entry');
    setError(null);
  };

  return (
    <Modal
      testID="cloud-waitlist-modal"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        onPress={handleClose}
        accessibilityLabel="Close waitlist sheet"
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => {
            /* swallow taps so backdrop-press doesn't fire here */
          }}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight: '90%',
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView edges={['bottom']}>
              {/* Drag handle */}
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.textMuted,
                  opacity: 0.5,
                  alignSelf: 'center',
                  marginTop: 8,
                }}
              />

              {/* Close button row */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  paddingHorizontal: 14,
                  paddingTop: 4,
                }}
              >
                <Pressable
                  testID="cloud-waitlist-close"
                  onPress={handleClose}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={10}
                  disabled={submitting}
                >
                  <X size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ paddingHorizontal: 22 }}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {state === 'confirmed' && result ? (
                  <ConfirmedView
                    colors={colors}
                    email={email}
                    country={country}
                    rank={result.rank}
                  />
                ) : state === 'error' ? (
                  <ErrorView
                    colors={colors}
                    message={error ?? 'Something went wrong. Try again.'}
                    onRetry={handleRetry}
                  />
                ) : (
                  <EntryView
                    colors={colors}
                    email={email}
                    setEmail={(t) => {
                      setEmail(t);
                      if (error) setError(null);
                    }}
                    country={country}
                    error={error}
                    submitting={submitting}
                  />
                )}
              </ScrollView>

              <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16 }}>
                {state === 'confirmed' && result ? (
                  <Pressable
                    testID="cloud-waitlist-continue-btn"
                    onPress={handleClose}
                    accessibilityRole="button"
                    accessibilityLabel="Continue on-device"
                    style={{
                      backgroundColor: colors.teal,
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '600' }}>
                      Continue on-device
                    </Text>
                  </Pressable>
                ) : state === 'error' ? (
                  <Pressable
                    testID="cloud-waitlist-retry-btn"
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                    style={{
                      backgroundColor: colors.surfaceHover,
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <RotateCcw size={16} color={colors.textSecondary} strokeWidth={2} />
                    <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>
                      Try again
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID="cloud-waitlist-submit-btn"
                    onPress={handleSubmit}
                    disabled={!isValidEmail || submitting}
                    accessibilityRole="button"
                    accessibilityLabel="Join the cloud waitlist"
                    accessibilityState={{ disabled: !isValidEmail || submitting, busy: submitting }}
                    style={{
                      backgroundColor:
                        isValidEmail && !submitting ? colors.teal : colors.surfaceHover,
                      borderRadius: 14,
                      paddingVertical: 16,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {submitting && <ActivityIndicator size="small" color={colors.accentText} />}
                    <Text
                      style={{
                        color: isValidEmail && !submitting ? colors.accentText : colors.textMuted,
                        fontSize: 16,
                        fontWeight: '600',
                      }}
                    >
                      {submitting ? 'Joining…' : 'Join waitlist'}
                    </Text>
                  </Pressable>
                )}

                <Text
                  style={{
                    marginTop: 10,
                    textAlign: 'center',
                    fontSize: 11,
                    color: colors.textMuted,
                  }}
                >
                  No account created. Email is only used to notify you.
                </Text>
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Entry state
// ---------------------------------------------------------------------------

function EntryView({
  colors,
  email,
  setEmail,
  country,
  error,
  submitting,
}: {
  colors: ReturnType<typeof useThemeColors>;
  email: string;
  setEmail: (s: string) => void;
  country: { code: string; name: string; flag: string };
  error: string | null;
  submitting: boolean;
}) {
  return (
    <View style={{ paddingBottom: 4 }}>
      {/* Cloud icon */}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: colors.surfaceHover,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CloudIcon size={28} color={colors.textPrimary} strokeWidth={1.6} />
      </View>

      <Text
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: colors.textPrimary,
          marginTop: 14,
          letterSpacing: -0.3,
          lineHeight: 32,
        }}
      >
        Cloud is coming.
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: 8,
          lineHeight: 21,
        }}
      >
        v1 runs entirely on your device. Cloud unlocks bigger models, web search, and computer-use —
        invite-only for now.
      </Text>

      {/* Email field */}
      <View style={{ marginTop: 24 }}>
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: '600',
          }}
        >
          Email · required
        </Text>
        <TextInput
          testID="cloud-waitlist-email-input"
          accessibilityLabel="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!submitting}
          returnKeyType="go"
          style={{
            marginTop: 6,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: error ? colors.agentError : colors.border,
            backgroundColor: colors.surfaceElevated,
            fontSize: 15,
            color: colors.textPrimary,
          }}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ marginTop: 6, fontSize: 12, color: colors.agentError }}
          >
            {error}
          </Text>
        ) : null}
      </View>

      {/* Region display */}
      <View style={{ marginTop: 14 }}>
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: '600',
          }}
        >
          Region
        </Text>
        <View
          style={{
            marginTop: 6,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 15, color: colors.textPrimary }}>
            {country.flag} {country.name}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Confirmed state
// ---------------------------------------------------------------------------

function ConfirmedView({
  colors,
  email,
  country,
  rank,
}: {
  colors: ReturnType<typeof useThemeColors>;
  email: string;
  country: { code: string; name: string; flag: string };
  rank: number;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
      {/* Success circle */}
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colors.agentSuccess,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={40} color={colors.white} strokeWidth={2.5} />
      </View>

      <Text
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: colors.textPrimary,
          marginTop: 18,
          letterSpacing: -0.3,
          textAlign: 'center',
        }}
      >
        You're confirmed.
      </Text>

      {/* Rank badge */}
      <View
        style={{
          marginTop: 12,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.successSurface,
          borderWidth: 1,
          borderColor: colors.successBorder,
        }}
      >
        <Text
          testID="cloud-waitlist-rank"
          style={{ fontSize: 15, fontWeight: '600', color: colors.agentSuccess }}
        >
          #{(rank + 1).toLocaleString('en-US')} in line
        </Text>
      </View>

      <Text
        style={{
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: 14,
          textAlign: 'center',
          lineHeight: 21,
          maxWidth: 300,
        }}
      >
        We'll email you when cloud opens. No date promised yet — we'll let you in in waves.
      </Text>

      {/* Receipt strip */}
      <View
        style={{
          marginTop: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          {email} · {country.flag} · joined {formatToday()}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorView({
  colors,
  message,
  onRetry,
}: {
  colors: ReturnType<typeof useThemeColors>;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
      {/* Error surface */}
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.dangerSurface,
          borderWidth: 1,
          borderColor: colors.dangerBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={32} color={colors.agentError} strokeWidth={2.5} />
      </View>

      <Text
        style={{
          fontSize: 20,
          fontWeight: '700',
          color: colors.textPrimary,
          marginTop: 16,
          textAlign: 'center',
        }}
      >
        Something went wrong.
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: 8,
          textAlign: 'center',
          lineHeight: 21,
          maxWidth: 300,
        }}
        accessibilityRole="alert"
      >
        {message}
      </Text>
    </View>
  );
}

function formatToday(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
