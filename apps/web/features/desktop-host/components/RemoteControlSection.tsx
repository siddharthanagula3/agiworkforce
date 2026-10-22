'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Maximize2, RefreshCw } from 'lucide-react';
import {
  DesktopRuntimeError,
  getHostBridge,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  useConfirmAction,
  translateUiPlural,
} from '@agiworkforce/ui';
import { browserPairingLink } from '@/features/remote-dispatch/lib/browser-pairing';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { readRemoteControl, startRemoteControl, stopRemoteControl } from '../lib/runtime-client';

const HEADING = 'Remote Control';
const INTRO =
  'Pair your phone to follow AGI Code sessions running on this computer: approve steps, read diffs, test results and new files, and steer the next turn.';
const HOW_TO_PAIR =
  'Open AGI Mobile on your phone, choose Pair with Desktop, and scan this code. The code works once and expires in a few minutes.';
const PAIRING_WINDOW =
  'Scan the code in the pairing window with AGI Mobile on your phone. Before the phone connects, this computer asks you to allow it.';
const PHONE_CAN_RECONNECT =
  'Your phone disconnected. It reconnects on its own while Remote Control is on. To pair a different phone, stop Remote Control and pair again.';
const BROWSER_PAIRING =
  'To send tasks from a browser instead, copy a link and open it in a browser signed in to this account. The link works once, like the code.';
const PAIR_FAILED = 'Pairing could not start.';
const STOP_FAILED = 'Remote Control could not be stopped.';
const COPY_LINK_FAILED = 'The link could not be copied. Pair from the phone instead, or try again.';
const RECONNECTING = 'Connection lost. Reconnecting so your phone can pick up where it left off.';
const DISCONNECT_CONSEQUENCE =
  'The phone is disconnected from this computer and can no longer follow or steer its sessions. To connect it again, pair it with a new code.';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const CODE_CLASS =
  'inline-flex min-h-[36px] items-center rounded-md border border-border/60 bg-muted/40 px-3 font-mono text-base tracking-[0.2em] text-foreground';

interface PairingResponse {
  code: string;
  expiresAt: number;
  signaling: { wsUrl: string };
  pairTokens: { desktop: string };
}

function isPairingResponse(value: unknown): value is PairingResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const signaling = record['signaling'] as Record<string, unknown> | undefined;
  const tokens = record['pairTokens'] as Record<string, unknown> | undefined;
  return (
    typeof record['code'] === 'string' &&
    typeof record['expiresAt'] === 'number' &&
    typeof signaling?.['wsUrl'] === 'string' &&
    typeof tokens?.['desktop'] === 'string'
  );
}

function runtimeMessage(error: unknown, fallback: string): string {
  if (error instanceof DesktopRuntimeError) return `${fallback} ${error.message}`;
  return toUserMessage(error, fallback);
}

async function requestPairing(): Promise<PairingResponse> {
  const response = await fetch('/api/pair/initiate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initiator: 'desktop' }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isPairingResponse(body)) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : PAIR_FAILED;
    throw new Error(message);
  }
  return body;
}

