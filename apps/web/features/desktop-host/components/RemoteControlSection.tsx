'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  DesktopRuntimeError,
  getHostBridge,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { useDesktopHost } from '../lib/host';
import { readRemoteControl, startRemoteControl, stopRemoteControl } from '../lib/runtime-client';

const HEADING = 'Remote Control';
const INTRO =
  'Pair your phone to follow AGI Code sessions running on this computer: approve steps, read diffs, test results and new files, and steer the next turn.';
const HOW_TO_PAIR =
  'Open the AGI Workforce app on your phone, choose Pair with Desktop, and scan this code. The code works once and expires in a few minutes.';
const PAIR_FAILED = 'Pairing could not start.';
const STOP_FAILED = 'Remote Control could not be stopped.';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
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
    });
  }, [host]);

  const qrPayload = state?.status === 'waiting' ? state.qrPayload : null;
  useEffect(() => {
    if (!qrPayload) {
      setQrImage(null);
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

  const onPair = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const pairing = await requestPairing();
      setState(
        await startRemoteControl({
          code: pairing.code,
          wsUrl: pairing.signaling.wsUrl,
          pairToken: pairing.pairTokens.desktop,
          expiresAt: pairing.expiresAt,
        }),
      );
    } catch (cause) {
      setError(runtimeMessage(cause, PAIR_FAILED));
    } finally {
      setBusy(false);
    }
  }, []);

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
          <p className="text-xs text-foreground">{HOW_TO_PAIR}</p>
          {qrImage ? (
            <img
              src={qrImage}
              alt="Pairing QR code"
              width={200}
              height={200}
              className="h-[200px] w-[200px] rounded-md border border-border/60 bg-background"
            />
          ) : (
            <Spinner aria-label="Drawing the pairing code" />
          )}
          {state?.pairingCode ? (
            <span className={CODE_CLASS} aria-label="Pairing code">
              {state.pairingCode}
            </span>
          ) : null}
        </div>
      ) : null}

      {status === 'connected' ? (
        <p className="text-xs text-foreground" aria-live="polite">
          {`Connected to ${state?.phoneName ?? 'your phone'}`}
          {state && state.attachedSessions > 0
            ? ` · ${state.attachedSessions} ${state.attachedSessions === 1 ? 'session' : 'sessions'} open on the phone`
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
            onClick={() => void onStop()}
          >
            {status === 'connected' ? 'Disconnect phone' : 'Cancel pairing'}
          </button>
        )}
      </div>
    </section>
  );
}
