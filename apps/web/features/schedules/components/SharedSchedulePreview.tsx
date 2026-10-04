'use client';

import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import type { ManagedCloudScheduleShareSnapshot } from '@agiworkforce/cloud-contracts';
import { scheduleShareTask } from '../lib/schedule-form';
import { scheduleTiming } from './ScheduleCard';
import { SCHEDULE_SHARE_QUERY_PARAM } from './SchedulesPageWithProjects';

export function SharedSchedulePreview({
  token,
  snapshot,
}: {
  token: string;
  snapshot: ManagedCloudScheduleShareSnapshot;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timing = scheduleTiming(scheduleShareTask(snapshot, timezone));
  const addHref = `/chat/schedules?${SCHEDULE_SHARE_QUERY_PARAM}=${encodeURIComponent(token)}`;

  return (
    <main
      id="main-content"
      className="flex min-h-screen justify-center bg-background px-4 py-12 text-foreground"
    >
      <article className="w-full max-w-[768px]">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Shared schedule
        </p>
        <h1 className="mt-3 break-words text-2xl font-semibold">{snapshot.name}</h1>
        {snapshot.description ? (
          <p className="mt-2 break-words text-sm text-muted-foreground">{snapshot.description}</p>
        ) : null}
        <dl className="mt-6 grid gap-4 text-sm">
          <div>
            <dt className="font-medium text-muted-foreground">Runs</dt>
            <dd className="mt-1 break-words">{timing}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">Instructions</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 p-4">
              {snapshot.prompt}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">
          Adding it creates your own schedule from this copy. You review the instructions, time and
          model before it is saved, and it runs on your account.
        </p>
        <Link
          href={addHref}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Add to my schedules
        </Link>
      </article>
    </main>
  );
}