export function RemoteControlSection() {
  const host = useDesktopHost();
  const [state, setState] = useState<RemoteControlState | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrEnlarged, setQrEnlarged] = useState(false);
  const { confirm, dialog } = useConfirmAction();
  const refreshRequested = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!host) return undefined;
    readRemoteControl()
      .then(setState)
      .catch((cause: unknown) => {
        if (cause instanceof DesktopRuntimeError && cause.code === 'unknown-command') {
          setSupported(false);
          return;
        }
        setError(runtimeMessage(cause, PAIR_FAILED));
      });
    return getHostBridge()?.onRuntimeEvent((event) => {
      if (event.kind === 'remote-control-changed') setState(event.state);
      else if (event.kind === 'remote-control-refresh-requested') refreshRequested.current();
    });
  }, [host]);

  const reconnectable = state?.reconnectable === true;
  const qrPayload = state?.status === 'waiting' && !reconnectable ? state.qrPayload : null;
  useEffect(() => {
    setLinkCopied(false);
    if (!qrPayload) {
      setQrImage(null);
      setQrEnlarged(false);
      return undefined;
    }
    let cancelled = false;
    void QRCode.toString(qrPayload, { type: 'svg', margin: 1, width: 200 })
      .then((svg) => {
        if (!cancelled) setQrImage(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (!cancelled) setQrImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  const beginPairing = useCallback(async () => {
    const pairing = await requestPairing();
    setState(
      await startRemoteControl({
        code: pairing.code,
        wsUrl: pairing.signaling.wsUrl,
        pairToken: pairing.pairTokens.desktop,
        expiresAt: pairing.expiresAt,
      }),
    );
  }, []);

  const onPair = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await beginPairing();
    } catch (cause) {
      setError(runtimeMessage(cause, PAIR_FAILED));
    } finally {
      setBusy(false);
    }
  }, [beginPairing]);

  const onRefreshCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await stopRemoteControl());
      await beginPairing();
    } catch (cause) {
      setError(runtimeMessage(cause, PAIR_FAILED));
    } finally {
      setBusy(false);
    }
  }, [beginPairing]);

  const waiting = state?.status === 'waiting';
  useEffect(() => {
    refreshRequested.current = () => {
      if (waiting) void onRefreshCode();
    };
  }, [waiting, onRefreshCode]);

  const onCopyLink = useCallback(async () => {
    if (!qrPayload) return;
    try {
      await navigator.clipboard.writeText(browserPairingLink(window.location.origin, qrPayload));
      setError(null);
      setLinkCopied(true);
    } catch {
      setError(COPY_LINK_FAILED);
    }
  }, [qrPayload]);

  const onStop = useCallback(async () => {
    setBusy(true);
    try {
      setState(await stopRemoteControl());
      setError(null);
    } catch (cause) {
      setError(runtimeMessage(cause, STOP_FAILED));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!host || !supported) return null;

  const status = state?.status ?? 'idle';

  return (
    <section className="flex flex-col gap-2" aria-label={HEADING}>
      <h3 className="text-sm font-medium text-foreground">{HEADING}</h3>
      <p className="text-xs text-muted-foreground">{INTRO}</p>

      {state === null && !error ? <Spinner aria-label="Loading Remote Control" /> : null}

      {error || (status === 'error' && state?.error) ? (
        <p role="alert" className="text-xs text-danger">
          {error ?? state?.error}
        </p>
      ) : null}

      {status === 'waiting' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground">
            {reconnectable ? PHONE_CAN_RECONNECT : qrPayload ? HOW_TO_PAIR : PAIRING_WINDOW}
          </p>
          {qrPayload ? (
            qrImage ? (
              <div className="flex w-fit flex-col items-end gap-1">
                <img
                  src={qrImage}
                  alt="Pairing QR code"
                  width={200}
                  height={200}
                  className="h-[200px] w-[200px] rounded-md border border-border/60 bg-background"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    aria-label="Enlarge pairing QR code"
                    onClick={() => setQrEnlarged(true)}
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    aria-label="Refresh pairing code"
                    disabled={busy}
                    onClick={() => void onRefreshCode()}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            ) : (
              <Spinner aria-label="Drawing the pairing code" />
            )
          ) : null}
          {state?.pairingCode && !reconnectable ? (
            <span className={CODE_CLASS} aria-label="Pairing code">
              {state.pairingCode}
            </span>
          ) : null}
          {qrPayload ? (
            <>
              <p className="text-xs text-muted-foreground">{BROWSER_PAIRING}</p>
              <div className="flex items-center gap-2">
                <button type="button" className={BUTTON_CLASS} onClick={() => void onCopyLink()}>
                  Copy link for a browser
                </button>
                {linkCopied ? (
                  <span className="text-xs text-muted-foreground" role="status">
                    Link copied
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {status === 'reconnecting' ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <Spinner aria-label={RECONNECTING} />
          <p className="text-xs text-foreground">{RECONNECTING}</p>
        </div>
      ) : null}

      {status === 'connected' ? (
        <p className="text-xs text-foreground" aria-live="polite">
          {`Connected to ${state?.phoneName ?? 'your phone'}`}
          {state && state.attachedSessions > 0
            ? ` · ${translateUiPlural('settings', 'counts.phoneSessions', state.attachedSessions, {
                one: '{{count}} session open on the phone',
                other: '{{count}} sessions open on the phone',
              })}`
            : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === 'idle' || status === 'error' ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy}
            onClick={() => void onPair()}
          >
            {busy ? 'Starting…' : 'Pair a phone'}
          </button>
        ) : (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busy}
            onClick={() =>
              status === 'connected' || status === 'reconnecting' || reconnectable
                ? confirm({
                    title: `Disconnect ${state?.phoneName ?? 'your phone'}?`,
                    description: DISCONNECT_CONSEQUENCE,
                    confirmLabel: 'Disconnect phone',
                    onConfirm: onStop,
                  })
                : void onStop()
            }
          >
            {status === 'connected'
              ? 'Disconnect phone'
              : status === 'reconnecting' || reconnectable
                ? 'Stop Remote Control'
                : 'Cancel pairing'}
          </button>
        )}
      </div>
      {dialog}
      <Dialog open={qrEnlarged && qrImage !== null} onOpenChange={setQrEnlarged}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pair your phone</DialogTitle>
            <DialogDescription>{HOW_TO_PAIR}</DialogDescription>
          </DialogHeader>
          {qrImage ? (
            <img
              src={qrImage}
              alt="Enlarged pairing QR code"
              width={360}
              height={360}
              className="mx-auto aspect-square w-full max-w-[360px] rounded-md border border-border/60 bg-background"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
