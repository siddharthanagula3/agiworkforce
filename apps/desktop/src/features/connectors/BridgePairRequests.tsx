import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { realtime, type PairRequestPrompt } from '@agiworkforce/desktop-command-client';
import { listen, type UnlistenFn } from '@agiworkforce/client-runtime';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/tauri-mock';

interface TrackedRequest extends PairRequestPrompt {
  expiresAt: number;
}

function formatCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

function secondsLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

interface BridgePairRequestsProps {
  fetcher?: () => Promise<PairRequestPrompt[]>;
  subscribe?: (handler: (prompt: PairRequestPrompt) => void) => Promise<UnlistenFn>;
  subscribeConfirmed?: (handler: (requestId: string) => void) => Promise<UnlistenFn>;
  deny?: (requestId: string) => Promise<boolean>;
  isTauriHost?: boolean;
}

export function BridgePairRequests({
  fetcher,
  subscribe,
  subscribeConfirmed,
  deny,
  isTauriHost = isTauri,
}: BridgePairRequestsProps = {}) {
  const [requests, setRequests] = useState<TrackedRequest[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const effectiveFetcher = fetcher ?? realtime.bridgePendingPairRequests;
  const effectiveDeny = deny ?? realtime.bridgeDenyPairRequest;
  // Memoized because the subscribe effect below depends on both. A fresh
  // arrow every render tore down and re-established the pairing listeners on
  // every render, so a prompt arriving mid-render could land on a listener
  // that was already gone.
  const effectiveSubscribe = useMemo(
    () =>
      subscribe ??
      ((handler: (prompt: PairRequestPrompt) => void) =>
        listen<PairRequestPrompt>(realtime.BRIDGE_PAIR_REQUEST_EVENT, handler)),
    [subscribe],
  );
  const effectiveSubscribeConfirmed = useMemo(
    () =>
      subscribeConfirmed ??
      ((handler: (requestId: string) => void) =>
        listen<string>(realtime.BRIDGE_PAIR_REQUEST_CONFIRMED_EVENT, handler)),
    [subscribeConfirmed],
  );

  const track = useCallback((prompt: PairRequestPrompt) => {
    if (!mountedRef.current) return;
    setRequests((current) => [
      { ...prompt, expiresAt: Date.now() + prompt.expiresInMs },
      ...current.filter((request) => request.requestId !== prompt.requestId),
    ]);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriHost) return;
    let cancelled = false;
    void (async () => {
      try {
        const pending = await effectiveFetcher();
        if (cancelled || !mountedRef.current) return;
        setRequests(
          pending.map((prompt) => ({ ...prompt, expiresAt: Date.now() + prompt.expiresInMs })),
        );
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to read pairing requests');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveFetcher, isTauriHost]);

  useEffect(() => {
    if (!isTauriHost) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    void (async () => {
      const dispose = (unlisten: UnlistenFn) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      };
      try {
        dispose(await effectiveSubscribe(track));
        dispose(
          await effectiveSubscribeConfirmed((requestId) => {
            setRequests((current) => current.filter((request) => request.requestId !== requestId));
          }),
        );
      } catch {
        setError('Pairing requests will not appear until the desktop bridge restarts');
      }
    })();
    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [effectiveSubscribe, effectiveSubscribeConfirmed, isTauriHost, track]);

  useEffect(() => {
    if (requests.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [requests.length]);

  useEffect(() => {
    setRequests((current) => current.filter((request) => request.expiresAt > now));
  }, [now]);

  const onDeny = useCallback(
    async (requestId: string) => {
      setRequests((current) => current.filter((request) => request.requestId !== requestId));
      try {
        await effectiveDeny(requestId);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to deny the pairing request');
      }
    },
    [effectiveDeny],
  );

  if (!isTauriHost) return null;
  if (requests.length === 0 && !error) return null;

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/5"
      data-testid="bridge-pair-requests"
    >
      <div className="flex items-center gap-2 border-b border-amber-500/30 px-4 py-3">
        <KeyRound className="h-4 w-4 text-amber-500" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Pairing request</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A browser extension asked to connect to this desktop.
          </p>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 px-4 py-2 text-xs text-rose-500">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <ul className="divide-y divide-amber-500/20">
        {requests.map((request) => (
          <li
            key={request.requestId}
            data-testid={`bridge-pair-request-${request.requestId}`}
            className="px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">
              Extension <span className="font-mono text-foreground">{request.extensionId}</span>
            </p>
            <p
              className={cn(
                'mt-2 font-mono text-2xl font-semibold tracking-[0.25em] text-foreground',
              )}
              data-testid={`bridge-pair-code-${request.requestId}`}
            >
              {formatCode(request.code)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Type this code into the extension to finish pairing. It expires in{' '}
              {secondsLeft(request.expiresAt, now)}s. If you did not start this, deny it, nothing is
              installed until the code is entered.
            </p>
            <button
              type="button"
              onClick={() => void onDeny(request.requestId)}
              className={cn(
                'mt-3 rounded-md border border-border bg-background px-2.5 py-1 text-xs',
                'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              )}
            >
              Deny
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
