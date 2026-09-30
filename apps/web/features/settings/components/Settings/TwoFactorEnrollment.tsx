'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
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
} from '@agiworkforce/ui';
import { Check, Copy, Download, Printer, ShieldCheck, ShieldOff } from 'lucide-react';
import settingsService, {
  type TwoFactorStatus,
} from '@features/settings/services/user-preferences';
import { isStepUpCancelled, sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/use-step-up';
import { toUserMessage } from '@/lib/user-error-message';
import { queryClient } from '@shared/stores/query-client';
import { WORKSPACE_MFA_REQUIREMENT_QUERY_KEY } from '../WorkspaceMfaNotice';

type Stage =
  | { name: 'idle' }
  /** /setup returned · the user is scanning and about to submit a code. */
  | { name: 'enrolling'; secret: string; otpauthUrl: string }
  /** Server confirmed the change · these codes are visible exactly once. */
  | { name: 'backup-codes'; codes: string[]; reason: 'enabled' | 'regenerated' };

const BACKUP_CODES_PRINT_TITLE = 'AGI Workforce backup codes';
const BACKUP_CODES_PRINT_NOTE =
  'Each code works once, in place of a code from your authenticator app. Keep this page somewhere safe.';

interface TwoFactorEnrollmentPanelProps {
  onStatusChange?: (status: TwoFactorStatus) => void;
}

function describeCodeFailure(error: string | undefined, status: number | undefined): string {
  if (status === 401) {
    return 'That code was not accepted. Check your authenticator app is showing a current code, then try again.';
  }
  if (status === 429) {
    return 'Too many attempts. Wait a few minutes before trying another code.';
  }
  if (status === 400) {
    return error && !/^bad request$/i.test(error)
      ? error
      : 'The server rejected the request. Start the setup again to get a fresh secret.';
  }
  return error ?? 'The request failed.';
}

function describeSetupFailure(error: string | undefined, status: number | undefined): string {
  if (status === 503) {
    return 'Authenticator setup is temporarily unavailable. Try again later or contact support.';
  }
  return describeCodeFailure(error, status);
}

async function readRouteFailure(
  response: Response,
  describe: (error: string | undefined, status: number | undefined) => string = describeCodeFailure,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
  } | null;
  const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
  return describe(message, response.status);
}

