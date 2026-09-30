'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleAlert } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { SERVICE_NOTICES_PATH, ServiceNoticeListSchema } from '@agiworkforce/cloud-contracts';
import type { ServiceNotice } from '@/lib/service-notices/types';
import { ProductNoticeCard } from './ProductNotice';

const NOTICES_REFRESH_MS = 5 * 60 * 1000;
const DISMISSED_KEY = 'agi-dismissed-service-notices';

async function readServiceNotices(): Promise<ServiceNotice[]> {
  const response = await fetch(SERVICE_NOTICES_PATH);
  if (!response.ok) {
    throw Object.assign(new Error('Service notices could not be read.'), {
      status: response.status,
    });
  }
  const parsed = ServiceNoticeListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.notices : [];
}

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: readonly string[]): void {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    return;
  }
}

export function ServiceNotices() {
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readDismissed(),
  );
  const { data: notices } = useQuery({
    queryKey: ['service-notices'],
    queryFn: readServiceNotices,
    staleTime: NOTICES_REFRESH_MS,
    refetchInterval: NOTICES_REFRESH_MS,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  });

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = [...current, id];
      writeDismissed(next);
      return next;
    });
  }, []);

  return (
    <>
      {(notices ?? [])
        .filter((notice) => !dismissed.includes(notice.id))
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
            onDismiss={() => dismiss(notice.id)}
          />
        ))}
    </>
  );
}
