'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { StepUpAction } from '@/lib/server/step-up/actions';

export interface StepUpDialogProps {
  open: boolean;
  action: StepUpAction;
  /** What the person is about to do, in their words, not the action id. */
  consequence: string;
  /** Binds the proof to one target; must match what the route requires. */
  resourceId?: string | null;
  onCancel: () => void;
  onSatisfied: (token: string) => void | Promise<void>;
}

interface ChallengeResponse {
  token?: string;
  error?: { message?: string };
}

export async function requestStepUpToken(
  action: StepUpAction,
  code: string,
  resourceId?: string | null,
): Promise<{ token?: string; error?: string; status: number }> {
  const authToken = await getAuthToken();
  if (!authToken) return { error: 'You are signed out. Sign in again to continue.', status: 401 };

  const response = await fetch('/api/auth/step-up', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'x-csrf-token': await getCsrfToken(),
    },
    body: JSON.stringify({ action, code, ...(resourceId ? { resourceId } : {}) }),
  });

  const body = (await response.json().catch(() => ({}))) as ChallengeResponse;
  if (!response.ok || !body.token) {
    return {
      error: body.error?.message ?? 'That code was not accepted.',
      status: response.status,
    };
  }
  return { token: body.token, status: response.status };
}

export function StepUpDialog({
  open,
  action,
  consequence,
  resourceId = null,
  onCancel,
  onSatisfied,
}: StepUpDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setCode('');
    setError(null);
    setNotEnrolled(false);
    setBusy(false);
  }, [open]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const minted = await requestStepUpToken(action, code.trim(), resourceId);
    setBusy(false);
    if (!minted.token) {
      setNotEnrolled(minted.status === 409);
      setError(minted.error ?? 'That code was not accepted.');
      return;
    }
    setCode('');
    await onSatisfied(minted.token);
  }, [action, code, resourceId, onSatisfied]);

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

        <div className="space-y-2">
          <label htmlFor="step-up-code" className="text-sm font-medium text-foreground">
            Authenticator or backup code
          </label>
          <Input
            id="step-up-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            disabled={notEnrolled}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.trim().length > 0 && !busy) {
                event.preventDefault();
                void submit();
              }
            }}
            className="max-w-[14rem] border-border bg-background font-mono text-foreground"
          />
          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
              {notEnrolled ? (
                <>
                  {' '}
                  <a className="underline" href="/settings/security">
                    Set up two-factor authentication
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || notEnrolled || code.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? <Spinner size="sm" className="mr-2" aria-label="Checking your code" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
