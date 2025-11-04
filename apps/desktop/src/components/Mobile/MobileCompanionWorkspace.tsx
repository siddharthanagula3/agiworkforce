import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RotateCcw, Smartphone, Video, WifiOff } from 'lucide-react';
import { toDataURL } from 'qrcode';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useConnectionStore, type CompanionStatus } from '../../stores/connectionStore';

const STATUS_LABELS: Record<CompanionStatus, string> = {
  idle: 'Ready to pair',
  requesting: 'Generating pairing code...',
  waiting: 'Waiting for mobile device...',
  pairing: 'Negotiating connection...',
  streaming: 'Streaming to mobile companion',
  error: 'Error',
};

const STATUS_COLOR: Record<CompanionStatus, string> = {
  idle: 'bg-slate-100 text-slate-700',
  requesting: 'bg-sky-100 text-sky-700',
  waiting: 'bg-amber-100 text-amber-700',
  pairing: 'bg-indigo-100 text-indigo-700',
  streaming: 'bg-emerald-100 text-emerald-700',
  error: 'bg-rose-100 text-rose-700',
};

export function MobileCompanionWorkspace() {
  const {
    status,
    pairingCode,
    expiresAt,
    qrData,
    wsUrl,
    peerConnected,
    stream,
    error,
    requestPairingCode,
    stopSession,
    clearError,
  } = useConnectionStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        // ignore autoplay restrictions in desktop app
      });
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    let cancelled = false;

    if (!qrData) {
      setQrImage(null);
      return () => {
        cancelled = true;
      };
    }

    toDataURL(qrData, { margin: 1, width: 256 })
      .then((uri: string) => {
        if (!cancelled) {
          setQrImage(uri);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrImage(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrData]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    const timeout = window.setTimeout(() => clearError(), 4000);
    return () => window.clearTimeout(timeout);
  }, [error, clearError]);

  const expiresMessage = useMemo(() => {
    if (!expiresAt) {
      return null;
    }
    return formatDistanceToNow(expiresAt, { addSuffix: true });
  }, [expiresAt]);

  const statusLabel = STATUS_LABELS[status] ?? STATUS_LABELS['idle'];
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR['idle'];

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-slate-50/60 p-8">
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Smartphone className="h-5 w-5 text-slate-600" />
              Mobile Companion
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Pair your phone to receive notifications, remote control, and live screen sharing.
            </CardDescription>
          </div>
          <Badge className={statusColor}>{statusLabel}</Badge>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-inner">
              <h3 className="text-sm font-semibold text-slate-800">
                Step 1 - Generate pairing code
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Click the button below to create a secure 6-digit code. Your desktop registers with
                the signaling server and waits for the mobile companion app to connect.
              </p>
              <Button
                className="mt-3"
                onClick={() => requestPairingCode()}
                disabled={status === 'requesting' || status === 'pairing' || status === 'streaming'}
              >
                {status === 'requesting' ? 'Generating...' : 'Generate pairing QR'}
              </Button>
              {pairingCode ? (
                <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Pairing code</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{pairingCode}</p>
                  {expiresMessage ? (
                    <p className="mt-1 text-xs text-slate-500">Expires {expiresMessage}</p>
                  ) : null}
                </div>
              ) : null}
              {wsUrl ? (
                <p className="mt-3 text-xs text-slate-500">
                  Signaling endpoint: <span className="font-mono">{wsUrl}</span>
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-inner">
              <h3 className="text-sm font-semibold text-slate-800">
                Step 2 - Scan from your phone
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Install the AGI Workforce Companion app, sign in, and tap{' '}
                <strong>Pair desktop</strong>. Scan the QR code or enter the 6-digit code manually.
                Once connected, you will see live stream status below.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${peerConnected ? 'bg-emerald-500 shadow-emerald-500/40 shadow' : 'bg-amber-400'}`}
                />
                <span className="text-sm text-slate-600">
                  {peerConnected
                    ? 'Mobile companion connected'
                    : 'Waiting for mobile companion to connect'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-inner">
              <h3 className="text-sm font-semibold text-slate-800">Control session</h3>
              <p className="mt-1 text-sm text-slate-600">
                Stop the current streaming session to invalidate the pairing code, or re-generate a
                new code at any time.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => stopSession()}
                disabled={status === 'idle' || status === 'requesting'}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset session
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 p-4">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt="Pairing QR code"
                  className="h-full max-h-[224px] w-full max-w-[224px] object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <WifiOff className="h-6 w-6" />
                  <p className="text-sm">Generate a pairing QR to display it here.</p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-900 text-slate-50 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-slate-300" />
                  <span className="text-sm font-semibold">Desktop preview</span>
                </div>
                {status === 'streaming' ? (
                  <Badge className="bg-emerald-500/20 text-emerald-200">Streaming</Badge>
                ) : (
                  <Badge className="bg-slate-700 text-slate-100">Inactive</Badge>
                )}
              </div>
              <div className="flex h-64 items-center justify-center overflow-hidden bg-slate-950">
                {stream ? (
                  <video
                    ref={videoRef}
                    className="h-full w-full object-contain"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Smartphone className="h-6 w-6" />
                    <p className="text-sm">Start streaming to preview your shared screen.</p>
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 shadow-inner">
                {error}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
