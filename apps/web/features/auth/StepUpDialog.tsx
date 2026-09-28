'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from '@agiworkforce/ui';
import {
  useSessionReverification,
  useSignOut,
  type IdentityEmailCodeFactor,
  type IdentityReverificationStep,
  type IdentitySecondFactorMethod,
} from '@/lib/identity/client';
import { classifyAuthError, type AuthErrorKind } from '@/lib/auth/error-taxonomy';
import { toUserMessage } from '@/lib/user-error-message';
import type { StepUpAction, StepUpLevel } from '@/lib/server/step-up/actions';
import { useAuthCopy } from './authCopy';
import { AUTH_LOGIN_PATH } from './authRoutes';
import { requestStepUpGrant } from './step-up-fetch';

export interface StepUpDialogProps {
  open: boolean;
  action: StepUpAction;
  consequence: string;
  resourceId?: string | null;
  level: StepUpLevel | null;
  onCancel: () => void;
  onSatisfied: (token: string) => void | Promise<void>;
}

type Prompt =
  | { kind: 'loading' }
  | {
      kind: 'second_factor';
      methods: readonly IdentitySecondFactorMethod[];
      method: IdentitySecondFactorMethod;
    }
  | { kind: 'password'; emailCode: IdentityEmailCodeFactor | null; passkey: boolean }
  | { kind: 'email_offer'; emailCode: IdentityEmailCodeFactor; passkey: boolean }
  | { kind: 'email_code'; emailCode: IdentityEmailCodeFactor }
  | { kind: 'passkey' }
  | { kind: 'unavailable' }
  | { kind: 'retry' };

const SECOND_FACTOR_LABELS: Readonly<Record<IdentitySecondFactorMethod, string>> = {
  authenticator: 'Code from your authenticator app',
  backup_code: 'Backup code',
};

const SECOND_FACTOR_SWITCH: Readonly<Record<IdentitySecondFactorMethod, string>> = {
  authenticator: 'Use your authenticator app instead',
  backup_code: 'Use a backup code instead',
};

