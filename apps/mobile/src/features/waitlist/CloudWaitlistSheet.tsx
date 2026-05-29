/**
 * Cloud waitlist capture sheet — surfaces when the user taps the locked Cloud
 * side of the ModeToggle (or any other cloud-gated entry point).
 *
 * Three internal states:
 *   1. `entry`     — email + country form
 *   2. `submitting`— loading state during onSubmit()
 *   3. `confirmed` — success state with rank
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
import { Cloud as CloudIcon, X, Check, ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

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
  const [state, setState] = useState<SheetState>('entry');
  const [email, setEmail] = useState('');
  const [country] = useState(defaultCountry);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaitlistResult | null>(null);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submitting = state === 'submitting';

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
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setState('submitting');
    try {
      const res = await onSubmit({
        email: email.trim().toLowerCase(),
        country: country.code,
      });
      setResult(res);
      setState('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setState('error');
    }
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

              <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 22 }}>
                {state === 'confirmed' && result
                  ? renderConfirmed({ colors, email, country, rank: result.rank })
                  : renderEntry({
                      colors,
                      email,
                      setEmail,
                      country,
                      error,
                      submitting,
                    })}
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
                    <Text style={{ color: colors.white, fontSize: 16, fontWeight: '600' }}>
                      Continue on-device
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID="cloud-waitlist-submit-btn"
                    onPress={handleSubmit}
                    disabled={!isValidEmail || submitting}
                    accessibilityRole="button"
                    accessibilityLabel="Join the cloud waitlist"
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
                    {submitting && <ActivityIndicator size="small" color={colors.white} />}
                    <Text
                      style={{
                        color: isValidEmail && !submitting ? colors.white : colors.textMuted,
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

function renderEntry({
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
    <View>
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
          fontSize: 28,
          fontWeight: '700',
          color: colors.textPrimary,
          marginTop: 14,
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
          lineHeight: 20,
        }}
      >
        v1 runs entirely on your device. Cloud unlocks bigger models, web search, and computer-use.
        Join the waitlist and we'll email you.
      </Text>

      <View style={{ marginTop: 22 }}>
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
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!submitting}
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
        {error && (
          <Text style={{ marginTop: 6, fontSize: 12, color: colors.agentError }}>{error}</Text>
        )}
      </View>

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
          Country · optional · helps us price fairly
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
          <View style={{ flex: 1 }} />
          <ChevronDown size={16} color={colors.textMuted} />
        </View>
      </View>
    </View>
  );
}

function renderConfirmed({
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
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
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
          fontSize: 28,
          fontWeight: '700',
          color: colors.textPrimary,
          marginTop: 16,
        }}
      >
        You're confirmed.
      </Text>

      <Text
        style={{
          fontSize: 16,
          fontWeight: '600',
          color: colors.teal,
          marginTop: 8,
        }}
        testID="cloud-waitlist-rank"
      >
        {/* rank is 0-indexed from server (count of earlier rows); display as 1-indexed */}#
        {(rank + 1).toLocaleString('en-US')} in line
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: 12,
          textAlign: 'center',
          lineHeight: 20,
          maxWidth: 320,
        }}
      >
        We'll email you when cloud opens. No date promised yet — we'll let you in in waves.
      </Text>

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

function formatToday(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
