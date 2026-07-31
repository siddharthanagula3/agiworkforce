import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toDataURL } from 'qrcode';
import { Check, Copy, Maximize2, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { copyToClipboard } from '@/utils/clipboard';
import { useConnectionStore } from '../../stores/connectionStore';

export function QRPairingCard() {
  const { status, pairingCode, expiresAt, qrData, error, requestPairingCode, clearError } =
    useConnectionStore(
      useShallow((s) => ({
        status: s.status,
        pairingCode: s.pairingCode,
        expiresAt: s.expiresAt,
        qrData: s.qrData,
        error: s.error,
        requestPairingCode: s.requestPairingCode,
        clearError: s.clearError,
      })),
    );

  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  // Generate QR image whenever qrData changes
  useEffect(() => {
    let cancelled = false;

    if (!qrData) {
      setQrImage(null);
      return () => {
        cancelled = true;
      };
    }

    toDataURL(qrData, { margin: 1, width: 512 })
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

  useEffect(
    () => () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const expiresMessage = useMemo(() => {
    if (!expiresAt) return null;
    return formatDistanceToNow(expiresAt, { addSuffix: true });
  }, [expiresAt]);

  const isLoading = status === 'requesting';
  const hasCode = !!pairingCode;
  const formattedPairingCode =
    pairingCode && pairingCode.length === 12
      ? `${pairingCode.slice(0, 4)} ${pairingCode.slice(4, 8)} ${pairingCode.slice(8, 12)}`
      : pairingCode;

  const handleCopyCode = async () => {
    if (!pairingCode) return;
    const succeeded = await copyToClipboard(pairingCode, {
      successMessage: 'Pairing code copied',
      errorMessage: 'Could not copy the pairing code',
    });
    if (!succeeded) return;

    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-violet-50 p-2 text-violet-600">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pair your phone</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              On your phone, open{' '}
              <span className="font-medium text-slate-700">
                AGI Workforce &rarr; Desktop Companion
              </span>
              , then select <span className="font-medium text-slate-700">Scan QR Code</span>.
            </p>
          </div>
        </div>

        <ol className="list-inside list-decimal space-y-1 text-xs text-slate-600">
          <li>Open Desktop Companion on your phone</li>
          <li>Select Scan QR Code</li>
          <li>Scan the QR or choose Enter code manually</li>
        </ol>

        <div className="relative flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
          {qrImage ? (
            <>
              <img
                src={qrImage}
                alt="Pairing QR code"
                className="h-full max-h-[192px] w-full max-w-[192px] object-contain"
              />
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => void requestPairingCode()}
                  disabled={isLoading}
                  aria-label="Refresh pairing code"
                  className="rounded-md border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-xs transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setQrExpanded(true)}
                  aria-label="Enlarge pairing QR code"
                  className="rounded-md border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-xs transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <WifiOff className="h-6 w-6" aria-hidden="true" />
              <p className="text-xs">Generate a code to display QR</p>
            </div>
          )}
        </div>

        {hasCode && (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
            <p className="text-center text-xs uppercase tracking-wide text-slate-500">
              Pairing code
            </p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">
                {formattedPairingCode}
              </p>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                aria-label={copied ? 'Pairing code copied' : 'Copy pairing code'}
                className="rounded-md p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-xs leading-4 text-slate-500">
              On your phone, choose Enter code manually and type this 12-character code.
            </p>
            {expiresMessage && (
              <p className="mt-1 text-center text-xs text-slate-500">Expires {expiresMessage}</p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => requestPairingCode()}
          disabled={isLoading || status === 'pairing' || status === 'streaming'}
        >
          {isLoading ? (
            <>
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Generating...
            </>
          ) : hasCode ? (
            <>
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Refresh code
            </>
          ) : (
            'Generate pairing QR'
          )}
        </Button>
      </div>

      <Dialog open={qrExpanded} onOpenChange={setQrExpanded}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Scan with your phone</DialogTitle>
            <DialogDescription>
              In AGI Workforce Mobile, open Desktop Companion and select Scan QR Code.
            </DialogDescription>
          </DialogHeader>
          {qrImage && (
            <div className="flex items-center justify-center rounded-xl bg-white p-5">
              <img
                src={qrImage}
                alt="Enlarged pairing QR code"
                className="aspect-square w-full max-w-md object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
