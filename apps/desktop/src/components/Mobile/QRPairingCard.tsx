import { useEffect, useMemo, useState } from 'react';
import { toDataURL } from 'qrcode';
import { RefreshCw, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../ui/Button';
import { useConnectionStore } from '../../stores/connectionStore';

export function QRPairingCard() {
  const { status, pairingCode, expiresAt, qrData, error, requestPairingCode, clearError } =
    useConnectionStore();

  const [qrImage, setQrImage] = useState<string | null>(null);

  // Generate QR image whenever qrData changes
  useEffect(() => {
    let cancelled = false;

    if (!qrData) {
      setQrImage(null);
      return () => {
        cancelled = true;
      };
    }

    toDataURL(qrData, { margin: 1, width: 200 })
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

  // Auto-clear errors after 4 seconds
  useEffect(() => {
    if (!error) return undefined;
    const timeout = window.setTimeout(() => clearError(), 4000);
    return () => window.clearTimeout(timeout);
  }, [error, clearError]);

  const expiresMessage = useMemo(() => {
    if (!expiresAt) return null;
    return formatDistanceToNow(expiresAt, { addSuffix: true });
  }, [expiresAt]);

  const deepLink = pairingCode ? `agiworkforce://pair/${pairingCode}` : null;

  const isLoading = status === 'requesting';
  const hasCode = !!pairingCode;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-xs space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Pair Your Phone</h3>
        <p className="mt-1 text-xs text-slate-500">
          Open AGI Workforce on your phone, tap{' '}
          <span className="font-medium">Menu &rarr; Pair with Desktop</span>, and scan the code.
        </p>
      </div>

      {/* Instructions list */}
      <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
        <li>Open AGI Workforce on your phone</li>
        <li>Tap Menu &rarr; Pair with Desktop</li>
        <li>Scan this QR code or enter the code manually</li>
      </ol>

      {/* QR code display */}
      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
        {qrImage ? (
          <img
            src={qrImage}
            alt="Pairing QR code"
            className="h-full max-h-[192px] w-full max-w-[192px] object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <WifiOff className="h-6 w-6" />
            <p className="text-xs">Generate a code to display QR</p>
          </div>
        )}
      </div>

      {/* Pairing code display */}
      {hasCode && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pairing code</p>
          <p className="mt-1 text-2xl font-bold font-mono tracking-widest text-slate-900">
            {pairingCode}
          </p>
          {expiresMessage && (
            <p className="mt-1 text-xs text-slate-500">Expires {expiresMessage}</p>
          )}
          {deepLink && (
            <p className="mt-2 text-xs text-slate-400 truncate font-mono">{deepLink}</p>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Generate button */}
      <Button
        className="w-full"
        onClick={() => requestPairingCode()}
        disabled={isLoading || status === 'pairing' || status === 'streaming'}
      >
        {isLoading ? (
          <>
            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : hasCode ? (
          <>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh code
          </>
        ) : (
          'Generate pairing QR'
        )}
      </Button>
    </div>
  );
}
