'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { ShieldCheck } from 'lucide-react';
import {
  ACCOUNT_SECURITY_CREDENTIAL_NAME_MAX_LENGTH,
  ACCOUNT_SECURITY_ENROLLMENT_CODE_LENGTH,
  ACCOUNT_SECURITY_POLICY,
  type AccountSecurityCredential,
  type AccountSecurityStatus,
} from '@agiworkforce/cloud-contracts/account-security';

import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/use-step-up';
import { isPasskeyCancellation } from '@features/settings/lib/passkey-cancellation';
import { toUserMessage } from '@/lib/user-error-message';
import {
  addCredential,
  cancelRecovery,
  canUseWebAuthn,
  confirmReplacementRecoveryKeys,
  disableAccountSecurity,
  enrollAccountSecurity,
  fetchAccountSecurityStatus,
  generateRecoveryKeys,
  removeCredential,
  sendEnrollmentCode,
  verifyWithPasskey,
  type StepUpRunner,
} from '../lib/account-security-client';
import { RecoveryKeysSheet } from './RecoveryKeysSheet';

type Setup =
  | { step: 'closed' }
  | { step: 'methods' }
  | { step: 'keys'; keys: string[] | null }
  | { step: 'email'; sentTo: string; expiresAt: string };

const HOLD_HOURS = ACCOUNT_SECURITY_POLICY.recoveryHoldHours;
const MINIMUM_METHODS = ACCOUNT_SECURITY_POLICY.minimumSignInMethods;
const CODE_LENGTH = ACCOUNT_SECURITY_ENROLLMENT_CODE_LENGTH;
const UNDO_HOURS = ACCOUNT_SECURITY_POLICY.undoHours;
const VERIFY_DAYS = ACCOUNT_SECURITY_POLICY.verificationLifetimeHours / 24;

const WHAT_CHANGES = [
  'Signing in needs one of your passkeys or security keys. A password or an email code alone no longer gets in.',
  `Email account recovery no longer restores access. A recovery key starts recovery, and the account unlocks ${HOLD_HOURS} hours later.`,
  `Every new sign-in is emailed to you, and each session has to be confirmed with your passkey or security key again every ${VERIFY_DAYS} days.`,
  'Every other device is signed out when you turn it on. The CLI, VS Code, the Chrome extension and the desktop app have to be linked again.',
] as const;

const LOSS_WARNING =
  'If you lose every passkey, security key and recovery key, you can lose access to your account for good. AGI support cannot turn this off, add a sign-in method or restore access for you.';

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function describeCredential(credential: AccountSecurityCredential): string {
  return [
    credential.kind === 'security_key' ? 'Security key' : 'Passkey',
    credential.worksAcrossDevices ? 'Works across devices' : 'This device only',
    `Added ${formatWhen(credential.createdAt)}`,
    credential.lastUsedAt ? `Last used ${formatWhen(credential.lastUsedAt)}` : 'Not used yet',
  ].join(' · ');
}

function quietFailure(error: unknown): boolean {
  return isPasskeyCancellation(error) || isStepUpCancelled(error);
}

