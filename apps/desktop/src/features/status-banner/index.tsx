import { useEffect, useState } from 'react';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import {
  SERVICE_NOTICES_PATH,
  ServiceNoticeSchema,
  type ServiceNotice,
  type ServiceNoticeTone,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../../api/config';
import { isTauri } from '../../lib/tauri-mock';
import { guardedFetch } from '../../lib/egressGuard';
import { openExternalUrl } from '../../utils/navigation';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const toneConfig: Record<
  ServiceNoticeTone,
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
    containerClass: 'bg-warning-fill/10 border-b border-warning-fill/30',
    iconClass: 'text-warning-text',
    textClass: 'text-warning-text',
    dismissClass: 'text-warning-text',
  },
  danger: {
    Icon: XCircle,
    containerClass: 'bg-danger-fill/10 border-b border-danger-fill/30',
    iconClass: 'text-danger-text',
    textClass: 'text-danger-text',
    dismissClass: 'text-danger-text',
  },
};

/** Each row is checked on its own, so one malformed notice cannot hide the rest. */
export function parseServiceNotices(value: unknown): ServiceNotice[] {
  if (!isRecord(value) || !Array.isArray(value['notices'])) return [];
  return value['notices'].flatMap((candidate) => {
    const parsed = ServiceNoticeSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export function serviceNoticeUrl(href: string): string | null {
  try {
    const origin = new URL(WEB_APP_URL).origin;
    const url = new URL(href, origin);
    return url.origin === origin ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchServiceNotices(): Promise<ServiceNotice[]> {
  if (!isTauri || import.meta.env.DEV) return [];
  try {
    const response = await guardedFetch(`${WEB_APP_URL}${SERVICE_NOTICES_PATH}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return parseServiceNotices(await response.json());
  } catch {
    return [];
  }
}

interface StatusBannerItemProps {
  notice: ServiceNotice;
  onDismiss: (id: string) => void;
}

function StatusBannerItem({ notice, onDismiss }: StatusBannerItemProps) {
  const config = toneConfig[notice.tone];
  const { Icon } = config;
  const link = serviceNoticeUrl(notice.href);

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${config.containerClass}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-2 ${config.textClass}`}>
        <Icon className={`h-4 w-4 shrink-0 ${config.iconClass}`} aria-hidden="true" />
        <span className="font-medium">{notice.message}</span>
        {link && (
          <button
            type="button"
            onClick={() => void openExternalUrl(link)}
            className="font-medium underline underline-offset-2"
          >
            {notice.linkLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        className={`shrink-0 rounded p-0.5 transition-colors ${config.dismissClass}`}
        aria-label={`Dismiss: ${notice.message}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function StatusBanner() {
  const [notices, setNotices] = useState<ServiceNotice[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const fetched = await fetchServiceNotices();
      if (!cancelled) {
        setNotices(fetched);
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

  const visibleNotices = notices.filter((notice) => !dismissedIds.has(notice.id));

  if (visibleNotices.length === 0) return null;

  return (
    <div className="w-full">
      {visibleNotices.map((notice) => (
        <StatusBannerItem key={notice.id} notice={notice} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

export default StatusBanner;
