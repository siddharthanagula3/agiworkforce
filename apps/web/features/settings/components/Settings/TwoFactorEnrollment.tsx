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
} from '@agiworkforce/ui';
import { Check, Copy, Download, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import settingsService, {
  type TwoFactorStatus,
} from '@features/settings/services/user-preferences';

type Stage =
  | { name: 'idle' }
  /** /setup returned · the user is scanning and about to submit a code. */
  | { name: 'enrolling'; secret: string; otpauthUrl: string; pendingBackupCodes: string[] }
  /** Server confirmed the change · these codes are visible exactly once. */
  | { name: 'backup-codes'; codes: string[]; reason: 'enabled' | 'regenerated' }
  | { name: 'disabling' }
  | { name: 'regenerating' };

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

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const refreshStatus = useCallback(async () => {
    const { data, error } = await settingsService.get2FAStatus();
    setStatus(data);
    setStatusError(error ?? null);
    onStatusChangeRef.current?.(data);
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
    const { data, error, status: httpStatus } = await settingsService.setup2FA();
    setBusy(false);
    if (!data) {
      setActionError(describeCodeFailure(error, httpStatus));
      return;
    }
    setCode('');
    setStage({
      name: 'enrolling',
      secret: data.secret,
      otpauthUrl: data.otpauthUrl,
      pendingBackupCodes: data.backupCodes,
    });
  }, []);

  const handleVerify = useCallback(async () => {
    if (stage.name !== 'enrolling') return;
    setBusy(true);
    setActionError(null);
    const { success, error, status: httpStatus } = await settingsService.verify2FA(code.trim());
    setBusy(false);
    if (!success) {
      setActionError(describeCodeFailure(error, httpStatus));
      return;
    }
    setCode('');
    setAcknowledged(false);
    setStage({ name: 'backup-codes', codes: stage.pendingBackupCodes, reason: 'enabled' });
    await refreshStatus();
  }, [stage, code, refreshStatus]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    const { success, error, status: httpStatus } = await settingsService.disable2FA(code.trim());
    setBusy(false);
    if (!success) {
      setActionError(describeCodeFailure(error, httpStatus));
      return;
    }
    resetFlow();
    await refreshStatus();
  }, [code, refreshStatus, resetFlow]);

  const handleRegenerate = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    const {
      backupCodes,
      error,
      status: httpStatus,
    } = await settingsService.regenerateBackupCodes(code.trim());
    setBusy(false);
    if (!backupCodes) {
      setActionError(describeCodeFailure(error, httpStatus));
      return;
    }
    setCode('');
    setAcknowledged(false);
    setStage({ name: 'backup-codes', codes: backupCodes, reason: 'regenerated' });
    await refreshStatus();
  }, [code, refreshStatus]);

  const handleDismissBackupCodes = useCallback(async () => {
    resetFlow();
    await refreshStatus();
  }, [refreshStatus, resetFlow]);

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

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          {enabled ? (
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          ) : (
            <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          Authenticator app
        </CardTitle>
        <CardDescription>
          {enabled
            ? 'Two-factor authentication is on. A code from your authenticator app is required to turn it off or to replace your backup codes.'
            : 'Add a time-based one-time code (TOTP) from an authenticator app as a second factor.'}
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
                These are shown once and stored only as hashes. Each code works a single time, and
                any of them can be used in place of an authenticator code.
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
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                Copy codes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadCodes(stage.codes)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download codes
              </Button>
            </div>
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
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
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
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify and enable
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetFlow}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Disable · requires a current TOTP or backup code                  */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'disabling' ? (
          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <h4 className="font-medium text-foreground">Turn off two-factor authentication</h4>
            <p className="text-sm text-muted-foreground">
              Enter a current authenticator code, or one of your backup codes, to confirm.
            </p>
            <Input
              id="totp-disable-code"
              aria-label="Authenticator or backup code"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="max-w-[14rem] border-border bg-background font-mono text-foreground"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={busy || code.trim().length === 0}
                onClick={() => void handleDisable()}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Turn off two-factor
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetFlow}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Regenerate backup codes                                           */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'regenerating' ? (
          <div className="space-y-3 rounded-lg border border-border/50 p-4">
            <h4 className="font-medium text-foreground">Generate new backup codes</h4>
            <p className="text-sm text-muted-foreground">
              Enter a current authenticator code. Your existing backup codes stop working
              immediately.
            </p>
            <Input
              id="totp-regenerate-code"
              aria-label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="max-w-[10rem] border-border bg-background font-mono text-foreground"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy || code.trim().length === 0}
                onClick={() => void handleRegenerate()}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate new codes
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetFlow}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Resting state                                                     */}
        {/* ---------------------------------------------------------------- */}
        {stage.name === 'idle' && status !== null ? (
          <div className="space-y-3">
            {enabled ? (
              <p className="text-sm text-muted-foreground">
                {typeof status?.backupCodesRemaining === 'number'
                  ? `${status.backupCodesRemaining} backup ${status.backupCodesRemaining === 1 ? 'code' : 'codes'} remaining.`
                  : 'Backup code count is unavailable.'}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCode('');
                      setActionError(null);
                      setStage({ name: 'regenerating' });
                    }}
                  >
                    Generate new backup codes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCode('');
                      setActionError(null);
                      setStage({ name: 'disabling' });
                    }}
                  >
                    Turn off two-factor
                  </Button>
                </>
              ) : (
                <Button type="button" disabled={busy} onClick={() => void handleStartSetup()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Set up authenticator app
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
