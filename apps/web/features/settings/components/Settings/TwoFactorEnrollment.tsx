'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  useConfirmAction,
} from '@agiworkforce/ui';
import { Check, Copy, Download, Printer, ShieldCheck, ShieldOff } from 'lucide-react';
import type { TwoFactorStatus } from '@features/settings/services/user-preferences';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { useStepUp } from '@features/settings/hooks/useStepUp';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { invalidateMfaReaders } from '@features/settings/hooks/use-mfa-readers';
import {
  readTwoFactorStatus,
  sendTwoFactorMutation,
  readTwoFactorReceipt,
  type TwoFactorAction,
} from '../../services/two-factor-client';

type Stage =
  | { name: 'idle' }
  /** /setup returned · the user is scanning and about to submit a code. */
  | { name: 'enrolling'; secret: string; otpauthUrl: string }
  /** Server confirmed the change · these codes are visible exactly once. */
  | { name: 'backup-codes'; codes: string[]; reason: 'enabled' | 'regenerated' };

const BACKUP_CODES_PRINT_TITLE = 'AGI backup codes';
const BACKUP_CODES_PRINT_NOTE =
  'Each code works once, in place of a code from your authenticator app. Keep this page somewhere safe.';
const BACKUP_CODES_PRINT_FAILED =
  'The codes could not be sent to the printer. Download or copy the codes instead.';
const PRINT_FRAME_CLASS = 'pointer-events-none fixed bottom-0 right-0 h-0 w-0 border-0';
// No scripts run in the frame: this page writes it and asks it to print, which
// needs the page's origin to reach the document and modals for the print dialog.
const PRINT_FRAME_SANDBOX = 'allow-same-origin allow-modals';

async function renderQrDataUri(otpauthUrl: string): Promise<string | null> {
  try {
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 200 });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

const UNCERTAIN =
  'We could not confirm the complete two-factor change outcome. Your authenticator or backup codes may have changed. Check your sign-in settings before another change. Missing new backup codes cannot be recovered.';
type Owner = { session: SessionAuthority; id: number; pending: boolean; isCurrent: () => boolean };
type Intent = {
  generation: object;
  action: TwoFactorAction;
  dispatched: boolean;
  started: boolean;
  request: RequestAuthority;
};

export function TwoFactorEnrollmentPanel({ active = true }: { active?: boolean }) {
  const capture = useSessionSnapshot();
  const slot = useRef<Owner | null>(null);
  const sequence = useRef(0);
  const admission = useRef(active);
  const uncertainty = useRef<SessionAuthority | null>(null);
  const [, redraw] = useState(0);
  admission.current = active;
  if (slot.current && (!active || !slot.current.session.isCurrent())) {
    if (slot.current.pending && slot.current.session.isCurrent())
      uncertainty.current = slot.current.session;
    slot.current = null;
  }
  if (uncertainty.current && !uncertainty.current.isCurrent()) uncertainty.current = null;
  if (active && !slot.current) {
    const session = capture();
    if (session) {
      const owner: Owner = {
        session,
        id: ++sequence.current,
        pending: false,
        isCurrent: () => admission.current && slot.current === owner && session.isCurrent(),
      };
      slot.current = owner;
    }
  }
  const owner = slot.current;
  const replace = useCallback(
    (uncertain = false) => {
      if (!owner || slot.current !== owner) return;
      if (uncertain && owner.session.isCurrent()) uncertainty.current = owner.session;
      slot.current = null;
      redraw((value) => value + 1);
    },
    [owner],
  );
  if (!active) return null;
  if (!owner) return <p role="status">Sign in to manage your authenticator app.</p>;
  return (
    <OwnedTwoFactorEnrollment
      key={owner.id}
      owner={owner}
      blocked={uncertainty.current !== null}
      replace={replace}
      acknowledge={() => {
        if (!owner.isCurrent()) return;
        uncertainty.current = null;
        replace();
      }}
    />
  );
}

