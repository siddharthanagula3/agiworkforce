import { useEffect, useState } from 'react';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { isTauri } from '../../lib/tauri-mock';
import { guardedFetch } from '../../lib/egressGuard';

const STATUS_URL: string =
  (typeof import.meta !== 'undefined' &&
    typeof import.meta.env?.['VITE_STATUS_URL'] === 'string' &&
    import.meta.env?.['VITE_STATUS_URL']) ||
  'https://status.agiworkforce.com/status.json';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;

type Severity = 'info' | 'warning' | 'critical';

export interface StatusMessage {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  dismissible: boolean;
  expiresAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const severityConfig: Record<
  Severity,
  {
    Icon: typeof Info;
    containerClass: string;
    iconClass: string;
    textClass: string;
    dismissClass: string;
  }
> = {
  info: {
    Icon: Info,
    containerClass: 'bg-blue-500/10 border-b border-blue-500/30',
    iconClass: 'text-blue-400',
    textClass: 'text-blue-200',
    dismissClass: 'text-blue-300 hover:text-blue-100',
  },
  warning: {
    Icon: AlertTriangle,
    containerClass: 'bg-amber-500/10 border-b border-amber-500/30',
    iconClass: 'text-amber-400',
    textClass: 'text-amber-200',
    dismissClass: 'text-amber-300 hover:text-amber-100',
  },
  critical: {
    Icon: XCircle,
    containerClass: 'bg-red-500/10 border-b border-red-500/30',
    iconClass: 'text-red-400',
    textClass: 'text-red-200',
    dismissClass: 'text-red-300 hover:text-red-100',
  },
};

function isExpired(message: StatusMessage, now = Date.now()): boolean {
  if (!message.expiresAt) return false;
  return new Date(message.expiresAt).getTime() <= now;
}

/**
 * Treat the remote status document as untrusted input.
 *
 * A malformed severity previously reached StatusBannerItem where the
 * severity configuration lookup returned undefined and crashed the mounted
 * shell. Invalid expiry dates also survived forever because `NaN < now` is
 * false. Reject malformed rows independently so one bad incident cannot hide
 * valid notices or take down the app chrome.
 */
export function parseStatusMessages(value: unknown, now = Date.now()): StatusMessage[] {
  if (!isRecord(value) || !Array.isArray(value['messages'])) return [];

  const messages: StatusMessage[] = [];
  for (const candidate of value['messages']) {
    if (!isRecord(candidate)) continue;

    const id = candidate['id'];
    const severity = candidate['severity'];
    const title = candidate['title'];
    const message = candidate['message'];
    const dismissible = candidate['dismissible'];
    const expiresAt = candidate['expiresAt'];

    if (typeof id !== 'string' || id.trim().length === 0) continue;
    if (severity !== 'info' && severity !== 'warning' && severity !== 'critical') continue;
    if (typeof title !== 'string' || title.trim().length === 0) continue;
    if (typeof message !== 'string') continue;
    if (typeof dismissible !== 'boolean') continue;
    if (expiresAt !== undefined) {
      if (typeof expiresAt !== 'string' || !Number.isFinite(new Date(expiresAt).getTime()))
        continue;
    }

    const parsed: StatusMessage = {
      id,
      severity,
      title,
      message,
      dismissible,
      ...(typeof expiresAt === 'string' ? { expiresAt } : {}),
    };
    if (!isExpired(parsed, now)) messages.push(parsed);
  }

  return messages;
}

async function fetchStatusMessages(): Promise<StatusMessage[]> {
  // Only fetch in Tauri production builds. In dev mode (tauri dev) the Vite
  // dev server origin triggers CORS; plain browser has no Tauri at all.
  if (!isTauri || import.meta.env.DEV) return [];
  try {
    // status.agiworkforce.com is OUR cloud. Route through the egress guard so a
    // Local/BYOK session does not ping our infra (reveals IP + app-running). The
    // guard throws fail-closed there; the catch below degrades to no banner.
    const response = await guardedFetch(STATUS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return parseStatusMessages(await response.json());
  } catch {
    // Silently fail — status endpoint is non-critical
    return [];
  }
}

interface StatusBannerItemProps {
  message: StatusMessage;
  onDismiss: (id: string) => void;
}

function StatusBannerItem({ message, onDismiss }: StatusBannerItemProps) {
  const config = severityConfig[message.severity];
  const { Icon } = config;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${config.containerClass}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-2 ${config.textClass}`}>
        <Icon className={`h-4 w-4 shrink-0 ${config.iconClass}`} aria-hidden="true" />
        <span className="font-medium">{message.title}</span>
        {message.message && (
          <>
            <span className="opacity-60">—</span>
            <span className="opacity-80">{message.message}</span>
          </>
        )}
      </div>
      {message.dismissible && (
        <button
          type="button"
          onClick={() => onDismiss(message.id)}
          className={`shrink-0 rounded p-0.5 transition-colors ${config.dismissClass}`}
          aria-label={`Dismiss: ${message.title}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function StatusBanner() {
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const fetched = await fetchStatusMessages();
      if (!cancelled) {
        setMessages(fetched);
      }
    };

    void poll();

    const intervalId = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const visibleMessages = messages.filter((msg) => !dismissedIds.has(msg.id));

  if (visibleMessages.length === 0) return null;

  return (
    <div className="w-full">
      {visibleMessages.map((msg) => (
        <StatusBannerItem key={msg.id} message={msg} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

export default StatusBanner;
