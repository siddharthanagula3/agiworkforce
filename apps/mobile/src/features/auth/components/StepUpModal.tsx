import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useSession } from '@clerk/expo';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { useAuthStore } from '@/src/features/auth/store';
import { requestStepUpGrant, type StepUpChallenge, type StepUpLevel } from '../services/stepUp';

type ActiveSession = NonNullable<ReturnType<typeof useSession>['session']>;
type Verification = Awaited<ReturnType<ActiveSession['startVerification']>>;
type SecondFactorStrategy = 'totp' | 'backup_code';

type Prompt =
  | { kind: 'loading' }
  | {
      kind: 'second_factor';
      strategies: readonly SecondFactorStrategy[];
      strategy: SecondFactorStrategy;
    }
  | { kind: 'password'; emailAddressId: string | null }
  | { kind: 'email_offer'; emailAddressId: string; destination: string | null }
  | { kind: 'email_code'; emailAddressId: string; destination: string | null }
  | { kind: 'unavailable' }
  | { kind: 'retry' };

const SECOND_FACTOR_LABELS: Readonly<Record<SecondFactorStrategy, string>> = {
  totp: 'Code from your authenticator app',
  backup_code: 'Backup code',
};

function promptFor(verification: Verification): Prompt | null {
  if (verification.status === 'complete') return null;
  if (verification.status === 'needs_second_factor') {
    const strategies = [
      ...new Set(
        (verification.supportedSecondFactors ?? [])
          .map((factor) => factor.strategy)
          .filter(
            (strategy): strategy is SecondFactorStrategy =>
              strategy === 'totp' || strategy === 'backup_code',
          ),
      ),
    ];
    return strategies[0]
      ? { kind: 'second_factor', strategies, strategy: strategies[0] }
      : { kind: 'unavailable' };
  }
  const factors = verification.supportedFirstFactors ?? [];
  const email = factors.find((factor) => factor.strategy === 'email_code');
  const emailAddressId = email && 'emailAddressId' in email ? email.emailAddressId : null;
  if (factors.some((factor) => factor.strategy === 'password')) {
    return { kind: 'password', emailAddressId };
  }
  if (email && emailAddressId) {
    return {
      kind: 'email_offer',
      emailAddressId,
      destination: 'safeIdentifier' in email ? (email.safeIdentifier ?? null) : null,
    };
  }
  return { kind: 'unavailable' };
}

function verificationFailure(error: unknown, fallback: string): string {
  const first = (error as { errors?: { longMessage?: string; message?: string }[] } | null)
    ?.errors?.[0];
  if (first?.longMessage || first?.message) return (first.longMessage ?? first.message)!;
  return error instanceof Error && error.message ? error.message : fallback;
}

interface StepUpModalProps {
  challenge: StepUpChallenge;
  onCancel: () => void;
  onSatisfied: (token: string) => void;
}

