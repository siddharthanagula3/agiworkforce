import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
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
import { Cloud as CloudIcon, X, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { redeemInviteCode, joinWaitlist } from '@/src/features/waitlist/service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import type { InviteCodeError, InviteCodeModalProps } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_COUNTRY = { code: 'IN', name: 'India', flag: '🇮🇳' };

function friendlyInviteError(code?: InviteCodeError): string {
  switch (code) {
    case 'invalid_code':
      return "That code doesn't look right. Double-check and try again.";
    case 'expired':
      return 'That code has expired. Join the waitlist to get a fresh one.';
    case 'fully_redeemed':
      return 'That code is fully redeemed. Try another or join the waitlist.';
    case 'already_redeemed_by_user':
      return "You've already used this code. Cloud should be unlocked.";
    case 'anon_signin_failed':
      return "Couldn't create your session. Try again in a moment.";
    case 'rpc_error':
      return 'Something went wrong on our end. Try again.';
    default:
      return 'Something went wrong. Try again or join the waitlist.';
  }
}

// ---------------------------------------------------------------------------
// InviteTab
// ---------------------------------------------------------------------------

type InviteState = 'idle' | 'loading' | 'success' | 'error';

interface InviteTabProps {
  source: InviteCodeModalProps['source'];
  onSwitchToWaitlist: () => void;
  onRedeemed?: (inviteId: string) => void;
  onClose: () => void;
}

function InviteTab({ source, onSwitchToWaitlist, onRedeemed, onClose }: InviteTabProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const markInviteRedeemed = useWaitlistStore((s) => s.markInviteRedeemed);
  const [code, setCode] = useState('');
  const [state, setState] = useState<InviteState>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmedCode = code.trim().toUpperCase();
  const canSubmit = trimmedCode.length >= 6 && state !== 'loading';

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setState('loading');

    const result = await redeemInviteCode(trimmedCode, source);

    if (!result.success) {
      setError(friendlyInviteError(result.error));
      setState('error');
      return;
    }

    setState('success');
    markInviteRedeemed({ code: trimmedCode, inviteId: result.inviteId });
    if (result.inviteId) onRedeemed?.(result.inviteId);
    setTimeout(() => {
      onClose();
      if (FEATURES.auth) {
        router.push('/(auth)/login' as never);
      }
    }, 1500);
  }, [canSubmit, trimmedCode, source, markInviteRedeemed, onRedeemed, onClose, router]);

  if (state === 'success') {
    return (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.agentSuccess,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={24} color={colors.white} strokeWidth={2.5} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
          Cloud unlocked!
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary }}>Closing in a moment…</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: '600',
          }}
        >
          Invitation code
        </Text>
        <TextInput
          testID="invite-code-input"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="XXXXXXXX"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={state !== 'loading'}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: error ? colors.agentError : colors.border,
            backgroundColor: colors.surfaceElevated,
            fontSize: 15,
            fontFamily: 'monospace',
            letterSpacing: 3,
            color: colors.textPrimary,
          }}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ fontSize: 12, color: colors.agentError, marginTop: 2 }}
          >
            {error}
          </Text>
        ) : null}
      </View>

      <Pressable
        testID="invite-code-submit-btn"
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Unlock cloud"
        style={{
          backgroundColor: canSubmit ? colors.teal : colors.surfaceHover,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {state === 'loading' ? (
          <>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: '600' }}>
              Validating…
            </Text>
          </>
        ) : (
          <Text
            style={{
              color: canSubmit ? colors.white : colors.textMuted,
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Unlock cloud
          </Text>
        )}
      </Pressable>

      <Pressable onPress={onSwitchToWaitlist} accessibilityRole="button" hitSlop={8}>
        <Text style={{ textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          Don't have a code?{' '}
          <Text style={{ color: colors.teal, textDecorationLine: 'underline' }}>
            Join the waitlist
          </Text>
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// WaitlistTab — preserves mobile rank+country UX from CloudWaitlistSheet
// ---------------------------------------------------------------------------

type WaitlistState = 'idle' | 'submitting' | 'confirmed' | 'error';

interface WaitlistTabProps {
  onWaitlisted?: (email: string) => void;
  onClose: () => void;
}

function WaitlistTab({ onWaitlisted, onClose }: WaitlistTabProps) {
  const colors = useThemeColors();
  const markWaitlistJoined = useWaitlistStore((s) => s.markJoined);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<WaitlistState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);

  const isValidEmail = EMAIL_RE.test(email.trim());
  const submitting = state === 'submitting';
  const canSubmit = isValidEmail && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setState('submitting');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await joinWaitlist({
        email: normalizedEmail,
        country: DEFAULT_COUNTRY.code,
      });
      markWaitlistJoined({ email: normalizedEmail, country: DEFAULT_COUNTRY.code }, result);
      setRank(result.rank);
      setState('confirmed');
      onWaitlisted?.(normalizedEmail);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setState('error');
    }
  }, [canSubmit, email, markWaitlistJoined, onWaitlisted, onClose]);

  if (state === 'confirmed' && rank !== null) {
    return (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.agentSuccess,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={32} color={colors.white} strokeWidth={2.5} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary }}>
          You're confirmed.
        </Text>
        <Text
          testID="cloud-waitlist-rank"
          style={{ fontSize: 16, fontWeight: '600', color: colors.teal }}
        >
          #{(rank + 1).toLocaleString('en-US')} in line
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          We'll email you when cloud opens.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
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
          returnKeyType="next"
          style={{
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
      </View>

      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: '600',
          }}
        >
          Name · optional
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          autoComplete="name"
          editable={!submitting}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            fontSize: 15,
            color: colors.textPrimary,
          }}
        />
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: 12, color: colors.agentError }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="cloud-waitlist-submit-btn"
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Join the cloud waitlist"
        style={{
          backgroundColor: canSubmit ? colors.teal : colors.surfaceHover,
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {submitting ? (
          <>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: '600' }}>Joining…</Text>
          </>
        ) : (
          <Text
            style={{
              color: canSubmit ? colors.white : colors.textMuted,
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Join waitlist
          </Text>
        )}
      </Pressable>

      <Text style={{ textAlign: 'center', fontSize: 11, color: colors.textMuted }}>
        No account created. Email used only to notify you.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// InviteCodeModal
// ---------------------------------------------------------------------------

export function InviteCodeModal({
  open,
  onClose,
  source,
  defaultTab = 'invite',
  onRedeemed,
  onWaitlisted,
}: InviteCodeModalProps) {
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<'invite' | 'waitlist'>(defaultTab);

  useEffect(() => {
    if (open) setActiveTab(defaultTab);
  }, [open, defaultTab]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      testID="invite-code-modal"
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        onPress={handleClose}
        accessibilityLabel="Close cloud features modal"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
      >
        <Pressable
          onPress={() => {
            /* swallow taps */
          }}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight: '92%',
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView edges={['bottom']}>
              {/* drag handle */}
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

              {/* header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  paddingHorizontal: 22,
                  paddingTop: 14,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: colors.surfaceHover,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloudIcon size={20} color={colors.textSecondary} strokeWidth={1.6} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
                    Cloud features
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                    Cloud features are gated for v1. Join the waitlist, or enter your invitation
                    code below to unlock AGI Managed Cloud routing with explicit retention,
                    residency, quota, and access controls.
                  </Text>
                </View>
                <Pressable
                  testID="invite-code-modal-close"
                  onPress={handleClose}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={10}
                >
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* tab bar */}
              <View
                style={{
                  flexDirection: 'row',
                  marginHorizontal: 22,
                  marginTop: 16,
                  borderRadius: 12,
                  backgroundColor: colors.surfaceHover,
                  padding: 3,
                  gap: 3,
                }}
              >
                {(['invite', 'waitlist'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    testID={`invite-code-tab-${tab}`}
                    onPress={() => setActiveTab(tab)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activeTab === tab }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: activeTab === tab ? colors.background : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: activeTab === tab ? '600' : '400',
                        color: activeTab === tab ? colors.textPrimary : colors.textMuted,
                      }}
                    >
                      {tab === 'invite' ? 'Enter invitation code' : 'Join waitlist'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* tab content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 }}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {activeTab === 'invite' ? (
                  <InviteTab
                    source={source}
                    onSwitchToWaitlist={() => setActiveTab('waitlist')}
                    onRedeemed={onRedeemed}
                    onClose={handleClose}
                  />
                ) : (
                  <WaitlistTab onWaitlisted={onWaitlisted} onClose={handleClose} />
                )}
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
