'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@agiworkforce/ui';
import { useManagedCloudProjects } from '@/features/projects';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import { SchedulesPage } from './SchedulesPage';
import type { ScheduleTask } from '../types';

export const SCHEDULE_FOCUS_QUERY_PARAM = 'schedule';

export function SchedulesEntitlementLoading() {
  return (
    <section
      role="status"
      aria-label="Loading schedule access"
      className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6"
    >
      <Skeleton className="h-9 w-52" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-52 w-full rounded-2xl" />
      <span className="sr-only">Loading schedule access…</span>
    </section>
  );
}

export function SchedulesPageWithProjects() {
  const router = useRouter();
  const focusScheduleId = useSearchParams()?.get(SCHEDULE_FOCUS_QUERY_PARAM) ?? null;
  const { projects } = useManagedCloudProjects();
  const subscriptionTier = useBillingStore((state) => state.subscription?.tier ?? 'free');
  const billingIsLoading = useBillingStore((state) => state.isLoading);
  const billingInitialized = useBillingStore((state) => state.initialized);

  if (billingIsLoading || !billingInitialized) return <SchedulesEntitlementLoading />;

  return (
    <SchedulesPage
      focusScheduleId={focusScheduleId}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      subscriptionTier={subscriptionTier}
      onOpenChat={(schedule: ScheduleTask) =>
        router.push(`/chat?starterPrompt=${encodeURIComponent(schedule.prompt ?? schedule.name)}`)
      }
    />
  );
}

export default SchedulesPageWithProjects;
