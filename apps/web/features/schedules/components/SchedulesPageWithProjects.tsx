'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useManagedCloudProjects } from '@/features/projects';
import { SchedulesPage } from './SchedulesPage';
import type { ScheduleTask } from '../types';

export const SCHEDULE_FOCUS_QUERY_PARAM = 'schedule';

export function SchedulesPageWithProjects() {
  const router = useRouter();
  const focusScheduleId = useSearchParams()?.get(SCHEDULE_FOCUS_QUERY_PARAM) ?? null;
  const { projects } = useManagedCloudProjects();
  return (
    <SchedulesPage
      focusScheduleId={focusScheduleId}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      onOpenChat={(schedule: ScheduleTask) =>
        router.push(`/chat?starterPrompt=${encodeURIComponent(schedule.prompt ?? schedule.name)}`)
      }
    />
  );
}

export default SchedulesPageWithProjects;