function CredentialList({
  credentials,
  busy,
  onRemove,
}: {
  credentials: readonly AccountSecurityCredential[];
  busy: boolean;
  onRemove: (credential: AccountSecurityCredential) => void;
}) {
  if (credentials.length === 0) {
    return <p className="text-sm text-muted-foreground">No passkeys or security keys yet.</p>;
  }
  return (
    <ul aria-label="Passkeys and security keys" className="divide-y divide-border">
      {credentials.map((credential) => (
        <li
          key={credential.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
        >
          <div className="min-w-0">
            <div className="text-sm text-foreground">{credential.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {describeCredential(credential)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label={`Remove ${credential.name}`}
            onClick={() => onRemove(credential)}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AddCredentialForm({
  count,
  busy,
  onAdd,
}: {
  count: number;
  busy: boolean;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  if (!canUseWebAuthn()) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser cannot create passkeys or use security keys. Open Settings in a browser that
        can.
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = name.trim() || `Passkey or security key ${count + 1}`;
        void onAdd(chosen).then((added) => {
          if (added) setName('');
        });
      }}
    >
      <Input
        aria-label="Name for the new passkey or security key"
        placeholder="Name, for example YubiKey or iPhone"
        value={name}
        maxLength={ACCOUNT_SECURITY_CREDENTIAL_NAME_MAX_LENGTH}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="outline" disabled={busy}>
        {busy ? <Spinner size="sm" /> : null}
        Add passkey or security key
      </Button>
    </form>
  );
}

export function AdvancedAccountSecurityPanel() {
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<Setup>({ step: 'closed' });
  const [replacement, setReplacement] = useState<string[] | null>(null);
  const [keysSaved, setKeysSaved] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchAccountSecurityStatus());
      setLoadError(null);
    } catch (error) {
      setLoadError(toUserMessage(error, 'Advanced Account Security could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (work: () => Promise<void>, fallback: string, keepNotice = false): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      if (!keepNotice) setNotice(null);
      try {
        await work();
        return true;
      } catch (error) {
        if (!quietFailure(error)) setActionError(toUserMessage(error, fallback));
        return false;
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const enrolled = status?.state === 'enrolled';
  const stepUp: StepUpRunner = withStepUp;

  const handleAdd = useCallback(
    (name: string) =>
      run(async () => {
        await addCredential(name, stepUp);
      }, 'This passkey or security key could not be added.'),
    [run, stepUp],
  );

  const handleRemove = useCallback(
    (credential: AccountSecurityCredential) => {
      confirm({
        title: `Remove ${credential.name}?`,
        description:
          'It will no longer be able to confirm a sign-in to your account. You can add it again later.',
        confirmLabel: 'Remove',
        destructive: true,
        onConfirm: () =>
          run(async () => {
            await removeCredential(credential.id, enrolled ? stepUp : undefined);
          }, 'This passkey or security key could not be removed.').then(() => undefined),
      });
    },
    [confirm, enrolled, run, stepUp],
  );

  const handleGenerateSetupKeys = useCallback(
    () =>
      run(async () => {
        const generated = await generateRecoveryKeys();
        setKeysSaved(false);
        setSetup({ step: 'keys', keys: generated.recoveryKeys });
      }, 'Recovery keys could not be generated.'),
    [run],
  );

  const handleSendCode = useCallback(
    () =>
      run(async () => {
        const sent = await sendEnrollmentCode();
        setEmailCode('');
        setSetup({ step: 'email', sentTo: sent.sentTo, expiresAt: sent.expiresAt });
      }, 'The code could not be emailed.'),
    [run],
  );

  const handleEnroll = useCallback(
    (code: string) =>
      run(async () => {
        const enrolledResult = await enrollAccountSecurity(stepUp, code);
        setSetup({ step: 'closed' });
        setKeysSaved(false);
        setEmailCode('');
        const signedOut = enrolledResult.sessionsSignedOut + enrolledResult.devicesSignedOut;
        const signedOutLine =
          signedOut > 0
            ? ` ${signedOut} other session${signedOut === 1 ? ' was' : 's were'} signed out.`
            : '';
        setNotice(
          `Advanced Account Security is on.${signedOutLine} We emailed you a link that turns it off for the next ${UNDO_HOURS} hours, in case this was not you.`,
        );
      }, 'Advanced Account Security could not be turned on.'),
    [run, stepUp],
  );

  const handleVerify = useCallback(
    () =>
      run(async () => {
        await verifyWithPasskey();
      }, 'That passkey or security key could not be verified.'),
    [run],
  );

  const handleStartReplacement = useCallback(
    () =>
      run(async () => {
        const generated = await generateRecoveryKeys();
        setKeysSaved(false);
        setReplacement(generated.recoveryKeys);
      }, 'Recovery keys could not be generated.'),
    [run],
  );

  const handleConfirmReplacement = useCallback(
    () =>
      run(async () => {
        await confirmReplacementRecoveryKeys(stepUp);
        setReplacement(null);
        setKeysSaved(false);
        setNotice('Your new recovery keys are saved. The old ones no longer work.');
      }, 'Your new recovery keys could not be saved.'),
    [run, stepUp],
  );

  const handleCancelRecovery = useCallback(() => {
    confirm({
      title: 'Cancel account recovery?',
      description:
        'The waiting recovery stops, and the recovery key used to start it will not work again.',
      confirmLabel: 'Cancel recovery',
      destructive: true,
      onConfirm: () =>
        run(async () => {
          await cancelRecovery();
          setNotice('Account recovery was cancelled.');
        }, 'The recovery could not be cancelled.').then(() => undefined),
    });
  }, [confirm, run]);

  const handleDisable = useCallback(() => {
    confirm({
      title: 'Turn off Advanced Account Security?',
      description:
        'Password sign-in, email codes and email account recovery work again, sign-in alert emails follow your notification settings, and your recovery keys are removed. Your passkeys and security keys stay on your account. You will be asked to confirm with one of them.',
      confirmLabel: 'Turn off',
      destructive: true,
      onConfirm: () =>
        run(async () => {
          await disableAccountSecurity();
          setNotice('Advanced Account Security is off.');
        }, 'Advanced Account Security could not be turned off.').then(() => undefined),
    });
  }, [confirm, run]);

  if (status?.state === 'unavailable') return null;

  const credentials =
    status?.state === 'available' || status?.state === 'enrolled' ? status.credentials : [];
  const crossDevice = credentials.some((credential) => credential.worksAcrossDevices);
  const requirementMet = credentials.length >= MINIMUM_METHODS && crossDevice;

  return (
    <Card className="border-border bg-card">
      {stepUpDialog}
      {confirmDialog}
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ShieldCheck
            className={enrolled ? 'h-4 w-4 text-success-text' : 'h-4 w-4 text-muted-foreground'}
            aria-hidden="true"
          />
          Advanced Account Security
        </CardTitle>
        <CardDescription>
          {status?.state === 'enrolled'
            ? `On since ${formatWhen(status.enrolledAt)}. Every sign-in needs one of your passkeys or security keys.`
            : 'An optional setting for accounts at higher risk of targeted attacks. Every sign-in needs a passkey or security key, and account recovery gets stricter.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loadError ? (
          <Alert variant="warning">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {actionError ? (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert variant="success">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {status === null && !loadError ? <Spinner size="sm" /> : null}

        {status?.state === 'verification_required' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm with one of your passkeys or security keys to manage Advanced Account Security
              on this device.
            </p>
            <Button type="button" disabled={busy} onClick={() => void handleVerify()}>
              {busy ? <Spinner size="sm" /> : null}
              Confirm with passkey or security key
            </Button>
          </div>
        ) : null}

        {status?.state === 'available' && setup.step === 'closed' ? (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {WHAT_CHANGES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Alert variant="warning">
              <AlertDescription>{LOSS_WARNING}</AlertDescription>
            </Alert>
            <Button type="button" disabled={busy} onClick={() => setSetup({ step: 'methods' })}>
              Set up
            </Button>
          </div>
        ) : null}

        {status?.state === 'available' && setup.step === 'methods' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Step 1 of 3: Add your sign-in methods
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add at least {MINIMUM_METHODS} passkeys or security keys, including one that works
                across devices, such as a passkey synced by your password manager or a hardware
                security key.
              </p>
            </div>
            <CredentialList credentials={credentials} busy={busy} onRemove={handleRemove} />
            <AddCredentialForm count={credentials.length} busy={busy} onAdd={handleAdd} />
            <ul className="space-y-1 text-sm" aria-label="Requirements">
              <li
                className={
                  credentials.length >= MINIMUM_METHODS
                    ? 'text-success-text'
                    : 'text-muted-foreground'
                }
              >
                {credentials.length >= MINIMUM_METHODS ? 'Done: ' : 'Needed: '}
                at least {MINIMUM_METHODS} passkeys or security keys
              </li>
              <li className={crossDevice ? 'text-success-text' : 'text-muted-foreground'}>
                {crossDevice ? 'Done: ' : 'Needed: '}one that works across devices
              </li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !requirementMet}
                onClick={() => void handleGenerateSetupKeys()}
              >
                Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSetup({ step: 'closed' })}
              >
                Not now
              </Button>
            </div>
          </div>
        ) : null}

        {status?.state === 'available' && setup.step === 'keys' && setup.keys ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Step 2 of 3: Save your recovery keys
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                If you lose your passkeys and security keys, a recovery key starts account recovery.
                For your security, the account unlocks {HOLD_HOURS} hours after a valid key is
                entered, and we email you when that happens.
              </p>
            </div>
            <RecoveryKeysSheet keys={setup.keys} saved={keysSaved} onSavedChange={setKeysSaved} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !keysSaved}
                onClick={() => void handleSendCode()}
              >
                {busy ? <Spinner size="sm" /> : null}
                Continue
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSetup({ step: 'methods' })}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {status?.state === 'available' && setup.step === 'email' ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (emailCode.length === CODE_LENGTH) void handleEnroll(emailCode);
            }}
          >
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Step 3 of 3: Confirm it is you
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                We emailed a {CODE_LENGTH}-digit code to {setup.sentTo}. It expires at{' '}
                {formatWhen(setup.expiresAt)}. Enter it, then confirm with one of the passkeys or
                security keys you added.
              </p>
            </div>
            <Input
              aria-label="Code from the email"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              value={emailCode}
              disabled={busy}
              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ''))}
              className="max-w-40 tracking-widest"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || emailCode.length !== CODE_LENGTH}>
                {busy ? <Spinner size="sm" /> : null}
                Turn on Advanced Account Security
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleSendCode()}
              >
                Send a new code
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEmailCode('');
                  setKeysSaved(false);
                  setSetup({ step: 'closed' });
                }}
              >
                Not now
              </Button>
            </div>
          </form>
        ) : null}

        {status?.state === 'enrolled' ? (
          <div className="space-y-5">
            {status.recovery ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <span className="block">
                    Account recovery is waiting. A recovery key was entered on{' '}
                    {formatWhen(status.recovery.startedAt)}, and the account unlocks for whoever
                    entered it on {formatWhen(status.recovery.unlocksAt)}. If this was not you,
                    cancel it now.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={busy}
                    onClick={handleCancelRecovery}
                  >
                    Cancel recovery
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <section aria-label="Sign-in methods" className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Sign-in methods</h3>
              <CredentialList credentials={credentials} busy={busy} onRemove={handleRemove} />
              <AddCredentialForm count={credentials.length} busy={busy} onAdd={handleAdd} />
            </section>

            <section aria-label="Recovery keys" className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Recovery keys</h3>
              {replacement ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Saving these replaces your current recovery keys, which stop working.
                  </p>
                  <RecoveryKeysSheet
                    keys={replacement}
                    saved={keysSaved}
                    onSavedChange={setKeysSaved}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy || !keysSaved}
                      onClick={() => void handleConfirmReplacement()}
                    >
                      Save new recovery keys
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setReplacement(null)}
                    >
                      Keep current keys
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {status.recoveryKeysRemaining} of {ACCOUNT_SECURITY_POLICY.recoveryKeyCount}{' '}
                    recovery keys unused. Replace them if you lost them or think someone else has
                    them.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleStartReplacement()}
                  >
                    Replace recovery keys
                  </Button>
                </div>
              )}
            </section>

            <section aria-label="Turn off Advanced Account Security" className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This device stays confirmed until {formatWhen(status.verifiedUntil)}.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="text-danger-text"
                onClick={handleDisable}
              >
                Turn off Advanced Account Security
              </Button>
            </section>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