async function renderQrDataUri(otpauthUrl: string): Promise<string | null> {
  try {
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

export function TwoFactorEnrollmentPanel({ onStatusChange }: TwoFactorEnrollmentPanelProps) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'codes' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const { withStepUp, dialog: stepUpDialog } = useStepUp();

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const refreshStatus = useCallback(async () => {
    const { data, error } = await settingsService.get2FAStatus();
    setStatus(data);
    setStatusError(error ?? null);
    onStatusChangeRef.current?.(data);
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_MFA_REQUIREMENT_QUERY_KEY });
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (stage.name !== 'enrolling') {
      setQrDataUri(null);
      return;
    }
    let cancelled = false;
    void renderQrDataUri(stage.otpauthUrl).then((uri) => {
      if (!cancelled) setQrDataUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  const resetFlow = useCallback(() => {
    setStage({ name: 'idle' });
    setCode('');
    setActionError(null);
    setAcknowledged(false);
    setCopied(null);
    setPrintError(null);
  }, []);

  const copyText = useCallback(async (text: string, what: 'secret' | 'codes') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  }, []);

  const handleStartSetup = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await withStepUp((headers) =>
        sendAuthorizedJson('/api/settings/2fa/setup', { method: 'POST', body: {} }, headers),
      );
      if (!response.ok) {
        setActionError(await readRouteFailure(response, describeSetupFailure));
        return;
      }
      const { secret, otpauth_url: otpauthUrl } = (await response.json()) as {
        secret: string;
        otpauth_url: string;
      };
      setCode('');
      setStage({ name: 'enrolling', secret, otpauthUrl });
    } catch (error) {
      if (!isStepUpCancelled(error)) {
        setActionError(toUserMessage(error, 'The request failed.'));
      }
    } finally {
      setBusy(false);
    }
  }, [withStepUp]);

  const handleVerify = useCallback(async () => {
    if (stage.name !== 'enrolling') return;
    setBusy(true);
    setActionError(null);
    const { backupCodes, error, status: httpStatus } = await settingsService.verify2FA(code.trim());
    setBusy(false);
    if (!backupCodes) {
      setActionError(describeCodeFailure(error, httpStatus));
      return;
    }
    setCode('');
    setAcknowledged(false);
    setStage({ name: 'backup-codes', codes: backupCodes, reason: 'enabled' });
    await refreshStatus();
  }, [stage, code, refreshStatus]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await withStepUp((headers) =>
        sendAuthorizedJson('/api/settings/2fa', { method: 'DELETE' }, headers),
      );
      if (!response.ok) {
        setActionError(await readRouteFailure(response));
        return;
      }
      resetFlow();
      await refreshStatus();
    } catch (error) {
      if (!isStepUpCancelled(error)) {
        setActionError(toUserMessage(error, 'The request failed.'));
      }
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, resetFlow, withStepUp]);

  const handleRegenerate = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await withStepUp((headers) =>
        sendAuthorizedJson('/api/settings/2fa/backup-codes', { method: 'POST' }, headers),
      );
      if (!response.ok) {
        setActionError(await readRouteFailure(response));
        return;
      }
      const { backup_codes: codes } = (await response.json()) as { backup_codes: string[] };
      setCode('');
      setAcknowledged(false);
      setStage({ name: 'backup-codes', codes, reason: 'regenerated' });
      await refreshStatus();
    } catch (error) {
      if (!isStepUpCancelled(error)) {
        setActionError(toUserMessage(error, 'The request failed.'));
      }
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, withStepUp]);

  const handleDismissBackupCodes = useCallback(async () => {
    resetFlow();
    await refreshStatus();
  }, [refreshStatus, resetFlow]);

  const printCodes = useCallback((codes: string[]) => {
    const printWindow = window.open('', '_blank', 'width=480,height=640');
    if (!printWindow) {
      setPrintError(
        'Your browser blocked the print window. Allow pop-ups for this site, or download or copy the codes instead.',
      );
      return;
    }
    setPrintError(null);
    const doc = printWindow.document;
    const heading = doc.createElement('h1');
    heading.textContent = BACKUP_CODES_PRINT_TITLE;
    const note = doc.createElement('p');
    note.textContent = BACKUP_CODES_PRINT_NOTE;
    const list = doc.createElement('ul');
    for (const code of codes) {
      const item = doc.createElement('li');
      item.textContent = code;
      list.append(item);
    }
    doc.title = BACKUP_CODES_PRINT_TITLE;
    doc.body.append(heading, note, list);
    printWindow.print();
  }, []);

  const downloadCodes = useCallback((codes: string[]) => {
    const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agiworkforce-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const enabled = status?.enabled === true;
  const enrollmentAvailable = status?.enrollmentAvailable === true;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          {enabled ? (
            <ShieldCheck className="h-4 w-4 text-success-text" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          Authenticator app
        </CardTitle>
        <CardDescription>
          {enabled
            ? 'Two-factor authentication is on. Every sign-in asks for a code from your authenticator app, and so does turning it off or replacing your backup codes.'
            : enrollmentAvailable
              ? 'Add a time-based one-time code (TOTP) from an authenticator app. Every sign-in then asks for a code from it.'
              : 'Authenticator apps and backup codes are temporarily unavailable. Your password, passkeys and the codes we email you still protect your account.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusError ? (
          <Alert variant="warning">
            <AlertDescription>
              Could not read your current two-factor status: {statusError}
            </AlertDescription>
          </Alert>
        ) : null}

        {status === null ? (
          <p className="text-sm text-muted-foreground">Checking two-factor status...</p>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Backup codes · shown exactly once, gated behind acknowledgement    */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'backup-codes' ? (
          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <Alert variant="success">
              <AlertDescription>
                {stage.reason === 'enabled'
                  ? 'Two-factor authentication is now enabled on your account.'
                  : 'Your previous backup codes have been invalidated.'}
              </AlertDescription>
            </Alert>
            <div>
              <h4 className="font-medium text-foreground">Save your backup codes</h4>
              <p className="text-sm text-muted-foreground">
                These are shown once. Each code works a single time, and any of them can be used in
                place of an authenticator code.
              </p>
            </div>
            <ul
              aria-label="Backup codes"
              className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm text-foreground"
            >
              {stage.codes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyText(stage.codes.join('\n'), 'codes')}
              >
                {copied === 'codes' ? (
                  <Check className="me-2 h-4 w-4" />
                ) : (
                  <Copy className="me-2 h-4 w-4" />
                )}
                Copy codes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCodes(stage.codes)}
              >
                <Download className="me-2 h-4 w-4" />
                Download codes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => printCodes(stage.codes)}
              >
                <Printer className="me-2 h-4 w-4" />
                Print codes
              </Button>
            </div>
            {printError ? (
              <Alert variant="destructive">
                <AlertDescription>{printError}</AlertDescription>
              </Alert>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I have saved these backup codes somewhere safe
            </label>
            <Button
              type="button"
              disabled={!acknowledged}
              onClick={() => void handleDismissBackupCodes()}
            >
              Done
            </Button>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Enrollment · scan, then verify                                    */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'enrolling' ? (
          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <h4 className="font-medium text-foreground">Scan this in your authenticator app</h4>
            {qrDataUri ? (
              <img
                src={qrDataUri}
                alt="QR code containing your two-factor setup key"
                width={200}
                height={200}
                className="rounded-md bg-white p-2"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                The QR image could not be drawn. Add the account manually with the setup key below.
              </p>
            )}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Or enter this setup key manually (type: time-based, 6 digits, 30 seconds):
              </p>
              <div className="flex items-center gap-2">
                <code
                  data-testid="totp-secret"
                  className="select-all break-all rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground"
                >
                  {stage.secret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(stage.secret, 'secret')}
                >
                  {copied === 'secret' ? (
                    <Check className="me-2 h-4 w-4" />
                  ) : (
                    <Copy className="me-2 h-4 w-4" />
                  )}
                  Copy key
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="totp-enroll-code"
                className="block text-sm font-medium text-foreground"
              >
                Enter the 6-digit code from the app
              </label>
              <Input
                id="totp-enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="max-w-[10rem] border-border bg-background font-mono text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Two-factor is not switched on until this code is accepted by the server.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy || code.trim().length === 0}
                onClick={() => void handleVerify()}
              >
                {busy ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
                Verify and enable
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetFlow}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {stepUpDialog}

        {/* ---------------------------------------------------------------- */}
        {/* Resting state                                                     */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'idle' && status !== null ? (
          <div className="space-y-3">
            {enabled ? (
              status?.backupCodesReady ? (
                <p className="text-sm text-muted-foreground">
                  Backup codes are set. Each one works once, at sign-in or when you confirm it is
                  you.
                </p>
              ) : (
                <Alert variant="warning">
                  <AlertDescription>
                    {enrollmentAvailable
                      ? 'You have no backup codes. Generate a set so you can still sign in if you lose your authenticator app.'
                      : 'You have no backup codes, and new ones are temporarily unavailable, so keep your authenticator app safe.'}
                  </AlertDescription>
                </Alert>
              )
            ) : null}
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !enrollmentAvailable}
                    onClick={() => void handleRegenerate()}
                  >
                    Generate new backup codes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleDisable()}
                  >
                    Turn off two-factor
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={busy || !enrollmentAvailable}
                  onClick={() => void handleStartSetup()}
                >
                  {busy ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
                  Set up authenticator app
                </Button>
              )}
              {enrollmentAvailable ? null : (
                <span className="self-center text-sm text-muted-foreground">
                  Temporarily unavailable
                </span>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
