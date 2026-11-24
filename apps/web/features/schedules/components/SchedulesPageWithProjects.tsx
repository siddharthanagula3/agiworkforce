'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@agiworkforce/ui';
import { useManagedCloudProjects } from '@/features/projects';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import { LocalRoutinesSection } from './LocalRoutinesSection';
import { SchedulesPage } from './SchedulesPage';
import { useAgentOptions } from '@/features/agents/hooks/use-agent-options';
import { SCHEDULE_PROMPT_QUERY_PARAM } from './schedule-from-turn';
import { SCHEDULE_FOCUS_QUERY_PARAM } from '../lib/schedule-links';
import type { ScheduleTask } from '../types';

export const SCHEDULE_SHARE_QUERY_PARAM = 'fromShare';
export const SCHEDULE_AGENT_QUERY_PARAM = 'agent';

export function SchedulesEntitlementLoading({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <section
      role="status"
      aria-label="Loading schedule access"
      className={embedded ? 'space-y-4' : 'mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6'}
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
  const searchParams = useSearchParams();
  const focusScheduleId = searchParams?.get(SCHEDULE_FOCUS_QUERY_PARAM) ?? null;
  const sharedScheduleToken = searchParams?.get(SCHEDULE_SHARE_QUERY_PARAM) ?? null;
  const draftPrompt = searchParams?.get(SCHEDULE_PROMPT_QUERY_PARAM) ?? null;
  const draftAgentId = searchParams?.get(SCHEDULE_AGENT_QUERY_PARAM) ?? null;
  const agents = useAgentOptions();
  const { projects } = useManagedCloudProjects();
  const subscriptionTier = useBillingStore((state) => state.subscription?.tier ?? 'free');
  const billingIsLoading = useBillingStore((state) => state.isLoading);
  const billingInitialized = useBillingStore((state) => state.initialized);

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[68rem] flex-col gap-8 px-8 py-12 max-md:px-4 max-md:pt-6">
        <LocalRoutinesSection />
        {billingIsLoading || !billingInitialized ? (
          <SchedulesEntitlementLoading embedded />
        ) : (
          <SchedulesPage
            focusScheduleId={focusScheduleId}
            sharedScheduleToken={sharedScheduleToken}
            draftPrompt={draftPrompt}
            draftAgentId={draftAgentId}
            agents={agents}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
            subscriptionTier={subscriptionTier}
            onOpenChat={(schedule: ScheduleTask) =>
              router.push(
                `/chat?starterPrompt=${encodeURIComponent(schedule.prompt ?? schedule.name)}`,
              )
            }
          />
        )}
      </div>
    </main>
  );
}

export default SchedulesPageWithProjects;