function OwnedTwoFactorEnrollment({
  owner,
  blocked,
  replace,
  acknowledge,
}: {
  owner: Owner;
  blocked: boolean;
  replace: (uncertain?: boolean) => void;
  acknowledge: () => void;
}) {
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
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const committedStage = useRef(stage);
  useLayoutEffect(() => {
    committedStage.current = stage;
  }, [stage]);
  const lane = useRef({
    active: false,
    generation: {} as object,
    intent: null as Intent | null,
    requests: new Set<RequestAuthority>(),
    stage,
    status: null as TwoFactorStatus | null,
    statusRead: 0,
  }).current;
  const removePrintFrame = useCallback(() => {
    printFrameRef.current?.remove();
    printFrameRef.current = null;
  }, []);
  const reconcileOwner = useCallback(() => {
    if (!lane.active || owner.session.isCurrent()) return;
    lane.active = false;
    for (const request of lane.requests) request.retire();
    lane.requests.clear();
    lane.intent?.request.retire();
    lane.intent = null;
    lane.stage = { name: 'idle' };
    removePrintFrame();
    replace();
  }, [lane, owner, removePrintFrame, replace]);
  const current = useCallback(() => {
    if (!lane.active) return false;
    if (owner.isCurrent()) return true;
    reconcileOwner();
    return false;
  }, [lane, owner, reconcileOwner]);
  const owns = (intent: Intent) =>
    current() && lane.intent === intent && lane.generation === intent.generation;
  const { withStepUp, dialog: stepUpDialog } = useStepUp();
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const changeStage = (next: Stage) => {
    if (!current()) return;
    lane.stage = next;
    removePrintFrame();
    setQrDataUri(null);
    setStage(next);
    setCode('');
    setCopied(null);
    setPrintError(null);
    setAcknowledged(false);
  };
  const refreshStatus = useCallback(async () => {
    if (!current()) return;
    lane.status = null;
    setStatus(null);
    const version = ++lane.statusRead;
    const request = createRequestAuthority(
      owner.session,
      () => current() && lane.statusRead === version,
    );
    lane.requests.add(request);
    try {
      const result = await readTwoFactorStatus(request);
      request.assertCurrent();
      lane.status = result;
      setStatus(result);
      setStatusError(null);
    } catch {
      if (request.isCurrent()) {
        lane.status = null;
        setStatus(null);
        setStatusError('Your two-factor status could not be loaded.');
      }
    } finally {
      lane.requests.delete(request);
      request.retire();
      reconcileOwner();
    }
  }, [current, lane, owner, reconcileOwner]);
  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    lane.stage = committedStage.current;
    const retire = () => {
      lane.active = false;
      for (const request of lane.requests) request.retire();
      lane.requests.clear();
      lane.intent?.request.retire();
      lane.intent = null;
      lane.stage = { name: 'idle' };
      removePrintFrame();
    };
    const stop = owner.session.subscribe?.(() => {
      if (!owner.isCurrent()) {
        retire();
        replace();
      }
    });
    void refreshStatus();
    return () => {
      retire();
      stop?.();
    };
  }, [lane, owner, refreshStatus, removePrintFrame, replace]);

  useEffect(() => {
    if (stage.name !== 'enrolling') return;
    let retired = false;
    void renderQrDataUri(stage.otpauthUrl).then((uri) => {
      if (!retired && current() && lane.stage === stage) setQrDataUri(uri);
    });
    return () => {
      retired = true;
    };
  }, [stage, lane, owner, current]);

  const resetFlow = () => {
    if (!current() || lane.intent || lane.stage !== stage) return;
    changeStage({ name: 'idle' });
    setActionError(null);
  };
  const copyText = async (text: string, what: 'secret' | 'codes') => {
    if (!current() || lane.stage !== stage || blocked) return;
    try {
      await navigator.clipboard.writeText(text);
      if (current() && lane.stage === stage) setCopied(what);
    } catch {
      if (current() && lane.stage === stage) setCopied(null);
    }
  };
  const release = (intent: Intent) => {
    if (!owns(intent)) return;
    intent.request.retire();
    lane.intent = null;
    owner.pending = false;
    setBusy(false);
  };
  const begin = (action: TwoFactorAction) => {
    if (!current() || blocked || lane.intent || lane.stage !== stage) return;
    if (action === 'verify' ? stage.name !== 'enrolling' : stage.name !== 'idle') return;
    if (!status || lane.status !== status || statusError) return;
    if (action === 'setup' && (status.enabled || !status.enrollmentAvailable)) return;
    if ((action === 'regenerate' || action === 'disable') && !status.enabled) return;
    if (action === 'regenerate' && !status.enrollmentAvailable) return;
    const draft = code.trim();
    if (action === 'verify' && !/^\d{6}$/.test(draft)) {
      setActionError('Enter the current 6-digit code from your authenticator app.');
      return;
    }
    const intent: Intent = {
      generation: lane.generation,
      action,
      dispatched: false,
      started: false,
      request: createRequestAuthority(
        owner.session,
        () => owns(intent),
        () => {
          intent.dispatched = true;
          owner.pending = true;
        },
      ),
    };
    lane.intent = intent;
    setBusy(true);
    setActionError(null);
    const run = async () => {
      if (!owns(intent) || intent.started) return;
      intent.started = true;
      try {
        const send = (headers: Record<string, string>) =>
          sendTwoFactorMutation(intent.request, action, headers, draft);
        const response =
          action === 'verify'
            ? await send({})
            : await withStepUp(send, null, {
                authority: intent.request,
                onStepUpRequired: () => {
                  if (owns(intent)) {
                    intent.dispatched = false;
                    owner.pending = false;
                  }
                },
              });
        intent.request.assertCurrent();
        const receipt = await readTwoFactorReceipt(intent.request, response, action);
        intent.request.assertCurrent();
        owner.pending = false;
        intent.dispatched = false;
        if ('secret' in receipt)
          changeStage({
            name: 'enrolling',
            secret: receipt.secret,
            otpauthUrl: receipt.otpauth_url,
          });
        else if ('backup_codes' in receipt)
          changeStage({
            name: 'backup-codes',
            codes: receipt.backup_codes,
            reason: action === 'verify' ? 'enabled' : 'regenerated',
          });
        else changeStage({ name: 'idle' });
        if (current()) invalidateMfaReaders(owner.session);
        release(intent);
        if (action !== 'setup') void refreshStatus();
      } catch (error) {
        if (!owns(intent)) return;
        if (intent.dispatched) {
          intent.request.retire();
          replace(true);
        } else {
          release(intent);
          if (!isStepUpCancelled(error)) setActionError('The request could not be completed.');
        }
      }
    };
    if (action === 'disable' || action === 'regenerate' || action === 'verify') {
      confirm({
        title:
          action === 'verify'
            ? 'Enable two-factor authentication?'
            : action === 'disable'
              ? 'Turn off two-factor authentication?'
              : 'Replace your backup codes?',
        description:
          action === 'verify'
            ? 'Sign-in will require your authenticator or a backup code. Save the backup codes shown next; they cannot be recovered if lost. This security change may also sign out sessions and revoke linked-device credentials.'
            : action === 'disable'
              ? 'Your authenticator and backup codes will stop protecting sign-in. You will need a new setup to enable them again. This security change may also sign out sessions and revoke linked-device credentials.'
              : 'Every previous backup code will stop working. The new codes are shown only once and cannot be recovered if lost. This security change may also sign out sessions and revoke linked-device credentials.',
        confirmLabel:
          action === 'verify'
            ? 'Enable two-factor'
            : action === 'disable'
              ? 'Turn off two-factor'
              : 'Replace backup codes',
        onConfirm: run,
        onCancel: () => {
          if (current() && !intent.started) release(intent);
        },
      });
    } else void run();
  };
  const handleStartSetup = () => begin('setup');
  const handleVerify = () => begin('verify');
  const handleDisable = () => begin('disable');
  const handleRegenerate = () => begin('regenerate');
  const handleDismissBackupCodes = () => {
    if (!current() || lane.stage !== stage || !acknowledged || lane.intent) return;
    resetFlow();
    void refreshStatus();
  };
  const printCodes = (codes: string[]) => {
    if (!current() || lane.stage !== stage || stage.name !== 'backup-codes' || blocked) return;
    removePrintFrame();
    const frame = document.createElement('iframe');
    const remove = () => {
      frame.remove();
      if (printFrameRef.current === frame) printFrameRef.current = null;
    };
    try {
      frame.setAttribute('sandbox', PRINT_FRAME_SANDBOX);
      frame.title = BACKUP_CODES_PRINT_TITLE;
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.className = PRINT_FRAME_CLASS;
      document.body.append(frame);
      printFrameRef.current = frame;
      const doc = frame.contentDocument;
      const view = frame.contentWindow;
      if (!doc || !view) throw new Error('Print unavailable');
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
      view.addEventListener('afterprint', remove, { once: true });
      if (!current() || lane.stage !== stage) {
        remove();
        return;
      }
      view.focus();
      view.print();
    } catch {
      remove();
      if (current() && lane.stage === stage) setPrintError(BACKUP_CODES_PRINT_FAILED);
    }
  };
  const downloadCodes = (codes: string[]) => {
    if (!current() || lane.stage !== stage || stage.name !== 'backup-codes' || blocked) return;
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'agiworkforce-backup-codes.txt';
      if (current() && lane.stage === stage) link.click();
    } catch {
      if (current())
        setActionError('The codes could not be downloaded. Copy or print them instead.');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  const enabled = status?.enabled === true;
  const enrollmentAvailable = status?.enrollmentAvailable === true;
  if (!owner.isCurrent()) return null;
  if (blocked)
    return (
      <Alert variant="warning">
        <AlertDescription>{UNCERTAIN}</AlertDescription>
        <Button
          type="button"
          onClick={() => {
            if (current()) acknowledge();
          }}
        >
          I understand; allow another action
        </Button>
        <p>This only clears the local warning. It does not confirm recovery or undo a change.</p>
      </Alert>
    );
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
        <CardDescription className="text-xs">
          {status === null
            ? 'Your current authenticator status has not been confirmed.'
            : enabled
              ? 'On. Sign-in, turning it off and new backup codes need an authenticator code.'
              : enrollmentAvailable
                ? 'Add codes from an authenticator app. Every sign-in then asks for one.'
                : 'Authenticator apps are temporarily unavailable. Password, passkeys and email codes still protect you.'}
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

        {status === null && !statusError ? (
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
              {stage.codes.map((backupCode, index) => (
                <li key={`${index}:${backupCode}`}>{backupCode}</li>
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
                onChange={(event) => {
                  if (current() && lane.stage === stage) setAcknowledged(event.target.checked);
                }}
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
                onChange={(event) => {
                  if (current() && lane.stage === stage && !lane.intent)
                    setCode(event.target.value);
                }}
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

        {confirmDialog}
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
              {status === null || enrollmentAvailable ? null : (
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