export function StepUpModal({ challenge, onCancel, onSatisfied }: StepUpModalProps) {
  const colors = useThemeColors();
  const { session } = useSession();
  const signOut = useAuthStore((state) => state.signOut);
  const [prompt, setPrompt] = useState<Prompt>({ kind: 'loading' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = useRef({ session, challenge, onSatisfied });
  latest.current = { session, challenge, onSatisfied };

  const show = useCallback((next: Prompt) => {
    setValue('');
    setPrompt(next);
  }, []);

  const flow = useMemo(() => {
    const giveUp = (message: string) => {
      setError(message);
      show({ kind: 'retry' });
    };

    const activeSession = (): ActiveSession => {
      const current = latest.current.session;
      if (!current) throw new Error('You are signed out. Sign in again to continue.');
      return current;
    };

    async function finish(): Promise<void> {
      const current = latest.current.challenge;
      const token = await activeSession().getToken({ skipCache: true });
      if (!token) {
        giveUp('You are signed out. Sign in again to continue.');
        return;
      }
      const outcome = await requestStepUpGrant(current.action, current.resourceId, token);
      if (outcome.kind === 'granted') latest.current.onSatisfied(outcome.token);
      else if (outcome.kind === 'verify')
        giveUp('That confirmation did not reach the server. Try again.');
      else giveUp(outcome.message);
    }

    async function advance(verification: Verification): Promise<void> {
      const next = promptFor(verification);
      if (next) show(next);
      else await finish();
    }

    async function begin(level: StepUpLevel): Promise<void> {
      show({ kind: 'loading' });
      try {
        await advance(await activeSession().startVerification({ level }));
      } catch (cause) {
        giveUp(verificationFailure(cause, 'Confirmation could not start. Try again.'));
      }
    }

    return { activeSession, advance, begin };
  }, [show]);

  useEffect(() => {
    void flow.begin(challenge.level);
  }, [challenge, flow]);

  const run = useCallback(
    async (work: () => Promise<Verification | void>, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        const verification = await work();
        if (verification) await flow.advance(verification);
      } catch (cause) {
        setError(verificationFailure(cause, fallback));
      } finally {
        setBusy(false);
      }
    },
    [flow],
  );

  const entered = value.trim();

  const submit = useCallback(() => {
    if (busy || !entered) return;
    const session = flow.activeSession;
    if (prompt.kind === 'second_factor') {
      void run(
        () =>
          session().attemptSecondFactorVerification({ strategy: prompt.strategy, code: entered }),
        'That code was not accepted.',
      );
    } else if (prompt.kind === 'password') {
      void run(
        () => session().attemptFirstFactorVerification({ strategy: 'password', password: value }),
        'That password was not accepted.',
      );
    } else if (prompt.kind === 'email_code') {
      void run(
        () => session().attemptFirstFactorVerification({ strategy: 'email_code', code: entered }),
        'That code was not accepted.',
      );
    }
  }, [busy, entered, flow, prompt, run, value]);

  const sendEmailCode = useCallback(
    (emailAddressId: string, destination: string | null) =>
      run(async () => {
        await flow
          .activeSession()
          .prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId });
        show({ kind: 'email_code', emailAddressId, destination });
      }, 'The code could not be sent. Try again.'),
    [flow, run, show],
  );

  const retry = useCallback(() => {
    void flow.begin(challenge.level);
  }, [challenge, flow]);

  const inputLabel =
    prompt.kind === 'second_factor'
      ? SECOND_FACTOR_LABELS[prompt.strategy]
      : prompt.kind === 'password'
        ? 'Password'
        : prompt.kind === 'email_code'
          ? `Code sent to ${prompt.destination ?? 'your email address'}`
          : null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView style={styles.flex} behavior={keyboardAvoidingBehavior('modal')}>
        <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
          <View
            style={[
              styles.dialog,
              { backgroundColor: colors.surfaceBase, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>Confirm it is you</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {challenge.consequence}
            </Text>

            {inputLabel ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{inputLabel}</Text>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  editable={!busy}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={prompt.kind === 'password'}
                  keyboardType={
                    prompt.kind === 'password' ||
                    (prompt.kind === 'second_factor' && prompt.strategy === 'backup_code')
                      ? 'default'
                      : 'number-pad'
                  }
                  textContentType={prompt.kind === 'password' ? 'password' : 'oneTimeCode'}
                  onSubmitEditing={submit}
                  accessibilityLabel={inputLabel}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputSurface,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                />
              </View>
            ) : null}

            {prompt.kind === 'loading' ? (
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Checking how you can confirm it is you.
              </Text>
            ) : null}
            {prompt.kind === 'email_offer' ? (
              <Text style={[styles.body, { color: colors.textPrimary }]}>
                We will email a one-time code to {prompt.destination ?? 'your email address'}.
              </Text>
            ) : null}
            {prompt.kind === 'unavailable' ? (
              <Text style={[styles.body, { color: colors.textPrimary }]}>
                This account has no way to confirm it is you here. Sign in again, then retry.
              </Text>
            ) : null}

            {prompt.kind === 'second_factor' && prompt.strategies.length > 1 ? (
              <PressableBox
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  show({
                    ...prompt,
                    strategy: prompt.strategy === 'totp' ? 'backup_code' : 'totp',
                  })
                }
              >
                <Text style={[styles.link, { color: colors.textPrimary }]}>
                  {prompt.strategy === 'totp'
                    ? 'Use a backup code instead'
                    : 'Use your authenticator app instead'}
                </Text>
              </PressableBox>
            ) : null}
            {prompt.kind === 'password' && prompt.emailAddressId ? (
              <PressableBox
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void sendEmailCode(prompt.emailAddressId!, null)}
              >
                <Text style={[styles.link, { color: colors.textPrimary }]}>
                  Email me a code instead
                </Text>
              </PressableBox>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={[styles.body, { color: colors.agentError }]}>
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Button title="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
              {prompt.kind === 'email_offer' ? (
                <Button
                  title="Send code"
                  loading={busy}
                  onPress={() => void sendEmailCode(prompt.emailAddressId, prompt.destination)}
                />
              ) : prompt.kind === 'unavailable' ? (
                <Button title="Sign in again" onPress={() => void signOut()} />
              ) : prompt.kind === 'retry' ? (
                <Button title="Try again" onPress={retry} />
              ) : inputLabel ? (
                <Button title="Confirm" loading={busy} disabled={!entered} onPress={submit} />
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    padding: dialogPadding,
    borderWidth: 1,
    gap: 12,
  },
  title: { fontSize: typeScale.headline, fontWeight: '600' },
  body: { fontSize: typeScale.subhead, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: typeScale.footnote },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: typeScale.body,
  },
  link: { fontSize: typeScale.subhead, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
