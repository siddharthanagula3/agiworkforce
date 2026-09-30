'use client';

import { useCallback, useState } from 'react';
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
import { useEmailAddressVerification } from '@/lib/identity/client';
import { classifyAuthError } from '@/lib/auth/error-taxonomy';
import { useAuthCopy } from '@/features/auth/authCopy';
import { isStepUpCancelled, sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/use-step-up';
import { toUserMessage } from '@/lib/user-error-message';

const ENDPOINT = '/api/settings/email';

type Stage =
  | { name: 'address' }
  | { name: 'code'; emailAddressId: string; emailAddress: string }
  | { name: 'confirmed'; emailAddressId: string; emailAddress: string }
  | { name: 'done'; emailAddress: string; previousAddressRemoved: boolean };

interface EmailAddressChangeProps {
  currentEmail: string | null;
  onChanged: (emailAddress: string) => void;
  onClose: () => void;
}

async function readFailure(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
  } | null;
  const message = typeof body?.error === 'string' ? body.error : (body?.error?.message ?? '');
  return toUserMessage(Object.assign(new Error(message), { status: response.status }), fallback);
}

export function EmailAddressChange({ currentEmail, onChanged, onClose }: EmailAddressChangeProps) {
  const verification = useEmailAddressVerification();
  const copy = useAuthCopy();
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const [stage, setStage] = useState<Stage>({ name: 'address' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const describe = useCallback(
    (cause: unknown, fallback: string): string => {
      const descriptor = classifyAuthError(cause);
      if (descriptor.vendorMessage) return descriptor.vendorMessage;
      if (descriptor.kind === 'unexpected') return toUserMessage(cause, fallback);
      return copy.errorCopy(descriptor.kind).message;
    },
    [copy],
  );

  const attempt = useCallback(
    async (work: () => Promise<void>, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        await work();
      } catch (cause) {
        if (!isStepUpCancelled(cause)) setError(describe(cause, fallback));
      } finally {
        setBusy(false);
      }
    },
    [describe],
  );

  const makePrimary = useCallback(
    async (emailAddressId: string) => {
      const response = await withStepUp(
        (headers) =>
          sendAuthorizedJson(ENDPOINT, { method: 'PATCH', body: { emailAddressId } }, headers),
        emailAddressId,
      );
      if (!response.ok) {
        setError(await readFailure(response, 'Your email address was not changed.'));
        return;
      }
      const result = (await response.json()) as {
        emailAddress: string;
        previousAddressRemoved: boolean;
      };
      await verification.refresh();
      onChanged(result.emailAddress);
      setStage({ name: 'done', ...result });
    },
    [onChanged, verification, withStepUp],
  );

  const startChange = useCallback(
    (emailAddress: string) =>
      attempt(async () => {
        const response = await withStepUp((headers) =>
          sendAuthorizedJson(ENDPOINT, { method: 'POST', body: { emailAddress } }, headers),
        );
        if (!response.ok) {
          setError(await readFailure(response, 'That address could not be added.'));
          return;
        }
        const { emailAddressId, verified } = (await response.json()) as {
          emailAddressId: string;
          verified: boolean;
        };
        setValue('');
        if (verified) {
          setStage({ name: 'confirmed', emailAddressId, emailAddress });
          await makePrimary(emailAddressId);
          return;
        }
        await verification.sendCode(emailAddressId);
        setStage({ name: 'code', emailAddressId, emailAddress });
      }, 'That address could not be added.'),
    [attempt, makePrimary, verification, withStepUp],
  );

  const finishChange = useCallback(
    (emailAddressId: string) =>
      attempt(() => makePrimary(emailAddressId), 'Your email address was not changed.'),
    [attempt, makePrimary],
  );

  const confirmCode = useCallback(
    async (emailAddressId: string, emailAddress: string, code: string) => {
      let verified = false;
      await attempt(async () => {
        await verification.verifyCode(emailAddressId, code);
        verified = true;
      }, 'That code was not accepted.');
      if (!verified) return;
      setValue('');
      setStage({ name: 'confirmed', emailAddressId, emailAddress });
      await finishChange(emailAddressId);
    },
    [attempt, finishChange, verification],
  );

  const resendCode = useCallback(
    (emailAddressId: string) =>
      attempt(() => verification.sendCode(emailAddressId), 'A new code could not be sent.'),
    [attempt, verification],
  );

  const entered = value.trim();
  const ready = stage.name === 'confirmed' || entered.length > 0;
  const submit = () => {
    if (busy || !ready) return;
    if (stage.name === 'address') void startChange(entered);
    if (stage.name === 'code') void confirmCode(stage.emailAddressId, stage.emailAddress, entered);
    if (stage.name === 'confirmed') void finishChange(stage.emailAddressId);
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => (next || busy ? undefined : onClose())}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Change email address
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {stage.name === 'done'
                ? `Your account now uses ${stage.emailAddress}.`
                : `Password resets and security notices go to the new address. Current address: ${currentEmail ?? 'none'}.`}
            </DialogDescription>
          </DialogHeader>

          {stage.name === 'done' ? (
            stage.previousAddressRemoved ? null : (
              <p className="text-sm text-foreground">
                Your previous address stays on the account because a sign-in method still uses it.
              </p>
            )
          ) : stage.name === 'confirmed' ? (
            <p className="text-sm text-foreground">
              {stage.emailAddress} is verified. Change address to start using it.
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="email-change-input" className="text-sm font-medium text-foreground">
                {stage.name === 'address'
                  ? 'New email address'
                  : `Code sent to ${stage.emailAddress}`}
              </label>
              <Input
                id="email-change-input"
                type={stage.name === 'address' ? 'email' : 'text'}
                inputMode={stage.name === 'address' ? 'email' : 'numeric'}
                autoComplete={stage.name === 'address' ? 'email' : 'one-time-code'}
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  submit();
                }}
                className="border-border bg-background text-foreground"
              />
              {stage.name === 'code' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resendCode(stage.emailAddressId)}
                  className="text-sm text-foreground underline underline-offset-2 disabled:opacity-50"
                >
                  Send a new code
                </button>
              ) : null}
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            {stage.name === 'done' ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy || !ready} onClick={submit}>
                  {busy ? <Spinner size="sm" className="me-2" aria-label="Working" /> : null}
                  {stage.name === 'address' ? 'Send code' : 'Change address'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {stepUpDialog}
    </>
  );
}
