'use client';

import { useManagedCloudProjects } from '@/features/projects';
import { SchedulesPage } from './SchedulesPage';

export function SchedulesPageWithProjects() {
  const { projects } = useManagedCloudProjects();
  return (
    <SchedulesPage projects={projects.map((project) => ({ id: project.id, name: project.name }))} />
  );
}

export default SchedulesPageWithProjects;
