'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleAlert } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { SERVICE_NOTICES_PATH, ServiceNoticeListSchema } from '@agiworkforce/cloud-contracts';
import type { ServiceNotice, ServiceNoticeScope } from '@/lib/service-notices/types';
import { ProductNoticeCard } from './ProductNotice';

const NOTICES_REFRESH_MS = 5 * 60 * 1000;
const DISMISSED_KEY = 'agi-dismissed-service-notices';
const NO_DISMISSALS: readonly string[] = [];

const dismissalListeners = new Set<() => void>();
let dismissals: readonly string[] = NO_DISMISSALS;
let storedDismissals: string | null = null;

function parseDismissals(raw: string | null): readonly string[] {
  if (!raw) return NO_DISMISSALS;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : NO_DISMISSALS;
  } catch {
    return NO_DISMISSALS;
  }
}

function readDismissals(): readonly string[] {
  if (typeof window === 'undefined') return NO_DISMISSALS;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return dismissals;
  }
  if (raw !== storedDismissals) {
    storedDismissals = raw;
    dismissals = parseDismissals(raw);
  }
  return dismissals;
}

function persistDismissals(ids: readonly string[]): void {
  try {
    const raw = JSON.stringify(ids);
    window.sessionStorage.setItem(DISMISSED_KEY, raw);
    storedDismissals = raw;
  } catch {
    return;
  }
}

function writeDismissals(ids: readonly string[]): void {
  dismissals = ids;
  persistDismissals(ids);
  for (const listener of dismissalListeners) listener();
}

function subscribeToDismissals(listener: () => void): () => void {
  dismissalListeners.add(listener);
  return () => {
    dismissalListeners.delete(listener);
  };
}

function dismissNotice(id: string): void {
  const current = readDismissals();
  if (!current.includes(id)) writeDismissals([...current, id]);
}

function forgetResolvedDismissals(feed: readonly ServiceNotice[]): void {
  const live = new Set(feed.map((notice) => notice.id));
  const current = readDismissals();
  if (current.every((id) => live.has(id))) return;
  writeDismissals(current.filter((id) => live.has(id)));
}

async function readServiceNotices(): Promise<ServiceNotice[]> {
  const response = await fetch(SERVICE_NOTICES_PATH);
  if (!response.ok) {
    throw Object.assign(new Error('Service notices could not be read.'), {
      status: response.status,
    });
  }
  const parsed = ServiceNoticeListSchema.safeParse(await response.json());
  if (!parsed.success) return [];
  forgetResolvedDismissals(parsed.data.notices);
  return parsed.data.notices;
}

export function ServiceNotices({ scope }: { scope: ServiceNoticeScope }) {
  const dismissed = useSyncExternalStore(
    subscribeToDismissals,
    readDismissals,
    () => NO_DISMISSALS,
  );
  const { data: notices } = useQuery({
    queryKey: ['service-notices'],
    queryFn: readServiceNotices,
    staleTime: NOTICES_REFRESH_MS,
    refetchInterval: NOTICES_REFRESH_MS,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  });

  return (
    <>
      {(notices ?? [])
        .filter((notice) => notice.scope === scope && !dismissed.includes(notice.id))
        .map((notice) => (
          <ProductNoticeCard
            key={notice.id}
            icon={notice.kind === 'maintenance' ? CalendarClock : CircleAlert}
            tone={notice.tone}
            message={notice.message}
            action={
              <Button
                asChild
                size="sm"
                variant="outline"
                className="shrink-0 pointer-coarse:min-h-11"
              >
                <Link href={notice.href}>{notice.linkLabel}</Link>
              </Button>
            }
            onDismiss={() => dismissNotice(notice.id)}
          />
        ))}
    </>
  );
}
