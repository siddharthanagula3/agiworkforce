'use client';

import { useRouter } from 'next/navigation';
import { useManagedCloudProjects } from '@/features/projects';
import { SchedulesPage } from './SchedulesPage';
import type { ScheduleTask } from '../types';

export function SchedulesPageWithProjects() {
  const router = useRouter();
  const { projects } = useManagedCloudProjects();
  return (
    <SchedulesPage
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      onOpenChat={(schedule: ScheduleTask) =>
        router.push(`/chat?starterPrompt=${encodeURIComponent(schedule.prompt ?? schedule.name)}`)
      }
    />
  );
}

export default SchedulesPageWithProjects;