function promptFor(step: Exclude<IdentityReverificationStep, { kind: 'complete' }>): Prompt {
  switch (step.kind) {
    case 'second_factor':
      return { kind: 'second_factor', methods: step.methods, method: step.methods[0]! };
    case 'first_factor':
      if (step.password) {
        return { kind: 'password', emailCode: step.emailCode, passkey: step.passkey };
      }
      if (step.emailCode) {
        return { kind: 'email_offer', emailCode: step.emailCode, passkey: step.passkey };
      }
      return { kind: 'passkey' };
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}

const REJECTED_FACTOR_KINDS: ReadonlySet<AuthErrorKind> = new Set([
  'code_incorrect',
  'code_expired',
  'credentials_invalid',
  'passkey_dismissed',
  'passkey_unrecognized',
]);

function destinationOf(factor: IdentityEmailCodeFactor): string {
  return factor.destination ?? 'your email address';
}

function signInAgainUrl(): string {
  const here = `${window.location.pathname}${window.location.search}`;
  return `${AUTH_LOGIN_PATH}?redirectTo=${encodeURIComponent(here)}`;
}

export function StepUpDialog({
  open,
  action,
  consequence,
  resourceId = null,
  level,
  onCancel,
  onSatisfied,
}: StepUpDialogProps) {
  const reverification = useSessionReverification();
  const signOut = useSignOut();
  const copy = useAuthCopy();
  const [prompt, setPrompt] = useState<Prompt>({ kind: 'loading' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restartedRef = useRef(false);

  const describe = useCallback(
    (cause: unknown, fallback: string): string => {
      const descriptor = classifyAuthError(cause);
      if (descriptor.vendorMessage) return descriptor.vendorMessage;
      if (REJECTED_FACTOR_KINDS.has(descriptor.kind)) return fallback;
      if (descriptor.kind === 'unexpected') return toUserMessage(cause, fallback);
      return copy.errorCopy(descriptor.kind).message;
    },
    [copy],
  );

  const latest = useRef({ action, resourceId, onSatisfied, reverification, describe });
  latest.current = { action, resourceId, onSatisfied, reverification, describe };

  const show = useCallback((next: Prompt) => {
    setValue('');
    setPrompt(next);
  }, []);

  const flow = useMemo(() => {
    const giveUp = (message: string) => {
      setError(message);
      show({ kind: 'retry' });
    };

    async function finish(): Promise<void> {
      const current = latest.current;
      const outcome = await requestStepUpGrant(
        current.action,
        current.resourceId,
        await current.reverification.freshToken(),
      );
      if (outcome.kind === 'granted') {
        await current.onSatisfied(outcome.token);
        return;
      }
      if (outcome.kind === 'verify' && !restartedRef.current) {
        restartedRef.current = true;
        await begin(outcome.level);
        return;
      }
      giveUp(outcome.message);
    }

    async function advance(step: IdentityReverificationStep): Promise<void> {
      if (step.kind === 'complete') await finish();
      else show(promptFor(step));
    }

    async function begin(requested: StepUpLevel): Promise<void> {
      show({ kind: 'loading' });
      try {
        await advance(await latest.current.reverification.start(requested));
      } catch (cause) {
        giveUp(latest.current.describe(cause, 'Confirmation could not start. Try again.'));
      }
    }

    async function attemptWithoutPrompt(): Promise<void> {
      show({ kind: 'loading' });
      try {
        const { action: current, resourceId: target, onSatisfied: satisfied } = latest.current;
        const outcome = await requestStepUpGrant(current, target);
        if (outcome.kind === 'granted') await satisfied(outcome.token);
        else if (outcome.kind === 'verify') await begin(outcome.level);
        else giveUp(outcome.message);
      } catch (cause) {
        giveUp(latest.current.describe(cause, 'Your identity could not be confirmed. Try again.'));
      }
    }

    return { advance, begin, attemptWithoutPrompt };
  }, [show]);

  useEffect(() => {
    if (!open) {
      setPrompt({ kind: 'loading' });
      setValue('');
      setError(null);
      setBusy(false);
      restartedRef.current = false;
      return;
    }
    void (level ? flow.begin(level) : flow.attemptWithoutPrompt());
  }, [flow, level, open]);

  const run = useCallback(
    async (work: () => Promise<IdentityReverificationStep | void>, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        const step = await work();
        if (step) await flow.advance(step);
      } catch (cause) {
        setError(describe(cause, fallback));
      } finally {
        setBusy(false);
      }
    },
    [describe, flow],
  );

  const submit = useCallback(() => {
    const entered = value.trim();
    switch (prompt.kind) {
      case 'second_factor':
        return run(
          () => reverification.verifySecondFactor(prompt.method, entered),
          'That code was not accepted.',
        );
      case 'password':
        return run(() => reverification.verifyPassword(value), 'That password was not accepted.');
      case 'email_code':
        return run(() => reverification.verifyEmailCode(entered), 'That code was not accepted.');
      default:
        return undefined;
    }
  }, [prompt, reverification, run, value]);

  const sendEmailCode = useCallback(
    (emailCode: IdentityEmailCodeFactor) =>
      run(async () => {
        await reverification.sendEmailCode(emailCode);
        show({ kind: 'email_code', emailCode });
      }, 'The code could not be sent. Try again.'),
    [reverification, run, show],
  );

  const confirmWithPasskey = useCallback(
    () => run(() => reverification.verifyPasskey(), 'The passkey was not accepted.'),
    [reverification, run],
  );

  const retry = useCallback(async () => {
    setBusy(true);
    setError(null);
    restartedRef.current = false;
    try {
      await flow.attemptWithoutPrompt();
    } finally {
      setBusy(false);
    }
  }, [flow]);

  const signInAgain = useCallback(() => {
    setBusy(true);
    void signOut({ redirectUrl: signInAgainUrl() });
  }, [signOut]);

  const inputField = (
    id: string,
    label: string,
    props: Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode'>,
  ): ReactNode => (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim().length > 0 && !busy) {
            event.preventDefault();
            void submit();
          }
        }}
        className="border-border bg-background text-foreground"
        {...props}
      />
    </div>
  );

  const alternative = (label: string, onSelect: () => void): ReactNode => (
    <button
      type="button"
      disabled={busy}
      onClick={onSelect}
      className="text-sm text-foreground underline underline-offset-2 disabled:opacity-50"
    >
      {label}
    </button>
  );

  let body: ReactNode = null;
  let primary: { label: string; onClick: () => void; disabled: boolean } | null = null;
  const needsValue = busy || value.trim().length === 0;

  switch (prompt.kind) {
    case 'loading':
      body = <Spinner size="sm" aria-label="Preparing the confirmation" />;
      break;
    case 'second_factor': {
      const other = prompt.methods.find((method) => method !== prompt.method);
      body = (
        <div className="space-y-3">
          {inputField('step-up-code', SECOND_FACTOR_LABELS[prompt.method], {
            autoComplete: 'one-time-code',
            inputMode: prompt.method === 'authenticator' ? 'numeric' : 'text',
          })}
          {other
            ? alternative(SECOND_FACTOR_SWITCH[other], () => show({ ...prompt, method: other }))
            : null}
        </div>
      );
      primary = { label: 'Confirm', onClick: () => void submit(), disabled: needsValue };
      break;
    }
    case 'password': {
      const { emailCode, passkey } = prompt;
      body = (
        <div className="space-y-3">
          {inputField('step-up-password', 'Password', {
            type: 'password',
            autoComplete: 'current-password',
          })}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {emailCode
              ? alternative('Email me a code instead', () => void sendEmailCode(emailCode))
              : null}
            {passkey ? alternative('Use a passkey instead', () => void confirmWithPasskey()) : null}
          </div>
        </div>
      );
      primary = { label: 'Confirm', onClick: () => void submit(), disabled: needsValue };
      break;
    }
    case 'email_offer':
      body = (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            We will email a one-time code to {destinationOf(prompt.emailCode)}.
          </p>
          {prompt.passkey
            ? alternative('Use a passkey instead', () => void confirmWithPasskey())
            : null}
        </div>
      );
      primary = {
        label: 'Send code',
        onClick: () => void sendEmailCode(prompt.emailCode),
        disabled: busy,
      };
      break;
    case 'email_code': {
      const { emailCode } = prompt;
      body = (
        <div className="space-y-3">
          {inputField('step-up-email-code', `Code sent to ${destinationOf(emailCode)}`, {
            autoComplete: 'one-time-code',
            inputMode: 'numeric',
          })}
          {alternative('Send a new code', () => void sendEmailCode(emailCode))}
        </div>
      );
      primary = { label: 'Confirm', onClick: () => void submit(), disabled: needsValue };
      break;
    }
    case 'passkey':
      body = <p className="text-sm text-foreground">Use a passkey saved for this account.</p>;
      primary = { label: 'Use passkey', onClick: () => void confirmWithPasskey(), disabled: busy };
      break;
    case 'unavailable':
      body = (
        <p className="text-sm text-foreground">
          This account has no way to confirm it is you from here. Sign in again, then retry.
        </p>
      );
      primary = { label: 'Sign in again', onClick: signInAgain, disabled: busy };
      break;
    case 'retry':
      primary = { label: 'Try again', onClick: () => void retry(), disabled: busy };
      break;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">
            Confirm it is you
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {consequence}
          </DialogDescription>
        </DialogHeader>

        {body}

        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          {primary ? (
            <Button type="button" disabled={primary.disabled} onClick={primary.onClick}>
              {busy ? <Spinner size="sm" className="me-2" aria-label="Checking" /> : null}
              {primary.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
