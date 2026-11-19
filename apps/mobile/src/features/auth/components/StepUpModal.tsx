import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, StyleSheet, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { useAuthStore } from '@/src/features/auth/store';
import { requestStepUpGrant, type StepUpChallenge, type StepUpSession } from '../services/stepUp';

type Verification = Awaited<ReturnType<StepUpSession['startVerification']>>;
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

export function StepUpModal(props: StepUpModalProps) {
  const [binding] = useState(() => props);
  const { challenge, onCancel, onSatisfied } = binding;
  const colors = useThemeColors();
  const signOutAllAccounts = useAuthStore((state) => state.signOutAllAccounts);
  const [prompt, setPrompt] = useState<Prompt>({ kind: 'loading' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lifecycle = useRef({ mounted: false, operation: 0, locked: false });
  const current = useCallback(
    () => lifecycle.current.mounted && challenge.isCurrent(),
    [challenge],
  );
  const show = useCallback(
    (next: Prompt) => {
      if (!current()) return;
      setValue('');
      setPrompt(next);
    },
    [current],
  );

  const flow = useMemo(() => {
    const session = challenge.identity.session;
    const owns = (operation: number) => current() && lifecycle.current.operation === operation;
    const giveUp = (operation: number, message: string) => {
      if (!owns(operation)) return;
      setError(message);
      show({ kind: 'retry' });
    };
    async function advance(operation: number, verification: Verification): Promise<void> {
      if (!owns(operation)) return;
      const next = promptFor(verification);
      if (next) {
        show(next);
        return;
      }
      const token = await session.getToken({ skipCache: true });
      if (!owns(operation)) return;
      if (!token) {
        giveUp(operation, 'You are signed out. Sign in again to continue.');
        return;
      }
      const outcome = await requestStepUpGrant(challenge.action, challenge.resourceId, token, {
        accountEpoch: challenge.identity.account,
        signal: challenge.signal,
      });
      if (!owns(operation)) return;
      if (outcome.kind === 'granted') onSatisfied(outcome.token);
      else if (outcome.kind === 'verify')
        giveUp(operation, 'That confirmation did not reach the server. Try again.');
      else giveUp(operation, outcome.message);
    }
    async function run(
      work: (operation: number) => Promise<Verification | void>,
      fallback: string,
      restart = false,
    ): Promise<void> {
      if (!current() || lifecycle.current.locked) return;
      lifecycle.current.locked = true;
      const operation = ++lifecycle.current.operation;
      setBusy(true);
      setError(null);
      try {
        const verification = await work(operation);
        if (!owns(operation)) return;
        if (verification) await advance(operation, verification);
      } catch (cause) {
        if (!owns(operation)) return;
        const message = verificationFailure(cause, fallback);
        if (restart) giveUp(operation, message);
        else setError(message);
      } finally {
        if (owns(operation)) {
          lifecycle.current.locked = false;
          setBusy(false);
        }
      }
    }
    const begin = () =>
      run(
        async () => {
          show({ kind: 'loading' });
          return session.startVerification({ level: challenge.level });
        },
        'Confirmation could not start. Try again.',
        true,
      );
    return { session, owns, run, begin };
  }, [challenge, current, onSatisfied, show]);

  useEffect(() => {
    const activeLifecycle = lifecycle.current;
    activeLifecycle.mounted = true;
    activeLifecycle.locked = false;
    void flow.begin();
    return () => {
      activeLifecycle.mounted = false;
      activeLifecycle.operation += 1;
      activeLifecycle.locked = false;
    };
  }, [flow]);

  const renderedOperation = lifecycle.current.operation;
  const interactionCurrent = useCallback(
    () =>
      current() && lifecycle.current.operation === renderedOperation && !lifecycle.current.locked,
    [current, renderedOperation],
  );
  const entered = value.trim();
  const submit = useCallback(() => {
    if (!interactionCurrent() || !entered) return;
    if (prompt.kind === 'second_factor') {
      void flow.run(
        async () =>
          flow.session.attemptSecondFactorVerification({
            strategy: prompt.strategy,
            code: entered,
          }),
        'That code was not accepted.',
      );
    } else if (prompt.kind === 'password') {
      void flow.run(
        async () =>
          flow.session.attemptFirstFactorVerification({ strategy: 'password', password: value }),
        'That password was not accepted.',
      );
    } else if (prompt.kind === 'email_code') {
      void flow.run(
        async () =>
          flow.session.attemptFirstFactorVerification({ strategy: 'email_code', code: entered }),
        'That code was not accepted.',
      );
    }
  }, [interactionCurrent, entered, flow, prompt, value]);

  const sendEmailCode = useCallback(
    (emailAddressId: string, destination: string | null) => {
      if (!interactionCurrent()) return;
      return flow.run(async (operation) => {
        await flow.session.prepareFirstFactorVerification({
          strategy: 'email_code',
          emailAddressId,
        });
        if (flow.owns(operation)) show({ kind: 'email_code', emailAddressId, destination });
      }, 'The code could not be sent. Try again.');
    },
    [flow, interactionCurrent, show],
  );
  const cancel = useCallback(() => {
    if (!current()) return;
    lifecycle.current.operation += 1;
    lifecycle.current.mounted = false;
    setValue('');
    onCancel();
  }, [current, onCancel]);

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
      onRequestClose={cancel}
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
                  onChangeText={(next) => {
                    if (interactionCurrent()) setValue(next);
                  }}
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
                onPress={() => {
                  if (!interactionCurrent()) return;
                  lifecycle.current.operation += 1;
                  show({
                    ...prompt,
                    strategy: prompt.strategy === 'totp' ? 'backup_code' : 'totp',
                  });
                }}
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
              <Button title="Cancel" variant="ghost" onPress={cancel} />
              {prompt.kind === 'email_offer' ? (
                <Button
                  title="Send code"
                  loading={busy}
                  onPress={() => void sendEmailCode(prompt.emailAddressId, prompt.destination)}
                />
              ) : prompt.kind === 'unavailable' ? (
                <Button
                  title="Sign in again"
                  onPress={() => {
                    if (!interactionCurrent()) return;
                    cancel();
                    void signOutAllAccounts().catch((err: unknown) => {
                      console.warn('[StepUpModal] sign-out for a fresh sign-in failed:', err);
                    });
                  }}
                />
              ) : prompt.kind === 'retry' ? (
                <Button
                  title="Try again"
                  onPress={() => {
                    if (interactionCurrent()) void flow.begin();
                  }}
                />
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
